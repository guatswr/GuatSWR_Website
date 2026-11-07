import { initializePostgres, checkPostgresSchema } from './engine.js'
import { createPostgresStore } from '../../database/postgres.js'

export async function runMigrationCli(argv: string[] = process.argv.slice(2)) {
  const [action, ...args] = argv
  if (action === 'initialize') {
    const [database, role] = args
    if (!database || !role || args.length !== 2 || !process.env.POSTGRES_MIGRATION_URL) throw Error('PG_MIGRATION_ARGUMENTS')
    return await initializePostgres(process.env.POSTGRES_MIGRATION_URL, database, role)
  }
  if (action === 'check') {
    const url = process.env.POSTGRES_URL || process.env.POSTGRES_MIGRATION_URL
    if (!url) throw Error('PG_MIGRATION_ARGUMENTS')
    const store = createPostgresStore({ connectionString: url, schema: 'main', maxConnections: 1 })
    try {
      return await checkPostgresSchema(store)
    } finally { await store.close() }
  }
  throw Error('PG_MIGRATION_ARGUMENTS')
}

async function main() {
  const result = await runMigrationCli()
  console.log(JSON.stringify(result))
}

if (require.main === module) void main().catch(error => {
  console.error(JSON.stringify({ error: /^PG_MIGRATION_[A-Z_]+$/.test(error?.message || '') ? error.message : 'PG_MIGRATION_FAILED' }))
  process.exitCode = 1
})
