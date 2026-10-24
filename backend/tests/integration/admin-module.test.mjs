import { expect, it } from 'vitest'
import { fixture, token, run, get } from '../helpers/fixture.mjs'

it('retains reset behavior for missing users and audit text for a historical NULL username', async () => {
  const f = await fixture(), authorize = `Bearer ${token()}`
  await run(f.db, 'UPDATE users SET username=NULL WHERE id=4')
  expect((await f.http.put('/api/admin/users/4/password').set('Authorization', authorize).send({ password: 'new-target-password' })).body).toEqual({ message: '重置成功' })
  await f.context.securityAudit.flush()
  expect((await get(f.logDb, "SELECT details FROM audit_logs WHERE action='RESET_PWD' ORDER BY id DESC LIMIT 1")).details).toBe('重置密码: null')
  expect((await f.http.put('/api/admin/users/999/password').set('Authorization', authorize).send({ password: 'missing-target-password' })).body).toEqual({ message: '重置成功' })
  expect((await f.http.put('/api/admin/users/999/twofa/reset').set('Authorization', authorize)).body).toEqual({ message: '二步密码已重置' })
  expect((await get(f.db, 'SELECT COUNT(*) AS n FROM users')).n).toBe(4)
})

it('keeps private audit projection, LIKE filters, legacy pagination and missing-log delete semantics', async () => {
  const f = await fixture(), authorize = `Bearer ${token(2, 'admin')}`
  await run(f.logDb, "INSERT INTO audit_logs(username,action,details,created_at) VALUES('admin','RESET_PWD','private unchanged','2026-01-02 00:00:00')")
  const response = await f.http.get('/api/admin/logs').query({ username: 'adm%', action: 'RESET', page: '-1', limit: 1 }).set('Authorization', authorize)
  expect(response.body).toEqual({ total: 1, logs: [{ id: 2, username: 'admin', action: 'RESET_PWD', details: 'private unchanged', created_at: '2026-01-02T08:00:00+08:00' }] })
  expect((await f.http.delete('/api/admin/logs/999').set('Authorization', authorize)).status).toBe(403)
  expect((await f.http.delete('/api/admin/logs/999').set('Authorization', `Bearer ${token()}`)).body).toEqual({ message: '删除成功' })
})

it('keeps pending queue content coercion, private reviewer fields and page boundaries', async () => {
  const f = await fixture(), authorize = `Bearer ${token(2, 'admin')}`
  await run(f.db, "UPDATE events SET content='broken',created_at='2026-01-01 00:00:00' WHERE id=3")
  await run(f.db, "INSERT INTO events(id,type,title,status,content,created_at) VALUES(4,'general','null pending','pending',NULL,'2026-01-02 00:00:00')")
  expect((await f.http.get('/api/admin/events/pending')).status).toBe(401)
  const first = await f.http.get('/api/admin/events/pending?page=-1').set('Authorization', authorize)
  expect(first.body.total).toBe(2)
  expect(first.body.items.map(row => row.content)).toEqual([{}, null])
  expect(first.body.items[0]).toHaveProperty('visitor_ip', '203.0.113.3')
  expect((await f.http.get('/api/admin/events/pending?page=2').set('Authorization', authorize)).body).toEqual({ total: 2, items: [] })
})
