import type { SqlExecutor } from '../../database/sqlite.js'

export interface ConfigEntry { key: string; value: string | null }
export interface ConfigRepository {
  list(): Promise<ConfigEntry[]>
  save(key: string, value: string): Promise<void>
}
export function createConfigRepository(db: SqlExecutor): ConfigRepository {
  return {
    list: () => db.all<{ key: string; value: string | null }>('SELECT key,value FROM site_config'),
    save: async (key, value) => { await db.run('INSERT OR REPLACE INTO site_config (key, value) VALUES (?, ?)', [key, value]) }
  }
}
