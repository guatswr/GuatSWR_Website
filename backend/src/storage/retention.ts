import fs from 'node:fs/promises'
import path from 'node:path'
import type { SqliteStore } from '../database/sqlite.js'
import { AppError } from '../errors.js'
import { isSafePath } from '../utils/storage-boundary.js'
import { captureCleanupTargets, enqueueCleanup, runCleanupBatch } from './cleanup.js'
import { assetReferences, localAssetPath } from './reference-inventory.js'

export function createAssetRetention(options: {
  store: SqliteStore; publicRoot: string; staging: string; privateRoot: string; quarantine: string
  ready: boolean; signal: AbortSignal
}) {
  const request = async (values: unknown[], directories: string[] = []) => {
    if (!options.ready) throw new AppError('请先升级数据库', 'asset_migration_required', 503)
    const targets = await captureCleanupTargets(options.publicRoot, values, directories)
    await options.store.transaction(tx => enqueueCleanup(tx, targets))
    await runCleanupBatch(options.store, options.publicRoot, options.quarantine, 20, options.signal)
  }
  const entries = async (directory: string) => fs.readdir(directory).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error })
  const cleanupStaging = async (ttl: number) => {
    const cutoff = Date.now() - ttl
    if (options.ready) {
      const values: string[] = []
      for (const name of await entries(options.staging)) {
        if (options.signal.aborted) break
        if (name.startsWith('.asset-prepare-')) continue
        const filename = path.join(options.staging, name)
        if (!isSafePath(options.publicRoot, filename)) continue
        const stat = await fs.lstat(filename).catch(() => undefined)
        if (!stat?.isFile() || stat.isSymbolicLink() || stat.mtimeMs >= cutoff) continue
        const base = path.basename(filename, path.extname(filename)).replace(/-thumb$/, '')
        const siblings = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '-thumb.webp'].map(ext => path.join(options.staging, base + ext))
        const newer = await Promise.all(siblings.map(sibling => fs.lstat(sibling).then(value => value.mtimeMs >= cutoff).catch(() => false)))
        if (newer.some(Boolean)) continue
        values.push('/uploads/' + path.relative(options.publicRoot, filename).split(path.sep).map(encodeURIComponent).join('/'))
      }
      if (values.length) {
        const targets = await captureCleanupTargets(options.publicRoot, values)
        await options.store.transaction(async tx => {
          const refs = await assetReferences(tx, options.publicRoot)
          if (refs.invalidLocalUrls) return
          const family = (filename: string) => {
            const value = process.platform === 'win32' ? filename.toLowerCase() : filename
            return path.join(path.dirname(value), path.basename(value, path.extname(value)).replace(/-thumb$/, ''))
          }
          const families = new Set([...refs.references].map(family))
          const pending = new Set((await tx.all<{ url: string; identity: string }>("SELECT url,identity FROM asset_cleanup_jobs WHERE state='pending'")).map(job => job.url + '\0' + job.identity))
          await enqueueCleanup(tx, targets.filter(target => {
            const filename = localAssetPath(options.publicRoot, target.url)
            return filename && !families.has(family(filename)) && !pending.has(target.url + '\0' + target.identity)
          }))
        })
        await runCleanupBatch(options.store, options.publicRoot, options.quarantine, 20, options.signal)
      }
    }
    // Only generated, unpublished request files are physically expired. Saved
    // public resources always use reference-checked durable quarantine.
    for (const name of await entries(options.privateRoot)) {
      if (options.signal.aborted) break
      if (!/^img-[a-f0-9-]{36}(?:-thumb)?\.(?:jpg|jpeg|png|gif|webp|svg)$/.test(name)) continue
      const filename = path.join(options.privateRoot, name)
      if (!isSafePath(options.privateRoot, filename)) continue
      const value = await fs.lstat(filename, { bigint: true }).catch(() => undefined)
      if (!value?.isFile() || value.isSymbolicLink() || Number(value.mtimeMs) >= cutoff) continue
      const current = await fs.lstat(filename, { bigint: true }).catch(() => undefined)
      if (current?.ino === value.ino && current.dev === value.dev && current.mtimeNs === value.mtimeNs && current.ctimeNs === value.ctimeNs && current.size === value.size) await fs.unlink(filename)
    }
  }
  return { request, cleanupStaging }
}
export type AssetRetention = ReturnType<typeof createAssetRetention>
