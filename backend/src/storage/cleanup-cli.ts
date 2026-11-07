import path from 'node:path'
import { runCleanupBatch } from './cleanup.js'
import { createAssetPublication } from './publication.js'
import { createPostgresStore } from '../database/postgres.js'
import { checkPostgresSchema } from '../migrations/postgres/engine.js'

async function main() {
  const args = process.argv.slice(2), apply = args.at(-1) === '--apply'
  if (apply) args.pop()
  let journal: string | undefined
  if (args.length === 8 && args[6] === '--journal-dir') { journal = args[7]; args.splice(6, 2) }
  if (args.length !== 6 || args[0] !== '--postgres-url-env' || args[2] !== '--public-dir' || args[4] !== '--quarantine-dir') throw new Error('CLEANUP_ARGUMENTS')
  const envName = args[1]!, root = args[3]!, quarantine = args[5]!
  const url = process.env[envName]
  if (!url || ![root, quarantine].every(path.isAbsolute)) throw new Error('CLEANUP_ARGUMENTS')
  const store = createPostgresStore({ connectionString: url, schema: 'main', maxConnections: 1 })
  try {
    await checkPostgresSchema(store)
    if (!apply) {
      console.log(JSON.stringify({ dryRun: true, jobs: await store.all('SELECT state,count(*) AS count FROM asset_cleanup_jobs GROUP BY state') }))
      return
    }
    const publication = createAssetPublication({
      store,
      filename: path.join(path.dirname(quarantine), 'postgres-assets'),
      publicRoot: root,
      journalRoot: journal || path.join(path.dirname(quarantine), 'asset-publications'),
      quarantine,
      signal: new AbortController().signal,
      track: work => work(),
      report: () => console.error('Publication recovery retained data for inspection.')
    })
    await publication.recover()
    console.log(JSON.stringify(await runCleanupBatch(store, root, quarantine)))
    return
  } finally { await store.close() }
}
void main().catch(() => { console.error('Asset cleanup failed; inspect database configuration and pending jobs.'); process.exitCode = 1 })
