import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { onTestFinished } from 'vitest'
const require = createRequire(import.meta.url)
const sqlite = require('sqlite3')
const { Pool } = require('pg')
const { createPostgresStore } = require('../../dist/src/database/postgres.js')
const { createDatabaseStore } = require('../../dist/src/database/factory.js')
export const appUrl = process.env.PG_ADAPTER_TEST_URL
export const adminUrl = process.env.PG_ADAPTER_ADMIN_URL
for (const value of [appUrl, adminUrl]) {
  if (!value) throw Error('Use pnpm test:database to provision isolated PostgreSQL')
  const url = new URL(value)
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/guatswr_pg_contract_test') throw Error('Isolated database required')
}
export async function fixture(driver, options = {}) {
  if (driver === 'postgres') {
    const admin = new Pool({ connectionString: adminUrl, max: 1 })
    admin.on('error', () => {})
    await admin.query('TRUNCATE main.items RESTART IDENTITY CASCADE')
    const store = Object.keys(options).length ? createPostgresStore({ connectionString: appUrl, schema: 'main', ...options })
      : createDatabaseStore({ driver: 'postgres', connectionString: appUrl }, { sqliteFilename: '', schema: 'main' })
    onTestFinished(async () => { await store.close(); await admin.end() })
    return { store, admin, bind: index => `$${index}`, blob: 'BYTEA' }
  }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guatswr-adapter-'))
  const filename = path.join(root, 'main.db')
  const db = new sqlite.Database(filename)
  await new Promise((resolve, reject) => db.exec('PRAGMA journal_mode=WAL; CREATE TABLE items(id INTEGER PRIMARY KEY AUTOINCREMENT,label TEXT UNIQUE,parent_id INTEGER REFERENCES items(id),value BLOB)', error => error ? reject(error) : resolve()))
  const store = createDatabaseStore({ driver: 'sqlite' }, { sqliteFilename: filename, schema: 'main' })
  onTestFinished(async () => {
    await store.close()
    await new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()))
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('guatswr-adapter-')) throw Error('Unsafe cleanup')
    await fs.rm(root, { recursive: true, force: true })
  })
  return { store, bind: () => '?' }
}
