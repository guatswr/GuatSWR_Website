import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { onTestFinished } from 'vitest'
const require = createRequire(import.meta.url)
const { createApplication } = require('../../src/app')
const request = require('supertest')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
export const secret = 'isolated-backend-contract-key'
const hash = bcrypt.hashSync('fixture-password', 10)
export const run = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (err) { err ? reject(err) : resolve(this) }))
export const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)))
export const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)))
export const token = (id = 1, role = 'super_admin', version = 0) => jwt.sign({ id, username: id === 1 ? 'owner' : 'admin', role, token_version: version }, secret, { expiresIn: '24h' })
export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64')
export const fixture = async (overrides = {}) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guatswr-contract-'))
  let instance
  onTestFinished(async () => {
    await instance?.close()
    const absolute = path.resolve(root)
    if (path.dirname(absolute) !== path.resolve(os.tmpdir()) || !path.basename(absolute).startsWith('guatswr-contract-')) throw new Error('Unsafe fixture cleanup')
    await fs.rm(absolute, { recursive: true, force: true })
  })
  instance = await createApplication({ env: { NODE_ENV: 'test', JWT_SECRET: secret, ...overrides.env },
    paths: { data: path.join(root, 'data'), public: path.join(root, 'public'), backups: path.join(root, 'backups') },
    backgroundTasks: false, externalServices: false })
  // Explicit direct-loopback test topology. Production proxy policy is tested separately.
  // Default policy is supplied by the application, never overridden here.
  const db = instance.context.db
  for (const [id, name, role] of [[1, 'owner', 'super_admin'], [2, 'admin', 'admin'], [3, 'second', 'super_admin'], [4, 'target', 'admin']]) {
    await run(db, 'INSERT INTO users(id,username,password,role,avatar) VALUES (?,?,?,?,?)', [id,name,hash,role,'/uploads/avatar.png'])
  }
  await run(db, "INSERT INTO activities(id,title,tag,date,images,status,created_by) VALUES (1,'published','STG','2026-01-02','[]','published',2),(2,'draft','STG','2026-01-01','[]','draft',2)")
  await run(db, "INSERT INTO members(id,name,role,school,tags) VALUES (1,'member','member','school','[\"tag\"]')")
  await run(db, "INSERT INTO history(id,date,title,sort_order) VALUES (1,'2026-01-01','history',0)")
  await run(db, "INSERT INTO events(id,type,title,status,content,visitor_ip,created_by) VALUES (1,'STG','public','published','{}','203.0.113.1',2),(2,'general','draft','draft','{}','203.0.113.2',NULL),(3,'STG','pending','pending','{}','203.0.113.3',2)")
  await run(db, "INSERT INTO event_participants(event_id,user_id,visitor_ip,common_id,qq,avatar) VALUES (1,2,'203.0.113.2','pilot','12345','/uploads/avatar.png')")
  await run(db, "INSERT INTO site_config VALUES ('banner_text','fixture'),('internal_test_key','private')")
  await run(instance.context.logDb, "INSERT INTO audit_logs(id,username,action,details,created_at) VALUES (1,'admin','CREATE_ACTIVITY','synthetic details','2026-01-01 00:00:00')")
  await fs.mkdir(path.join(root, 'backups/full'), { recursive: true })
  await fs.writeFile(path.join(root, 'backups/full/fixture.tar.gz'), Buffer.from('synthetic backup bytes'))
  const server = await instance.listen(0, '127.0.0.1')
  return { ...instance, root, db, logDb: instance.context.logDb, http: request(server), origin: `http://127.0.0.1:${server.address().port}`, fs }
}
