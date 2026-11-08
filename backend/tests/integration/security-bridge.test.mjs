import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { expect, it, onTestFinished } from 'vitest'
import { fixture, token } from '../helpers/fixture.mjs'
const require = createRequire(import.meta.url)
const request=require('supertest'),jwt=require('jsonwebtoken')
it('initializes security Expand with zero user versions and an empty durable audit queue', async () => {
  const f = await fixture()
  expect(f.context.mainSchemaVersion).toBe(10)
  expect(f.context.auditSchemaVersion).toBe(2)
  expect((await f.context.sql.main.get('SELECT count(*) AS n FROM security_audit_outbox')).n).toBe(0)
  expect((await f.context.sql.main.get('SELECT MAX(auth_version) AS version FROM users')).version).toBe(0)
})

it('reopens PostgreSQL without rewriting credentials and enforces current user versions', async () => {
  const f = await fixture()
  const before = await f.context.sql.main.get('SELECT password,twofa_secret FROM users WHERE id=2')
  const app = await require('../../src/app').createApplication({ env: f.context.env,
    paths: { data: path.join(f.root, 'data'), public: path.join(f.root, 'public'), backups: path.join(f.root, 'backups') },
    backgroundTasks: false, externalServices: false })
  onTestFinished(() => app.close())
  expect(app.context.mainSchemaVersion).toBe(10)
  expect(app.context.auditSchemaVersion).toBe(2)
  expect(await app.context.sql.main.get('SELECT password,twofa_secret FROM users WHERE id=2')).toEqual(before)
  const http = request(await app.listen(0, '127.0.0.1'))
  expect((await http.get('/api/auth/me').set('Authorization', `Bearer ${token(2, 'admin')}`)).status).toBe(200)
  await app.context.sql.main.run('UPDATE users SET auth_version=1 WHERE id=2')
  expect((await http.get('/api/auth/me').set('Authorization', `Bearer ${token(2, 'admin')}`)).status).toBe(401)
  expect((await http.get('/api/auth/me').set('Authorization', `Bearer ${token()}`)).status).toBe(200)
  const login = await http.post('/api/auth/login').send({ username: 'admin', password: 'fixture-password' })
  expect(login.status).toBe(200)
  expect(jwt.verify(login.body.token, f.context.env.JWT_SECRET).user_token_version).toBe(1)
  expect((await http.get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`)).status).toBe(200)
  expect((await app.context.sql.main.get("SELECT COUNT(*) AS n FROM security_audit_outbox WHERE action='LOGIN'")).n).toBe(1)
})
