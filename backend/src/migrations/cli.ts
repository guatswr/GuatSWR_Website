import path from 'node:path'
import sqlite from 'sqlite3'
import { resolvePaths } from '../models/db.js'
import { checkDatabase, inspectSchema, migrateDatabase, type Connection } from './engine.js'

async function main() {
  const [action, ...args] = process.argv.slice(2)
  const accepted = new Set(['--data-dir', '--main-fingerprint', '--audit-fingerprint'])
  const options = new Map<string, string>()
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1]
    if (!key || !value || !accepted.has(key) || options.has(key)) throw new Error('MIGRATION_ARGUMENTS')
    options.set(key, value)
  }
  const data = options.get('--data-dir')
  if (!data || !path.isAbsolute(data) || !['check', 'inspect', 'initialize', 'adopt'].includes(action || '')) throw new Error('MIGRATION_ARGUMENTS')
  if (action === 'adopt' && (!options.has('--main-fingerprint') || !options.has('--audit-fingerprint'))) throw new Error('MIGRATION_ADOPT_FINGERPRINT_REQUIRED')
  const directory = path.join(resolvePaths({}).BACKEND_ROOT, 'src/migrations')
  // Each database commits independently. On failure, check both and retry explicitly.
  for (const kind of ['main', 'audit'] as const) {
    const filename = path.join(data, kind === 'main' ? 'guatswr_web_main.db' : 'guatswr_web_logs.db')
    const mode = action === 'initialize' ? sqlite.OPEN_READWRITE | sqlite.OPEN_CREATE : action === 'adopt' ? sqlite.OPEN_READWRITE : sqlite.OPEN_READONLY
    const db = await new Promise<sqlite.Database>((resolve, reject) => {
      const connection = new sqlite.Database(filename, mode, error => error ? reject(error) : resolve(connection))
    })
    try {
      await new Promise<void>((resolve, reject) => db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;', error => error ? reject(error) : resolve()))
      const connection = db as unknown as Connection
      let result
      if (action === 'inspect') result = await inspectSchema(connection)
      else if (action === 'check') result = await checkDatabase(connection, directory, kind)
      else if (action === 'adopt') result = await migrateDatabase(connection, directory, kind, { mode: 'adopt', expectedFingerprint: options.get(`--${kind}-fingerprint`)! })
      else result = await migrateDatabase(connection, directory, kind, { mode: 'initialize' })
      console.log(JSON.stringify({ database: kind, action, ...result }))
    } finally {
      await new Promise<void>((resolve, reject) => db.close(error => error ? reject(error) : resolve()))
    }
  }
}
if (require.main === module) main().catch((error: unknown) => {
  const code = error instanceof Error ? error.message : 'MIGRATION_FAILED'
  console.error(JSON.stringify({ error: /^MIGRATION_[A-Z_]+$/.test(code) ? code : 'MIGRATION_DATABASE_ERROR' }))
  process.exitCode = 1
})
