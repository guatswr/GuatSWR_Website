import path from 'node:path'
import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { BigIntStats } from 'node:fs'
import type { Row, SqlExecutor, SqliteStore } from '../database/sqlite.js'
import { assetReferences, localAssetPath, referencesFromValues } from './reference-inventory.js'

export interface CleanupTarget { id: string; url: string; identity: string }
interface Job extends Row, CleanupTarget { state: string; attempts: number }
const identity = (stat: BigIntStats) => [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(':')
const family = (filename: string) => path.join(path.dirname(filename), path.basename(filename, path.extname(filename)).replace(/-thumb$/, ''))
const metadata = async (filename: string) => {
  try { return await fs.lstat(filename, { bigint: true }) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
}
async function safeParents(root: string, filename: string) {
  const relative = path.relative(root, filename)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('CLEANUP_PATH')
  let current = root
  for (const part of ['' , ...relative.split(path.sep).slice(0, -1)]) {
    current = path.join(current, part)
    const stat = await metadata(current)
    if (!stat?.isDirectory() || stat.isSymbolicLink()) throw new Error('CLEANUP_PATH')
  }
}

// Capture identity before deleting rows. File bytes are never copied under a DB lock.
export async function captureCleanupTargets(root: string, values: unknown[], directories: string[] = []) {
  const candidates = referencesFromValues(values, root).references
  const walk = async (directory: string) => {
    await safeParents(root, path.join(directory, 'placeholder'))
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name), stat = await metadata(filename)
      if (stat?.isSymbolicLink()) continue
      if (stat?.isDirectory()) await walk(filename)
      else if (stat?.isFile()) candidates.add(filename)
    }
  }
  for (const directory of directories) {
    if (await metadata(directory)) await walk(directory)
  }
  for (const filename of [...candidates]) {
    const thumb = path.join(path.dirname(filename), `${path.basename(filename, path.extname(filename))}-thumb.webp`)
    candidates.add(thumb)
  }
  const targets: CleanupTarget[] = []
  for (const filename of candidates) {
    const stat = await metadata(filename)
    if (!stat?.isFile() || stat.isSymbolicLink()) continue
    await safeParents(root, filename)
    const relative = path.relative(root, filename).split(path.sep).map(encodeURIComponent).join('/')
    targets.push({ id: randomUUID(), url: `/uploads/${relative}`, identity: identity(stat) })
  }
  return targets
}
export async function enqueueCleanup(tx: SqlExecutor, targets: CleanupTarget[]) {
  for (const target of targets) await tx.run('INSERT INTO asset_cleanup_jobs(id,url,identity) VALUES(?,?,?)', [target.id, target.url, target.identity])
}

export async function processCleanupJob(store: SqliteStore, root: string, quarantine: string, id: string) {
  if (!path.isAbsolute(root) || !path.isAbsolute(quarantine) || !/^[a-f0-9-]{36}$/.test(id)) throw new Error('CLEANUP_ARGUMENTS')
  const relative = path.relative(root, quarantine)
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) throw new Error('CLEANUP_QUARANTINE_PUBLIC')
  await fs.mkdir(quarantine, { recursive: true, mode: 0o700 })
  if ((await fs.lstat(quarantine)).isSymbolicLink()) throw new Error('CLEANUP_PATH')
  const actualRelative = path.relative(await fs.realpath(root), await fs.realpath(quarantine))
  if (!actualRelative.startsWith('..') && !path.isAbsolute(actualRelative)) throw new Error('CLEANUP_QUARANTINE_PUBLIC')
  try {
    return await store.transaction(async tx => {
      const job = await tx.get<Job>('SELECT * FROM asset_cleanup_jobs WHERE id=?', [id])
      if (!job || !['pending', 'quarantined'].includes(job.state)) return job?.state || 'missing'
      const filename = localAssetPath(root, job.url)
      if (!filename) throw new Error('CLEANUP_PATH')
      await safeParents(root, filename)
      const held = path.join(quarantine, id)
      const publicStat = await metadata(filename), heldStat = await metadata(held)
      if (heldStat?.isSymbolicLink() || (heldStat && !heldStat.isFile())) throw new Error('CLEANUP_PATH')
      // rename may change ctime; dev/ino/size/mtime are retained to recognize a crash
      // between the filesystem move and SQLite commit.
      const sameHeld = heldStat && identity(heldStat).split(':').slice(0, 4).join(':') === job.identity.split(':').slice(0, 4).join(':')
      const refs = await assetReferences(tx, root)
      const referenced = refs.invalidLocalUrls > 0 || [...refs.references].some(value => family(value) === family(filename))
      let state: string
      if (referenced) {
        if (!publicStat && sameHeld) {
          await fs.link(held, filename) // never overwrite a newly published file
          await fs.unlink(held)
        }
        state = 'retained'
      } else if (!publicStat) state = sameHeld ? 'quarantined' : heldStat ? 'obsolete' : 'missing'
      else if (!publicStat.isFile() || publicStat.isSymbolicLink() || identity(publicStat) !== job.identity || heldStat) state = 'obsolete'
      else {
        await fs.rename(filename, held) // metadata operation only; EXDEV is a retryable failure
        const moved = await metadata(held)
        if (!moved || identity(moved).split(':').slice(0, 4).join(':') !== job.identity.split(':').slice(0, 4).join(':')) {
          // A path changed between lstat and rename. Restore without overwriting.
          await fs.link(held, filename)
          await fs.unlink(held)
          state = 'obsolete'
        } else state = 'quarantined'
      }
      await tx.run('UPDATE asset_cleanup_jobs SET state=?,attempts=attempts+1,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?', [state, id])
      return state
    })
  } catch (error) {
    // Keep intent durable even if a filesystem operation or commit failed. A retry
    // reconciles the deterministic quarantine path; no public file is unlinked.
    const code = (error as NodeJS.ErrnoException).code
    const category = code === 'EXDEV' ? 'cross_device' : code === 'EACCES' || code === 'EPERM' ? 'permission' : 'cleanup_failed'
    await store.run('UPDATE asset_cleanup_jobs SET attempts=attempts+1,last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?', [category, id]).catch(() => {})
    throw new Error('CLEANUP_RETRY_REQUIRED', { cause: error })
  }
}

export async function runCleanupBatch(store: SqliteStore, root: string, quarantine: string, limit = 20, signal?: AbortSignal) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('CLEANUP_LIMIT')
  const jobs = await store.all<Job>("SELECT * FROM asset_cleanup_jobs WHERE state='pending' AND attempts<10 ORDER BY updated_at,id LIMIT ?", [limit])
  const result = { processed: 0, failed: 0 }
  for (const job of jobs) {
    if (signal?.aborted) break
    try { await processCleanupJob(store, root, quarantine, job.id); result.processed++ }
    catch { result.failed++ }
  }
  return result
}
