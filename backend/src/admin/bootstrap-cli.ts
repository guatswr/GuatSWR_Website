import path from 'node:path'
import sqlite from 'sqlite3'
import { checkDatabase } from '../migrations/engine.js'
import { resolvePaths } from '../models/db.js'
import { createSqliteStore } from '../database/sqlite.js'
import { bootstrapAdministrator } from './bootstrap.js'

async function main() {
  const [flag, filename, ...extra] = process.argv.slice(2)
  if (flag !== '--main-db' || !filename || !path.isAbsolute(filename) || extra.length) throw new Error('BOOTSTRAP_ARGUMENTS')
  const db = await new Promise<sqlite.Database>((resolve, reject) => {
    const connection = new sqlite.Database(filename, sqlite.OPEN_READWRITE, error => error ? reject(error) : resolve(connection))
  })
  try { await checkDatabase(db, path.join(resolvePaths({}).BACKEND_ROOT, 'src/migrations'), 'main') }
  finally { await new Promise<void>((resolve, reject) => db.close(error => error ? reject(error) : resolve())) }
  const store = createSqliteStore(filename)
  try { console.log(JSON.stringify({ bootstrap: await bootstrapAdministrator(store, process.env.SUPER_ADMIN_USERNAME, process.env.SUPER_ADMIN_PASSWORD) })) }
  finally { await store.close() }
}
void main().catch(() => { console.error('Administrator bootstrap failed; check explicit database path, schema and credentials.'); process.exitCode = 1 })
