import { expect, it } from 'vitest'
import { fixture, token, get } from '../helpers/fixture.mjs'

it('rejects non-finite and out-of-Date-range ban durations before creating any row', async () => {
  const f = await fixture()
  for (const minutes of ['Infinity', '-Infinity', 'invalid', '1e100']) {
    const response = await f.http.post('/api/admin/bans').set('Authorization', `Bearer ${token()}`).send({ ip: '203.0.113.66', minutes })
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: '封禁时长无效' })
    expect(await get(f.db, "SELECT ip FROM banned_ips WHERE ip='203.0.113.66'")).toBeUndefined()
  }
  expect((await f.http.get('/api/version')).status).toBe(200)
})

it('rejects invalid direct expiry through its callback and preserves finite and permanent bans', async () => {
  const f = await fixture()
  for (const expiry of [Infinity, -Infinity, NaN, 8640000000000001]) {
    const error = await new Promise(resolve => f.context.ban.banIp('203.0.113.66', 'synthetic', 'fixture', expiry, resolve))
    expect(error).toHaveProperty('code', 'BAN_EXPIRY')
    expect(await get(f.db, "SELECT ip FROM banned_ips WHERE ip='203.0.113.66'")).toBeUndefined()
  }
  for (const minutes of [5, 0, -1]) {
    const response = await f.http.post('/api/admin/bans').set('Authorization', `Bearer ${token()}`).send({ ip: '203.0.113.66', minutes })
    expect(response.body).toEqual({ message: '已封禁', ip: '203.0.113.66' })
    const stored = await get(f.db, "SELECT expires_at FROM banned_ips WHERE ip='203.0.113.66'")
    if (minutes > 0) expect(stored.expires_at).toBeGreaterThan(Date.now())
    else expect(stored.expires_at).toBeNull()
  }
})
