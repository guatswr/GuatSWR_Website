import { expect, it } from 'vitest'
import { fixture, get, token, draftProofHeaders } from '../helpers/fixture.mjs'

it.each([
  ['approve', {}, 'published', 403],
  ['status', { status: 'published' }, 'published', 403],
  ['reject', {}, 'rejected', 200],
  ['status', { status: 'ongoing' }, 'ongoing', 200],
  ['delete', {}, 'deleted', 200],
  ['purge', {}, null, 404]
])('rechecks the final write after concurrent %s, preserving legacy allowed states', async (action, body, state, expected) => {
  const f = await fixture({ env: { TRUST_PROXY_CIDRS: '127.0.0.1/32' } })
  const observed = Promise.withResolvers(), release = Promise.withResolvers()
  const original = f.context.sql.main.get
  f.context.sql.main.get = async function(sql, params) {
    const row = await original(sql, params)
    if (/^SELECT id,\s*status FROM events WHERE id\s*=\s*\?$/.test(sql) && String(params[0]) === '3') {
      observed.resolve(); await release.promise
    }
    return row
  }
  const saving = f.http.put('/api/event/3').set(draftProofHeaders('save', 3)).send({ title: 'late guest update', content: { copy: 'fixture' }, submit: true }).then(x => x)
  await observed.promise
  try {
    const response = action === 'purge'
      ? await f.http.delete('/api/admin/events/3').set('Authorization', `Bearer ${token()}`)
      : await f.http.post(`/api/event/3/${action}`).set('Authorization', `Bearer ${token(2, 'admin')}`).send(body)
    expect(response.status).toBe(200)
    const current = await get(f.db, 'SELECT status FROM events WHERE id=3')
    expect(current?.status ?? null).toBe(state)
  } finally { release.resolve() }
  const saved = await saving
  expect(saved.status).toBe(expected)
  const final = await get(f.db, 'SELECT title,status FROM events WHERE id=3')
  if (expected === 200) expect(final).toEqual({ title: 'late guest update', status: 'pending' })
  else if (expected === 403) expect(final).toEqual({ title: 'pending', status: 'published' })
  else expect(final).toBeUndefined()
  await expect.poll(async () => (await get(f.logDb, "SELECT count(*) AS n FROM audit_logs WHERE action='SUBMIT_EVENT'")).n).toBe(expected === 200 ? 1 : 0)
})
