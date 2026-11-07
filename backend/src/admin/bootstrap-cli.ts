import { bootstrapAdministrator } from './bootstrap.js'
import { createPostgresStore } from '../database/postgres.js'
import { checkPostgresSchema } from '../migrations/postgres/engine.js'

async function main() {
  const [flag, envName, ...extra] = process.argv.slice(2)
  if (flag === '--postgres-url-env') {
    const key = envName || 'POSTGRES_URL'
    const url = process.env[key]
    if (!url || extra.length) throw new Error('BOOTSTRAP_ARGUMENTS')
    const store = createPostgresStore({ connectionString: url, schema: 'main', maxConnections: 1 })
    try {
      await checkPostgresSchema(store)
      console.log(JSON.stringify({ bootstrap: await bootstrapAdministrator(store, process.env.SUPER_ADMIN_USERNAME, process.env.SUPER_ADMIN_PASSWORD) }))
      return
    } finally { await store.close() }
  }
  throw new Error('BOOTSTRAP_ARGUMENTS')
}
void main().catch(() => { console.error('Administrator bootstrap failed; check explicit database configuration and credentials.'); process.exitCode = 1 })
