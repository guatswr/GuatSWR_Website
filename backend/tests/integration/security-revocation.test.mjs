import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import { fixture, token, run, get } from '../helpers/fixture.mjs'
const require = createRequire(import.meta.url)
const jwt = require('jsonwebtoken')

it('revokes only the changed user across password and second-password changes, preserving avatar-only sessions', async () => {
  const f = await fixture(), old = token(2, 'admin'), owner = token()
  expect((await f.http.put('/api/auth/profile').set('Authorization', `Bearer ${old}`).send({ password: 'new-fixture-password' })).status).toBe(200)
  expect((await f.http.get('/api/auth/me').set('Authorization', `Bearer ${old}`)).status).toBe(401)
  expect((await f.http.get('/api/auth/me').set('Authorization', `Bearer ${owner}`)).status).toBe(200)
  const login = await f.http.post('/api/auth/login').send({ username: 'admin', password: 'new-fixture-password' })
  expect(login.status).toBe(200)
  expect(jwt.verify(login.body.token, f.context.env.JWT_SECRET).user_token_version).toBe(1)
  expect((await f.http.put('/api/auth/profile').set('Authorization', `Bearer ${login.body.token}`).send({ avatar: '/uploads/avatar.png' })).status).toBe(200)
  expect((await f.http.get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`)).status).toBe(200)
  expect((await f.http.put('/api/auth/profile').set('Authorization', `Bearer ${login.body.token}`).send({ twofa_password: 'new-second-password' })).status).toBe(200)
  expect((await f.http.get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`)).status).toBe(401)
  const second = await f.http.post('/api/auth/login').send({ username: 'admin', password: 'new-fixture-password', twofa: 'new-second-password' })
  expect(second.status).toBe(200)
  expect((await f.http.put('/api/admin/users/2/twofa/reset').set('Authorization', `Bearer ${owner}`)).status).toBe(200)
  expect((await f.http.get('/api/auth/me').set('Authorization', `Bearer ${second.body.token}`)).status).toBe(401)
  expect((await f.http.post('/api/auth/login').send({ username: 'admin', password: 'new-fixture-password' })).status).toBe(200)
})

it('keeps per-user reset independent from the explicit global revocation operation', async () => {
  const f = await fixture(), owner = token(), target = token(4, 'admin')
  expect((await f.http.put('/api/admin/users/4/password').set('Authorization', `Bearer ${owner}`).send({ password: 'new-target-password' })).status).toBe(200)
  expect((await f.http.get('/api/auth/me').set('Authorization', `Bearer ${target}`)).status).toBe(401)
  expect((await f.http.get('/api/auth/me').set('Authorization', `Bearer ${owner}`)).status).toBe(200)
  const login = await f.http.post('/api/auth/login').send({ username: 'target', password: 'new-target-password' })
  expect(login.status).toBe(200)
  expect((await f.http.post('/api/admin/token-version/refresh').set('Authorization', `Bearer ${owner}`)).body.version).toBe(1)
  for (const value of [owner, login.body.token]) expect((await f.http.get('/api/auth/me').set('Authorization', `Bearer ${value}`)).status).toBe(401)
})

it('rolls back security mutations when their same-database audit intent cannot be persisted', async () => {
  const f = await fixture(), owner = token(), before = await get(f.db, 'SELECT password,auth_version FROM users WHERE id=2')
  await run(f.db, "CREATE TRIGGER fail_security_intent BEFORE INSERT ON security_audit_outbox BEGIN SELECT RAISE(ABORT,'synthetic audit intent failure'); END")
  expect((await f.http.put('/api/auth/profile').set('Authorization', `Bearer ${token(2, 'admin')}`).send({ password: 'rolled-back-password' })).status).toBe(500)
  expect(await get(f.db, 'SELECT password,auth_version FROM users WHERE id=2')).toEqual(before)
  expect((await f.http.post('/api/auth/register').set('Authorization', `Bearer ${owner}`).send({ username: 'rolledback', password: 'valid-password' })).status).toBe(400)
  expect(await get(f.db, "SELECT id FROM users WHERE username='rolledback'")).toBeUndefined()
  expect((await f.http.delete('/api/admin/users/4').set('Authorization', `Bearer ${owner}`)).status).toBe(503)
  expect(await get(f.db, 'SELECT id FROM users WHERE id=4')).toEqual({ id: 4 })
})

it('returns committed success during audit-store failure and retries the durable intent later', async () => {
  const f = await fixture(), original = f.context.sql.audit.transaction
  f.context.sql.audit.transaction = async () => { throw new Error('synthetic audit outage') }
  expect((await f.http.put('/api/auth/profile').set('Authorization', `Bearer ${token(2, 'admin')}`).send({ password: 'committed-password' })).status).toBe(200)
  await f.context.securityAudit.flush()
  const intent = await get(f.db, "SELECT * FROM security_audit_outbox WHERE action='UPDATE_PROFILE'")
  expect(intent).toMatchObject({ delivered_at: null, last_error: 'audit_delivery_failed' })
  expect((await get(f.db, 'SELECT auth_version FROM users WHERE id=2')).auth_version).toBe(1)
  f.context.sql.audit.transaction = original
  expect((await f.context.securityAudit.flush()).delivered).toBe(1)
  expect((await get(f.logDb, "SELECT count(*) AS n FROM audit_logs WHERE source_id=$1", [intent.id])).n).toBe(1)
})

it('deduplicates delivery after audit commit but before main acknowledgement and rejects stale actor writes', async () => {
  const f = await fixture(), main = f.context.sql.main, original = main.run
  main.run = (sql, params) => /^UPDATE security_audit_outbox SET delivered_at/.test(sql) ? Promise.reject(new Error('synthetic acknowledgement failure')) : original(sql, params)
  expect((await f.http.put('/api/admin/users/4/password').set('Authorization', `Bearer ${token()}`).send({ password: 'acknowledged-later' })).status).toBe(200)
  await f.context.securityAudit.flush()
  const intent = await get(f.db, "SELECT * FROM security_audit_outbox WHERE action='RESET_PWD'")
  expect(intent.delivered_at).toBeNull()
  expect((await get(f.logDb, "SELECT count(*) AS n FROM audit_logs WHERE source_id=$1", [intent.id])).n).toBe(1)
  main.run = original
  await f.context.securityAudit.flush()
  expect((await get(f.logDb, "SELECT count(*) AS n FROM audit_logs WHERE source_id=$1", [intent.id])).n).toBe(1)
  const { createAdminService } = require('../../dist/src/admin/service.js')
  const service = createAdminService({ main, audit: f.context.sql.audit, ready: true, committed() {}, report() {} })
  await run(f.db, 'UPDATE users SET auth_version=1 WHERE id=1')
  await expect(service.resetPassword('2', 'stale-operation', { id: 1, username: 'owner', role: 'super_admin', user_token_version: 0, token_version: 0 })).rejects.toHaveProperty('status', 401)
  expect((await get(f.db, 'SELECT auth_version FROM users WHERE id=2')).auth_version).toBe(0)
})

it('recovers without duplicate audit records after a real process dies between commit and acknowledgement', async () => {
  const f = await fixture()
  const { enqueueSecurityAudit } = require('../../dist/src/security/audit-outbox.js')
  const id = await f.context.sql.main.transaction(tx => enqueueSecurityAudit(tx, 'owner', 'RESET_PWD', 'synthetic crash recovery'))
  const { promisify } = await import('node:util'), { execFile } = await import('node:child_process'), path = await import('node:path')
  let failure
  try { await promisify(execFile)(process.execPath, [path.resolve('tests/helpers/audit-outbox-crash.cjs'), f.context.dbPath, f.context.logDbPath], { timeout: 5000, env: { ...process.env, DATABASE_DRIVER: f.context.databaseDriver, POSTGRES_URL: f.context.env.POSTGRES_URL } }) }
  catch (error) { failure = error }
  expect(failure?.stdout).toBe('AUDIT_COMMITTED_BEFORE_ACK')
  expect((await get(f.db, "SELECT delivered_at FROM security_audit_outbox WHERE id=$1", [id])).delivered_at).toBeNull()
  expect((await get(f.logDb, "SELECT count(*) AS n FROM audit_logs WHERE source_id=$1", [id])).n).toBe(1)
  expect((await f.context.securityAudit.flush()).delivered).toBe(1)
  expect((await get(f.logDb, "SELECT count(*) AS n FROM audit_logs WHERE source_id=$1", [id])).n).toBe(1)
})

it('rejects startup when the independent audit schema is incomplete',async()=>{
 const f=await fixture(),{createApplication}=require('../../src/app.js')
 await f.fixtureAdmin.query('ALTER TABLE audit.audit_logs DROP COLUMN source_id CASCADE')
 await expect(createApplication({env:f.context.env,paths:{data:f.context.DATA_DIR,public:f.context.PUBLIC_DIR,backups:f.context.BACKUP_ROOT},backgroundTasks:false,externalServices:false})).rejects.toHaveProperty('code','PG_MIGRATION_SCHEMA_DRIFT')
})

it('rechecks super-admin permission after a queued request acquires the writer', async () => {
  const f = await fixture(), main = f.context.sql.main, original = main.transaction
  const entered = Promise.withResolvers(), release = Promise.withResolvers(), queued = Promise.withResolvers()
  const before = await get(f.db, 'SELECT password,auth_version FROM users WHERE id=2')
  const holding = original(async tx => {
    if (tx.dialect === 'postgres') await tx.get('SELECT pg_advisory_xact_lock(57123,1)')
    entered.resolve(); await release.promise
    await tx.run("UPDATE users SET role='admin' WHERE id=1")
  })
  await entered.promise
  main.transaction = (...args) => { queued.resolve(); return original(...args) }
  const response = f.http.put('/api/admin/users/2/password').set('Authorization', `Bearer ${token()}`).send({ password: 'must-not-commit' }).then(value => value)
  try {
    await queued.promise
    release.resolve(); await holding
    expect((await response).status).toBe(403)
    expect(await get(f.db, 'SELECT password,auth_version FROM users WHERE id=2')).toEqual(before)
    expect((await get(f.db, "SELECT COUNT(*) AS n FROM security_audit_outbox WHERE action='RESET_PWD'")).n).toBe(0)
  } finally { release.resolve(); await holding; main.transaction = original; await response }
})
