import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export interface Connection {
  all(sql: string, params: unknown[], callback: (error: Error | null, rows: Record<string, unknown>[]) => void): unknown
  exec(sql: string, callback: (error: Error | null) => void): unknown
  run(sql: string, params: unknown[], callback: (error: Error | null) => void): unknown
}
type Kind = 'main' | 'audit'
type Shape = { columns: unknown[][]; foreignKeys: unknown[][]; indexes: { name: string; unique: number; origin: string; partial: number; columns: unknown[][] }[] }
interface Entry { version: number; file: string; sha256: string; shape: Record<string, Shape>; upgrades?: Entry[] }
const ledger = '_guatswr_migrations'
const all = (db: Connection, sql: string, params: unknown[] = []) => new Promise<Record<string, unknown>[]>((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)))
const exec = (db: Connection, sql: string) => new Promise<void>((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()))
const run = (db: Connection, sql: string, params: unknown[]) => new Promise<void>((resolve, reject) => db.run(sql, params, error => error ? reject(error) : resolve()))
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const failure = (code: string): never => { throw Object.assign(new Error(code), { code }) }
const matrix = (rows: Record<string, unknown>[], keys: string[]) => rows.map(row => keys.map(key => row[key]))
const columnKeys = ['cid', 'name', 'type', 'notnull', 'dflt_value', 'pk', 'hidden']
const indexKeys = ['seqno', 'cid', 'name', 'desc', 'coll', 'key']

async function definition(directory: string, kind: Kind) {
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8')) as Record<Kind, Entry>
  const base = manifest[kind]
  if (!base || base.version !== 1 || (base.upgrades !== undefined && !Array.isArray(base.upgrades))) return failure('MIGRATION_MANIFEST_INVALID')
  const entries = [base, ...(base.upgrades || [])]
  const definitions: { entry: Entry; sql: string }[] = []
  const names = new Set<string>()
  for (const [index, entry] of entries.entries()) {
    if (!entry || entry.version !== index + 1 || typeof entry.file !== 'string' || !entry.file
      || path.basename(entry.file) !== entry.file || names.has(entry.file) || !entry.shape || typeof entry.shape !== 'object') return failure('MIGRATION_MANIFEST_INVALID')
    // This path supports additive Expand migrations. A later definition may not
    // silently drop an earlier column/index/FK from validation.
    const previous = entries[index - 1]
    if (previous) for (const [table, shape] of Object.entries(previous.shape)) {
      const next = entry.shape[table]
      if (!next || !Array.isArray(next.columns) || !Array.isArray(next.indexes)
        || JSON.stringify(shape.foreignKeys) !== JSON.stringify(next.foreignKeys)
        || shape.columns.some(column => !next.columns.some(item => JSON.stringify(item) === JSON.stringify(column)))
        || shape.indexes.some(item => !next.indexes.some(candidate => JSON.stringify(candidate) === JSON.stringify(item)))) return failure('MIGRATION_MANIFEST_INVALID')
    }
    names.add(entry.file)
    const sql = await fs.readFile(path.join(directory, entry.file), 'utf8')
    if (hash(sql) !== entry.sha256) return failure('MIGRATION_SOURCE_CHECKSUM')
    definitions.push({ entry, sql })
  }
  return definitions
}
export async function inspectSchema(db: Connection) {
  const rows = await all(db, "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name != ? AND tbl_name != ? ORDER BY type,name", [ledger, ledger])
  return { fingerprint: hash(JSON.stringify(rows)), objectCount: rows.length, tables: rows.filter(row => row.type === 'table').map(row => String(row.name)) }
}

async function validateCore(db: Connection, entry: Entry, kind: Kind) {
  if (kind === 'audit') {
    const schema = await inspectSchema(db)
    if (schema.tables.includes('users') || schema.tables.includes('site_config')) return failure('MIGRATION_DATABASE_IDENTITY')
  }
  for (const [table, expected] of Object.entries(entry.shape)) {
    const columns = matrix(await all(db, 'SELECT * FROM pragma_table_xinfo(?)', [table]), columnKeys)
    for (const column of expected.columns) {
      const actual = columns.find(item => item[1] === column[1])
      if (!actual || JSON.stringify(actual.slice(1)) !== JSON.stringify(column.slice(1))) return failure('MIGRATION_CORE_COLUMN_DRIFT')
    }
    const foreignKeys = matrix(await all(db, 'SELECT * FROM pragma_foreign_key_list(?)', [table]), ['id', 'seq', 'table', 'from', 'to', 'on_update', 'on_delete', 'match'])
    if (JSON.stringify(foreignKeys) !== JSON.stringify(expected.foreignKeys)) return failure('MIGRATION_CORE_FK_DRIFT')
    const indexes = await all(db, 'SELECT * FROM pragma_index_list(?)', [table])
    for (const index of expected.indexes) {
      const actual = indexes.find(item => item.name === index.name)
      if (!actual || actual.unique !== index.unique || actual.origin !== index.origin || actual.partial !== index.partial) return failure('MIGRATION_CORE_INDEX_DRIFT')
      const fields = matrix(await all(db, 'SELECT * FROM pragma_index_xinfo(?)', [index.name]), indexKeys)
      const semantic = (items: unknown[][]) => items.map(item => item.filter((_value, position) => position !== 1))
      if (JSON.stringify(semantic(fields)) !== JSON.stringify(semantic(index.columns))) return failure('MIGRATION_CORE_INDEX_DRIFT')
    }
  }
  const integrity = await all(db, 'PRAGMA integrity_check')
  if (integrity.length !== 1 || Object.values(integrity[0] || {})[0] !== 'ok') return failure('MIGRATION_INTEGRITY')
  if ((await all(db, 'PRAGMA foreign_key_check')).length) return failure('MIGRATION_FOREIGN_KEY_VIOLATIONS')
}

async function hasLedger(db: Connection) {
  return (await all(db, "SELECT name FROM sqlite_master WHERE type='table' AND name=?", [ledger])).length > 0
}

async function checkLoaded(db: Connection, definitions: { entry: Entry }[], kind: Kind, allowOlder = false) {
  if (!await hasLedger(db)) return failure('MIGRATION_REQUIRED')
  const rows = await all(db, `SELECT version, checksum, schema_hash FROM ${ledger} ORDER BY version`)
  if (!rows.length || rows.length > definitions.length || (!allowOlder && rows.length !== definitions.length)) return failure('MIGRATION_VERSION_MISMATCH')
  for (const [index, row] of rows.entries()) {
    const expected = definitions[index]!.entry
    if (row.version !== expected.version) return failure('MIGRATION_VERSION_MISMATCH')
    if (row.checksum !== expected.sha256) return failure('MIGRATION_LEDGER_CHECKSUM')
    if (typeof row.schema_hash !== 'string' || !/^[a-f0-9]{64}$/.test(row.schema_hash)) return failure('MIGRATION_SCHEMA_DRIFT')
  }
  const current = definitions[rows.length - 1]!.entry
  const schema = await inspectSchema(db)
  if (schema.fingerprint !== rows[rows.length - 1]?.schema_hash) return failure('MIGRATION_SCHEMA_DRIFT')
  await validateCore(db, current, kind)
  return { version: current.version, fingerprint: schema.fingerprint }
}

export async function checkDatabase(db: Connection, directory: string, kind: Kind) {
  const definitions = await definition(directory, kind)
  await exec(db, 'BEGIN')
  try {
    const result = await checkLoaded(db, definitions, kind)
    await exec(db, 'COMMIT')
    return result
  } catch (error) { await exec(db, 'ROLLBACK'); throw error }
}

export async function migrateDatabase(db: Connection, directory: string, kind: Kind,
  options: { mode: 'initialize' | 'adopt' | 'upgrade'; expectedFingerprint?: string }) {
  const definitions = await definition(directory, kind)
  if (!['initialize', 'adopt', 'upgrade'].includes(options.mode)) return failure('MIGRATION_MODE_INVALID')
  const { entry, sql } = definitions[0]!
  await exec(db, 'BEGIN IMMEDIATE')
  try {
    let version = 0
    if (await hasLedger(db)) {
      const current = await checkLoaded(db, definitions, kind, options.mode === 'upgrade')
      if (current.version === definitions.length) {
        await exec(db, 'COMMIT')
        return { ...current, applied: false }
      }
      version = current.version
    } else {
      if (options.mode === 'upgrade') return failure('MIGRATION_REQUIRED')
      const before = await inspectSchema(db)
      if (options.mode === 'initialize') {
        if (before.objectCount) return failure('MIGRATION_INITIALIZE_REQUIRES_EMPTY')
        await exec(db, sql)
      } else {
        if (!before.tables.length || !options.expectedFingerprint || options.expectedFingerprint !== before.fingerprint) return failure('MIGRATION_ADOPT_FINGERPRINT_REQUIRED')
      }
      await validateCore(db, entry, kind)
      const after = await inspectSchema(db)
      await exec(db, `CREATE TABLE ${ledger} (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, mode TEXT NOT NULL, schema_hash TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
      await run(db, `INSERT INTO ${ledger}(version,checksum,mode,schema_hash) VALUES(?,?,?,?)`, [entry.version, entry.sha256, options.mode, after.fingerprint])
      version = 1
    }
    for (const next of definitions.slice(version)) {
      await exec(db, next.sql)
      await validateCore(db, next.entry, kind)
      const schema = await inspectSchema(db)
      await run(db, `INSERT INTO ${ledger}(version,checksum,mode,schema_hash) VALUES(?,?,?,?)`, [next.entry.version, next.entry.sha256, 'upgrade', schema.fingerprint])
    }
    const result = await checkLoaded(db, definitions, kind)
    await exec(db, 'COMMIT')
    return { ...result, applied: true }
  } catch (error) { await exec(db, 'ROLLBACK'); throw error }
}
