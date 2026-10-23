import { expect, it } from 'vitest'
import { fixture, bridgeHeaders, token, run, get } from '../helpers/fixture.mjs'
const input = { common_id: 'deadline fixture', qq: '12345', avatar: '/uploads/avatar.png' }
const signup = f => f.http.post('/api/event/1/signup').set(bridgeHeaders()).send(input)
const make = () => fixture({ env: { TRUST_PROXY_CIDRS: '127.0.0.1/32' } })

it('EX-03 a parseable expired deadline blocks a direct backend signup before any write', async () => {
  const f = await make()
  await run(f.db, 'UPDATE events SET content=? WHERE id=1', [JSON.stringify({ deadline: '2000-01-01T00:00' })])
  const before = await get(f.db, 'SELECT count(*) AS n FROM event_participants')
  const response = await signup(f)
  expect.soft(response.status).toBe(403)
  expect.soft(response.body).toEqual({ message: '报名已截止' })
  expect(await get(f.db, 'SELECT count(*) AS n FROM event_participants')).toEqual(before)
})

it('keeps future/invalid/empty deadlines open and never treats activity time as a deadline', async () => {
  const f = await make()
  for (const content of [{ deadline: '2100-01-01T00:00' }, { deadline: '下周六' }, { deadline: '' }, { deadline: null }, { deadline: 1 }, { time: '2000-01-01T00:00' }, { end_time: '2000-01-01T00:00' }]) {
    await run(f.db, 'UPDATE events SET content=? WHERE id=1', [JSON.stringify(content)])
    expect((await signup(f)).status).toBe(200)
  }
})

it('applies the deadline to authenticated participants as well as anonymous visitors', async () => {
  const f = await make()
  await run(f.db, 'UPDATE events SET content=? WHERE id=1', [JSON.stringify({ deadline: '2000-01-01T00:00:00Z' })])
  const response = await f.http.post('/api/event/1/signup').set('Authorization', `Bearer ${token(2, 'admin')}`).send(input)
  expect(response.status).toBe(403)
  expect(response.body).toEqual({ message: '报名已截止' })
  expect(await get(f.db, 'SELECT common_id FROM event_participants WHERE user_id=2')).toEqual({ common_id: 'pilot' })
})

it('serializes anonymous and authenticated bursts without duplicating identity rows', async () => {
  const f = await make()
  const guest = await Promise.all(Array.from({ length: 12 }, (_, i) => f.http.post('/api/event/1/signup').set(bridgeHeaders('203.0.113.99')).send({ ...input, common_id: `guest-${i}` })))
  expect(guest.map(r => r.status)).toEqual(Array(12).fill(200))
  const logged = await Promise.all(Array.from({ length: 12 }, (_, i) => f.http.post('/api/event/1/signup').set(bridgeHeaders('203.0.113.98')).set('Authorization', `Bearer ${token(2, 'admin')}`).send({ ...input, common_id: `logged-${i}` })))
  expect(logged.map(r => r.status)).toEqual(Array(12).fill(200))
  expect(await get(f.db, 'SELECT count(*) AS n FROM event_participants')).toEqual({ n: 2 })
  expect(await get(f.db, 'SELECT count(*) AS n FROM event_participants WHERE user_id=2')).toEqual({ n: 1 })
})

it('preserves IP collision semantics and strips private fields from public participants', async () => {
  const f = await make()
  const post = (ip, user) => {
    const req = f.http.post('/api/event/1/signup').set(bridgeHeaders(ip))
    if (user) req.set('Authorization', `Bearer ${token(user, 'admin')}`)
    return req.send(input)
  }
  expect((await post('203.0.113.2')).status).toBe(200)
  expect(await get(f.db, 'SELECT user_id,common_id FROM event_participants WHERE visitor_ip=?', ['203.0.113.2'])).toEqual({ user_id: 2, common_id: input.common_id })
  expect((await post('203.0.113.2', 4)).body).toEqual({ message: '报名失败' })
  expect((await post('203.0.113.99')).status).toBe(200)
  expect((await post('203.0.113.99', 4)).status).toBe(500)
  const own = await f.http.get('/api/event/1/signup').set(bridgeHeaders('203.0.113.2'))
  expect(own.body.data.user_id).toBe(2)
  expect(own.body.data).not.toHaveProperty('visitor_ip')
  const list = await f.http.get('/api/event/1/participants/public')
  expect(list.status).toBe(200)
  expect(Object.keys(list.body.items[0]).sort()).toEqual(['id','common_id','qq','avatar','pilot_source','machine_sign','created_at'].sort())
  expect(list.body.items[0].machine_sign).toBe('')
})

it('keeps lookup and cancellation independent of event state and missing events', async () => {
  const f = await make()
  await run(f.db, "UPDATE events SET status='ended' WHERE id=1")
  const auth = { Authorization: `Bearer ${token(2, 'admin')}` }
  expect((await f.http.get('/api/event/1/signup').set(auth)).body.data.common_id).toBe('pilot')
  expect((await f.http.delete('/api/event/1/signup').set(auth)).body).toEqual({ message: '已删除报名' })
  expect((await f.http.delete('/api/event/1/signup').set(auth)).status).toBe(404)
  expect((await f.http.get('/api/event/999/signup').set(auth)).body).toEqual({ data: null })
})
