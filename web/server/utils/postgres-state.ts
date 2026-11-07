import { Pool, type PoolClient } from 'pg'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { BffError, BffConfigError } from './bff-errors.ts'

export interface LockedRecords<T> {
  get(id: string): Promise<T | undefined>
  set(id: string, value: T): Promise<void>
  delete(id: string): Promise<boolean>
}
interface SharedPool { pool: Pool; refs: number }
const pools = new Map<string, SharedPool>()
const unavailable = () => new BffError(503, 'upstream_unavailable', '状态存储暂不可用')
export function stateDriver(explicit?: string): 'postgres' | 'memory' {
  const fallback = (process.env.VITEST || process.env.NODE_ENV === 'test') ? 'memory' : 'postgres'
  const driver = explicit ?? process.env.BFF_DATABASE_DRIVER ?? process.env.DATABASE_DRIVER ?? fallback
  if (!['postgres', 'memory'].includes(driver)) throw new BffConfigError('Invalid state database driver')
  return driver as 'postgres' | 'memory'
}
export function postgresStateStore<T>(options: { namespace: string; secret: Buffer; connectionString?: string; maxConnections?: number; maxEntries?: number }) {
  const url = options.connectionString || process.env.BFF_POSTGRES_URL || process.env.POSTGRES_URL
  try {
    if (!url) throw Error()
    const parsed = new URL(url)
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || !parsed.username || parsed.pathname.length < 2 || parsed.hash || parsed.searchParams.has('options')) throw Error()
  } catch { throw new BffConfigError('A private PostgreSQL state URL is required') }
  if (!Number.isSafeInteger(options.maxEntries ?? 10000) || (options.maxEntries ?? 10000) < 1) throw new BffConfigError('Invalid state capacity')
  let shared = pools.get(url!)
  if (!shared) {
    const pool = new Pool({ connectionString: url!, max: 4, connectionTimeoutMillis: 1000, statement_timeout: 5000, lock_timeout: 1000,
      idle_in_transaction_session_timeout: 12000, options: '-c search_path=pg_catalog,bff -c timezone=UTC -c client_connection_check_interval=100ms' })
    pool.on('error', () => {}) // Idle disconnects are retried by later acquisitions, never uncaught events.
    shared = { pool, refs: 0 }; pools.set(url!, shared)
  }
  shared.refs++
  const holder = shared
  const prefix = options.namespace + ':'
  const key = createHash('sha256').update('guatswr:durable-records:v1').update(options.namespace).update(options.secret).digest()
  const seal = (id: string, value: T) => {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv)
    cipher.setAAD(Buffer.from(id))
    return Buffer.concat([iv, cipher.update(JSON.stringify(value)), cipher.final(), cipher.getAuthTag()])
  }
  const open = (id: string, raw: Buffer): T => {
    const cipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12))
    cipher.setAAD(Buffer.from(id)); cipher.setAuthTag(raw.subarray(-16))
    return JSON.parse(Buffer.concat([cipher.update(raw.subarray(12, -16)), cipher.final()]).toString()) as T
  }
  const active = new Set<Promise<unknown>>(), cancel = new Set<() => void>()
  let closing: Promise<void> | undefined, sweepCursor = ''
  const maxEntries = options.maxEntries ?? 10000
  const transaction = <R>(work: (ctx: LockedRecords<T>, client: PoolClient) => Promise<R>, exclusive = false): Promise<R> => {
    if (closing || holder.pool.waitingCount >= 128) return Promise.reject(unavailable())
    const task = (async () => {
      const client = await holder.pool.connect().catch(() => { throw unavailable() })
      if (closing) { client.release(true); throw unavailable() }
      let usable = true, released = false, damaged = false
      const release = (destroy = false) => { if (!released) { released = true; client.release(destroy) } }
      let rejectStop!: (error: Error) => void
      const stopped = new Promise<never>((_resolve, reject) => { rejectStop = reject }); void stopped.catch(() => {})
      const abort = () => { usable = false; damaged = true; release(true); rejectStop(unavailable()) }
      const broken = () => abort()
      client.on('error', broken); cancel.add(abort)
      const timer = setTimeout(abort, 12000)
      const query = async (sql: string, params: unknown[] = []) => {
        if (!usable) throw unavailable()
        return await Promise.race([client.query(sql, params), stopped])
      }
      const ctx: LockedRecords<T> = {
        async get(id) {
          await query('SELECT pg_advisory_xact_lock(hashtextextended($1,7912))', [prefix + id])
          const row = (await query('SELECT value FROM bff.records WHERE key=$1 FOR UPDATE', [prefix + id])).rows[0]
          return row ? open(id, Buffer.from(row.value)) : undefined
        },
        async set(id, value) {
          await query('SELECT pg_advisory_xact_lock(hashtextextended($1,7912))', [prefix + id])
          const exists = (await query('SELECT 1 FROM bff.records WHERE key=$1', [prefix + id])).rows.length > 0
          if (!exists) {
            await query('SELECT pg_advisory_xact_lock(hashtextextended($1,7913))', [prefix])
            const size = Number((await query('SELECT count(*) AS n FROM bff.records WHERE starts_with(key,$1)', [prefix])).rows[0].n)
            if (size >= maxEntries) throw unavailable()
          }
          await query('INSERT INTO bff.records(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [prefix + id, seal(id, value)])
        },
        async delete(id) {
          await query('SELECT pg_advisory_xact_lock(hashtextextended($1,7912))', [prefix + id])
          return ((await query('DELETE FROM bff.records WHERE key=$1', [prefix + id])).rowCount ?? 0) > 0
        },
      }
      try {
        await query('BEGIN')
        await query(`SELECT pg_advisory_xact_lock${exclusive ? '' : '_shared'}(hashtextextended($1,7911))`, [prefix])
        const value = await Promise.race([work(ctx, client), stopped])
        await query('COMMIT')
        return value
      } catch (error) {
        if (usable) await client.query('ROLLBACK').catch(() => { damaged = true })
        if (error instanceof BffError) throw error
        throw unavailable()
      } finally {
        usable = false; clearTimeout(timer); cancel.delete(abort); client.removeListener('error', broken); release(damaged)
      }
    })()
    active.add(task); void task.then(() => active.delete(task), () => active.delete(task))
    return task
  }
  const rows = async (client: PoolClient, after = '', limit = maxEntries + 1) => (await client.query<{ key: string; value: Buffer }>(
    'SELECT key,value FROM bff.records WHERE starts_with(key,$1) AND key>$2 ORDER BY key LIMIT $3', [prefix, after, limit])).rows
  return {
    get: (id: string) => transaction(ctx => ctx.get(id)),
    set: (id: string, value: T) => transaction(ctx => ctx.set(id, value)),
    delete: (id: string) => transaction(ctx => ctx.delete(id)),
    deleteMany: (ids: Iterable<string>) => transaction(async ctx => { let n = 0; for (const id of ids) if (await ctx.delete(id)) n++; return n }, true),
    atomicUpdate: (id: string, update: (current: T | undefined) => T) => transaction(async ctx => {
      const current = await ctx.get(id), next = update(current === undefined ? undefined : structuredClone(current))
      await ctx.set(id, next); return next
    }),
    compareAndSwap: (id: string, expected: T, value: T) => transaction(async ctx => {
      const current = await ctx.get(id)
      if (current === undefined || JSON.stringify(current) !== JSON.stringify(expected)) return false
      await ctx.set(id, value); return true
    }),
    withLock: <R>(id: string, work: (ctx: LockedRecords<T>) => Promise<R>) => transaction(async ctx => {
      await ctx.get(id)
      return work(ctx)
    }),
    clear: () => transaction(async (_ctx, client) => (await client.query('DELETE FROM bff.records WHERE starts_with(key,$1)', [prefix])).rowCount ?? 0, true),
    size: () => transaction(async (_ctx, client) => Number((await client.query('SELECT count(*) AS count FROM bff.records WHERE starts_with(key,$1)', [prefix])).rows[0].count)),
    scan: (filter?: (item: T, id: string) => boolean) => transaction(async (_ctx, client) => {
      const result = []
      for (const row of await rows(client)) {
        const id = row.key.slice(prefix.length), item = open(id, Buffer.from(row.value))
        if (!filter || filter(item, id)) result.push({ id, item })
      }
      return result
    }),
    deleteWhere: (filter: (item: T) => boolean) => transaction(async (ctx, client) => {
      let count = 0
      for (const row of await rows(client)) { const id = row.key.slice(prefix.length); if (filter(open(id, Buffer.from(row.value))) && await ctx.delete(id)) count++ }
      return count
    }, true),
    sweepBatch: (batchSize = 100, expired?: (item: T) => boolean) => transaction(async (ctx, client) => {
      if (!expired) return 0
      const page = await rows(client, sweepCursor, Math.min(100, Math.max(1, Math.floor(batchSize))))
      let n = 0
      for (const row of page) {
        const id = row.key.slice(prefix.length)
        if (expired(open(id, Buffer.from(row.value))) && await ctx.delete(id)) n++
      }
      sweepCursor = page.length ? page[page.length - 1]!.key : ''
      return n
    }, true),
    close: () => closing ??= (async () => {
      const timer = setTimeout(() => { for (const abort of cancel) abort() }, 1000)
      try { await Promise.allSettled([...active]) } finally { clearTimeout(timer) }
      holder.refs--
      if (!holder.refs) { pools.delete(url!); await holder.pool.end() }
    })(),
  }
}
