import path from 'node:path'
import http from 'node:http'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { expect, it, onTestFinished } from 'vitest'
import { fixture, token, get, run } from '../helpers/fixture.mjs'
const save = (f, body, id) => (id === undefined ? f.http.post('/api/members') : f.http.put(`/api/members/${id}`)).set('Authorization', `Bearer ${token(2, 'admin')}`).send(body)
const require = createRequire(import.meta.url)
const { DatabaseError } = require('../../dist/src/database/sqlite.js')

it('preserves NULL/invalid tags, deduplication, bio exclusion and sort_order/id ordering', async () => {
  const f = await fixture()
  await run(f.db, 'ALTER TABLE members ADD COLUMN bio TEXT')
  await run(f.db, 'INSERT INTO members(id,name,school,sort_order,tags,bio) VALUES (?,?,?,?,?,?),(?,?,?,?,?,?),(?,?,?,?,?,?)',
    [10, 'null member', null, null, null, 'private-bio', 11, 'invalid tags', '', 0, 'not JSON', 'private-bio', 12, 'mixed tags', 'school', 0, JSON.stringify([' A ', 'A', null, 2, false]), 'private-bio'])
  const response = await f.http.get('/api/members')
  expect(response.status).toBe(200)
  expect(response.body.map(row => row.id)).toEqual([10, 1, 11, 12])
  expect(response.body.map(row => row.tags)).toEqual([[], ['tag'], [], ['A', '2']])
  expect(JSON.stringify(response.body)).not.toContain('private-bio')
  expect(response.body.every(row => !Object.hasOwn(row, 'bio'))).toBe(true)
})

it('keeps school NULL/empty groups separate and binds scalar and legacy structured filters', async () => {
  const f = await fixture()
  await run(f.db, "INSERT INTO members(id,name,school) VALUES (10,'null',NULL),(11,'empty',''),(12,'same','school')")
  expect((await f.http.get('/api/members/stats/schools')).body).toEqual([{ school: 'school', count: 2 }, { school: null, count: 1 }, { school: '', count: 1 }])
  expect((await f.http.get('/api/members').query({ school: 'school' })).body.map(row => row.id)).toEqual([1, 12])
  expect((await f.http.get('/api/members').query({ school: '' })).body).toHaveLength(4)
  expect((await f.http.get('/api/members').query({ school: "school' OR 1=1 --" })).body).toEqual([])
  for (const suffix of ['school[]=school', 'school=school&school=other', 'school[nested]=school']) {
    const response = await f.http.get(`/api/members?${suffix}`)
    expect(response.status).toBe(200)
    expect(response.body).toEqual([])
  }
})

it('selects existing local thumbnails, preserves original mode and falls back when a thumbnail is missing', async () => {
  const f = await fixture(), directory = path.join(f.context.IMG_ROOT_DIR, 'user')
  await f.fs.mkdir(directory, { recursive: true })
  await f.fs.writeFile(path.join(directory, 'shared.png'), 'original-bytes')
  await f.fs.writeFile(path.join(directory, 'shared-thumb.webp'), 'thumbnail-bytes')
  const avatar = '/uploads/img/user/shared.png'
  const remote = `https://images.example.test${avatar}?cache=1#fragment`
  await run(f.db, 'UPDATE members SET avatar=? WHERE id=1', [avatar])
  await run(f.db, 'INSERT INTO members(id,name,avatar) VALUES (10,?,?)', ['remote URL', remote])
  const normal = (await f.http.get('/api/members')).body
  expect(normal.find(row => row.id === 1)).toMatchObject({ avatar: '/uploads/img/user/shared-thumb.webp', avatar_thumb: '/uploads/img/user/shared-thumb.webp', avatar_original: avatar })
  expect(normal.find(row => row.id === 10).avatar_thumb).toBe('https://images.example.test/uploads/img/user/shared-thumb.webp')
  const original = (await f.http.get('/api/members?original=1')).body
  expect(original.find(row => row.id === 1).avatar).toBe(avatar)
  expect(original.find(row => row.id === 10).avatar).toBe(remote)
  await f.fs.unlink(path.join(directory, 'shared-thumb.webp'))
  expect((await f.http.get('/api/members')).body.find(row => row.id === 1)).toMatchObject({ avatar, avatar_thumb: avatar, avatar_original: avatar })
})

it('preserves staged-avatar moves, normalized tag JSON, school default and actual created ID', async () => {
  const f = await fixture()
  await f.fs.writeFile(path.join(f.context.PUBLIC_DIR, 'upload/member.png'), 'synthetic-member-image')
  const created = await save(f, { name: ' new member ', role: 'member', avatar: '/uploads/upload/member.png', tags: [' A ', 'A', '', ' B '], school: null })
  expect(created.status).toBe(200)
  expect(created.body.id).toEqual(expect.any(Number))
  expect(await get(f.db, 'SELECT name,avatar,tags,school,sort_order FROM members WHERE id=?', [created.body.id])).toEqual({ name: 'new member', avatar: '/uploads/img/user/member.png', tags: '["A","B"]', school: '', sort_order: 0 })
  expect(await f.fs.readFile(path.join(f.context.IMG_ROOT_DIR, 'user/member.png'), 'utf8')).toBe('synthetic-member-image')
  expect((await save(f, { name: 'updated', role: 'member', avatar: null }, created.body.id)).body).toEqual({ message: '成员更新成功' })
  expect(await get(f.db, 'SELECT tags,avatar FROM members WHERE id=?', [created.body.id])).toEqual({ tags: '[]', avatar: null })
})

it('soft-deletes/restores without deleting shared avatars and keeps role-scoped deleted visibility', async () => {
  const f = await fixture(), avatar = '/uploads/shared-member.png', absolute = path.join(f.context.PUBLIC_DIR, 'shared-member.png')
  await f.fs.writeFile(absolute, 'shared-image')
  await run(f.db, 'UPDATE members SET avatar=? WHERE id=1', [avatar])
  await run(f.db, 'INSERT INTO members(id,name,avatar,school) VALUES (10,?,?,?)', ['shares avatar', avatar, 'school'])
  expect((await f.http.delete('/api/members/1').set('Authorization', `Bearer ${token(2, 'admin')}`)).body).toEqual({ message: '已软删除' })
  expect((await f.http.get('/api/members?includeDeleted=1').set('Authorization', `Bearer ${token(2, 'admin')}`)).body.map(row => row.id)).toEqual([10])
  expect((await f.http.get('/api/members?includeDeleted=1').set('Authorization', `Bearer ${token()}`)).body.map(row => row.id)).toEqual([1, 10])
  expect((await f.http.get('/api/members/stats/schools')).body).toEqual([{ school: 'school', count: 1 }])
  expect((await f.http.post('/api/members/1/restore').set('Authorization', `Bearer ${token(2, 'admin')}`)).status).toBe(403)
  expect((await f.http.post('/api/members/1/restore').set('Authorization', `Bearer ${token()}`)).body).toEqual({ message: '已恢复' })
  expect(await f.fs.readFile(absolute, 'utf8')).toBe('shared-image')
  expect(await get(f.db, 'SELECT deleted_at,deleted_by FROM members WHERE id=1')).toEqual({ deleted_at: null, deleted_by: null })
})

it('keeps safe database-read failure responses for member list and school statistics', async () => {
  const f = await fixture()
  await run(f.db, 'DROP TABLE members')
  for (const url of ['/api/members', '/api/members/stats/schools']) {
    const response = await f.http.get(url)
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ message: '服务器错误' })
  }
})

it('keeps the committed create successful on Bot failure and notifies only at the original create trigger', async () => {
  const payloads = [], f = await fixture()
  const receiver = http.createServer((request, response) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', chunk => { body += chunk })
    request.on('end', () => { payloads.push({ body: JSON.parse(body), authorization: request.headers.authorization }); response.writeHead(503); response.end('synthetic receiver failure') })
  })
  receiver.listen(0, '127.0.0.1')
  await once(receiver, 'listening')
  onTestFinished(() => new Promise((resolve, reject) => receiver.close(error => error ? reject(error) : resolve())))
  f.context.env.ASTRBOT_WEBHOOK_URL = `http://127.0.0.1:${receiver.address().port}`
  f.context.env.ASTRBOT_TOKEN = 'synthetic-member-hook-token'
  f.context.externalServices = true
  const created = await save(f, { name: 'notified member', role: 'member', school: 'school' })
  expect(created.status).toBe(200)
  await expect.poll(() => payloads.length).toBe(1)
  expect(payloads[0]).toMatchObject({ authorization: 'Bearer synthetic-member-hook-token', body: { event: 'member.added', source: 'guatswr_web', actor: { id: 2, username: 'admin', role: 'admin' }, data: { id: created.body.id, name: 'notified member', role: 'member', school: 'school', avatar: '' } } })
  expect((await save(f, { name: 'updated member', role: 'member' }, created.body.id)).status).toBe(200)
  expect((await f.http.delete(`/api/members/${created.body.id}`).set('Authorization', `Bearer ${token(2, 'admin')}`)).status).toBe(200)
  expect((await f.http.post(`/api/members/${created.body.id}/restore`).set('Authorization', `Bearer ${token()}`)).status).toBe(200)
  await f.close()
  expect(payloads).toHaveLength(1)
})

it('does not save or audit when moving an avatar fails', async () => {
  const f = await fixture(), source = path.join(f.context.PUBLIC_DIR, 'upload/blocked-member.png')
  await f.fs.writeFile(source, 'source-retained')
  await f.fs.writeFile(path.join(f.context.IMG_ROOT_DIR, 'user'), 'blocks-directory')
  const response = await save(f, { name: 'blocked', role: 'member', avatar: '/uploads/upload/blocked-member.png' })
  expect(response.status).toBe(500)
  expect(response.body).toEqual({ message: '服务器错误' })
  expect(await f.fs.readFile(source, 'utf8')).toBe('source-retained')
  expect(await get(f.db, "SELECT count(*) AS count FROM members WHERE name='blocked'")).toEqual({ count: 0 })
  expect(await get(f.logDb, "SELECT count(*) AS count FROM audit_logs WHERE action='CREATE_MEMBER'")).toEqual({ count: 0 })
})

it('retains prior member data when a database write fails', async () => {
  const f = await fixture()
  f.context.sql.main.run = async () => { throw new DatabaseError('unavailable', 'SQLITE_FULL') }
  const response = await save(f, { name: 'failed update', role: 'member' }, 1)
  expect(response.status).toBe(500)
  expect(response.body).toEqual({ message: '服务器错误' })
  expect(await get(f.db, 'SELECT name,tags FROM members WHERE id=1')).toEqual({ name: 'member', tags: '["tag"]' })
  expect(await get(f.logDb, "SELECT count(*) AS count FROM audit_logs WHERE action='UPDATE_MEMBER'")).toEqual({ count: 0 })
})
