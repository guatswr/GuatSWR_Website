import type { DatabaseStore } from './contracts.js'
import type { DatabaseConfiguration } from './config.js'
import { createSqliteStore } from './sqlite.js'
import { createPostgresStore, type PostgresSchema } from './postgres.js'

/** Adapter factory only. Application activation requires PG-02/03 SQL migration. */
export function createDatabaseStore(config: DatabaseConfiguration, options: { sqliteFilename: string; schema: PostgresSchema }): DatabaseStore {
  return config.driver === 'sqlite' ? createSqliteStore(options.sqliteFilename)
    : createPostgresStore({ connectionString: config.connectionString, schema: options.schema })
}
