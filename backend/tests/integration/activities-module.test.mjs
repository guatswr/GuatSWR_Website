import path from 'node:path'
import http from 'node:http'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { expect, it, onTestFinished } from 'vitest'
import { fixture, token, get, run } from '../helpers/fixture.mjs'
const activity = { title: 'typed activity', tag: 'STG', date: '2026-10-23', images: [] }
const update = (f, id, body) => f.http.put(`/api/activities/${id}`).set('Authorization', `Bearer ${token(2, 'admin')}`).send(body)
const require = createRequire(import.meta.url)
const { DatabaseError } = require('../../dist/src/database/sqlite.js')

it('EX-07 editing cannot select another file directory through an encoded activity ID', async () => {
  const f = await fixture(), source = path.join(f.context.PUBLIC_DIR, 'upload/keep-activity.png')
  await f.fs.writeFile(source, 'source-retained')
  const response = await update(f, '..%2Fuser', { ...activity, cover_image: '/uploads/upload/keep-activity.png' })
  expect.soft(response.status).toBe(400)
  expect.soft(await f.fs.readFile(source, 'utf8').catch(() => null)).toBe('source-retained')
  await expect(f.fs.access(path.join(f.context.IMG_ROOT_DIR, 'user/keep-activity.png'))).rejects.toHaveProperty('code', 'ENOENT')
  expect(await get(f.db, 'SELECT title FROM activities WHERE id=1')).toEqual({ title: 'published' })
})

it('EX-07 edit directory IDs use the same canonical positive integer policy as uploads', async () => {
  const f = await fixture()
  for (const id of ['0', '-1', '001', '1.5', '..%5Cuser', '9007199254740992']) {
    const response = await update(f, id, activity)
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'Invalid activity id' })
  }
  expect((await update(f, '1', activity)).body).toEqual({ message: '更新成功' })
  expect((await update(f, '9999', activity)).body).toEqual({ message: '更新成功' })
})

it('F02 repeated original/thumbnail references resolve to the same moved files even on a name collision', async () => {
  const f = await fixture(), staging = path.join(f.context.PUBLIC_DIR, 'upload'), target = path.join(f.context.IMG_ROOT_DIR, 'activity/1')
  await f.fs.mkdir(target, { recursive: true })
  await f.fs.writeFile(path.join(target, 'repeat.png'), 'existing-must-survive')
  await f.fs.writeFile(path.join(staging, 'repeat.png'), 'new-original')
  await f.fs.writeFile(path.join(staging, 'repeat-thumb.webp'), 'new-thumbnail')
  const source = '/uploads/upload/repeat.png', thumb = '/uploads/upload/repeat-thumb.webp'
  const response = await update(f, '1', { ...activity, cover_image: thumb, images: [source, thumb, source], content: `![original](${source}) ![thumb](${thumb}) ${source}` })
  expect(response.status).toBe(200)
  const row = await get(f.db, 'SELECT cover_image,images,content FROM activities WHERE id=1')
  const movedOriginal = row.cover_image.replace(/-thumb\.webp$/, '.png')
  expect.soft(JSON.parse(row.images)).toEqual([movedOriginal, row.cover_image, movedOriginal])
  expect.soft(row.content).toBe(`![original](${movedOriginal}) ![thumb](${row.cover_image}) ${movedOriginal}`)
  expect(await f.fs.readFile(f.context.storage.resolveUploadsPath(row.cover_image), 'utf8')).toBe('new-thumbnail')
  expect(await f.fs.readFile(f.context.storage.resolveUploadsPath(movedOriginal), 'utf8')).toBe('new-original')
  expect(await f.fs.readFile(path.join(target, 'repeat.png'), 'utf8')).toBe('existing-must-survive')
})

it('F02 an existing thumbnail alone reserves its whole image pair without being overwritten', async () => {
  const f = await fixture(), staging = path.join(f.context.PUBLIC_DIR, 'upload'), target = path.join(f.context.IMG_ROOT_DIR, 'activity/1')
  await f.fs.mkdir(target, { recursive: true })
  await f.fs.writeFile(path.join(target, 'occupied-thumb.webp'), 'existing-thumbnail')
  await f.fs.writeFile(path.join(staging, 'occupied.png'), 'new-original')
  await f.fs.writeFile(path.join(staging, 'occupied-thumb.webp'), 'new-thumbnail')
  const response = await update(f, '1', { ...activity, cover_image: '/uploads/upload/occupied.png' })
  expect(response.status).toBe(200)
  const row = await get(f.db, 'SELECT cover_image FROM activities WHERE id=1')
  expect.soft(row.cover_image).not.toBe('/uploads/img/activity/1/occupied.png')
  expect(await f.fs.readFile(path.join(target, 'occupied-thumb.webp'), 'utf8')).toBe('existing-thumbnail')
})

it('preserves NULL status visibility and separate list-ID/detail-name author projections', async () => {
  const f = await fixture()
  await run(f.db, "INSERT INTO activities(id,title,date,status,created_by,updated_by,images) VALUES (3,'NULL status','2026-01-04',NULL,99,2,'{\"legacy\":true}'),(4,'other status','2026-01-05','other',2,NULL,'null')")
  const list = await f.http.get('/api/activities')
  expect(list.body.items.map(row => row.id)).toEqual([3, 1])
  expect(list.body.items[1].created_by).toBe(2)
  expect(list.body.items[0].images).toEqual({ legacy: true })
  const detail = await f.http.get('/api/activities/3')
  expect(detail.body).toMatchObject({ created_by: null, updated_by: 'admin', created_by_name: null, updated_by_name: 'admin', updated_by_avatar: '/uploads/avatar.png' })
  expect((await f.http.get('/api/activities/1')).body.created_by).toBe('admin')
  expect((await f.http.get('/api/activities/2')).status).toBe(404)
  expect((await f.http.get('/api/activities/4')).body.images).toBeNull()
  expect((await f.http.get('/api/activities?all=1')).status).toBe(401)
  expect((await f.http.get('/api/activities?all=1').set('Authorization', `Bearer ${token(2, 'admin')}`)).body.items.map(row => row.id)).toEqual([4, 3, 1, 2])
})

it('preserves legacy pagination coercion and dirty image JSON output', async () => {
  const f = await fixture()
  await run(f.db, "UPDATE activities SET images='not JSON' WHERE id=1")
  expect((await f.http.get('/api/activities')).body.items[0].images).toEqual([])
  for (const [query, expected] of [[{ page: '-1', limit: '999' }, { page: 1, limit: 100 }], [{ page: '2.9', limit: '0' }, { page: 2, limit: 20 }], [{ page: 'bad', limit: '-9' }, { page: 1, limit: 1 }]]) {
    expect((await f.http.get('/api/activities').query(query)).body).toMatchObject(expected)
  }
  expect((await f.http.get('/api/activities?page[]=2&limit[]=1')).body).toMatchObject({ page: 2, limit: 1, total: 1, items: [] })
})

it('keeps draft defaults and publishes an edit without adding an automatic publish notification', async () => {
  const payloads = [], f = await fixture()
  const receiver = http.createServer((request, response) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', chunk => { body += chunk })
    request.on('end', () => { payloads.push(JSON.parse(body)); response.writeHead(503); response.end('synthetic Bot failure') })
  })
  receiver.listen(0, '127.0.0.1')
  await once(receiver, 'listening')
  onTestFinished(() => new Promise((resolve, reject) => receiver.close(error => error ? reject(error) : resolve())))
  f.context.env.ASTRBOT_WEBHOOK_URL = `http://127.0.0.1:${receiver.address().port}`
  f.context.externalServices = true
  const before = new Date().toISOString().slice(0, 10)
  const draft = await f.http.post('/api/activities/draft').set('Authorization', `Bearer ${token(2, 'admin')}`).send({ ignored: true })
  expect(draft.status).toBe(200)
  const persisted = await get(f.db, 'SELECT title,tag,date,description,content,cover_image,images,created_by,status FROM activities WHERE id=?', [draft.body.id])
  expect(persisted).toMatchObject({ title: '(草稿)', tag: '', description: '', content: '', cover_image: '', images: '[]', created_by: 2, status: 'draft' })
  expect([before, new Date().toISOString().slice(0, 10)]).toContain(persisted.date)
  expect((await update(f, String(draft.body.id), activity)).body).toEqual({ message: '更新成功' })
  expect(await get(f.db, 'SELECT status,updated_by FROM activities WHERE id=?', [draft.body.id])).toEqual({ status: 'published', updated_by: 2 })
  const created = await f.http.post('/api/activities').set('Authorization', `Bearer ${token(2, 'admin')}`).send(activity)
  expect(created.status).toBe(200)
  expect(created.body).toEqual({ id: expect.any(Number), message: '发布成功' })
  await expect.poll(() => payloads.length).toBe(1)
  expect(payloads[0]).toMatchObject({ event: 'activity.published', source: 'guatswr_web', actor: { id: 2, username: 'admin', role: 'admin' }, data: { id: created.body.id, title: activity.title, tag: activity.tag, date: activity.date, description: '', cover_image: '' } })
  await f.close()
  expect(payloads).toHaveLength(1)
})

it('keeps soft-delete visibility, restore privileges and formal image bytes', async () => {
  const f = await fixture(), target = path.join(f.context.IMG_ROOT_DIR, 'activity/1')
  await f.fs.mkdir(target, { recursive: true })
  await f.fs.writeFile(path.join(target, 'retained.png'), 'formal-image')
  await run(f.db, "UPDATE activities SET cover_image='/uploads/img/activity/1/retained.png' WHERE id=1")
  expect((await f.http.delete('/api/activities/1').set('Authorization', `Bearer ${token(2, 'admin')}`)).body).toEqual({ message: '已软删除' })
  expect((await f.http.get('/api/activities/1')).status).toBe(404)
  expect((await f.http.get('/api/activities/1').set('Authorization', `Bearer ${token(2, 'admin')}`)).status).toBe(404)
  expect((await f.http.get('/api/activities/1').set('Authorization', `Bearer ${token()}`)).status).toBe(200)
  expect((await f.http.get('/api/activities?all=1&includeDeleted=1').set('Authorization', `Bearer ${token(2, 'admin')}`)).body.items.map(row => row.id)).toEqual([2])
  expect((await f.http.get('/api/activities?all=1&includeDeleted=1').set('Authorization', `Bearer ${token()}`)).body.items.map(row => row.id)).toEqual([1, 2])
  expect((await f.http.post('/api/activities/1/restore').set('Authorization', `Bearer ${token(2, 'admin')}`)).status).toBe(403)
  expect((await f.http.post('/api/activities/1/restore').set('Authorization', `Bearer ${token()}`)).body).toEqual({ message: '已恢复' })
  expect(await f.fs.readFile(path.join(target, 'retained.png'), 'utf8')).toBe('formal-image')
})

it('retains the explicit legacy list-error/detail-404 distinction', async () => {
  const f = await fixture()
  await run(f.db, 'DROP TABLE activities')
  const list = await f.http.get('/api/activities')
  expect(list.status).toBe(500)
  expect(list.body).toEqual({ message: '服务器错误' })
  const detail = await f.http.get('/api/activities/1')
  expect(detail.status).toBe(404)
  expect(detail.body).toEqual({ message: 'Not Found' })
})

it('does not reuse a previous request move map when a new upload uses the same source name', async () => {
  const f = await fixture(), source = path.join(f.context.PUBLIC_DIR, 'upload/reused.png')
  await f.fs.writeFile(source, 'first-request')
  expect((await update(f, '1', { ...activity, cover_image: '/uploads/upload/reused.png' })).status).toBe(200)
  const first = await get(f.db, 'SELECT cover_image FROM activities WHERE id=1')
  await f.fs.writeFile(source, 'second-request')
  expect((await update(f, '1', { ...activity, cover_image: '/uploads/upload/reused.png' })).status).toBe(200)
  const second = await get(f.db, 'SELECT cover_image FROM activities WHERE id=1')
  expect(second.cover_image).not.toBe(first.cover_image)
  expect(await f.fs.readFile(f.context.storage.resolveUploadsPath(first.cover_image), 'utf8')).toBe('first-request')
  expect(await f.fs.readFile(f.context.storage.resolveUploadsPath(second.cover_image), 'utf8')).toBe('second-request')
})

it('does not leave a published activity when later image preparation fails', async () => {
  const f = await fixture(), source = path.join(f.context.PUBLIC_DIR, 'upload/create-failure.png')
  const beforeAudit = await get(f.logDb, "SELECT count(*) AS n FROM audit_logs WHERE action='CREATE_ACTIVITY'")
  await f.fs.writeFile(source, 'retained-source')
  await f.fs.mkdir(path.join(f.context.IMG_ROOT_DIR, 'activity'), { recursive: true })
  await f.fs.writeFile(path.join(f.context.IMG_ROOT_DIR, 'activity/3'), 'blocks-directory')
  const response = await f.http.post('/api/activities').set('Authorization', `Bearer ${token(2, 'admin')}`).send({ ...activity, title: 'failed second phase', cover_image: '/uploads/upload/create-failure.png' })
  expect(response.status).toBe(500)
  expect(response.body).toEqual({ message: '服务器错误' })
  expect(await get(f.db, "SELECT status,cover_image FROM activities WHERE title='failed second phase'")).toBeUndefined()
  expect(await f.fs.readFile(source, 'utf8')).toBe('retained-source')
  expect(await get(f.logDb, "SELECT count(*) AS n FROM audit_logs WHERE action='CREATE_ACTIVITY'")).toEqual(beforeAudit)
})

it('keeps the old row and staging bytes when a prepared update cannot commit', async () => {
  const f = await fixture()
  await f.fs.writeFile(path.join(f.context.PUBLIC_DIR, 'upload/update-failure.png'), 'moved-before-db-failure')
  await run(f.db, "CREATE TRIGGER fail_activity_update BEFORE UPDATE ON activities BEGIN SELECT RAISE(ABORT,'synthetic'); END")
  const response = await update(f, '1', { ...activity, cover_image: '/uploads/upload/update-failure.png' })
  expect(response.status).toBe(500)
  expect(response.body).toEqual({ message: '服务器错误' })
  expect(await get(f.db, 'SELECT title,cover_image FROM activities WHERE id=1')).toEqual({ title: 'published', cover_image: null })
  expect(await f.fs.readFile(path.join(f.context.PUBLIC_DIR, 'upload/update-failure.png'), 'utf8')).toBe('moved-before-db-failure')
  expect(await get(f.logDb, "SELECT count(*) AS n FROM audit_logs WHERE action='UPDATE_ACTIVITY'")).toEqual({ n: 0 })
})

it('does no file work if the first create INSERT fails', async () => {
  const f = await fixture(), source = path.join(f.context.PUBLIC_DIR, 'upload/insert-failure.png')
  await f.fs.writeFile(source, 'unmoved-source')
  f.context.sql.main.run = async () => { throw new DatabaseError('unavailable', 'SQLITE_FULL') }
  const response = await f.http.post('/api/activities').set('Authorization', `Bearer ${token(2, 'admin')}`).send({ ...activity, cover_image: '/uploads/upload/insert-failure.png' })
  expect(response.status).toBe(500)
  expect(await f.fs.readFile(source, 'utf8')).toBe('unmoved-source')
  expect(await get(f.db, 'SELECT count(*) AS n FROM activities')).toEqual({ n: 2 })
})
