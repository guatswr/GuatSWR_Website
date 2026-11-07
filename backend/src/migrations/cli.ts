import { runMigrationCli } from './postgres/cli.js'

async function main() {
  const result = await runMigrationCli()
  console.log(JSON.stringify(result))
}

if (require.main === module) void main().catch(error => {
  console.error(JSON.stringify({ error: /^PG_MIGRATION_[A-Z_]+$/.test(error?.message || '') ? error.message : 'PG_MIGRATION_FAILED' }))
  process.exitCode = 1
})
