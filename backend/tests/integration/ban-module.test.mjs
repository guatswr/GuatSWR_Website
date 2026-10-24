import path from 'node:path'
import fs from 'node:fs/promises'
import { expect, it } from 'vitest'
import { fixture, token, run, get } from '../helpers/fixture.mjs'

it('keeps guard expiry, permanent reasons, cleanup and the existing Bot-prefix bypass', async () => {
  const f = await fixture()
  await run(f.db, "INSERT INTO banned_ips(ip,reason,created_at,expires_at) VALUES('127.0.0.1','expired',1,?)", [Date.now() - 1000])
  expect((await f.http.get('/api/version')).status).toBe(200)
  expect(await get(f.db, "SELECT ip FROM banned_ips WHERE ip='127.0.0.1'")).toBeUndefined()
  await run(f.db, "INSERT INTO banned_ips(ip,reason,created_at,expires_at) VALUES('127.0.0.1','permanent synthetic',1,NULL)")
  expect((await f.http.get('/api/version')).body).toEqual({ message: 'IP 已被封禁', reason: 'permanent synthetic' })
  expect((await f.http.get('/api/bot/unknown')).status).toBe(404)
  await f.context.ban.service.unban('127.0.0.1', 'fixture')
  expect((await f.http.get('/api/version')).status).toBe(200)
})

it('persists ban and unban audit intent atomically and rejects a stale privileged actor', async () => {
  const f = await fixture(), ip = '203.0.113.66'
  expect((await f.http.post('/api/admin/bans').set('Authorization', `Bearer ${token()}`).send({ ip, reason: 'fixture', minutes: 5 })).status).toBe(200)
  expect((await get(f.db, "SELECT count(*) AS n FROM security_audit_outbox WHERE action='BAN_IP'")).n).toBe(1)
  await run(f.db, "CREATE TRIGGER fail_ban_intent BEFORE INSERT ON security_audit_outbox BEGIN SELECT RAISE(ABORT,'synthetic'); END")
  expect((await f.http.delete('/api/admin/bans/' + ip).set('Authorization', `Bearer ${token()}`)).status).toBe(500)
  expect(await get(f.db, 'SELECT ip FROM banned_ips WHERE ip=?', [ip])).toEqual({ ip })
  await run(f.db, 'DROP TRIGGER fail_ban_intent')
  await run(f.db, 'UPDATE users SET auth_version=1 WHERE id=1')
  await expect(f.context.ban.service.unban(ip, 'owner', { id: 1, username: 'owner', role: 'super_admin', user_token_version: 0, token_version: 0 })).rejects.toHaveProperty('status', 401)
  expect(await get(f.db, 'SELECT ip FROM banned_ips WHERE ip=?', [ip])).toEqual({ ip })
})

it('enforces the configured rate limit and stores its automatic ban without an unhandled callback', async () => {
  const f = await fixture({ env: { GLOBAL_RATE_LIMIT: '1', BAN_MINUTES: '0.5' } })
  expect((await f.http.get('/api/version')).status).toBe(200)
  expect((await f.http.get('/api/version')).status).toBe(429)
  await expect.poll(async () => Boolean(await get(f.db, "SELECT ip FROM banned_ips WHERE ip='127.0.0.1'"))).toBe(true)
  expect((await f.http.get('/api/version')).status).toBe(403)
  expect((await get(f.db, "SELECT count(*) AS n FROM security_audit_outbox WHERE action='BAN_IP'")).n).toBe(1)
})

it('rejects invalid limiter configuration before creating data directories', async () => {
  const f = await fixture(), { createRequire } = await import('node:module'), require = createRequire(import.meta.url)
  const factory = require('../../src/app.js').createApplication
  for (const [key, value] of [['BAN_MINUTES', 'Infinity'], ['BAN_MINUTES', '1e100'], ['GLOBAL_RATE_LIMIT', 'NaN'], ['GLOBAL_RATE_LIMIT', '1.5']]) {
    const data = path.join(f.root, `invalid-${key}-${value}`)
    await expect(factory({ env: { ...f.context.env, [key]: value }, paths: { data, public: path.join(data, 'public'), backups: path.join(f.root, 'unused-backups') }, backgroundTasks: false, externalServices: false })).rejects.toHaveProperty('code', 'invalid_configuration')
    await expect(fs.stat(data)).rejects.toHaveProperty('code', 'ENOENT')
  }
})

it('drains an automatic ban queued behind a writer before shutdown closes the databases', async () => {
  const f = await fixture({ env: { GLOBAL_RATE_LIMIT: '1' } })
  expect((await f.http.get('/api/version')).status).toBe(200)
  const entered = Promise.withResolvers(), release = Promise.withResolvers()
  const holding = f.context.sql.main.transaction(async () => { entered.resolve(); await release.promise })
  await entered.promise
  let closing
  try {
    expect((await f.http.get('/api/version')).status).toBe(429)
    closing = f.close()
    await new Promise(resolve => setImmediate(resolve))
  } finally { release.resolve(); await holding; await closing }
  const { createRequire } = await import('node:module'), require = createRequire(import.meta.url)
  const store = require('../../dist/src/database/sqlite.js').createSqliteStore(f.context.dbPath)
  try {
    expect(await store.get("SELECT ip FROM banned_ips WHERE ip='127.0.0.1'")).toEqual({ ip: '127.0.0.1' })
    expect((await store.get("SELECT count(*) AS n FROM security_audit_outbox WHERE action='BAN_IP'")).n).toBe(1)
  } finally { await store.close() }
})
