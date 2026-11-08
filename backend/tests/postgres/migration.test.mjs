import path from 'node:path'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import { fixture, token, draftProofHeaders, get, run } from '../helpers/fixture.mjs'
const require = createRequire(import.meta.url)
const { initializePostgres, checkPostgresSchema } = require('../../dist/src/migrations/postgres/engine.js')
const { createApplication } = require('../../src/app.js')
const manifest = require('../../src/migrations/postgres/manifest.json')

it('uses all website tables and minimum runtime privileges without opening SQLite files', async () => {
  const f = await fixture()
  expect(f.context.databaseDriver).toBe('postgres')
  expect(f.context.db).toBeUndefined(); expect(f.context.logDb).toBeUndefined()
  expect((await f.fs.readdir(f.context.DATA_DIR)).filter(name=>/\.db(?:-wal|-shm)?$/.test(name))).toEqual([])
  const rows = await f.context.sql.main.all("SELECT schemaname||'.'||tablename AS name FROM pg_catalog.pg_tables WHERE schemaname IN ('main','audit','bff') AND tablename<>'schema_version' ORDER BY name")
  expect(rows.map(row => row.name)).toEqual(manifest.tables)
  expect(await f.context.sql.main.get("SELECT has_schema_privilege(current_user,'main','CREATE') AS ddl,has_table_privilege(current_user,'main.schema_version','UPDATE') AS ledger")).toEqual({ ddl: false, ledger: false })
  expect(await checkPostgresSchema(f.context.sql.main)).toMatchObject({ mainVersion: 10, auditVersion: 2 })
})

it('revalidates an initialized schema idempotently without rewriting existing data', async () => {
  const f = await fixture()
  const url = new URL(process.env.PG_BUSINESS_ADMIN_URL); url.pathname = new URL(f.context.env.POSTGRES_URL).pathname
  const before = await get(f.db, 'SELECT password,auth_version FROM users WHERE id=2')
  expect(await initializePostgres(url.href, url.pathname.slice(1), 'guatswr_app')).toMatchObject({ applied: false })
  expect(await get(f.db, 'SELECT password,auth_version FROM users WHERE id=2')).toEqual(before)
})

it('rejects schema drift before creating candidate directories or falling back', async () => {
  const f = await fixture()
  await f.fixtureAdmin.query('ALTER TABLE main.events ADD COLUMN unexpected_column TEXT')
  const paths = { data: path.join(f.root, 'drift-data'), public: path.join(f.root, 'drift-public'), backups: path.join(f.root, 'drift-backups') }
  await expect(createApplication({ env: f.context.env, paths, externalServices: false })).rejects.toHaveProperty('code', 'PG_MIGRATION_SCHEMA_DRIFT')
  for (const target of Object.values(paths)) await expect(f.fs.stat(target)).rejects.toHaveProperty('code', 'ENOENT')
})

it('rejects a migration administrator as the application runtime role', async () => {
  const f = await fixture()
  const url = new URL(process.env.PG_BUSINESS_ADMIN_URL); url.pathname = new URL(f.context.env.POSTGRES_URL).pathname
  const paths = { data: path.join(f.root, 'role-data'), public: path.join(f.root, 'role-public'), backups: path.join(f.root, 'role-backups') }
  await expect(createApplication({ env: { ...f.context.env, POSTGRES_URL: url.href }, paths, externalServices: false })).rejects.toHaveProperty('code', 'PG_RUNTIME_ROLE')
  for (const target of Object.values(paths)) await expect(f.fs.stat(target)).rejects.toHaveProperty('code', 'ENOENT')
})

it('rejects unsafe inserted IDs before they can commit or lose JavaScript precision', async () => {
  const f = await fixture()
  const before = await get(f.db, 'SELECT count(*) AS count FROM events')
  await expect(f.fixtureAdmin.query('INSERT INTO main.events(id) VALUES(9007199254740992)')).rejects.toHaveProperty('code', '23514')
  expect(await get(f.db, 'SELECT count(*) AS count FROM events')).toEqual(before)
})

it('serializes same-event submissions and leaves one durable receipt and notification', async () => {
  const f = await fixture({ env: { TRUST_PROXY_CIDRS: '127.0.0.1/32', BOT_PLATFORM_ENABLED: 'true' } })
  const created = await f.http.post('/api/event/draft').set(draftProofHeaders('draft', 0)).send({})
  const id = created.body.id
  const payload = { type: 'STG', title: 'native PG retry', content: { copy: 'same content' }, submit: true }
  const responses = await Promise.all(Array.from({ length: 2 }, () => f.http.put(`/api/event/${id}`).set(draftProofHeaders('save', id)).send(payload)))
  expect(responses.map(response => response.status)).toEqual([200, 200])
  expect(await get(f.db, 'SELECT count(*) AS count FROM event_submissions WHERE event_id=$1', [id])).toEqual({ count: 1 })
  expect(await get(f.db, "SELECT count(*) AS count FROM bot_notifications WHERE event_name='event.pending'")).toEqual({ count: 1 })
})

it('protects the last super-admin under concurrent deletions by different actors', async () => {
  const f = await fixture()
  const responses = await Promise.all([
    f.http.delete('/api/admin/users/3').set('Authorization', `Bearer ${token(1)}`),
    f.http.delete('/api/admin/users/1').set('Authorization', `Bearer ${token(3)}`),
  ])
  expect(responses.filter(response => response.status === 200)).toHaveLength(1)
  expect(await get(f.db, "SELECT count(*) AS count FROM users WHERE role='super_admin'")).toEqual({ count: 1 })
})

it('preserves numeric ID misses and calendar validation without PG cast errors', async () => {
  const f = await fixture()
  expect((await f.http.get('/api/activities/not-an-id')).status).toBe(404)
  expect((await f.http.get('/api/event/not-an-id')).status).toBe(404)
  expect(await f.context.sql.main.get("SELECT main.is_calendar_date('2024-02-29') AS leap,main.is_calendar_date('2023-02-29') AS corrupt")).toEqual({ leap: true, corrupt: false })
})

it('bounds backend business and audit sessions to four in total', async () => {
  const f = await fixture()
  await Promise.all([
    ...Array.from({ length: 6 }, () => f.context.sql.main.get('SELECT pg_sleep(0.02)')),
    ...Array.from({ length: 2 }, () => f.context.sql.audit.get('SELECT pg_sleep(0.02)')),
  ])
  const { count } = (await f.fixtureAdmin.query("SELECT count(*)::integer AS count FROM pg_stat_activity WHERE datname=current_database() AND application_name='guatswr-website'")).rows[0]
  expect(count).toBeLessThanOrEqual(4)
})

it('preserves notification idempotency when enqueue callers race', async () => {
  const f = await fixture({ env: { BOT_PLATFORM_ENABLED: 'true' } })
  const platform = f.context.botPlatform
  const results = await Promise.all(Array.from({ length: 2 }, () => platform.enqueue('event.updated', { eventId: 1 }, null, undefined, 'pg-race-key')))
  expect(results[0].id).toBe(results[1].id)
  expect(await get(f.db, "SELECT count(*) AS count FROM bot_notifications WHERE dedupe_key='pg-race-key'")).toEqual({ count: 1 })
})

it('holds cancellation behind an actual in-flight signup row lock', async () => {
  const f = await fixture(), { createSignupRepository } = require('../../dist/src/modules/events/signup/repository.js')
  const { createSignupService } = require('../../dist/src/modules/events/signup/service.js')
  const store = f.context.sql.main, locked = Promise.withResolvers(), release = Promise.withResolvers()
  const identity = { userId: null, visitorIp: '198.51.100.88' }
  const held = store.transaction(async tx => {
    await tx.get('SELECT id FROM events WHERE id=1 FOR UPDATE'); locked.resolve(); await release.promise
    await tx.run("INSERT INTO event_participants(event_id,visitor_ip,common_id) VALUES(1,$1,'native signup')", [identity.visitorIp])
  })
  await locked.promise
  const service = createSignupService({ repository: createSignupRepository(store), notify: async () => {} })
  const cancel = service.remove(1, identity)
  const checked = cancel.catch(error => { throw error })
  release.resolve(); await held; await checked
  expect(await service.find(1, identity)).toBeNull()
})
