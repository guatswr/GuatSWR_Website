import path from 'node:path'
import sqlite from 'sqlite3'
import { resolvePaths } from '../models/db.js'
import { checkDatabase } from '../migrations/engine.js'
import { createSqliteStore } from '../database/sqlite.js'
import { runCleanupBatch } from './cleanup.js'
import { createAssetPublication } from './publication.js'
import { createPostgresStore } from '../database/postgres.js'
import { checkPostgresSchema } from '../migrations/postgres/engine.js'

async function main() {
  const args = process.argv.slice(2), apply = args.at(-1) === '--apply'
  if (apply) args.pop()
  let journal: string | undefined
  if (args.length === 8 && args[6] === '--journal-dir') { journal = args[7]; args.splice(6, 2) }
  if (args.length !== 6 || !['--main-db', '--postgres-url-env'].includes(args[0]!) || args[2] !== '--public-dir' || args[4] !== '--quarantine-dir') throw new Error('CLEANUP_ARGUMENTS')
  const filename = args[1]!, root = args[3]!, quarantine = args[5]!
  if (args[0] === '--postgres-url-env') {
    if (filename !== 'POSTGRES_URL' || !process.env.POSTGRES_URL || ![root, quarantine].every(path.isAbsolute)) throw new Error('CLEANUP_ARGUMENTS')
    const store = createPostgresStore({ connectionString: process.env.POSTGRES_URL, schema: 'main', maxConnections: 1 })
    try {
      await checkPostgresSchema(store)
      if (!apply) {
        console.log(JSON.stringify({ dryRun: true, jobs: await store.all('SELECT state,count(*) AS count FROM asset_cleanup_jobs GROUP BY state') }))
        return
      }
      const publication = createAssetPublication({ store, filename: path.join(path.dirname(quarantine), 'postgres-assets'), publicRoot: root,
        journalRoot: journal || path.join(path.dirname(quarantine), 'asset-publications'), quarantine,
        signal: new AbortController().signal, track: work => work(), report: () => console.error('Publication recovery retained data for inspection.') })
      await publication.recover()
      console.log(JSON.stringify(await runCleanupBatch(store, root, quarantine)))
      return
    } finally { await store.close() }
  }
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
  try {
    const publication = createAssetPublication({ store, filename, publicRoot: root, journalRoot: journal || path.join(path.dirname(quarantine), 'asset-publications'), quarantine,
      signal: new AbortController().signal, track: work => work(), report: () => console.error('Publication recovery retained data for inspection.') })
    await publication.recover()
    console.log(JSON.stringify(await runCleanupBatch(store, root, quarantine)))
  } finally { await store.close() }
}
void main().catch(() => { console.error('Asset cleanup failed; inspect paths, migration and pending jobs.'); process.exitCode = 1 })
