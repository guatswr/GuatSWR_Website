import path from 'node:path'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import { fixture, token, run, get } from '../helpers/fixture.mjs'
const require = createRequire(import.meta.url)
const { DatabaseError } = require('../../dist/src/database/sqlite.js')
const post = (f, body, auth = token(2, 'admin')) => f.http.post('/api/config').set('Authorization', `Bearer ${auth}`).send(body)

it('preserves public/admin projections, NULL/empty values and super-admin internal reads', async () => {
  const f = await fixture()
  await run(f.db, "INSERT INTO site_config VALUES ('home_bg',NULL),('join_bg',''),('backup_private','private'),('future_private','private')")
  const expected = { home_bg: null, join_bg: '', banner_text: 'fixture' }
  expect((await f.http.get('/api/config')).body).toEqual(expected)
  const admin = await f.http.get('/api/config').set('Authorization', `Bearer ${token(2, 'admin')}`)
  expect(admin.body).toEqual(expected)
  expect(admin.headers['cache-control']).toContain('no-store')
  const owner = await f.http.get('/api/config').set('Authorization', `Bearer ${token()}`)
  expect(owner.body).toMatchObject({ ...expected, backup_private: 'private', future_private: 'private', internal_test_key: 'private' })
})
it('preserves trimming/default values, parameter binding and the audit action', async () => {
  const f = await fixture()
  const value = "literal '); DROP TABLE site_config; --"
  expect((await post(f, { key: ' banner_text ', value })).body).toEqual({ message: '已保存' })
  expect(await get(f.db, "SELECT value FROM site_config WHERE key='banner_text'")).toEqual({ value })
  expect((await post(f, { key: 'banner_text' })).body).toEqual({ message: '已保存' })
  expect(await get(f.db, "SELECT value FROM site_config WHERE key='banner_text'")).toEqual({ value: '' })
  await expect.poll(() => get(f.logDb, "SELECT username,action,details FROM audit_logs WHERE action='UPDATE_CONFIG' ORDER BY id DESC LIMIT 1")).toEqual({ username: 'admin', action: 'UPDATE_CONFIG', details: '修改配置: banner_text' })
})
it('checks internal-key policy before touching staged files and keeps future keys owner-only', async () => {
  const f = await fixture(), staged = '/uploads/upload/forbidden.png'
  const source = path.join(f.context.PUBLIC_DIR, 'upload/forbidden.png')
  await f.fs.writeFile(source, 'synthetic-image')
  for (const auth of [token(), token(2, 'admin')]) {
    for (const key of ['token_version', 'backup_private']) {
      const response = await post(f, { key, value: staged }, auth)
      expect(response.body).toEqual({ message: '请使用专用管理接口修改内部配置' })
      expect(response.status).toBe(403)
    }
  }
  expect((await post(f, { key: 'future_private', value: 'private' })).status).toBe(403)
  expect((await post(f, { key: 'future_private', value: 'private' }, token())).body).toEqual({ message: '已保存' })
  expect(await f.fs.readFile(source, 'utf8')).toBe('synthetic-image')
  expect(await get(f.db, "SELECT value FROM site_config WHERE key='token_version'")).toBeUndefined()
})
it('moves original/thumbnail into the configured directory and keeps missing staging URLs', async () => {
  const f = await fixture(), staging = path.join(f.context.PUBLIC_DIR, 'upload')
  await f.fs.writeFile(path.join(staging, 'pair.png'), 'synthetic-original')
  await f.fs.writeFile(path.join(staging, 'pair-thumb.webp'), 'synthetic-thumbnail')
  const response = await post(f, { key: 'home_bg', value: '/uploads/upload/pair-thumb.webp' })
  expect(response.body).toEqual({ message: '已保存' })
  expect(await get(f.db, "SELECT value FROM site_config WHERE key='home_bg'")).toEqual({ value: '/uploads/img/bg/home/pair-thumb.webp' })
  expect(await f.fs.readFile(path.join(f.context.IMG_ROOT_DIR, 'bg/home/pair.png'), 'utf8')).toBe('synthetic-original')
  expect(await f.fs.readFile(path.join(f.context.IMG_ROOT_DIR, 'bg/home/pair-thumb.webp'), 'utf8')).toBe('synthetic-thumbnail')
  await expect(f.fs.access(path.join(staging, 'pair.png'))).rejects.toHaveProperty('code', 'ENOENT')
  const missing = '/uploads/upload/missing.png'
  expect((await post(f, { key: 'badge_image', value: missing })).status).toBe(200)
  expect(await get(f.db, "SELECT value FROM site_config WHERE key='badge_image'")).toEqual({ value: missing })
})
it('rejects a failed move before persisting config or writing an audit entry', async () => {
  const f = await fixture(), source = path.join(f.context.PUBLIC_DIR, 'upload/move-error.png')
  await f.fs.writeFile(source, 'source-retained')
  await f.fs.mkdir(path.join(f.context.IMG_ROOT_DIR, 'bg'), { recursive: true })
  await f.fs.writeFile(path.join(f.context.IMG_ROOT_DIR, 'bg/home'), 'target-is-a-file')
  const response = await post(f, { key: 'home_bg', value: '/uploads/upload/move-error.png' })
  expect(response.status).toBe(500)
  expect(response.body).toEqual({ message: '服务器错误' })
  expect(await f.fs.readFile(source, 'utf8')).toBe('source-retained')
  expect(await get(f.db, "SELECT value FROM site_config WHERE key='home_bg'")).toBeUndefined()
  expect(await get(f.logDb, "SELECT count(*) AS n FROM audit_logs WHERE action='UPDATE_CONFIG'")).toEqual({ n: 0 })
})
it('keeps the pre-existing moved-file/failed-save gap explicit until BM-27', async () => {
  const lines = [], f = await fixture({ logDestination: { write: line => lines.push(JSON.parse(line)) } })
  await f.fs.writeFile(path.join(f.context.PUBLIC_DIR, 'upload/save-error.png'), 'moved-before-save')
  f.context.sql.main.run = async () => { throw new DatabaseError('unavailable', 'SQLITE_FULL') }
  const response = await post(f, { key: 'home_bg', value: '/uploads/upload/save-error.png' })
  expect(response.status).toBe(500)
  expect(response.body).toEqual({ message: '服务器错误' })
  expect(await get(f.db, "SELECT value FROM site_config WHERE key='home_bg'")).toBeUndefined()
  expect(await f.fs.readFile(path.join(f.context.IMG_ROOT_DIR, 'bg/home/save-error.png'), 'utf8')).toBe('moved-before-save')
  expect(lines.find(line => line.event === 'http.failed')).toMatchObject({ route: '/api/config', code: 'database_unavailable' })
  expect(await get(f.logDb, "SELECT count(*) AS n FROM audit_logs WHERE action='UPDATE_CONFIG'")).toEqual({ n: 0 })
})
it('returns the existing safe HTTP read failure without raw database details', async () => {
  const f = await fixture()
  f.context.sql.main.all = async () => { throw new Error('private SQL and data path') }
  const response = await f.http.get('/api/config')
  expect(response.status).toBe(500)
  expect(response.body).toEqual({ message: '服务器错误' })
})
it('bounds a locked config write and succeeds after the other writer releases', async () => {
  const f = await fixture()
  await run(f.db, 'BEGIN IMMEDIATE')
  try {
    const started = performance.now()
    const response = await post(f, { key: 'banner_text', value: 'blocked' })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ message: '服务器错误' })
    expect(performance.now() - started).toBeLessThan(6000)
    expect(await get(f.db, "SELECT value FROM site_config WHERE key='banner_text'")).toEqual({ value: 'fixture' })
  } finally { await run(f.db, 'ROLLBACK') }
  expect((await post(f, { key: 'banner_text', value: 'after-lock' })).body).toEqual({ message: '已保存' })
})
it('keeps successful config writes successful when audit delivery fails', async () => {
  const lines = [], f = await fixture({ logDestination: { write: line => lines.push(JSON.parse(line)) } })
  await run(f.logDb, 'DROP TABLE audit_logs')
  const response = await post(f, { key: 'banner_text', value: 'committed' })
  expect(response.status).toBe(200)
  expect(response.body).toEqual({ message: '已保存' })
  expect(await get(f.db, "SELECT value FROM site_config WHERE key='banner_text'")).toEqual({ value: 'committed' })
  await expect.poll(() => lines.find(line => line.event === 'audit.failed')).toMatchObject({ code: 'SQLITE_ERROR' })
})
