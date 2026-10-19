import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAuthUpstreamFixture } from './fixtures/auth-upstream.mjs'
import { createUpstreamClient } from '../server/utils/bff-upstream'
import { createBffAuthService } from '../server/utils/bff-auth-service'
import { createMemorySessionStore } from '../server/utils/bff-session'
import { BffError } from '../server/utils/bff-errors'

// Real loopback HTTP against the deterministic in-memory auth fixture: no real
// backend, no database, no browser. This exercises the actual fetch path,
// header construction, timeouts, status mapping and JWT metadata parsing.
//
// Run with the regular web unit suite: `pnpm --filter @guatswr/web test`. The
// fixture binds an ephemeral loopback port; nothing outside this process is
// started and no fixed port is required.

const SECRET = 'integration-session-secret-long-enough-0123456789'

const fixture = createAuthUpstreamFixture()
let baseUrl = ''

function createSessionService() {
  const store = createMemorySessionStore()
  const service = createBffAuthService({
    store,
    secret: SECRET,
    upstream: createUpstreamClient({ origin: baseUrl, timeoutMs: 2000, maxResponseBytes: 32 * 1024 }),
  })
  return { store, service }
}

beforeAll(async () => {
  const port = await fixture.listen(0)
  baseUrl = `http://127.0.0.1:${port}`
})

afterAll(async () => {
  await fixture.close()
})

describe('BFF auth against the loopback fixture', () => {
  it('logs in, verifies with fresh /me, and logs out without leaking browser credentials', async () => {
    const { service } = createSessionService()
    const login = await service.login({ username: 'admin', password: 'adminpass' }, { clientIp: '203.0.113.9' })
    expect(login.user).toEqual({ id: 1, username: 'admin', role: 'super_admin', avatar: null })
    expect(JSON.stringify(login)).not.toContain('token')

    const verified = await service.verify(login.sessionId)
    expect(verified.identity.username).toBe('admin')
    expect(verified.twofaEnabled).toBe(false)

    await service.logout(login.sessionId)
    await expect(service.verify(login.sessionId)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('requires the second password for the frozen backend twofa field', async () => {
    const { service } = createSessionService()
    await expect(service.login({ username: 'second', password: 'secondpass' }, { clientIp: '203.0.113.9' }))
      .rejects.toMatchObject({ statusCode: 401 })
    const login = await service.login({ username: 'second', password: 'secondpass', twofa: '123456' }, { clientIp: '203.0.113.9' })
    expect(login.user).toEqual({ id: 2, username: 'second', role: 'admin', avatar: '/uploads/second.webp' })
  })

  it('forwards exactly one resolved address and never the browser cookie or origin', async () => {
    const { service } = createSessionService()
    fixture.state.requests.length = 0
    await service.login({ username: 'admin', password: 'adminpass' }, { clientIp: '198.51.100.7' })
    const loginRequest = fixture.state.requests.find(request => request.path === '/api/auth/login')
    expect(loginRequest?.headers['x-forwarded-for']).toBe('198.51.100.7')
    expect(loginRequest?.headers.cookie).toBeUndefined()
    expect(loginRequest?.headers.origin).toBeUndefined()
    expect(loginRequest?.headers.authorization).toBeUndefined()
    const meRequest = fixture.state.requests.find(request => request.path === '/api/auth/me')
    expect(meRequest?.headers.authorization).toMatch(/^Bearer /)
    expect(meRequest?.headers['x-forwarded-for']).toBeUndefined()
  })

  it('maps a fixture rate limit with its Retry-After hint', async () => {
    const { service } = createSessionService()
    fixture.state.lockLogin = true
    try {
      await expect(service.login({ username: 'admin', password: 'adminpass' }, { clientIp: '203.0.113.9' }))
        .rejects.toMatchObject({ statusCode: 429, retryAfterSeconds: 60 })
    }
    finally {
      fixture.state.lockLogin = false
    }
  })

  it('maps a revoked token (403) to session expiry and deletes the record', async () => {
    const { store, service } = createSessionService()
    const login = await service.login({ username: 'admin', password: 'adminpass' }, { clientIp: '203.0.113.9' })
    fixture.state.meStatus = 403
    try {
      await expect(service.verify(login.sessionId)).rejects.toMatchObject({ statusCode: 401, code: 'session_expired' })
      expect(store.size()).toBe(0)
    }
    finally {
      fixture.state.meStatus = null
    }
  })

  it('reflects a role change from the backend on the next protected operation', async () => {
    const { service } = createSessionService()
    const login = await service.login({ username: 'admin', password: 'adminpass' }, { clientIp: '203.0.113.9' })
    const adminUser = fixture.state.users.get('admin')
    if (!adminUser) throw new Error('fixture user missing')
    adminUser.role = 'admin'
    try {
      const verified = await service.verify(login.sessionId)
      expect(verified.identity.role).toBe('admin')
      await expect(service.verify(login.sessionId, { superAdmin: true })).rejects.toMatchObject({ statusCode: 403, code: 'forbidden' })
    }
    finally {
      adminUser.role = 'super_admin'
    }
  })

  it('rejects an oversized /me response instead of buffering it', async () => {
    const { service } = createSessionService()
    // Login verifies identity with its own `/me`; the oversized response is
    // switched on afterwards so the protected read is the one that trips the
    // streamed response cap.
    const login = await service.login({ username: 'admin', password: 'adminpass' }, { clientIp: '203.0.113.9' })
    fixture.state.hugeMe = true
    try {
      const error = await service.verify(login.sessionId).catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(BffError)
      expect((error as BffError).statusCode).toBe(502)
    }
    finally {
      fixture.state.hugeMe = false
    }
  })
})
