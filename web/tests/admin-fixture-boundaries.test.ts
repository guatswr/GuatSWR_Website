import { expect, test } from 'vitest'
import { createAuthUpstreamFixture } from './fixtures/auth-upstream.mjs'
import { createAdminUpstreamFixture } from './fixtures/admin-upstream.mjs'

// These verify test-oracle behavior, not the real backend implementation. The
// production integration cases still cross the actual Nuxt session/BFF layer.
test('a targeted write failure cannot be consumed by background reads or another write', async () => {
  const fixture = createAdminUpstreamFixture(), port = await fixture.listen(0)
  const root = `http://127.0.0.1:${port}`
  const token = `fixture.${Buffer.from(JSON.stringify({ id: 1 })).toString('base64url')}.fixture`
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  try {
    fixture.state.failNext = { method: 'POST', path: '/api/activities', status: 500, body: { message: 'deliberate' } }
    expect((await fetch(`${root}/api/activities`, { headers })).status).toBe(200)
    expect((await fetch(`${root}/api/config`, { method: 'POST', headers, body: JSON.stringify({ key: 'banner_text', value: 'test' }) })).status).toBe(200)
    const write = () => fetch(`${root}/api/activities`, { method: 'POST', headers, body: JSON.stringify({ title: 'manual retry' }) })
    expect((await write()).status).toBe(500)
    expect(fixture.state.activities.some(row => row.title === 'manual retry')).toBe(false)
    expect((await write()).status).toBe(200)
    expect(fixture.state.activities.filter(row => row.title === 'manual retry')).toHaveLength(1)
  } finally { await fixture.close() }
})

test('fixture login follows the enabled flag and the frozen global token version', async () => {
  const fixture = createAuthUpstreamFixture(), port = await fixture.listen(0)
  const root = `http://127.0.0.1:${port}`
  const second = fixture.state.users.get('second')!
  const login = (twofa?: string) => fetch(`${root}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'second', password: 'secondpass', twofa }) })
  try {
    second.twofaEnabled = 0
    const disabled = await login()
    expect(disabled.status).toBe(200) // A stale secret must not secretly keep 2FA on.
    const { token } = await disabled.json()
    second.twofaEnabled = 1
    expect((await login()).status).toBe(401)
    expect((await login('123456')).status).toBe(200)
    const headers = { authorization: `Bearer ${token}` }
    expect((await fetch(`${root}/api/auth/me`, { headers })).status).toBe(200)
    fixture.state.tokenVersion++
    expect((await fetch(`${root}/api/auth/me`, { headers })).status).toBe(401)
  } finally { await fixture.close() }
})
