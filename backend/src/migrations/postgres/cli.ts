import { initializePostgres } from './engine.js'

async function main() {
  const [action, database, role] = process.argv.slice(2)
  if (action !== 'initialize' || !database || !role || process.argv.length !== 5 || !process.env.POSTGRES_MIGRATION_URL) throw Error('PG_MIGRATION_ARGUMENTS')
  console.log(JSON.stringify(await initializePostgres(process.env.POSTGRES_MIGRATION_URL, database, role)))
}
if (require.main === module) void main().catch(error => {
  console.error(JSON.stringify({ error: /^PG_MIGRATION_[A-Z_]+$/.test(error?.message || '') ? error.message : 'PG_MIGRATION_FAILED' }))
  process.exitCode = 1
})
