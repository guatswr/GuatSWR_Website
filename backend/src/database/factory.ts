import type { DatabaseStore } from './contracts.js'
import type { DatabaseConfiguration } from './config.js'
import { createPostgresStore, type PostgresSchema } from './postgres.js'

export function createDatabaseStore(config: DatabaseConfiguration, options: { sqliteFilename?: string; schema: PostgresSchema }): DatabaseStore {
  return createPostgresStore({ connectionString: config.connectionString, schema: options.schema })
}
