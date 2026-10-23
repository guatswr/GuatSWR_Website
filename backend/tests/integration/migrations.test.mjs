import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { expect, it, onTestFinished } from 'vitest'
const require = createRequire(import.meta.url)
const sqlite = require('sqlite3')
const { migrateDatabase, checkDatabase, inspectSchema } = require('../../dist/src/migrations/engine.js')
const directory = path.resolve('src/migrations')
const command = promisify(execFile)
const exec = (db, sql) => new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()))
const all = (db, sql) => new Promise((resolve, reject) => db.all(sql, (error, rows) => error ? reject(error) : resolve(rows)))
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guatswr-migration-'))
  const connections = []
  onTestFinished(async () => {
    await Promise.all(connections.map(db => new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()))))
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('guatswr-migration-')) throw new Error('Unsafe cleanup')
    await fs.rm(root, { recursive: true, force: true })
  })
  const open = async (name = 'main.db') => {
    const db = await new Promise((resolve, reject) => { const value = new sqlite.Database(path.join(root, name), error => error ? reject(error) : resolve(value)) })
    connections.push(db)
    await exec(db, 'PRAGMA foreign_keys=ON; PRAGMA busy_timeout=2000;')
    return db
  }
  return { root, open }
}
it('initializes both databases, validates checksums and repeats without DDL', async () => {
  const f = await fixture()
  for (const kind of ['main', 'audit']) {
    const db = await f.open(`${kind}.db`)
    expect((await migrateDatabase(db, directory, kind, { mode: 'initialize' })).applied).toBe(true)
    expect((await checkDatabase(db, directory, kind)).version).toBe(1)
    expect((await migrateDatabase(db, directory, kind, { mode: 'initialize' })).applied).toBe(false)
  }
})
it('adopts only an explicitly fingerprinted complete legacy schema and retains extensions and NULL', async () => {
  const db = await (await fixture()).open()
  await exec(db, await fs.readFile(path.join(directory, 'main-001.sql'), 'utf8'))
  await exec(db, "ALTER TABLE members ADD COLUMN bio TEXT; CREATE TABLE legacy_extension(value TEXT); INSERT INTO legacy_extension VALUES('synthetic'); INSERT INTO members(name,tags,bio) VALUES('synthetic',NULL,'retained');")
  await expect(migrateDatabase(db, directory, 'main', { mode: 'adopt' })).rejects.toHaveProperty('code', 'MIGRATION_ADOPT_FINGERPRINT_REQUIRED')
  const before = await inspectSchema(db)
  await migrateDatabase(db, directory, 'main', { mode: 'adopt', expectedFingerprint: before.fingerprint })
  expect(await all(db, 'SELECT tags,bio FROM members')).toEqual([{ tags: null, bio: 'retained' }])
  expect(await all(db, 'SELECT * FROM legacy_extension')).toEqual([{ value: 'synthetic' }])
  await checkDatabase(db, directory, 'main')
})
it('rejects missing core indexes even with a matching supplied fingerprint', async () => {
  const db = await (await fixture()).open()
  await exec(db, await fs.readFile(path.join(directory, 'main-001.sql'), 'utf8'))
  await exec(db, 'DROP INDEX idx_members_name')
  const current = await inspectSchema(db)
  await expect(migrateDatabase(db, directory, 'main', { mode: 'adopt', expectedFingerprint: current.fingerprint })).rejects.toHaveProperty('code', 'MIGRATION_CORE_INDEX_DRIFT')
  expect(await all(db, "SELECT name FROM sqlite_master WHERE name='_guatswr_migrations'")).toEqual([])
})
it('detects ledger tampering and schema changes after adoption', async () => {
  const db = await (await fixture()).open()
  await migrateDatabase(db, directory, 'main', { mode: 'initialize' })
  await exec(db, 'CREATE TABLE unexpected(value TEXT)')
  await expect(checkDatabase(db, directory, 'main')).rejects.toHaveProperty('code', 'MIGRATION_SCHEMA_DRIFT')
  await exec(db, "DROP TABLE unexpected; UPDATE _guatswr_migrations SET checksum='modified'")
  await expect(checkDatabase(db, directory, 'main')).rejects.toHaveProperty('code', 'MIGRATION_LEDGER_CHECKSUM')
})
it('rolls back partially executed initialization SQL and rejects source checksum drift', async () => {
  const f = await fixture()
  const db = await f.open()
  const custom = path.join(f.root, 'definitions')
  await fs.cp(directory, custom, { recursive: true })
  const manifest = JSON.parse(await fs.readFile(path.join(custom, 'manifest.json'), 'utf8'))
  const sqlFile = path.join(custom, manifest.main.file)
  const sql = (await fs.readFile(sqlFile, 'utf8')) + '\nSELECT * FROM nonexistent_failure;'
  await fs.writeFile(sqlFile, sql)
  await expect(migrateDatabase(db, custom, 'main', { mode: 'initialize' })).rejects.toHaveProperty('code', 'MIGRATION_SOURCE_CHECKSUM')
  manifest.main.sha256 = createHash('sha256').update(sql).digest('hex')
  await fs.writeFile(path.join(custom, 'manifest.json'), JSON.stringify(manifest))
  await expect(migrateDatabase(db, custom, 'main', { mode: 'initialize' })).rejects.toThrow()
  expect(await all(db, "SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")).toEqual([])
})
it('preserves main completion when audit fails and allows an explicit retry', async () => {
  const f = await fixture()
  const main = await f.open('main.db'), audit = await f.open('audit.db')
  await migrateDatabase(main, directory, 'main', { mode: 'initialize' })
  await exec(audit, 'CREATE TABLE unexpected(value TEXT)')
  await expect(migrateDatabase(audit, directory, 'audit', { mode: 'initialize' })).rejects.toHaveProperty('code', 'MIGRATION_INITIALIZE_REQUIRES_EMPTY')
  await checkDatabase(main, directory, 'main')
  await expect(checkDatabase(audit, directory, 'audit')).rejects.toHaveProperty('code', 'MIGRATION_REQUIRED')
  await exec(audit, 'DROP TABLE unexpected')
  await migrateDatabase(audit, directory, 'audit', { mode: 'initialize' })
  await checkDatabase(audit, directory, 'audit')
})
it('serializes independent migrator connections using SQLite write locks', async () => {
  const f = await fixture()
  const a = await f.open(), b = await f.open()
  const results = await Promise.all([a, b].map(db => migrateDatabase(db, directory, 'main', { mode: 'initialize' })))
  expect(results.filter(result => result.applied)).toHaveLength(1)
  await checkDatabase(a, directory, 'main')
})
it('adopts historical columns inserted between core columns without moving or rewriting them', async () => {
  const db = await (await fixture()).open()
  const sql = (await fs.readFile(path.join(directory, 'main-001.sql'), 'utf8')).replace('name TEXT, role TEXT, avatar TEXT', 'name TEXT, role TEXT, bio TEXT, avatar TEXT')
  expect(sql).toContain('bio TEXT')
  await exec(db, sql)
  const before = await inspectSchema(db)
  await migrateDatabase(db, directory, 'main', { mode: 'adopt', expectedFingerprint: before.fingerprint })
  expect((await inspectSchema(db)).fingerprint).toBe(before.fingerprint)
})
it('rejects a main database mislabeled as audit even if it retains legacy audit tables', async () => {
  const db = await (await fixture()).open()
  await exec(db, await fs.readFile(path.join(directory, 'main-001.sql'), 'utf8'))
  await exec(db, await fs.readFile(path.join(directory, 'audit-001.sql'), 'utf8'))
  const before = await inspectSchema(db)
  await expect(migrateDatabase(db, directory, 'audit', { mode: 'adopt', expectedFingerprint: before.fingerprint })).rejects.toHaveProperty('code', 'MIGRATION_DATABASE_IDENTITY')
})
it('CLI initializes and checks explicitly named custom database files', async () => {
  const f = await fixture()
  const cli = path.resolve('dist/src/migrations/cli.js')
  const args = ['--data-dir', f.root, '--main-db', path.join(f.root, 'custom-main.db'), '--audit-db', path.join(f.root, 'custom-audit.db')]
  const created = await command(process.execPath, [cli, 'initialize', ...args])
  expect(created.stdout).toContain('"applied":true')
  expect((await command(process.execPath, [cli, 'check', ...args])).stdout).toContain('"version":1')
  await expect(command(process.execPath, [cli, 'check', '--data-dir', f.root])).rejects.toHaveProperty('code', 1)
  await expect(fs.access(path.join(f.root, 'guatswr_web_main.db'))).rejects.toHaveProperty('code', 'ENOENT')
})

async function upgrades(f, failingThird = false) {
  const custom = path.join(f.root, 'upgrade-definitions')
  await fs.cp(directory, custom, { recursive: true })
  const manifest = JSON.parse(await fs.readFile(path.join(custom, 'manifest.json'), 'utf8'))
  const shape = { ...manifest.main.shape, cleanup_fixture: { columns: [[0,'id','INTEGER',0,null,1,0],[1,'value','TEXT',0,null,0,0]], foreignKeys: [], indexes: [] } }
  const sql = 'CREATE TABLE cleanup_fixture(id INTEGER PRIMARY KEY,value TEXT);'
  await fs.writeFile(path.join(custom, 'main-002.sql'), sql)
  manifest.main.upgrades = [{ version: 2, file: 'main-002.sql', sha256: createHash('sha256').update(sql).digest('hex'), shape }]
  if (failingThird) {
    const bad = 'CREATE TABLE partial_fixture(value TEXT); SELECT * FROM nonexistent_failure;'
    await fs.writeFile(path.join(custom, 'main-003.sql'), bad)
    manifest.main.upgrades.push({ version: 3, file: 'main-003.sql', sha256: createHash('sha256').update(bad).digest('hex'), shape })
  }
  await fs.writeFile(path.join(custom, 'manifest.json'), JSON.stringify(manifest))
  return custom
}
it('explicitly upgrades v1, retains adopted extensions/data and historical ledger rows, and is idempotent', async () => {
  const f = await fixture(), db = await f.open(), custom = await upgrades(f)
  await exec(db, await fs.readFile(path.join(directory, 'main-001.sql'), 'utf8'))
  await exec(db, "ALTER TABLE members ADD COLUMN bio TEXT; INSERT INTO members(name,tags,bio) VALUES('synthetic',NULL,'retained');")
  await migrateDatabase(db, directory, 'main', { mode: 'adopt', expectedFingerprint: (await inspectSchema(db)).fingerprint })
  const ledger = await all(db, 'SELECT * FROM _guatswr_migrations')
  await expect(checkDatabase(db, custom, 'main')).rejects.toHaveProperty('code', 'MIGRATION_VERSION_MISMATCH')
  await expect(migrateDatabase(db, custom, 'main', { mode: 'initialize' })).rejects.toHaveProperty('code', 'MIGRATION_VERSION_MISMATCH')
  expect(await migrateDatabase(db, custom, 'main', { mode: 'upgrade' })).toMatchObject({ version: 2, applied: true })
  expect(await all(db, 'SELECT * FROM _guatswr_migrations WHERE version=1')).toEqual(ledger)
  expect(await all(db, 'SELECT bio,tags FROM members')).toEqual([{ bio: 'retained', tags: null }])
  expect(await migrateDatabase(db, custom, 'main', { mode: 'upgrade' })).toMatchObject({ version: 2, applied: false })
  await checkDatabase(db, custom, 'main')
  // An older validator must fail closed, not silently accept an unknown version.
  await expect(checkDatabase(db, directory, 'main')).rejects.toHaveProperty('code', 'MIGRATION_VERSION_MISMATCH')
})
it('initializes latest schema atomically and refuses upgrading an unadopted database', async () => {
  const f = await fixture(), custom = await upgrades(f), db = await f.open()
  await expect(migrateDatabase(db, custom, 'main', { mode: 'upgrade' })).rejects.toHaveProperty('code', 'MIGRATION_REQUIRED')
  expect((await migrateDatabase(db, custom, 'main', { mode: 'initialize' })).version).toBe(2)
  expect((await all(db, 'SELECT version FROM _guatswr_migrations ORDER BY version')).map(r => r.version)).toEqual([1,2])
  await checkDatabase(db, custom, 'main')
})
it('rolls back every pending upgrade and allows retry after a failed later script', async () => {
  const f = await fixture(), custom = await upgrades(f, true), db = await f.open()
  await migrateDatabase(db, directory, 'main', { mode: 'initialize' })
  const before = await all(db, 'SELECT * FROM _guatswr_migrations')
  await expect(migrateDatabase(db, custom, 'main', { mode: 'upgrade' })).rejects.toThrow()
  expect(await all(db, 'SELECT * FROM _guatswr_migrations')).toEqual(before)
  expect(await all(db, "SELECT name FROM sqlite_master WHERE name IN ('cleanup_fixture','partial_fixture')")).toEqual([])
  const manifest = JSON.parse(await fs.readFile(path.join(custom, 'manifest.json'), 'utf8'))
  manifest.main.upgrades.pop()
  await fs.writeFile(path.join(custom, 'manifest.json'), JSON.stringify(manifest))
  expect((await migrateDatabase(db, custom, 'main', { mode: 'upgrade' })).version).toBe(2)
})
it('validates historical checksums, contiguous versions and all script checksums before writing', async () => {
  const f = await fixture(), custom = await upgrades(f), db = await f.open()
  await migrateDatabase(db, custom, 'main', { mode: 'initialize' })
  await exec(db, "UPDATE _guatswr_migrations SET checksum='tampered' WHERE version=1")
  await expect(checkDatabase(db, custom, 'main')).rejects.toHaveProperty('code', 'MIGRATION_LEDGER_CHECKSUM')
  const blank = await f.open('blank.db')
  await fs.appendFile(path.join(custom, 'main-002.sql'), '\n-- checksum drift')
  await expect(migrateDatabase(blank, custom, 'main', { mode: 'initialize' })).rejects.toHaveProperty('code', 'MIGRATION_SOURCE_CHECKSUM')
  expect(await all(blank, "SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")).toEqual([])
  const manifest = JSON.parse(await fs.readFile(path.join(custom, 'manifest.json'), 'utf8'))
  manifest.main.upgrades[0].version = 3
  await fs.writeFile(path.join(custom, 'manifest.json'), JSON.stringify(manifest))
  await expect(migrateDatabase(blank, custom, 'main', { mode: 'initialize' })).rejects.toHaveProperty('code', 'MIGRATION_MANIFEST_INVALID')
})
it('CLI upgrade opens existing databases only and succeeds as a no-op at the current version', async () => {
  const f = await fixture(), cli = path.resolve('dist/src/migrations/cli.js')
  await command(process.execPath, [cli, 'initialize', '--data-dir', f.root])
  const response = await command(process.execPath, [cli, 'upgrade', '--data-dir', f.root])
  expect(response.stdout.trim().split('\n').map(line => JSON.parse(line))).toEqual([
    expect.objectContaining({ database: 'main', version: 1, applied: false }), expect.objectContaining({ database: 'audit', version: 1, applied: false })
  ])
  await expect(command(process.execPath, [cli, 'upgrade', '--data-dir', path.join(f.root, 'missing')])).rejects.toMatchObject({ code: 1 })
  await expect(fs.stat(path.join(f.root, 'missing'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('rejects an upgrade manifest that weakens previously required schema validation', async () => {
  const f = await fixture(), custom = await upgrades(f), db = await f.open()
  const manifest = JSON.parse(await fs.readFile(path.join(custom, 'manifest.json'), 'utf8'))
  delete manifest.main.upgrades[0].shape.users
  await fs.writeFile(path.join(custom, 'manifest.json'), JSON.stringify(manifest))
  await expect(migrateDatabase(db, custom, 'main', { mode: 'initialize' })).rejects.toHaveProperty('code', 'MIGRATION_MANIFEST_INVALID')
  expect(await all(db, "SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")).toEqual([])
})
