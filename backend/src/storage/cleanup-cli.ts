import path from 'node:path'
import sqlite from 'sqlite3'
import { resolvePaths } from '../models/db.js'
import { checkDatabase } from '../migrations/engine.js'
import { createSqliteStore } from '../database/sqlite.js'
import { runCleanupBatch } from './cleanup.js'

async function main() {
  const args = process.argv.slice(2), apply = args.at(-1) === '--apply'
  if (apply) args.pop()
  if (args.length !== 6 || args[0] !== '--main-db' || args[2] !== '--public-dir' || args[4] !== '--quarantine-dir') throw new Error('CLEANUP_ARGUMENTS')
  const filename = args[1]!, root = args[3]!, quarantine = args[5]!
  if (![filename, root, quarantine].every(path.isAbsolute)) throw new Error('CLEANUP_ARGUMENTS')
  const db = await new Promise<sqlite.Database>((resolve, reject) => {
    const value = new sqlite.Database(filename, sqlite.OPEN_READONLY, error => error ? reject(error) : resolve(value))
  })
  try {
    const schema = await checkDatabase(db, path.join(resolvePaths({}).BACKEND_ROOT, 'src/migrations'), 'main', { compatible: true })
    if (schema.version < 2) throw new Error('CLEANUP_MIGRATION_REQUIRED')
    if (!apply) {
      const rows = await new Promise<unknown[]>((resolve, reject) => db.all('SELECT state,count(*) AS count FROM asset_cleanup_jobs GROUP BY state', (error, rows) => error ? reject(error) : resolve(rows)))
      console.log(JSON.stringify({ dryRun: true, jobs: rows }))
      return
    }
  } finally { await new Promise<void>((resolve, reject) => db.close(error => error ? reject(error) : resolve())) }
  const store = createSqliteStore(filename)
  try { console.log(JSON.stringify(await runCleanupBatch(store, root, quarantine))) } finally { await store.close() }
}
void main().catch(() => { console.error('Asset cleanup failed; inspect paths, migration and pending jobs.'); process.exitCode = 1 })
