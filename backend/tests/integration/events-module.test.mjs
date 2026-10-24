import path from 'node:path'
import { expect, it } from 'vitest'
import { fixture, token, run, get, all } from '../helpers/fixture.mjs'

it('retains permissive native sqlite bindings and content shapes instead of adding an Event schema', async () => {
  const f = await fixture()
  for (const value of [true, 7, { legacy: 'object' }, ['legacy', 'array']]) {
    const expected = await get(f.db, 'SELECT CAST(? AS TEXT) AS value', [value])
    const response = await f.http.post('/api/event/admin').set('Authorization', `Bearer ${token(2, 'admin')}`).send({ type: value, title: value, content: ['legacy'], status: 'unknown-state' })
    expect(response.status).toBe(200)
    expect(await get(f.db, 'SELECT type,title,content,status FROM events WHERE id=?', [response.body.id])).toEqual({ type: expected.value, title: expected.value, content: '["legacy"]', status: 'published' })
  }
})

it('preserves public/admin query coercion, status fallback and private historical extensions', async () => {
  const f = await fixture(), authorize = `Bearer ${token(2, 'admin')}`
  await run(f.db, 'ALTER TABLE events ADD COLUMN legacy_extra TEXT')
  await run(f.db, "INSERT INTO events(id,type,title,status,content,visitor_ip,legacy_extra) VALUES(10,'[object Object]','legacy binding','published',NULL,'203.0.113.99','private historical extension')")
  const native = await all(f.db, "SELECT id FROM events WHERE status IN ('published','ongoing','ended','settled') AND type=?", [{ nested: 'legacy' }])
  const publicList = await f.http.get('/api/event?type[nested]=legacy')
  expect(publicList.body.items.map(row => row.id)).toEqual(native.map(row => row.id))
  expect(publicList.body.items[0].content).toEqual({})
  expect(publicList.body.items[0]).not.toHaveProperty('legacy_extra')
  expect(publicList.body.items[0]).not.toHaveProperty('visitor_ip')
  const admin = await f.http.get('/api/event/admin/list?status=unknown&page=-1&limit=1000').set('Authorization', authorize)
  expect(admin.body).toMatchObject({ total: 4, page: 1, limit: 100 })
  expect(admin.body.items.find(row => row.id === 10)).toHaveProperty('legacy_extra', 'private historical extension')
  expect((await f.http.get('/api/event/10').set('Authorization', authorize)).body).toHaveProperty('visitor_ip', '203.0.113.99')
})

it('discards a reserved draft when preparation fails, before publishing or auditing success', async () => {
  const f = await fixture(), source = path.join(f.context.PUBLIC_DIR, 'upload/prepare-failure.png')
  await f.fs.writeFile(source, 'synthetic staged bytes')
  await f.fs.mkdir(path.join(f.context.IMG_ROOT_DIR, 'events'), { recursive: true })
  await f.fs.writeFile(path.join(f.context.IMG_ROOT_DIR, 'events/4'), 'blocks destination directory')
  const response = await f.http.post('/api/event/admin').set('Authorization', `Bearer ${token(2, 'admin')}`).send({ type: 'STG', content: { cover: '/uploads/upload/prepare-failure.png' } })
  expect(response.status).toBe(500)
  expect(response.body).toEqual({ message: '创建失败' })
  expect(await get(f.db, 'SELECT id FROM events WHERE id=4')).toBeUndefined()
  expect((await get(f.logDb, "SELECT count(*) AS n FROM audit_logs WHERE action='CREATE_EVENT'")).n).toBe(0)
  expect(await f.fs.readFile(source, 'utf8')).toBe('synthetic staged bytes')
})
