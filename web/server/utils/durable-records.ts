import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, chmodSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { postgresStateStore, stateDriver } from './postgres-state.ts'

export interface DurableRecords<T> extends Map<string, T> {
  close: () => void
  deleteMany: (keys: Iterable<string>) => number
  atomicUpdate: (id: string, updater: (current: T | undefined) => T) => T
}

export interface AsyncDurableStore<T> {
  get: (key: string) => Promise<T | undefined>
  set: (key: string, value: T) => Promise<void>
  delete: (key: string) => Promise<boolean>
  deleteMany: (keys: Iterable<string>) => Promise<number>
  atomicUpdate: (id: string, updater: (current: T | undefined) => T) => Promise<T>
  clear: () => Promise<number>
  size: () => Promise<number>
  close: () => Promise<void>
  sweepBatch?: (batchSize?: number, isExpired?: (item: T) => boolean) => Promise<number>
  scan?: (filter?: (item: T, id: string) => boolean) => Promise<Array<{ id: string; item: T }>>
}

export interface PostgresDurableStoreOptions {
  namespace: string
  secret: Buffer
  connectionString?: string
  maxConnections?: number
  maxEntries?: number
}

export function createPostgresDurableStore<T>(options: PostgresDurableStoreOptions) {
  return postgresStateStore<T>(options)
}

export function createAsyncDurableStore<T>(options: {
  namespace: string
  secret: Buffer
  driver?: 'sqlite' | 'postgres' | 'memory'
  connectionString?: string
  maxConnections?: number
}): AsyncDurableStore<T> {
  const driver = stateDriver(options.driver)
  if (driver === 'postgres') {
    return createPostgresDurableStore<T>(options)
  }
  const syncStore = durableRecords<T>(options.namespace, options.secret)
  return {
    get: async (id: string) => syncStore.get(id),
    set: async (id: string, value: T) => {
      syncStore.set(id, value)
    },
    delete: async (id: string) => syncStore.delete(id),
    deleteMany: async (ids: Iterable<string>) => syncStore.deleteMany(ids),
    atomicUpdate: async (id: string, updater: (current: T | undefined) => T) => syncStore.atomicUpdate(id, updater),
    clear: async () => {
      const size = syncStore.size
      syncStore.clear()
      return size
    },
    size: async () => syncStore.size,
    close: async () => syncStore.close(),
    sweepBatch: async (batchSize = 100, isExpired?: (item: T) => boolean) => {
      if (!isExpired) return 0
      const expired: string[] = []
      for (const [k, v] of syncStore) {
        if (isExpired(v)) {
          expired.push(k)
          if (expired.length >= batchSize) break
        }
      }
      return syncStore.deleteMany(expired)
    },
    scan: async (filter?: (item: T, id: string) => boolean) => {
      const result: Array<{ id: string; item: T }> = []
      for (const [k, v] of syncStore) {
        if (!filter || filter(v, k)) {
          result.push({ id: k, item: v })
        }
      }
      return result
    },
  }
}

class MemoryDurableRecords<T> extends Map<string, T> implements DurableRecords<T> {
  close(): void {}

  deleteMany(keys: Iterable<string>): number {
    let removed = 0
    for (const key of keys) {
      if (super.delete(key)) removed += 1
    }
    return removed
  }

  atomicUpdate(id: string, updater: (current: T | undefined) => T): T {
    const current = super.get(id)
    const cloned = current !== undefined ? structuredClone(current) : undefined
    const candidate = updater(cloned)
    super.delete(id)
    super.set(id, candidate)
    return candidate
  }
}

/** Single-process durable capabilities. No raw cookies or plaintext tokens on disk. */
export function durableRecords<T>(namespace: string, secret: Buffer): DurableRecords<T> {
  const root = process.env.BFF_STATE_DIR
  if (!root) return new MemoryDurableRecords<T>()
  mkdirSync(root, { recursive: true, mode: 0o700 })
  chmodSync(root, 0o700)
  const filename = join(resolve(root), createHash('sha256').update(namespace).update(secret).digest('hex') + '.sqlite')
  const db = new DatabaseSync(filename)
  chmodSync(filename, 0o600)
  db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY, value BLOB NOT NULL)')

  const insertStmt = db.prepare('INSERT OR REPLACE INTO records VALUES (?, ?)')
  const deleteStmt = db.prepare('DELETE FROM records WHERE key = ?')
  const selectAllStmt = db.prepare('SELECT key, value FROM records')
  const clearStmt = db.prepare('DELETE FROM records')

  const key = createHash('sha256').update('guatswr:durable-records:v1').update(namespace).update(secret).digest()
  const seal = (id: string, value: T) => {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    cipher.setAAD(Buffer.from(id))
    return Buffer.concat([iv, cipher.update(JSON.stringify(value)), cipher.final(), cipher.getAuthTag()])
  }
  const open = (id: string, raw: Uint8Array): T => {
    const data = Buffer.from(raw)
    const cipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12))
    cipher.setAAD(Buffer.from(id))
    cipher.setAuthTag(data.subarray(-16))
    return JSON.parse(Buffer.concat([cipher.update(data.subarray(12, -16)), cipher.final()]).toString()) as T
  }

  class Records extends Map<string, T> implements DurableRecords<T> {
    _hydrate(id: string, value: T): void {
      super.set(id, value)
    }

    override set(id: string, value: T): this {
      const sealed = seal(id, value)
      insertStmt.run(id, sealed)
      super.delete(id)
      super.set(id, value)
      return this
    }

    override delete(id: string): boolean {
      try {
        deleteStmt.run(id)
      }
      catch (error) {
        super.delete(id)
        throw error
      }
      return super.delete(id)
    }

    deleteMany(keys: Iterable<string>): number {
      const list = Array.isArray(keys) ? keys : Array.from(keys)
      if (list.length === 0) return 0
      try {
        db.exec('BEGIN IMMEDIATE')
        for (const k of list) {
          deleteStmt.run(k)
        }
        db.exec('COMMIT')
      }
      catch (error) {
        try {
          db.exec('ROLLBACK')
        }
        catch {
          // Rollback failed or transaction already closed
        }
        for (const k of list) {
          super.delete(k)
        }
        throw error
      }
      let removed = 0
      for (const k of list) {
        if (super.delete(k)) removed += 1
      }
      return removed
    }

    atomicUpdate(id: string, updater: (current: T | undefined) => T): T {
      const current = super.get(id)
      const cloned = current !== undefined ? structuredClone(current) : undefined
      const candidate = updater(cloned)
      const sealed = seal(id, candidate)
      insertStmt.run(id, sealed)
      super.delete(id)
      super.set(id, candidate)
      return candidate
    }

    override clear(): void {
      try {
        clearStmt.run()
      }
      catch (error) {
        super.clear()
        throw error
      }
      super.clear()
    }

    private _closed = false

    close(): void {
      if (this._closed) return
      this._closed = true
      try {
        db.close()
      }
      catch {
        // Safe idempotent close
      }
    }
  }

  const records = new Records()
  for (const row of selectAllStmt.all()) {
    // Authentication/corruption errors fail closed; never silently reset capabilities.
    records._hydrate(String(row.key), open(String(row.key), row.value as Uint8Array))
  }
  return records
}
