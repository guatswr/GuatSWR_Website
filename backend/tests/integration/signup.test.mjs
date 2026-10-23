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
