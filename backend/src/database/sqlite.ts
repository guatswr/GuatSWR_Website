import path from 'node:path'
import { AsyncLocalStorage } from 'node:async_hooks'
import { setMaxListeners } from 'node:events'
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

/**
 * Accurately determines if a query is mutating (write).
 * In SQLite, statements starting with INSERT/UPDATE/DELETE/REPLACE are writes.
 * Common Table Expressions (WITH) can contain mutations (e.g. WITH ins AS (INSERT ... RETURNING ...) SELECT ...),
 * and MUST be classified as writes to never run on a read lease.
 */
const isWriteStatement = (sql: string): boolean => {
  if (/^\s*(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql)) return true
  if (/^\s*WITH\b/i.test(sql)) {
    return /\b(?:INSERT|UPDATE|DELETE)\b/i.test(sql) || /\bREPLACE\b(?!\s*\()/i.test(sql)
  }
  return false
}

const control = (db: sqlite.Database, sql: string) => new Promise<void>((resolve, reject) => {
  db.exec(sql, error => error ? reject(classifySqliteError(error)) : resolve())
})
const closeConnection = (db: sqlite.Database) => new Promise<void>((resolve, reject) => {
  db.close(error => error ? reject(classifySqliteError(error)) : resolve())
})

export interface OperationOptions { signal?: AbortSignal }
export interface SqliteStoreOptions {
  busyTimeoutMs?: number
  maxReaders?: number
}
export interface SqliteStore extends SqlExecutor {
  transaction<T>(work: (transaction: SqlExecutor) => Promise<T>, options?: OperationOptions): Promise<T>
  close(): Promise<void>
}

export function createSqliteStore(filename: string, options: SqliteStoreOptions = {}): SqliteStore {
  const busyTimeoutMs = options.busyTimeoutMs ?? 1000
  if (options.maxReaders !== undefined && (!Number.isInteger(options.maxReaders) || options.maxReaders < 1)) throw scopeError()
  const maxReaders = Math.min(16, Math.max(1, options.maxReaders ?? 4))
  if (!path.isAbsolute(filename) || !Number.isInteger(busyTimeoutMs) || busyTimeoutMs < 0 || busyTimeoutMs > 5000) throw scopeError()
  const shutdown = new AbortController()
  // Every connection/waiter removes its listener; concurrent requests share this owner signal.
  setMaxListeners(0, shutdown.signal)
  const active = new Set<Promise<unknown>>()
  let closing: Promise<void> | undefined
  let isClosing = false

  const createRawConnection = async (): Promise<sqlite.Database> => {
    const db = await new Promise<sqlite.Database>((resolve, reject) => {
      const value = new sqlite.Database(filename, sqlite.OPEN_READWRITE, error => error ? reject(classifySqliteError(error)) : resolve(value))
    })
    try {
      db.configure('busyTimeout', busyTimeoutMs)
      await control(db, 'PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA synchronous=NORMAL;')
      return db
    } catch (error) {
      await closeConnection(db)
      throw error
    }
  }

  // -------------------------------------------------------------
  // Writer connection and lease management
  // -------------------------------------------------------------
  let writerHeld = false
  let writerDb: sqlite.Database | undefined
  const writers: { grant(): void; cancel(error: DatabaseError): void }[] = []

  const acquireWriter = (signal: AbortSignal) => new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(interrupted()); return }
    if (isClosing) { reject(scopeError()); return }
    if (!writerHeld) { writerHeld = true; resolve(); return }
    if (!busyTimeoutMs || writers.length >= 128) { reject(new DatabaseError('busy')); return }
    const abort = () => waiter.cancel(interrupted())
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', abort) }
    const waiter = {
      grant: () => { cleanup(); resolve() },
      cancel: (error: DatabaseError) => {
        const index = writers.indexOf(waiter)
        if (index < 0) return
        writers.splice(index, 1)
        cleanup()
        reject(error)
      }
    }
    const timer = setTimeout(() => waiter.cancel(new DatabaseError('busy')), busyTimeoutMs)
    writers.push(waiter)
    signal.addEventListener('abort', abort, { once: true })
  })

  const getWriterDb = async (): Promise<sqlite.Database> => {
    if (writerDb) return writerDb
    const db = await createRawConnection()
    writerDb = db
    return db
  }

  const destroyWriterDb = async () => {
    if (writerDb) {
      const db = writerDb
      writerDb = undefined
      await closeConnection(db).catch(() => {})
    }
  }

  const withWriter = async <T>(work: (db: sqlite.Database) => Promise<T>, supplied?: AbortSignal): Promise<T> => {
    const signal = supplied ? AbortSignal.any([shutdown.signal, supplied]) : shutdown.signal
    await acquireWriter(signal)
    try {
      if (signal.aborted || isClosing) throw interrupted()
      const db = await getWriterDb()
      return await work(db)
    } finally {
      const next = writers.shift()
      if (next) next.grant()
      else writerHeld = false
    }
  }

  // -------------------------------------------------------------
  // Reader connections and lease pool management
  // -------------------------------------------------------------
  const allReaders = new Set<sqlite.Database>()
  let openingReaders = 0
  const idleReaders: sqlite.Database[] = []
  const readerWaiters: { grant(db: sqlite.Database): void; cancel(error: DatabaseError): void }[] = []

  const openReader = async () => {
    // Reserve synchronously: concurrent acquisitions must count opens in progress.
    openingReaders++
    try {
      const db = await createRawConnection()
      allReaders.add(db)
      return db
    } finally {
      openingReaders--
    }
  }

  const acquireReader = (signal: AbortSignal): Promise<sqlite.Database> => {
    if (signal.aborted) return Promise.reject(interrupted())
    if (isClosing) return Promise.reject(scopeError())

    while (idleReaders.length > 0) {
      const db = idleReaders.pop()!
      if (allReaders.has(db)) return Promise.resolve(db)
    }

    if (allReaders.size + openingReaders < maxReaders) {
      return openReader()
    }

    if (!busyTimeoutMs || readerWaiters.length >= 128) {
      return Promise.reject(new DatabaseError('busy'))
    }

    return new Promise<sqlite.Database>((resolve, reject) => {
      const abort = () => waiter.cancel(interrupted())
      const cleanup = () => {
        clearTimeout(timer)
        signal.removeEventListener('abort', abort)
      }
      const waiter = {
        grant: (db: sqlite.Database) => {
          cleanup()
          resolve(db)
        },
        cancel: (error: DatabaseError) => {
          const index = readerWaiters.indexOf(waiter)
          if (index >= 0) readerWaiters.splice(index, 1)
          cleanup()
          reject(error)
        }
      }
      const timer = setTimeout(() => waiter.cancel(new DatabaseError('busy')), busyTimeoutMs)
      readerWaiters.push(waiter)
      signal.addEventListener('abort', abort, { once: true })
    })
  }

  const releaseReader = async (db: sqlite.Database, healthy: boolean) => {
    if (!healthy || isClosing || !allReaders.has(db)) {
      allReaders.delete(db)
      const closed = closeConnection(db).catch(() => {})
      if (!isClosing && readerWaiters.length > 0 && allReaders.size + openingReaders < maxReaders) {
        const replacementPromise = openReader().then(async replacement => {
          if (isClosing) {
            allReaders.delete(replacement)
            await closeConnection(replacement).catch(() => {})
            return
          }
          allReaders.add(replacement)
          const next = readerWaiters.shift()
          if (next) next.grant(replacement)
          else idleReaders.push(replacement)
        }).catch(err => {
          if (!isClosing) {
            const next = readerWaiters.shift()
            if (next) next.cancel(classifySqliteError(err))
          }
        })
        active.add(replacementPromise)
        replacementPromise.finally(() => {
          active.delete(replacementPromise)
        })
      }
      await closed
      return
    }

    const next = readerWaiters.shift()
    if (next) {
      next.grant(db)
    } else {
      idleReaders.push(db)
    }
  }

  const withReader = async <T>(work: (db: sqlite.Database) => Promise<T>, supplied?: AbortSignal): Promise<T> => {
    const signal = supplied ? AbortSignal.any([shutdown.signal, supplied]) : shutdown.signal
    if (signal.aborted) throw interrupted()
    const db = await acquireReader(signal)
    let healthy = true
    const abort = () => {
      healthy = false
      db.interrupt()
    }
    signal.addEventListener('abort', abort, { once: true })
    try {
      if (signal.aborted) throw interrupted()
      return await work(db)
    } catch (error) {
      const err = classifySqliteError(error)
      if (err.kind === 'unavailable' || err.kind === 'interrupted') {
        healthy = false
      }
      throw signal.aborted ? interrupted() : err
    } finally {
      signal.removeEventListener('abort', abort)
      await releaseReader(db, healthy)
    }
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
    if (closing || isClosing || transactionScope.getStore()?.active) return Promise.reject(scopeError())
    const pending = work()
    active.add(pending)
    pending.then(() => active.delete(pending), () => active.delete(pending))
    return pending
  }

  const executeWrite = <T>(sql: string, work: (executor: SqlExecutor) => Promise<T>): Promise<T> => track(() => withWriter(async (db) => {
    statement(sql)
    const signal = shutdown.signal
    if (signal.aborted) throw interrupted()
    let connectionDamaged = false
    const abort = () => {
      connectionDamaged = true
      db.interrupt()
    }
    signal.addEventListener('abort', abort, { once: true })
    try {
      if (signal.aborted) throw interrupted()
      const raw = execute(db)
      return await work(raw)
    } catch (error) {
      const err = classifySqliteError(error)
      if (err.kind === 'unavailable' || signal.aborted) {
        connectionDamaged = true
      }
      throw signal.aborted ? interrupted() : err
    } finally {
      signal.removeEventListener('abort', abort)
      if (connectionDamaged) {
        await destroyWriterDb()
      }
    }
  }))

  const executeRead = <T>(sql: string, work: (executor: SqlExecutor) => Promise<T>): Promise<T> => track(() => withReader(async (db) => {
    statement(sql)
    const raw = execute(db)
    return await work(raw)
  }))

  const single = async <T>(sql: string, work: (executor: SqlExecutor) => Promise<T>): Promise<T> => {
    statement(sql)
    return isWriteStatement(sql) ? executeWrite(sql, work) : executeRead(sql, work)
  }

  return {
    get: <T extends Row>(sql: string, params: readonly SqlValue[] = []) => single(sql, executor => executor.get<T>(sql, params)),
    all: <T extends Row>(sql: string, params: readonly SqlValue[] = []) => single(sql, executor => executor.all<T>(sql, params)),
    run: (sql: string, params: readonly SqlValue[] = []) => single(sql, executor => executor.run(sql, params)),
    transaction: <T>(work: (transaction: SqlExecutor) => Promise<T>, operation: OperationOptions = {}) => track(() => withWriter(async (db) => {
      const signal = operation.signal ? AbortSignal.any([shutdown.signal, operation.signal]) : shutdown.signal
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
        abortCallback = () => {
          db.interrupt()
          reject(interrupted())
        }
        signal.addEventListener('abort', abortCallback, { once: true })
      })
      void cancelled.catch(() => {})
      let begun = false
      let connectionDamaged = false
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
        if (begun) {
          try {
            await control(db, 'ROLLBACK')
          } catch {
            connectionDamaged = true
          }
        }
        const err = classifySqliteError(error)
        if (err.kind === 'unavailable' || signal.aborted) {
          connectionDamaged = true
        }
        throw signal.aborted ? interrupted() : error
      } finally {
        scope.active = false
        accepting = false
        if (abortCallback) signal.removeEventListener('abort', abortCallback)
        if (connectionDamaged) {
          await destroyWriterDb()
        }
      }
    }, operation.signal)),
    close: () => {
      if (transactionScope.getStore()?.active) return Promise.reject(scopeError())
      if (!closing) {
        isClosing = true
        closing = Promise.resolve().then(async () => {
          shutdown.abort()
          for (const w of writers.splice(0)) {
            w.cancel(interrupted())
          }
          for (const r of readerWaiters.splice(0)) {
            r.cancel(interrupted())
          }
          await Promise.allSettled([...active])
          await destroyWriterDb()
          const toClose = [...allReaders]
          allReaders.clear()
          idleReaders.length = 0
          await Promise.allSettled(toClose.map(closeConnection))
        })
      }
      return closing
    }
  }
}
