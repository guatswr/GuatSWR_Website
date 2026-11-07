import { setMaxListeners } from 'node:events'
import { Pool, types, type PoolClient, type QueryConfig } from 'pg'
import { DatabaseError, transactionScope, type DatabaseStore, type SqlExecutor, type SqlValue, type Row, type OperationOptions } from './contracts.js'
import { parseDatabaseConfiguration } from './config.js'

export type PostgresSchema = 'main' | 'audit' | 'bff'
export interface PostgresStoreOptions {
  connectionString: string
  schema: PostgresSchema
  maxConnections?: number
  maxWaiting?: number
  acquireTimeoutMs?: number
  shutdownGraceMs?: number
  statementTimeoutMs?: number
  report?: (error: DatabaseError) => void
}
export interface PostgresStore extends DatabaseStore { ready(): Promise<void> }
const scopeError = () => new DatabaseError('scope')
const interrupted = () => new DatabaseError('interrupted')

export function classifyPostgresError(error: unknown): DatabaseError {
  if (error instanceof DatabaseError) return error
  const raw = error && typeof error === 'object' && 'code' in error ? error.code : undefined
  const code = typeof raw === 'string' && raw !== 'EPIPE' && /^[0-9A-Z]{5}$/.test(raw) ? raw : undefined
  const kind = code?.startsWith('23') ? 'constraint' : code === '40001' ? 'serialization'
    : code === '40P01' ? 'deadlock' : code === '57014' ? 'interrupted'
      : code === '55P03' || code === '53300' ? 'busy'
        : code === '22003' ? 'data'
          : !code || code.startsWith('08') || ['57P01', '57P02', '57P03', '53100', '53200', '53400'].includes(code) ? 'unavailable' : 'query'
  return new DatabaseError(kind, undefined, code)
}

const safeInteger = (value: string) => {
  const number = Number(value)
  if (!Number.isSafeInteger(number)) throw new DatabaseError('data')
  return number
}
// Per-pool parsers: never change pg's global parsers or shift timestamps through local time.
const parsers = { getTypeParser(oid: number, format?: 'text' | 'binary') {
  if (format === 'binary') return types.getTypeParser(oid, format)
  if (oid === 20) return safeInteger
  if ([1082, 1114, 1184].includes(oid)) return (value: string) => value
  return types.getTypeParser(oid, 'text')
} }

export function createPostgresStore(options: PostgresStoreOptions): PostgresStore {
  parseDatabaseConfiguration({ DATABASE_DRIVER: 'postgres', POSTGRES_URL: options.connectionString })
  if (!['main', 'audit', 'bff'].includes(options.schema)) throw scopeError()
  const max = options.maxConnections ?? 4, maxWaiting = options.maxWaiting ?? 128
  const timeout = options.acquireTimeoutMs ?? 1000, grace = options.shutdownGraceMs ?? 1000
  const statementTimeout = options.statementTimeoutMs ?? 15000
  if (!Number.isInteger(max) || max < 1 || max > 16 || !Number.isInteger(maxWaiting) || maxWaiting < 0 || maxWaiting > 128
    || !Number.isInteger(timeout) || timeout < 1 || timeout > 5000 || !Number.isInteger(grace) || grace < 0 || grace > 30000
    || !Number.isInteger(statementTimeout) || statementTimeout < 1 || statementTimeout > 120000) throw scopeError()
  const pool = new Pool({ connectionString: options.connectionString, max, connectionTimeoutMillis: timeout,
    idleTimeoutMillis: 10000, statement_timeout: statementTimeout, lock_timeout: timeout, types: parsers,
    // PostgreSQL 18 on Linux checks a destroyed client's socket while a query
    // runs, so cancellation releases server-side locks without another SQL client.
    options: `-c search_path=pg_catalog,${options.schema} -c timezone=UTC -c client_connection_check_interval=100ms`, application_name: 'guatswr-website' })
  pool.on('error', error => { try { options.report?.(classifyPostgresError(error)) } catch { /* diagnostics must not crash the process */ } })
  const shutdown = new AbortController()
  setMaxListeners(0, shutdown.signal)
  const active = new Set<Promise<unknown>>()
  const openings = new Set<Promise<void>>()
  let closing: Promise<void> | undefined
  let slots = 0
  const waiters: { grant(): void; cancel(error: DatabaseError): void }[] = []
  const releaseSlot = () => {
    const next = waiters.shift()
    if (next) next.grant()
    else slots--
  }
  const reserve = (signal: AbortSignal): Promise<void> => {
    if (signal.aborted) return Promise.reject(interrupted())
    if (closing) return Promise.reject(scopeError())
    if (slots < max) { slots++; return Promise.resolve() }
    if (waiters.length >= maxWaiting) return Promise.reject(new DatabaseError('busy'))
    return new Promise((resolve, reject) => {
      const abort = () => waiter.cancel(interrupted())
      const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', abort) }
      const waiter = {
        grant: () => { cleanup(); resolve() },
        cancel: (error: DatabaseError) => {
          const index = waiters.indexOf(waiter)
          if (index >= 0) waiters.splice(index, 1)
          cleanup(); reject(error)
        },
      }
      const timer = setTimeout(() => waiter.cancel(new DatabaseError('busy')), timeout)
      waiters.push(waiter)
      signal.addEventListener('abort', abort, { once: true })
    })
  }
  const track = <T>(work: () => Promise<T>): Promise<T> => {
    if (closing || transactionScope.getStore()?.active) return Promise.reject(scopeError())
    const pending = work()
    active.add(pending)
    void pending.then(() => active.delete(pending), () => active.delete(pending))
    return pending
  }
  interface Lease { client: PoolClient; signal: AbortSignal; stopped: Promise<never>; destroyed: boolean }
  const withLease = async <T>(work: (lease: Lease) => Promise<T>, supplied?: AbortSignal): Promise<T> => {
    const signal = supplied ? AbortSignal.any([shutdown.signal, supplied]) : shutdown.signal
    const deadline = Date.now() + timeout
    await reserve(signal)
    if (signal.aborted) { releaseSlot(); throw interrupted() }
    const connection = pool.connect()
    let timer: ReturnType<typeof setTimeout> | undefined
    let abortOpening: (() => void) | undefined
    let client: PoolClient
    try {
      client = await Promise.race([connection, new Promise<never>((_resolve, reject) => {
        abortOpening = () => reject(interrupted())
        signal.addEventListener('abort', abortOpening, { once: true })
        timer = setTimeout(() => reject(new DatabaseError('busy')), Math.max(0, deadline - Date.now()))
      })])
    } catch (error) {
      // Keep the slot reserved until a late connection has been destroyed.
      const cleanup = connection.then(value => { value.release(true) }, () => {}).then(releaseSlot)
      openings.add(cleanup)
      void cleanup.then(() => openings.delete(cleanup), () => openings.delete(cleanup))
      throw classifyPostgresError(error)
    } finally {
      clearTimeout(timer)
      if (abortOpening) signal.removeEventListener('abort', abortOpening)
    }
    let released = false
    const release = (destroy = false) => { if (!released) { released = true; client.release(destroy); releaseSlot() } }
    let rejectStop!: (error: DatabaseError) => void
    const stopped = new Promise<never>((_resolve, reject) => { rejectStop = reject })
    void stopped.catch(() => {})
    const lease: Lease = { client, signal, stopped, destroyed: false }
    const fail = (error: DatabaseError) => { lease.destroyed = true; release(true); rejectStop(error) }
    const abort = () => fail(interrupted())
    const broken = (error: Error) => fail(classifyPostgresError(error))
    client.on('error', broken)
    signal.addEventListener('abort', abort, { once: true })
    try {
      if (signal.aborted) { abort(); throw interrupted() }
      return await work(lease)
    } catch (error) {
      if (classifyPostgresError(error).kind === 'unavailable') lease.destroyed = true
      throw error
    } finally {
      signal.removeEventListener('abort', abort)
      client.removeListener('error', broken)
      release(lease.destroyed)
    }
  }
  const query = async (lease: Lease, sql: string, params: readonly SqlValue[] = []) => {
    if (lease.signal.aborted || lease.destroyed) throw interrupted()
    if (!/^\s*(SELECT|WITH|INSERT|UPDATE|DELETE)\b/i.test(sql)) throw scopeError()
    for (const value of params) {
      if (value === null || typeof value === 'string' || Buffer.isBuffer(value)) continue
      if (typeof value !== 'number' || !Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) throw new DatabaseError('data')
    }
    try {
      // Extended protocol rejects multiple statements. SQL uses native $n binds;
      // literals, comments and JSON question-mark operators remain untouched.
      const config: QueryConfig & { queryMode: 'extended' } = { text: sql, values: [...params], queryMode: 'extended' }
      return await Promise.race([lease.client.query(config), lease.stopped])
    } catch (error) { throw classifyPostgresError(error) }
  }
  const execute = (lease: Lease): SqlExecutor => ({
    dialect: 'postgres', schema: options.schema,
    get: async <T extends Row>(sql: string, params?: readonly SqlValue[]) => (await query(lease, sql, params)).rows[0] as T | undefined,
    all: async <T extends Row>(sql: string, params?: readonly SqlValue[]) => (await query(lease, sql, params)).rows as T[],
    run: async (sql, params) => {
      const result = await query(lease, sql, params)
      const id: unknown = result.command === 'INSERT' ? result.rows[0]?.id : undefined
      return { changes: result.rowCount ?? 0, lastID: typeof id === 'number' && Number.isSafeInteger(id) ? id : 0 }
    },
  })
  const transaction = <T>(work: (tx: SqlExecutor) => Promise<T>, operation: OperationOptions = {}) => track(() => withLease(async lease => {
    const scope = { active: true }
    let accepting = true, begun = false, committing = false
    let tail = Promise.resolve()
    let failure: unknown
    const raw = execute(lease)
    const queue = <R>(work: () => Promise<R>): Promise<R> => {
      if (!accepting) return Promise.reject(scopeError())
      const pending = tail.then(work)
      tail = pending.then(() => {}, error => { failure ??= error })
      return pending
    }
    const tx: SqlExecutor = { dialect: 'postgres', schema: options.schema, get: (sql, params) => queue(() => raw.get(sql, params)),
      all: (sql, params) => queue(() => raw.all(sql, params)), run: (sql, params) => queue(() => raw.run(sql, params)) }
    const control = async (sql: string) => {
      try { await Promise.race([lease.client.query(sql), lease.stopped]) }
      catch (error) { throw classifyPostgresError(error) }
    }
    try {
      await control('BEGIN'); begun = true
      const value = await Promise.race([transactionScope.run(scope, () => work(tx)), lease.stopped])
      accepting = false
      await tail
      if (failure) throw failure
      if (lease.signal.aborted || lease.destroyed) throw interrupted()
      committing = true
      await control('COMMIT')
      committing = false; begun = false
      return value
    } catch (error) {
      accepting = false
      await tail
      const classified = classifyPostgresError(error)
      if (begun && !lease.destroyed) {
        try { await control('ROLLBACK') } catch { lease.destroyed = true }
      }
      if (committing && ['unavailable', 'interrupted'].includes(classified.kind)) {
        lease.destroyed = true
        throw new DatabaseError('outcome_unknown', undefined, classified.postgresCode)
      }
      // Domain errors retain identity; native query errors were sanitized by query().
      throw error
    } finally { accepting = false; scope.active = false }
  }, operation.signal))
  return {
    dialect: 'postgres', schema: options.schema,
    get: (sql, params) => track(() => withLease(lease => execute(lease).get(sql, params))),
    all: (sql, params) => track(() => withLease(lease => execute(lease).all(sql, params))),
    run: (sql, params) => track(() => withLease(lease => execute(lease).run(sql, params))),
    transaction,
    ready: () => track(() => withLease(async lease => {
      const table = { main: 'site_config', audit: 'audit_logs', bff: 'records' }[options.schema]
      await query(lease, `SELECT 1 FROM ${options.schema}.${table} LIMIT 1`)
    })),
    close: () => {
      if (transactionScope.getStore()?.active) return Promise.reject(scopeError())
      if (!closing) {
        closing = Promise.resolve().then(async () => {
          for (const waiter of waiters.splice(0)) waiter.cancel(interrupted())
          const timer = setTimeout(() => shutdown.abort(), grace)
          try { await Promise.allSettled([...active]) } finally { clearTimeout(timer); shutdown.abort() }
          await Promise.allSettled([...openings])
          await pool.end()
        })
      }
      return closing
    },
  }
}
