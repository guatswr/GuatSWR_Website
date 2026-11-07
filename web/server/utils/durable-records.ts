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

export class MemoryDurableRecords<T> extends Map<string, T> implements DurableRecords<T> {
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

/** In-memory state records implementation for ephemeral and unit-test environments. */
export function durableRecords<T>(_namespace: string, _secret: Buffer): DurableRecords<T> {
  return new MemoryDurableRecords<T>()
}

export function createAsyncDurableStore<T>(options: {
  namespace: string
  secret: Buffer
  driver?: 'postgres' | 'memory'
  connectionString?: string
  maxConnections?: number
}): AsyncDurableStore<T> {
  const driver = stateDriver(options.driver)
  if (driver === 'postgres') {
    return createPostgresDurableStore<T>(options)
  }
  const syncStore = new MemoryDurableRecords<T>()
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
