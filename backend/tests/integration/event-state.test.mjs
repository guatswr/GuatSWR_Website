import { expect, it } from 'vitest'
import { fixture, token, get } from '../helpers/fixture.mjs'

it('E05 concurrent settlement payloads and results retain every independently merged field', async () => {
  const f = await fixture()
  const auth = { Authorization: `Bearer ${token(2, 'admin')}` }
  const settlements = Array.from({ length: 12 }, (_, i) => f.http.post('/api/event/1/settle').set(auth).send({ payload: { [`fixture_${i}`]: i } }))
  const result = f.http.post('/api/event/1/set_result').set(auth).send({ results: [{ rank: 1, common_id: 'fixture' }] })
  const responses = await Promise.all([...settlements, result])
  expect(responses.map(r => r.status)).toEqual(Array(13).fill(200))
  const content = JSON.parse((await get(f.db, 'SELECT content FROM events WHERE id=1')).content)
  for (let i = 0; i < 12; i++) expect.soft(content[`fixture_${i}`]).toBe(i)
  expect(content.results).toEqual([{ rank: 1, common_id: 'fixture' }])
  expect(content.results_updated_at).toEqual(expect.any(String))
})

it('preserves settlement status compatibility, shallow merge, malformed content and validation order', async () => {
  const f = await fixture(), auth = { Authorization: `Bearer ${token(2, 'admin')}` }
  const settle = body => f.http.post('/api/event/1/settle').set(auth).send(body)
  expect((await settle({ payload: { nested: { a: 1 }, keep: true }, status: 'legacy-custom-status' })).status).toBe(200)
  expect((await settle({ payload: { nested: { b: 2 } }, status: ' published ' })).status).toBe(200)
  let row = await get(f.db, 'SELECT content,status FROM events WHERE id=1')
  expect(row.status).toBe(' published ')
  expect(JSON.parse(row.content)).toEqual({ nested: { b: 2 }, keep: true })
  expect((await f.http.post('/api/event/999/set_result').set(auth).send({ results: null })).body).toEqual({ message: 'results must be an array' })
  expect((await f.http.post('/api/event/999/set_result').set(auth).send({ results: [] })).status).toBe(404)
  expect((await f.http.post('/api/event/2/set_result').set(auth).send({ results: [] })).status).toBe(400)
  await f.context.sql.main.run('UPDATE events SET content=? WHERE id=1', ['malformed json'])
  expect((await settle({ payload: ['old-array-value'] })).status).toBe(200)
  row = await get(f.db, 'SELECT content,status FROM events WHERE id=1')
  expect(JSON.parse(row.content)).toEqual({ 0: 'old-array-value' })
  expect(row.status).toBe('settled')
})

it('preserves all eight by eight status transitions, including restoring deleted records', async () => {
  const f = await fixture(), auth = { Authorization: `Bearer ${token(2, 'admin')}` }
  const states = ['draft','pending','published','ongoing','ended','settled','rejected','deleted']
  for (const from of states) for (const to of states) {
    await f.context.sql.main.run('UPDATE events SET status=? WHERE id=1', [from])
    const response = await f.http.post('/api/event/1/status').set(auth).send({ status: ` ${to} ` })
    expect(response.body).toEqual({ message: '状态已更新' })
    expect((await get(f.db, 'SELECT status FROM events WHERE id=1')).status).toBe(to)
  }
  expect((await f.http.post('/api/event/1/status').set(auth).send({ status: 'custom' })).status).toBe(400)
})

it('keeps approve/reject/delete broad source states and legacy review audit and ID behavior', async () => {
  const f = await fixture(), auth = { Authorization: `Bearer ${token(2, 'admin')}` }
  for (const state of ['draft','pending','published','ongoing','ended','settled','rejected','deleted']) {
    for (const [action, target] of [['approve','published'],['reject','rejected'],['delete','deleted']]) {
      await f.context.sql.main.run('UPDATE events SET status=? WHERE id=1', [state])
      expect((await f.http.post(`/api/event/1/${action}`).set(auth).send({})).status).toBe(200)
      expect((await get(f.db, 'SELECT status FROM events WHERE id=1')).status).toBe(target)
    }
  }
  for (const [action, target] of [['approve','published'],['reject','rejected']]) {
    const response = await f.http.post('/api/admin/events/001/review').set(auth).send({ action })
    expect(response.body).toEqual({ message: `操作成功，事件已${action === 'approve' ? '发布' : '驳回'}` })
    expect((await get(f.db, 'SELECT status FROM events WHERE id=1')).status).toBe(target)
    await expect.poll(() => get(f.logDb, 'SELECT details FROM audit_logs WHERE action=? ORDER BY id DESC LIMIT 1', ['REVIEW_EVENT'])).toEqual({ details: `审核事件 EID: 001 -> ${target}` })
  }
  expect((await f.http.post('/api/admin/events/not-an-id/review').set(auth).send({ action: 'approve' })).status).toBe(404)
  expect((await f.http.post('/api/event/not-an-id/approve').set(auth).send({})).status).toBe(400)
  expect((await f.http.post('/api/admin/events/1/review').set(auth).send({ action: 'invalid' })).status).toBe(400)
})

it('emits state hooks after commit, keeps legacy review hook-free and tolerates audit failure', async () => {
  const { createRequire } = await import('node:module')
  const require = createRequire(import.meta.url)
  const { createEventStateRepository } = require('../../dist/src/modules/events/state/repository.js')
  const { createEventStateService } = require('../../dist/src/modules/events/state/service.js')
  const f = await fixture(), hooks = [], audits = [], failures = []
  const service = createEventStateService({
    repository: createEventStateRepository(f.context.sql.main),
    audit: (...args) => { audits.push(args); throw new Error('synthetic audit unavailable') },
    reportAuditFailure: error => failures.push(error.message),
    notify: async (name, payload, actor) => { hooks.push({ name, payload, actor, row: await f.context.sql.main.get('SELECT status,content FROM events WHERE id=1') }) }
  })
  const actor = { id: 2, username: 'admin', role: 'admin' }
  await service.change('001', 'review', 'published', actor)
  expect(hooks).toEqual([])
  expect(audits[0]).toEqual(['admin', 'REVIEW_EVENT', '审核事件 EID: 001 -> published'])
  await service.settle(1, { payload: { complete: true } }, actor)
  await expect.poll(() => hooks.length).toBe(1)
  expect(hooks[0]).toMatchObject({ name: 'event.settled', payload: { eventId: 1, type: 'STG', payload: { complete: true } }, actor, row: { status: 'settled' } })
  expect(JSON.parse(hooks[0].row.content)).toEqual({ complete: true })
  expect(failures).toHaveLength(2)
})

it('rolls back a failing content write without auditing or leaking SQL errors', async () => {
  const f = await fixture(), auth = { Authorization: `Bearer ${token(2, 'admin')}` }
  const before = await get(f.db, 'SELECT content,status FROM events WHERE id=1')
  await new Promise((resolve, reject) => f.db.exec("CREATE TRIGGER synthetic_reject BEFORE UPDATE OF content ON events BEGIN SELECT RAISE(ABORT, 'synthetic SQL private error'); END", error => error ? reject(error) : resolve()))
  const settled = await f.http.post('/api/event/1/settle').set(auth).send({ payload: { lost: true } })
  expect(settled.status).toBe(500)
  expect(settled.body).toEqual({ message: '结算失败' })
  const result = await f.http.post('/api/event/1/set_result').set(auth).send({ results: [] })
  expect(result.status).toBe(500)
  expect(result.body).toEqual({ message: '录入失败' })
  expect(await get(f.db, 'SELECT content,status FROM events WHERE id=1')).toEqual(before)
  expect(await get(f.logDb, "SELECT count(*) AS n FROM audit_logs WHERE action IN ('SETTLE_EVENT','SET_EVENT_RESULT')")).toEqual({ n: 0 })
})
