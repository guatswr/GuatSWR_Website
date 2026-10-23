import path from 'node:path'
import { AsyncLocalStorage } from 'node:async_hooks'
import sqlite from 'sqlite3'

export type SqlValue = string | number | Buffer | null
export type Row = Record<string, unknown>
export interface RunResult { changes: number; lastID: number }
export interface SqlExecutor {
  get<T extends Row = Row>(sql: string, params?: readonly SqlValue[]): Promise<T | undefined>
  all<T extends Row = Row>(sql: string, params?: readonly SqlValue[]): Promise<T[]>
  run(sql: string, params?: readonly SqlValue[]): Promise<RunResult>
}
type Kind = 'busy' | 'constraint' | 'interrupted' | 'unavailable' | 'query' | 'scope'
export class DatabaseError extends Error {
  readonly code: string
  readonly retryable: boolean
  constructor(readonly kind: Kind, readonly sqliteCode?: string) {
    super(`Database ${kind}`)
    this.name = 'DatabaseError'
    this.code = `database_${kind}`
    this.retryable = kind === 'busy'
  }
}
export function classifySqliteError(error: unknown): DatabaseError {
  if (error instanceof DatabaseError) return error
  const candidate = error && typeof error === 'object' && 'code' in error ? error.code : undefined
  const code = typeof candidate === 'string' && /^SQLITE_[A-Z_]+$/.test(candidate) ? candidate : undefined
  const kind = code?.startsWith('SQLITE_CONSTRAINT') ? 'constraint'
    : code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED' ? 'busy'
      : code === 'SQLITE_INTERRUPT' ? 'interrupted'
        : code && /^(SQLITE_CANTOPEN|SQLITE_IOERR|SQLITE_FULL|SQLITE_CORRUPT|SQLITE_NOTADB|SQLITE_READONLY)(_|$)/.test(code) ? 'unavailable' : 'query'
  return new DatabaseError(kind, code)
}
// A callback must use its supplied executor, including when another store is involved.
// Independent main/audit transactions cannot provide a cross-file atomic operation.
const transactionScope = new AsyncLocalStorage<{ active: boolean }>()
const interrupted = () => new DatabaseError('interrupted')
const scopeError = () => new DatabaseError('scope')
const statement = (sql: string) => {
  // Schema/transaction control belongs to migrations and this adapter, never repositories.
  if (!/^\s*(?:SELECT|WITH|INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql)) throw scopeError()
}
const control = (db: sqlite.Database, sql: string) => new Promise<void>((resolve, reject) => {
  db.exec(sql, error => error ? reject(classifySqliteError(error)) : resolve())
})
const closeConnection = (db: sqlite.Database) => new Promise<void>((resolve, reject) => {
  db.close(error => error ? reject(classifySqliteError(error)) : resolve())
})

export interface OperationOptions { signal?: AbortSignal }
export interface SqliteStore extends SqlExecutor {
  transaction<T>(work: (transaction: SqlExecutor) => Promise<T>, options?: OperationOptions): Promise<T>
  close(): Promise<void>
}

export function createSqliteStore(filename: string, options: { busyTimeoutMs?: number } = {}): SqliteStore {
  const busyTimeoutMs = options.busyTimeoutMs ?? 1000
  if (!path.isAbsolute(filename) || !Number.isInteger(busyTimeoutMs) || busyTimeoutMs < 0 || busyTimeoutMs > 5000) throw scopeError()
  const shutdown = new AbortController()
  const active = new Set<Promise<unknown>>()
  let closing: Promise<void> | undefined

  const connection = async () => {
    const db = await new Promise<sqlite.Database>((resolve, reject) => {
      const value = new sqlite.Database(filename, sqlite.OPEN_READWRITE, error => error ? reject(classifySqliteError(error)) : resolve(value))
    })
    try {
      db.configure('busyTimeout', busyTimeoutMs)
      await control(db, 'PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA synchronous=NORMAL;')
      return db
    } catch (error) { await closeConnection(db); throw error }
  }
  const execute = (db: sqlite.Database): SqlExecutor => ({
    get: <T extends Row>(sql: string, params: readonly SqlValue[] = []) => new Promise<T | undefined>((resolve, reject) => {
      statement(sql)
      db.get<T>(sql, [...params], (error, row) => error ? reject(classifySqliteError(error)) : resolve(row))
    }),
    all: <T extends Row>(sql: string, params: readonly SqlValue[] = []) => new Promise<T[]>((resolve, reject) => {
      statement(sql)
      db.all<T>(sql, [...params], (error, rows) => error ? reject(classifySqliteError(error)) : resolve(rows))
    }),
    run: (sql: string, params: readonly SqlValue[] = []) => new Promise<RunResult>((resolve, reject) => {
      statement(sql)
      db.run(sql, [...params], function (error) {
        if (error) reject(classifySqliteError(error))
        else resolve({ changes: this.changes, lastID: this.lastID })
      })
    })
  })
  const track = <T>(work: () => Promise<T>): Promise<T> => {
    if (closing || transactionScope.getStore()?.active) return Promise.reject(scopeError())
    const pending = work()
    active.add(pending)
    pending.then(() => active.delete(pending), () => active.delete(pending))
    return pending
  }
  // Each call owns its connection; no request can enqueue SQL on somebody else's BEGIN.
  const using = async <T>(work: (db: sqlite.Database, signal: AbortSignal) => Promise<T>, supplied?: AbortSignal) => {
    const signal = supplied ? AbortSignal.any([shutdown.signal, supplied]) : shutdown.signal
    if (signal.aborted) throw interrupted()
    const db = await connection()
    const abort = () => db.interrupt()
    signal.addEventListener('abort', abort, { once: true })
    try {
      if (signal.aborted) throw interrupted()
      return await work(db, signal)
    } finally {
      signal.removeEventListener('abort', abort)
      await closeConnection(db)
    }
  }
  // A successful autocommit callback stays successful even if shutdown begins next.
  const single = <T>(work: (executor: SqlExecutor) => Promise<T>) => track(() => using(db => work(execute(db))))

  return {
    get: <T extends Row>(sql: string, params: readonly SqlValue[] = []) => single(executor => executor.get<T>(sql, params)),
    all: <T extends Row>(sql: string, params: readonly SqlValue[] = []) => single(executor => executor.all<T>(sql, params)),
    run: (sql: string, params: readonly SqlValue[] = []) => single(executor => executor.run(sql, params)),
    transaction: <T>(work: (transaction: SqlExecutor) => Promise<T>, operation: OperationOptions = {}) => track(() => using(async (db, signal) => {
      const scope = { active: true }
      let tail = Promise.resolve()
      let accepting = true
      let firstFailure: unknown
      const queue = <R>(query: () => Promise<R>): Promise<R> => {
        if (!accepting) return Promise.reject(scopeError())
        const pending = tail.then(() => {
          if (signal.aborted) throw interrupted()
          return query()
        })
        tail = pending.then(() => {}, error => { firstFailure ??= error })
        return pending
      }
      const raw = execute(db)
      const executor: SqlExecutor = {
        get: (sql, params) => queue(() => raw.get(sql, params)),
        all: (sql, params) => queue(() => raw.all(sql, params)),
        run: (sql, params) => queue(() => raw.run(sql, params))
      }
      let abortCallback: (() => void) | undefined
      const cancelled = new Promise<never>((_resolve, reject) => {
        abortCallback = () => reject(interrupted())
        signal.addEventListener('abort', abortCallback, { once: true })
      })
      // An abort can happen while BEGIN is still waiting for a writer lock.
      void cancelled.catch(() => {})
      let begun = false
      try {
        if (signal.aborted) throw interrupted()
        await control(db, 'BEGIN IMMEDIATE')
        begun = true
        if (signal.aborted) throw interrupted()
        const value = await Promise.race([transactionScope.run(scope, () => work(executor)), cancelled])
        accepting = false
        await tail
        if (firstFailure) throw firstFailure
        if (signal.aborted) throw interrupted()
        await control(db, 'COMMIT')
        begun = false
        return value
      } catch (error) {
        accepting = false
        await tail
        if (begun) await control(db, 'ROLLBACK')
        throw signal.aborted ? interrupted() : error
      } finally {
        scope.active = false
        accepting = false
        if (abortCallback) signal.removeEventListener('abort', abortCallback)
      }
    }, operation.signal)),
    close: () => {
      if (transactionScope.getStore()?.active) return Promise.reject(scopeError())
      if (!closing) {
        // Set the guard before abort listeners can schedule more work.
        closing = Promise.resolve().then(async () => {
          shutdown.abort()
          await Promise.allSettled([...active])
        })
      }
      return closing
    }
  }
}
