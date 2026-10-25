import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { expect, it, onTestFinished, beforeAll, afterAll } from 'vitest'
const require = createRequire(import.meta.url)
const sqlite = require('sqlite3')
const { migrateDatabase, checkDatabase, inspectSchema } = require('../../dist/src/migrations/engine.js')
const productionDirectory = path.resolve('src/migrations')
it('adds article baselines to main6 without rewriting existing articles or earlier migration ledger entries',async()=>{
  const f=await fixture(),db=await f.open(),old=path.join(f.root,'main6')
  await fs.cp(productionDirectory,old,{recursive:true})
  const manifest=JSON.parse(await fs.readFile(path.join(old,'manifest.json'),'utf8'))
  manifest.main.upgrades=manifest.main.upgrades.filter(entry=>entry.version<=6)
  await fs.writeFile(path.join(old,'manifest.json'),JSON.stringify(manifest))
  await migrateDatabase(db,old,'main',{mode:'initialize'})
  await exec(db,"INSERT INTO users(id,username,password,role) VALUES(1,'historic-editor','hash','admin'); INSERT INTO activities(id,title,tag,date,description,content,cover_image,images,created_by,status) VALUES(42,'retained','STG','2020-02','summary','old body','/uploads/old.png','[\"/uploads/a.png\"]',1,NULL)")
  const before=await all(db,'SELECT * FROM activities'),ledger=await all(db,'SELECT * FROM _guatswr_migrations ORDER BY version')
  await migrateDatabase(db,productionDirectory,'main',{mode:'upgrade'})
  expect(await all(db,'SELECT * FROM activities')).toEqual(before)
  expect((await all(db,'SELECT * FROM _guatswr_migrations ORDER BY version')).slice(0,6)).toEqual(ledger)
  expect(await all(db,'SELECT activity_id,version,action,actor_name,content,source_status FROM activity_revisions')).toEqual([{activity_id:42,version:1,action:'baseline',actor_name:'historic-editor',content:'old body',source_status:null}])
  await exec(db,'DELETE FROM users WHERE id=1')
  expect((await all(db,'SELECT actor_name FROM activity_revisions'))[0].actor_name).toBe('historic-editor')
})
it('upgrades main4 with existing Bot state and protects legacy member fields while adding unique QQ and revision triggers',async()=>{
  const f=await fixture(),db=await f.open(),old=path.join(f.root,'main4')
  await fs.cp(productionDirectory,old,{recursive:true})
  const manifest=JSON.parse(await fs.readFile(path.join(old,'manifest.json'),'utf8'))
  manifest.main.upgrades=manifest.main.upgrades.filter(entry=>entry.version<=4)
  await fs.writeFile(path.join(old,'manifest.json'),JSON.stringify(manifest))
  // Historical extensions must exist before explicit adoption. Adding DDL to
  // an already ledgered main4 database is correctly rejected as schema drift.
  await exec(db,await fs.readFile(path.join(old,'main-001.sql'),'utf8'))
  await exec(db,'ALTER TABLE members ADD COLUMN bio TEXT')
  await migrateDatabase(db,old,'main',{mode:'adopt',expectedFingerprint:(await inspectSchema(db)).fingerprint})
  await exec(db,`INSERT INTO members(id,name,role,school,tags,bio) VALUES(42,'manual','role','school','["tag"]','retained');
    INSERT INTO bot_credentials(id,name,secret_hash,scopes,groups_json,created_by,created_at) VALUES('bot','legacy','synthetic-hash','["query:read"]','[]',1,0);
    INSERT INTO bot_notifications(id,dedupe_key,event_name,payload,created_at) VALUES('notice','dedupe','member.added','{}',0);
    INSERT INTO bot_deliveries(id,notification_id,credential_id,next_attempt_at) VALUES('delivery','notice','bot',0);`)
  const ledger=await all(db,'SELECT * FROM _guatswr_migrations ORDER BY version')
  await migrateDatabase(db,productionDirectory,'main',{mode:'upgrade'})
  expect((await all(db,'SELECT * FROM _guatswr_migrations ORDER BY version')).slice(0,4)).toEqual(ledger)
  expect(await all(db,'SELECT name,role,school,tags,bio,qq,follow_group_name,sync_managed FROM members')).toEqual([{name:'manual',role:'role',school:'school',tags:'["tag"]',bio:'retained',qq:null,follow_group_name:0,sync_managed:0}])
  expect(await all(db,'SELECT target_type,message_status FROM bot_deliveries')).toEqual([{target_type:'group',message_status:null}])
  expect(JSON.parse((await all(db,'SELECT value FROM member_sync_settings'))[0].value).enabled).toBe(false)
  await exec(db,"UPDATE members SET qq='11111' WHERE id=42")
  expect((await all(db,'SELECT revision FROM member_sync_meta'))[0].revision).toBe(1)
  await expect(exec(db,"INSERT INTO members(name,role,qq) VALUES('duplicate','member','11111')")).rejects.toHaveProperty('code','SQLITE_CONSTRAINT')
  expect((await checkDatabase(db,productionDirectory,'main')).version).toBe(7)
})
it('upgrades main3 to main7 without rewriting old data or ledger and accepts main3 with the platform disabled', async () => {
  const f = await fixture(), db = await f.open(), old = path.join(f.root, 'main3')
  await fs.cp(productionDirectory, old, { recursive: true })
  const manifest = JSON.parse(await fs.readFile(path.join(old,'manifest.json'),'utf8'))
  manifest.main.upgrades = manifest.main.upgrades.filter(entry => entry.version < 4)
  await fs.writeFile(path.join(old,'manifest.json'), JSON.stringify(manifest))
  await migrateDatabase(db,old,'main',{mode:'initialize'})
  await exec(db,"INSERT INTO users(id,username,password,role) VALUES(1,'retained','hash','admin'); INSERT INTO events(id,type,title,status) VALUES(1,'STG','retained','published'); INSERT INTO event_participants(event_id,user_id,visitor_ip,common_id) VALUES(1,1,'203.0.113.1','retained')")
  const before = await all(db,'SELECT * FROM _guatswr_migrations ORDER BY version')
  expect((await checkDatabase(db,productionDirectory,'main',{compatible:true})).version).toBe(3)
  await expect(checkDatabase(db,productionDirectory,'main')).rejects.toHaveProperty('code','MIGRATION_VERSION_MISMATCH')
  const audit = await f.open('audit.db')
  await migrateDatabase(audit,productionDirectory,'audit',{mode:'initialize'})
  const factory=require('../../src/app').createApplication
  const options={ env:{NODE_ENV:'test',JWT_SECRET:'synthetic-bot-migration-secret',DB_PATH:path.join(f.root,'main.db'),LOG_DB_PATH:path.join(f.root,'audit.db')},
    paths:{data:path.join(f.root,'data'),public:path.join(f.root,'public'),backups:path.join(f.root,'backups')},backgroundTasks:false,externalServices:false }
  const older = await factory(options)
  expect(older.context.mainSchemaVersion).toBe(3);expect(older.context.botPlatform).toBeUndefined()
  await older.close()
  await expect(factory({...options,env:{...options.env,BOT_PLATFORM_ENABLED:'true'}})).rejects.toThrow('requires explicit main database migration to version 4')
  expect((await migrateDatabase(db,productionDirectory,'main',{mode:'upgrade'})).version).toBe(7)
  expect((await all(db,'SELECT * FROM _guatswr_migrations ORDER BY version')).slice(0,3)).toEqual(before)
  expect(await all(db,'SELECT common_id,visitor_ip,bot_identity_id FROM event_participants')).toEqual([{common_id:'retained',visitor_ip:'203.0.113.1',bot_identity_id:null}])
  await exec(db,"INSERT INTO bot_identities(id,user_id,created_at) VALUES('bound',1,0); DELETE FROM users WHERE id=1")
  expect(await all(db,"SELECT user_id FROM bot_identities WHERE id='bound'")).toEqual([{user_id:null}])
  expect((await checkDatabase(db,productionDirectory,'main')).version).toBe(7)
  expect((await migrateDatabase(db,productionDirectory,'main',{mode:'upgrade'})).applied).toBe(false)
})
let directory
beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'guatswr-v1-definitions-'))
  await fs.cp(productionDirectory, directory, { recursive: true })
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'))
  for (const kind of ['main', 'audit']) {
    delete manifest[kind].upgrades
    delete manifest[kind].compatibleUpgrades
  }
  await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest))
})
afterAll(async () => {
  if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('guatswr-v1-definitions-')) throw new Error('Unsafe cleanup')
  await fs.rm(directory, { recursive: true, force: true })
})
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
  const checked = (await command(process.execPath, [cli, 'check', ...args])).stdout.trim().split('\n').map(line => JSON.parse(line))
  expect(checked).toEqual([expect.objectContaining({ database: 'main', version: 7 }), expect.objectContaining({ database: 'audit', version: 2 })])
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
    expect.objectContaining({ database: 'main', version: 7, applied: false }), expect.objectContaining({ database: 'audit', version: 2, applied: false })
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

it('bridge validator accepts only declared compatible v2 without enabling it at initialization', async () => {
  const f = await fixture(), db = await f.open(), custom = path.join(f.root, 'activated')
  await migrateDatabase(db, directory, 'main', { mode: 'initialize' })
  expect((await checkDatabase(db, productionDirectory, 'main', { compatible: true })).version).toBe(1)
  await fs.cp(productionDirectory, custom, { recursive: true })
  const manifest = JSON.parse(await fs.readFile(path.join(custom, 'manifest.json'), 'utf8'))
  manifest.main.upgrades = (manifest.main.upgrades || manifest.main.compatibleUpgrades).filter(step => step.version <= 2)
  delete manifest.main.compatibleUpgrades
  await fs.writeFile(path.join(custom, 'manifest.json'), JSON.stringify(manifest))
  await migrateDatabase(db, custom, 'main', { mode: 'upgrade' })
  expect((await checkDatabase(db, productionDirectory, 'main', { compatible: true })).version).toBe(2)
  await expect(checkDatabase(db, directory, 'main')).rejects.toHaveProperty('code', 'MIGRATION_VERSION_MISMATCH')
  const { createDatabase } = require('../../src/models/db.js')
  const audit = await f.open('audit.db')
  await migrateDatabase(audit, directory, 'audit', { mode: 'initialize' })
  const instance = await createDatabase({ env: { DB_PATH: path.join(f.root, 'main.db'), LOG_DB_PATH: path.join(f.root, 'audit.db') }, paths: { data: f.root, public: path.join(f.root, 'public') } })
  expect(instance.mainSchemaVersion).toBe(2)
  await instance.close()
  await exec(db, 'CREATE TABLE unknown_future(value TEXT)')
  await expect(checkDatabase(db, productionDirectory, 'main', { compatible: true })).rejects.toHaveProperty('code', 'MIGRATION_SCHEMA_DRIFT')
})
