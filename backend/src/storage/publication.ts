import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { SqlExecutor, SqliteStore } from '../database/sqlite.js'
import { AppError } from '../errors.js'
import { isSafePath } from '../utils/storage-boundary.js'
import { referencesFromValues, assetReferences } from './reference-inventory.js'
import { captureCleanupTargets, processCleanupJob, type CleanupTarget } from './cleanup.js'

export interface AssetPublication {
  publish<P, R>(values: unknown[], prepare: () => Promise<P>, save: (prepared: P, tx: SqlExecutor) => Promise<R>): Promise<R>
  standalone<T>(values: unknown[], work: () => Promise<T>): Promise<T>
  recover(limit?: number): Promise<{ recovered: number; retained: number }>
}
interface Entry { target: string; temporary: string; targetJob: string; temporaryJob: string; identity?: string; finalIdentity?: string }
interface Journal { version: 1; id: string; pid: number; state: 'preparing' | 'failed'; entries: Entry[] }
interface Operation { filename: string; publish(source: string, destination: string): Promise<void> }
export const assetOperation = new AsyncLocalStorage<Operation>()
const active = new Set<string>()
const identity = (value: import('node:fs').BigIntStats) => [value.dev, value.ino, value.size, value.mtimeNs, value.ctimeNs].map(String).join(':')
const sameMoved = (actual: string, expected: string) => actual.split(':').slice(0, 4).join(':') === expected.split(':').slice(0, 4).join(':')
const stat = async (filename: string) => { try { return await fs.lstat(filename, { bigint: true }) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error } }
export function createAssetPublication(options: {
  store: SqliteStore; filename: string; publicRoot: string; journalRoot: string; quarantine: string
  signal: AbortSignal; track<T>(work: () => Promise<T>): Promise<T>; report(error: unknown): void
  ready?: boolean
}): AssetPublication {
  const report = (error: unknown) => { try { options.report(Object.assign(new Error('Asset publication maintenance requires retry', { cause: error }), { code: 'ASSET_PUBLICATION_RECOVERY_REQUIRED' })) } catch { /* a committed mutation must stay successful */ } }
  const inside = (root: string, value: string) => { const rel = path.relative(root, value); return !rel || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)) }
  const initialize = async () => {
    if (inside(options.publicRoot, options.journalRoot)) throw new Error('ASSET_JOURNAL_PUBLIC')
    await fs.mkdir(options.journalRoot, { recursive: true, mode: 0o700 })
    if ((await fs.lstat(options.journalRoot)).isSymbolicLink() || inside(await fs.realpath(options.publicRoot), await fs.realpath(options.journalRoot))) throw new Error('ASSET_JOURNAL_PUBLIC')
  }
  const journalFile = (id: string) => path.join(options.journalRoot, id + '.json')
  const write = async (journal: Journal) => {
    const text = JSON.stringify(journal)
    if (Buffer.byteLength(text) > 1048576) throw new AppError('单次图片数量过多', 'asset_limit', 413)
    const target = journalFile(journal.id), temporary = target + '.' + randomUUID() + '.tmp'
    const file = await fs.open(temporary, 'wx', 0o600)
    try { await file.writeFile(text); await file.sync() } finally { await file.close() }
    await fs.rename(temporary, target)
  }
  const absolute = (relative: string) => {
    if (!relative || path.isAbsolute(relative) || /[\\\0:]/.test(relative) || relative.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('ASSET_JOURNAL_PATH')
    const target = path.join(options.publicRoot, ...relative.split('/'))
    if (!isSafePath(options.publicRoot, target)) throw new Error('ASSET_JOURNAL_PATH')
    return target
  }
  const relative = (filename: string) => {
    if (!isSafePath(options.publicRoot, filename)) throw new Error('ASSET_PUBLICATION_PATH')
    return path.relative(options.publicRoot, filename).split(path.sep).join('/')
  }
  const enqueue = async (tx: SqlExecutor, targets: CleanupTarget[]) => {
    for (const target of targets) {
      await tx.run('INSERT OR IGNORE INTO asset_cleanup_jobs(id,url,identity) VALUES(?,?,?)', [target.id, target.url, target.identity])
      const stored = await tx.get('SELECT url,identity FROM asset_cleanup_jobs WHERE id=?', [target.id])
      if (!stored || stored.url !== target.url || stored.identity !== target.identity) throw new Error('ASSET_CLEANUP_IDENTITY')
    }
  }
  const recoverOne = async (filename: string) => {
    const meta = await stat(filename)
    if (!meta?.isFile() || meta.isSymbolicLink() || meta.size > 1048576n || !inside(await fs.realpath(options.journalRoot), await fs.realpath(filename))) throw new Error('ASSET_JOURNAL_INVALID')
    const journal = JSON.parse(await fs.readFile(filename, 'utf8')) as Journal
    if (journal.version !== 1 || !/^[a-f0-9-]{36}$/.test(journal.id) || path.basename(filename) !== journal.id + '.json' || !Number.isSafeInteger(journal.pid) || journal.pid <= 0 || !Array.isArray(journal.entries) || journal.entries.length > 1024) throw new Error('ASSET_JOURNAL_INVALID')
    if (active.has(journal.id)) return false
    if (journal.pid !== process.pid && journal.state !== 'failed') {
      try { process.kill(journal.pid, 0); return false } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') return false }
    }
    const targets: CleanupTarget[] = []
    let ambiguous = false
    for (const entry of journal.entries) {
      if (!entry || !/^[a-f0-9-]{36}$/.test(entry.targetJob) || !/^[a-f0-9-]{36}$/.test(entry.temporaryJob)) throw new Error('ASSET_JOURNAL_INVALID')
      const target = absolute(entry.target), temporary = absolute(entry.temporary)
      let targetStat = await stat(target), temporaryStat = await stat(temporary)
      const expected = entry.finalIdentity || entry.identity
      const validIdentity = (value: unknown): value is string => typeof value === 'string' && /^\d+:\d+:\d+:\d+:\d+$/.test(value)
      const ownedTarget = Boolean(targetStat?.isFile() && !targetStat.isSymbolicLink() && validIdentity(expected)
        && (entry.finalIdentity ? identity(targetStat) === expected : sameMoved(identity(targetStat), expected)))
      const ownedTemporary = Boolean(temporaryStat?.isFile() && !temporaryStat.isSymbolicLink() && validIdentity(entry.identity) && sameMoved(identity(temporaryStat), entry.identity))
      // The temporary link is never an API resource. Remove it first when both
      // names identify our same inode, then capture the final post-unlink ctime.
      if (ownedTarget && ownedTemporary && targetStat && temporaryStat && sameMoved(identity(targetStat), identity(temporaryStat))) {
        await fs.unlink(temporary); temporaryStat = undefined; targetStat = await stat(target)
      }
      if (ownedTarget && targetStat) targets.push({ id: entry.targetJob, url: '/uploads/' + entry.target.split('/').map(encodeURIComponent).join('/'), identity: identity(targetStat) })
      if (ownedTemporary && temporaryStat) targets.push({ id: entry.temporaryJob, url: '/uploads/' + entry.temporary.split('/').map(encodeURIComponent).join('/'), identity: identity(temporaryStat) })
      if (temporaryStat && !validIdentity(entry.identity)) ambiguous = true // interrupted copy: retain until inspected
    }
    if (targets.length) await options.store.transaction(tx => enqueue(tx, targets))
    if (!ambiguous) await fs.unlink(filename)
    return !ambiguous
  }
  let recoveryOffset = 0
  const recover: AssetPublication['recover'] = async (limit = 20) => {
    options.signal.throwIfAborted()
    if (options.ready === false) return { recovered: 0, retained: 0 }
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('ASSET_RECOVERY_LIMIT')
    await initialize()
    const result = { recovered: 0, retained: 0 }
    const names = (await fs.readdir(options.journalRoot)).filter(name => /^[a-f0-9-]{36}\.json$/.test(name)).sort()
    const start = names.length ? recoveryOffset % names.length : 0
    const selected = [...names.slice(start), ...names.slice(0, start)].slice(0, limit)
    recoveryOffset = names.length ? (start + selected.length) % names.length : 0
    for (const name of selected) {
      if (options.signal.aborted) break
      try { if (await recoverOne(path.join(options.journalRoot, name))) result.recovered++; else result.retained++ }
      catch (error) { report(error); result.retained++ }
    }
    return result
  }
  const perform = <P, R>(values: unknown[], prepare: () => Promise<P>, save: (prepared: P, tx: SqlExecutor) => Promise<R>, standalone: boolean): Promise<R> => {
    if (options.ready === false) throw new AppError('请先升级数据库', 'asset_migration_required', 503)
    options.signal.throwIfAborted()
    return options.track(async () => {
      options.signal.throwIfAborted()
      const journal: Journal = { version: 1, id: randomUUID(), pid: process.pid, state: 'preparing', entries: [] }
      const observed = new Map<string, string>(), sources = new Map<string, CleanupTarget>()
      let queued: CleanupTarget[] = []
      const key = (filename: string) => process.platform === 'win32' ? filename.toLowerCase() : filename
      let committed = false, journalCreated = false
      active.add(journal.id)
      const check = async (filename: string, expected: string) => {
        const actual = await stat(filename)
        if (!actual?.isFile() || actual.isSymbolicLink() || identity(actual) !== expected || !isSafePath(options.publicRoot, filename)) throw new AppError('文件已变化，请重新提交', 'asset_changed', 409)
      }
      const operation: Operation = { filename: options.filename, publish: async (source, destination) => {
        options.signal.throwIfAborted()
        const before = await stat(source), expectedSource = observed.get(key(source))
        if (!before?.isFile() || before.isSymbolicLink() || (expectedSource && expectedSource !== identity(before))) throw new AppError('文件已变化，请重新提交', 'asset_changed', 409)
        if (journal.entries.length >= 1024) throw new AppError('单次图片数量过多', 'asset_limit', 413)
        await initialize()
        const temporary = path.join(path.dirname(destination), '.asset-prepare-' + randomUUID() + '.tmp')
        const entry: Entry = { target: relative(destination), temporary: relative(temporary), targetJob: randomUUID(), temporaryJob: randomUUID() }
        journal.entries.push(entry); await write(journal); journalCreated = true
        await fs.copyFile(source, temporary, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE)
        await fs.chmod(temporary, 0o644)
        const now = new Date(); await fs.utimes(temporary, now, now)
        const file = await fs.open(temporary, 'r+')
        try { await file.sync() } finally { await file.close() }
        const prepared = await stat(temporary)
        if (!prepared?.isFile() || prepared.isSymbolicLink()) throw new Error('ASSET_PREPARATION_FAILED')
        entry.identity = identity(prepared); await write(journal)
        options.signal.throwIfAborted()
        await fs.link(temporary, destination) // same-filesystem metadata operation, no overwrite
        await fs.unlink(temporary)
        const final = await stat(destination)
        if (!final?.isFile() || !sameMoved(identity(final), entry.identity)) throw new Error('ASSET_PREPARATION_FAILED')
        const after = await stat(source)
        if (after && identity(after) !== identity(before)) throw new AppError('文件已变化，请重新提交', 'asset_changed', 409)
        entry.finalIdentity = identity(final); observed.set(key(destination), entry.finalIdentity); observed.delete(key(source)); await write(journal)
        for (const target of await captureCleanupTargets(options.publicRoot, ['/uploads/' + relative(source).split('/').map(encodeURIComponent).join('/')])) if (!sources.has(target.url)) sources.set(target.url, target)
      } }
      try {
        const serialized = values.map(value => typeof value === 'string' ? value : JSON.stringify(value) || '')
        const references = referencesFromValues(serialized, options.publicRoot).references
        if (references.size > 1024) throw new AppError('单次图片数量过多', 'asset_limit', 413)
        for (const filename of references) {
          if (!isSafePath(options.publicRoot, filename)) continue
          const value = await stat(filename).catch(() => undefined)
          if (value?.isFile() && !value.isSymbolicLink()) observed.set(key(filename), identity(value))
        }
        const prepared = await assetOperation.run(operation, prepare)
        const result = await options.store.transaction(async tx => {
          const result = await save(prepared, tx)
          for (const [filename, expected] of observed) await check(filename, expected)
          if (journal.entries.length) {
          const refs = await assetReferences(tx, options.publicRoot)
          const family = (filename: string) => {
            const normalized = process.platform === 'win32' ? filename.toLowerCase() : filename
            return path.join(path.dirname(normalized), path.basename(normalized, path.extname(normalized)).replace(/-thumb$/, ''))
          }
          const used = standalone || refs.invalidLocalUrls > 0 || journal.entries.some(entry => [...refs.references].some(value => family(value) === family(absolute(entry.target))))
          if (used) queued = [...sources.values()]
          else {
            const leftovers: CleanupTarget[] = []
            for (const entry of journal.entries) if (entry.finalIdentity) leftovers.push({ id: entry.targetJob, url: '/uploads/' + entry.target.split('/').map(encodeURIComponent).join('/'), identity: entry.finalIdentity })
            queued = leftovers
          }
          await enqueue(tx, queued)
          }
          return result
        })
        committed = true
        if (journalCreated) await fs.unlink(journalFile(journal.id)).catch(report)
        for (const target of queued.slice(0, 20)) await processCleanupJob(options.store, options.publicRoot, options.quarantine, target.id).catch(report)
        return result
      } finally {
        if (!committed && journalCreated) { journal.state = 'failed'; await write(journal).catch(report) }
        active.delete(journal.id)
        if (!committed && journalCreated) {
          await recoverOne(journalFile(journal.id)).catch(report)
          for (const id of journal.entries.flatMap(entry => [entry.targetJob, entry.temporaryJob]).slice(0, 20)) await processCleanupJob(options.store, options.publicRoot, options.quarantine, id).catch(report)
        }
      }
    })
  }
  return { publish: (values, prepare, save) => perform(values, prepare, save, false), standalone: (values, work) => perform(values, work, async result => result, true), recover }
}
export async function publishAssets<P, R>(publisher: AssetPublication | undefined, values: unknown[], prepare: () => Promise<P>, save: (prepared: P, tx?: SqlExecutor) => Promise<R>): Promise<R> {
  return publisher ? publisher.publish(values, prepare, save) : save(await prepare())
}
export function guardAssetReferences<R>(publisher: AssetPublication | undefined, values: unknown[], save: (tx?: SqlExecutor) => Promise<R>): Promise<R> {
  return publisher ? publisher.publish(values, async () => undefined, (_prepared, tx) => save(tx)) : save()
}
