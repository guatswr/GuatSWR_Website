import type { SqlExecutor } from '../../database/contracts.js'

export interface ConfigEntry { key: string; value: string | null }
export interface ConfigRepository {
  list(): Promise<ConfigEntry[]>
  save(key: string, value: string, executor?: SqlExecutor): Promise<void>
}
export function createConfigRepository(db: SqlExecutor): ConfigRepository {
  return {
    list: () => db.all<{ key: string; value: string | null }>('SELECT key,value FROM site_config'),
    save: async (key, value, executor = db) => { await executor.run("INSERT INTO site_config (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [key, value]) }
  }
}
