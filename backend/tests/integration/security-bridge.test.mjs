import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { expect, it, onTestFinished } from 'vitest'
import { fixture, token } from '../helpers/fixture.mjs'
const require = createRequire(import.meta.url)
const sqlite = require('sqlite3'), request = require('supertest'), jwt = require('jsonwebtoken')
const { migrateDatabase } = require('../../dist/src/migrations/engine.js')
const production = path.resolve('src/migrations')

it('declares future security Expand definitions without applying them during initialization', async () => {
  const f = await fixture()
  expect(f.context.mainSchemaVersion).toBe(2)
  expect(f.context.auditSchemaVersion).toBe(1)
  expect(await f.context.sql.main.get("SELECT name FROM sqlite_master WHERE name='security_audit_outbox'")).toBeUndefined()
  expect((await f.context.sql.main.all("SELECT name FROM pragma_table_xinfo('users')")).some(row => row.name === 'auth_version')).toBe(false)
})

it('boots the compatibility bridge against expanded databases and enforces and issues user versions', async () => {
  const f = await fixture(), custom = path.join(f.root, 'activated-security')
  const before = await f.context.sql.main.get('SELECT password,twofa_secret FROM users WHERE id=2')
  await f.close()
  await fs.cp(production, custom, { recursive: true })
  const manifest = JSON.parse(await fs.readFile(path.join(custom, 'manifest.json'), 'utf8'))
  for (const kind of ['main', 'audit']) {
    manifest[kind].upgrades = [...(manifest[kind].upgrades || []), ...manifest[kind].compatibleUpgrades]
    delete manifest[kind].compatibleUpgrades
  }
  await fs.writeFile(path.join(custom, 'manifest.json'), JSON.stringify(manifest))
  for (const [kind, filename] of [['main', f.context.dbPath], ['audit', f.context.logDbPath]]) {
    const db = await new Promise((resolve, reject) => { const db = new sqlite.Database(filename, error => error ? reject(error) : resolve(db)) })
    try { await migrateDatabase(db, custom, kind, { mode: 'upgrade' }) }
    finally { await new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve())) }
  }
  const app = await require('../../src/app').createApplication({ env: f.context.env,
    paths: { data: path.join(f.root, 'data'), public: path.join(f.root, 'public'), backups: path.join(f.root, 'backups') },
    backgroundTasks: false, externalServices: false })
  onTestFinished(() => app.close())
  expect(app.context.mainSchemaVersion).toBe(3)
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
  expect((await app.context.sql.main.get('SELECT COUNT(*) AS n FROM security_audit_outbox')).n).toBe(0)
})
