import path from 'node:path'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { expect, it, onTestFinished } from 'vitest'
import { fixture, get } from '../helpers/fixture.mjs'
const require = createRequire(import.meta.url)
const { bootstrapAdministrator } = require('../../dist/src/admin/bootstrap.js')
const { createDatabase } = require('../../src/models/db.js')
const command = promisify(execFile)
async function fresh() {
  const f=await fixture()
  await f.fixtureAdmin.query('TRUNCATE main.users CASCADE')
  return {f,store:f.context.sql.main,filename:f.context.env.POSTGRES_URL}
}
it('startup never creates or re-promotes users from legacy environment credentials', async () => {
  const f = await fixture()
  for (const username of ['admin', 'missing-bootstrap']) {
    const before = await get(f.db, 'SELECT count(*) AS n FROM users')
    const db = await createDatabase({ env: { ...f.context.env, SUPER_ADMIN_USERNAME: username, SUPER_ADMIN_PASSWORD: 'synthetic-password' }, paths: { data: path.join(f.root, 'data'), public: path.join(f.root, 'public'), backups: path.join(f.root, 'backups') } })
    await db.close()
    expect(await get(f.db, 'SELECT count(*) AS n FROM users')).toEqual(before)
    expect((await get(f.db, 'SELECT role FROM users WHERE username=?', ['admin'])).role).toBe('admin')
  }
})
it('explicit bootstrap creates once, preserves hashes on rerun and refuses promotion', async () => {
  const { store } = await fresh()
  expect(await bootstrapAdministrator(store, 'first-admin', 'synthetic-password')).toBe('created')
  const before = await store.get('SELECT * FROM users')
  expect(require('bcryptjs').compareSync('synthetic-password', before.password)).toBe(true)
  expect(await bootstrapAdministrator(store, 'first-admin', 'different-password')).toBe('unchanged')
  expect(await store.get('SELECT * FROM users')).toEqual(before)
  await expect(bootstrapAdministrator(store, 'other-admin', 'synthetic-password')).rejects.toThrow('BOOTSTRAP_ADMIN_EXISTS')
  await store.run("UPDATE users SET role='admin'")
  await expect(bootstrapAdministrator(store, 'first-admin', 'synthetic-password')).rejects.toThrow('BOOTSTRAP_USER_EXISTS')
  expect((await store.get('SELECT role FROM users')).role).toBe('admin')
})
it('concurrent explicit bootstraps cannot create two initial administrators', async () => {
  const { store } = await fresh()
  const results = await Promise.allSettled(['first','second'].map(name => bootstrapAdministrator(store, name, 'synthetic-password')))
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
  expect(await store.get('SELECT count(*) AS n FROM users')).toEqual({ n: 1 })
})
it('rejects invalid or truncated bcrypt credentials without writing', async () => {
  const { store } = await fresh()
  for (const pair of [['','password'],['space name','password'],['valid','short'],['valid','密'.repeat(25)],[null,'password'],['valid',undefined]]) {
    await expect(bootstrapAdministrator(store, ...pair)).rejects.toThrow('BOOTSTRAP_CREDENTIALS')
  }
  expect(await store.get('SELECT count(*) AS n FROM users')).toEqual({ n: 0 })
})
it('CLI needs an explicit existing migrated database, and prints no credentials', async () => {
  const { filename, store, f } = await fresh()
  const cli = path.resolve('dist/src/admin/bootstrap-cli.js')
  const env = { ...process.env, SUPER_ADMIN_USERNAME: 'cli-admin', SUPER_ADMIN_PASSWORD: 'synthetic-cli-password', TEST_BOOTSTRAP_URL:filename }
  const result = await command(process.execPath, [cli, '--postgres-url-env', 'TEST_BOOTSTRAP_URL'], { env })
  expect(JSON.parse(result.stdout)).toEqual({ bootstrap: 'created' })
  expect(result.stdout + result.stderr).not.toContain(env.SUPER_ADMIN_PASSWORD)
  await expect(command(process.execPath, [cli, '--postgres-url-env', 'MISSING_TEST_URL'], { env })).rejects.toMatchObject({ code: 1 })
  await expect(command(process.execPath, [cli, '--main-db', 'retired.db'], { env })).rejects.toMatchObject({ code: 1 })
  expect(await store.get('SELECT count(*) AS n FROM users')).toEqual({ n: 1 })
})
