import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
import { once } from 'node:events'
import { expect, it, onTestFinished } from 'vitest'
import { fixture, token, get, run } from '../helpers/fixture.mjs'
const require = createRequire(import.meta.url)
const { DatabaseError } = require('../../dist/src/database/sqlite.js')
const save = (f, body, id) => (id === undefined ? f.http.post('/api/history') : f.http.put(`/api/history/${id}`)).set('Authorization', `Bearer ${token(2, 'admin')}`).send(body)

it('EX-06 create returns each committed ID and sends that ID to the real local Bot receiver', async () => {
  const notifications = []
  const receiver = http.createServer((request, response) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', chunk => { body += chunk })
    request.on('end', () => { notifications.push(JSON.parse(body)); response.writeHead(200, { 'content-type': 'application/json' }); response.end('{}') })
  })
  receiver.listen(0, '127.0.0.1')
  await once(receiver, 'listening')
  onTestFinished(() => new Promise((resolve, reject) => receiver.close(error => error ? reject(error) : resolve())))
  const f = await fixture({ env: { ASTRBOT_WEBHOOK_URL: `http://127.0.0.1:${receiver.address().port}`, ASTRBOT_TIMEOUT_MS: '1000' } })
  f.context.externalServices = true
  const titles = ['first concurrent history', 'second concurrent history', 'third concurrent history']
  const responses = await Promise.all(titles.map(title => f.http.post('/api/history').set('Authorization', `Bearer ${token(2, 'admin')}`).send({ date: '2026-10-23', title })))
  for (const [index, response] of responses.entries()) {
    expect(response.status).toBe(200)
    expect(response.body.id).toEqual(expect.any(Number))
    expect(await get(f.db, 'SELECT id FROM history WHERE title=?', [titles[index]])).toEqual({ id: response.body.id })
  }
  expect(new Set(responses.map(response => response.body.id)).size).toBe(3)
  await expect.poll(() => notifications.length).toBe(3)
  for (const notification of notifications) {
    const index = titles.indexOf(notification.data.title)
    expect(index).toBeGreaterThanOrEqual(0)
    expect(notification).toMatchObject({ event: 'history.updated', source: 'guatswr_web', actor: { id: 2, username: 'admin', role: 'admin' }, data: { id: responses[index].body.id, date: '2026-10-23', title: titles[index], description: '', image: '', sort_order: 0, action: 'create' } })
    expect(Number.isFinite(Date.parse(notification.timestamp))).toBe(true)
  }
  const updated = await save(f, { date: '2026-10-24', title: 'updated notification', description: 'updated', sort_order: 4 }, responses[0].body.id)
  expect(updated.body).toEqual({ message: '更新成功' })
  await expect.poll(() => notifications.length).toBe(4)
  expect(notifications[3].data).toEqual({ id: responses[0].body.id, date: '2026-10-24', title: 'updated notification', description: 'updated', image: '', sort_order: 4, action: 'update' })
})

it('EX-06 history SQL read failure returns a safe failure instead of a successful empty list', async () => {
  const f = await fixture()
  await run(f.db, 'DROP TABLE history')
  const response = await f.http.get('/api/history')
  expect(response.status).toBe(500)
  expect(response.body).toEqual({ message: '服务器错误' })
})

it('preserves SQLite date/sort ordering, NULLs and additional historical columns', async () => {
  const f = await fixture()
  await run(f.db, 'ALTER TABLE history ADD COLUMN legacy_extension TEXT')
  await run(f.db, "INSERT INTO history(id,date,title,sort_order,legacy_extension) VALUES (10,NULL,'null date',NULL,'retained'),(11,'2025-01-01','later sort',4,NULL),(12,'2025-01-01','null sort',NULL,NULL)")
  const response = await f.http.get('/api/history')
  expect(response.status).toBe(200)
  expect(response.body.map(row => row.id)).toEqual([10, 12, 11, 1])
  expect(response.body[0]).toMatchObject({ date: null, sort_order: null, image: null, description: null, legacy_extension: 'retained' })
})

it('soft-deletes/restores with existing role visibility and keeps referenced image bytes', async () => {
  const f = await fixture(), image = path.join(f.context.PUBLIC_DIR, 'history-retained.png')
  await f.fs.writeFile(image, 'retained-image')
  await run(f.db, "UPDATE history SET image='/uploads/history-retained.png' WHERE id=1")
  expect((await f.http.delete('/api/history/1').set('Authorization', `Bearer ${token(2, 'admin')}`)).body).toEqual({ message: '已软删除' })
  expect(await get(f.db, 'SELECT deleted_by FROM history WHERE id=1')).toEqual({ deleted_by: 2 })
  expect((await f.http.get('/api/history?includeDeleted=1')).body).toEqual([])
  expect((await f.http.get('/api/history?includeDeleted=1').set('Authorization', `Bearer ${token(2, 'admin')}`)).body).toEqual([])
  expect((await f.http.get('/api/history?includeDeleted=1').set('Authorization', `Bearer ${token()}`)).body.map(row => row.id)).toEqual([1])
  expect((await f.http.post('/api/history/1/restore').set('Authorization', `Bearer ${token(2, 'admin')}`)).status).toBe(403)
  expect((await f.http.post('/api/history/1/restore').set('Authorization', `Bearer ${token()}`)).body).toEqual({ message: '已恢复' })
  expect(await get(f.db, 'SELECT deleted_at,deleted_by FROM history WHERE id=1')).toEqual({ deleted_at: null, deleted_by: null })
  expect(await f.fs.readFile(image, 'utf8')).toBe('retained-image')
  await expect.poll(() => get(f.logDb, "SELECT details FROM audit_logs WHERE action='RESTORE_HISTORY'")).toEqual({ details: '恢复群史: history' })
})

it('preserves date-based move rules, missing image URLs and nullable persistence', async () => {
  const f = await fixture(), staging = path.join(f.context.PUBLIC_DIR, 'upload')
  await f.fs.writeFile(path.join(staging, 'history.png'), 'synthetic-history-image')
  const created = await save(f, { date: '2026-10-23', title: 'moved history', image: '/uploads/upload/history.png', sort_order: 3 })
  expect(created.status).toBe(200)
  expect(await get(f.db, 'SELECT image,description,sort_order FROM history WHERE id=?', [created.body.id])).toEqual({ image: '/uploads/img/History/2026/10/23/history.png', description: null, sort_order: 3 })
  expect(await f.fs.readFile(path.join(f.context.IMG_ROOT_DIR, 'History/2026/10/23/history.png'), 'utf8')).toBe('synthetic-history-image')
  expect((await save(f, { date: '2026-10-24', title: 'missing image', image: '/uploads/upload/not-present.png' }, created.body.id)).body).toEqual({ message: '更新成功' })
  expect(await get(f.db, 'SELECT image,sort_order FROM history WHERE id=?', [created.body.id])).toEqual({ image: '/uploads/upload/not-present.png', sort_order: 0 })
  expect((await save(f, { date: '2026-10-24', title: 'null image', image: null }, created.body.id)).status).toBe(200)
  expect(await get(f.db, 'SELECT image FROM history WHERE id=?', [created.body.id])).toEqual({ image: null })
})

it('keeps missing-ID update/delete/restore success semantics during the type migration', async () => {
  const f = await fixture()
  expect((await save(f, { date: '2026-10-23', title: 'absent' }, '9999')).body).toEqual({ message: '更新成功' })
  expect((await f.http.delete('/api/history/9999').set('Authorization', `Bearer ${token(2, 'admin')}`)).body).toEqual({ message: '已软删除' })
  expect((await f.http.post('/api/history/9999/restore').set('Authorization', `Bearer ${token()}`)).body).toEqual({ message: '已恢复' })
  expect(await get(f.db, 'SELECT id FROM history WHERE id=9999')).toBeUndefined()
  await expect.poll(() => get(f.logDb, "SELECT details FROM audit_logs WHERE action='DELETE_HISTORY'")).toEqual({ details: '软删除群史: Unknown' })
})

it('fails before database writes when moving the staged image fails', async () => {
  const f = await fixture(), source = path.join(f.context.PUBLIC_DIR, 'upload/blocked.png')
  await f.fs.writeFile(source, 'retained-source')
  await f.fs.writeFile(path.join(f.context.IMG_ROOT_DIR, 'History/2026'), 'blocks-directory')
  const response = await save(f, { date: '2026-10-23', title: 'should not commit', image: '/uploads/upload/blocked.png' })
  expect(response.status).toBe(500)
  expect(response.body).toEqual({ message: '服务器错误' })
  expect(await f.fs.readFile(source, 'utf8')).toBe('retained-source')
  expect(await get(f.db, "SELECT count(*) AS count FROM history WHERE title='should not commit'")).toEqual({ count: 0 })
  expect(await get(f.logDb, "SELECT count(*) AS count FROM audit_logs WHERE action='CREATE_HISTORY'")).toEqual({ count: 0 })
})

it('does not audit a failed database write or change the previously persisted history', async () => {
  const f = await fixture()
  f.context.sql.main.run = async () => { throw new DatabaseError('unavailable', 'SQLITE_FULL') }
  const response = await save(f, { date: '2026-10-23', title: 'failed update' }, 1)
  expect(response.status).toBe(500)
  expect(response.body).toEqual({ message: '服务器错误' })
  expect(await get(f.db, 'SELECT title FROM history WHERE id=1')).toEqual({ title: 'history' })
  expect(await get(f.logDb, "SELECT count(*) AS count FROM audit_logs WHERE action='UPDATE_HISTORY'")).toEqual({ count: 0 })
})
