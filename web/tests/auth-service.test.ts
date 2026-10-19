import { describe, expect, it } from 'vitest'
import { createBffAuthService } from '../server/utils/bff-auth-service'
import type { UpstreamClient, UpstreamRequestOptions, UpstreamJsonResponse } from '../server/utils/bff-upstream'
import { createMemorySessionStore, hashSessionId } from '../server/utils/bff-session'
import type { BffSessionRecord, BffSessionStore } from '../server/utils/bff-session'
import { BffError } from '../server/utils/bff-errors'

const SECRET = 'test-session-secret-that-is-long-enough-0123456789'
const NOW = 1_760_000_000_000

function bearerToken(options: { id?: number, expSeconds?: number, role?: string } = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    id: options.id ?? 1,
    username: 'admin',
    role: options.role ?? 'super_admin',
    token_version: 1,
    exp: options.expSeconds ?? Math.floor((NOW + 3_600_000) / 1000),
  })).toString('base64url')
  return `${header}.${payload}.signature`
}

interface FakePlan {
  login?: (request: UpstreamRequestOptions) => UpstreamJsonResponse | Promise<UpstreamJsonResponse>
  me?: (request: UpstreamRequestOptions) => UpstreamJsonResponse | Promise<UpstreamJsonResponse>
}

function createFakeUpstream(plan: FakePlan) {
  const calls: UpstreamRequestOptions[] = []
  const client: UpstreamClient = {
    async request(request) {
      calls.push(request)
      const handler = request.route === 'auth.login' ? plan.login : plan.me
      if (!handler) throw new Error(`no fake handler for ${request.route}`)
      return handler(request)
    },
  }
  return { client, calls }
}

const LOGIN_OK: UpstreamJsonResponse = {
  status: 200,
  data: { token: bearerToken(), username: 'admin', role: 'super_admin', avatar: null, id: 1 },
}

const ME_OK: UpstreamJsonResponse = {
  status: 200,
  data: { id: 1, username: 'admin', role: 'super_admin', avatar: null, twofa_enabled: 1 },
}

function createHarness(plan: FakePlan) {
  const clock = { value: NOW }
  const store = createMemorySessionStore()
  const upstream = createFakeUpstream(plan)
  const service = createBffAuthService({
    store,
    upstream: upstream.client,
    secret: SECRET,
    now: () => clock.value,
  })
  return { clock, store, upstream, service }
}

async function expectBffError(promise: Promise<unknown>, statusCode: number, code: string) {
  try {
    await promise
  }
  catch (error) {
    expect(error).toBeInstanceOf(BffError)
    expect((error as BffError).statusCode).toBe(statusCode)
    expect((error as BffError).code).toBe(code)
    return error as BffError
  }
  throw new Error(`expected a BffError with code ${code}`)
}

describe('login establishes an opaque server-side session', () => {
  it('keeps the upstream JWT out of the browser-facing result and seals it in the store', async () => {
    const { store, service } = createHarness({ login: () => LOGIN_OK, me: () => ME_OK })
    const result = await service.login({ username: 'admin', password: 'adminpass' }, { clientIp: '203.0.113.9' })

    expect(result.sessionId).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(result.user).toEqual({ id: 1, username: 'admin', role: 'super_admin', avatar: null })
    expect(result.expiresAt).toBe(NOW + 3_600_000)
    expect(JSON.stringify(result)).not.toContain('signature')
    expect(JSON.stringify(result)).not.toContain('token')

    const record = store.get(hashSessionId(result.sessionId), NOW) as BffSessionRecord
    expect(record).toBeDefined()
    expect(JSON.stringify(record)).not.toContain(bearerToken())
    expect(record.expiresAt).toBe(NOW + 3_600_000)
  })

  it('forwards the trusted client address and the second password only to the login call', async () => {
    const { upstream, service } = createHarness({ login: () => LOGIN_OK, me: () => ME_OK })
    await service.login({ username: 'second', password: 'secondpass', twofa: '123456' }, { clientIp: '198.51.100.4' })
    expect(upstream.calls[0]).toMatchObject({
      route: 'auth.login',
      clientIp: '198.51.100.4',
      body: { username: 'second', password: 'secondpass', twofa: '123456' },
    })
    expect(upstream.calls[1]).toMatchObject({ route: 'auth.me' })
    expect(upstream.calls[1]?.bearerToken).toBeDefined()
  })

  it('caps a long-lived upstream token at 24 hours', async () => {
    const { service } = createHarness({
      login: () => ({
        status: 200,
        data: { token: bearerToken({ expSeconds: Math.floor((NOW + 48 * 3_600_000) / 1000) }), username: 'admin', role: 'super_admin', avatar: null, id: 1 },
      }),
      me: () => ME_OK,
    })
    const result = await service.login({ username: 'admin', password: 'x' }, { clientIp: '203.0.113.9' })
    expect(result.expiresAt).toBe(NOW + 24 * 3_600_000)
  })

  it('replaces the previous local session instead of reusing its cookie id', async () => {
    const { store, service } = createHarness({ login: () => LOGIN_OK, me: () => ME_OK })
    const first = await service.login({ username: 'admin', password: 'x' }, { clientIp: '203.0.113.9' })
    const second = await service.login({ username: 'admin', password: 'x' }, { clientIp: '203.0.113.9', currentSessionId: first.sessionId })
    expect(second.sessionId).not.toBe(first.sessionId)
    expect(store.get(hashSessionId(first.sessionId), NOW)).toBeUndefined()
    expect(store.get(hashSessionId(second.sessionId), NOW)).toBeDefined()
  })

  it.each([
    ['invalid credentials', 401, 'invalid_credentials', '用户名或密码错误'],
    ['rate limited', 429, 'rate_limited', '登录过于频繁，请稍后再试'],
    ['validation failure', 400, 'invalid_request', '请求参数无效'],
  ])('maps a %s upstream response to a fixed public error', async (_label, status, code, expected) => {
    const { service } = createHarness({ login: () => ({ status, data: { message: expected } }) })
    const error = await expectBffError(
      service.login({ username: 'admin', password: 'adminpass' }, { clientIp: '203.0.113.9' }),
      status,
      code,
    )
    expect(error.retryAfterSeconds).toBeUndefined()
  })

  it('reports the bounded Retry-After hint from a rate limit', async () => {
    const { service } = createHarness({
      login: () => ({ status: 429, data: { message: '登录过于频繁，请稍后再试' }, retryAfterSeconds: 60 }),
    })
    const error = await expectBffError(service.login({ username: 'admin', password: 'x' }, { clientIp: '203.0.113.9' }), 429, 'rate_limited')
    expect(error.retryAfterSeconds).toBe(60)
  })

  it('projects only known credential failure texts and never reflects upstream detail', async () => {
    const hostile = createHarness({
      login: () => ({ status: 401, data: { message: '密码 adminpass 与用户名 admin 不匹配 secret-twofa' } }),
    })
    const error = await expectBffError(
      hostile.service.login({ username: 'admin', password: 'adminpass', twofa: 'secret-twofa' }, { clientIp: '203.0.113.9' }),
      401,
      'invalid_credentials',
    )
    expect(error.message).toBe('用户名或密码错误')
    expect(error.message).not.toContain('adminpass')
    expect(error.message).not.toContain('secret-twofa')

    const sql = createHarness({ login: () => ({ status: 401, data: { message: 'SQLITE_ERROR: no such table users' } }) })
    const sqlError = await expectBffError(
      sql.service.login({ username: 'admin', password: 'x' }, { clientIp: '203.0.113.9' }),
      401,
      'invalid_credentials',
    )
    expect(sqlError.message).not.toContain('SQLITE')
  })

  it.each([
    ['需要二步密码', '需要二步密码'],
    ['二步密码错误 123456', '二步密码错误'],
    ['用户名或密码错误 (剩余 3 次)', '用户名或密码错误 (剩余 3 次)'],
    ['用户名或密码错误 (剩余 999999 次)', '用户名或密码错误'],
    ['错误次数过多，锁定 1 分钟', '用户名或密码错误'],
  ])('keeps the frozen second-password UX for %s', async (upstreamMessage, expected) => {
    const { service } = createHarness({ login: () => ({ status: 401, data: { message: upstreamMessage } }) })
    const error = await expectBffError(
      service.login({ username: 'admin', password: 'x', twofa: '123456' }, { clientIp: '203.0.113.9' }),
      401,
      'invalid_credentials',
    )
    expect(error.message).toBe(expected)
  })

  it('derives a bounded Retry-After from a backend lock message', async () => {
    const { service } = createHarness({ login: () => ({ status: 429, data: { message: '尝试次数过多，请等待 42 秒后再试' } }) })
    const error = await expectBffError(service.login({ username: 'admin', password: 'x' }, { clientIp: '203.0.113.9' }), 429, 'rate_limited')
    expect(error.retryAfterSeconds).toBe(42)
    expect(error.message).toBe('登录过于频繁，请稍后再试')
  })

  it.each([
    ['malformed login response', { status: 200, data: { token: 'a.b.c' } }],
    ['malformed token metadata', { status: 200, data: { token: 'not-a-jwt', username: 'admin', role: 'super_admin', avatar: null, id: 1 } }],
    ['expired token metadata', { status: 200, data: { token: bearerToken({ expSeconds: Math.floor((NOW - 1000) / 1000) }), username: 'admin', role: 'super_admin', avatar: null, id: 1 } }],
  ])('refuses to establish a session on %s', async (_label, loginResponse) => {
    const { store, service } = createHarness({ login: () => loginResponse, me: () => ME_OK })
    await expectBffError(service.login({ username: 'admin', password: 'x' }, { clientIp: '203.0.113.9' }), 502, 'upstream_invalid_response')
    expect(store.size()).toBe(0)
  })

  it('never falls back to the login identity when fresh /me verification fails', async () => {
    for (const status of [401, 403, 404]) {
      const { store, service } = createHarness({ login: () => LOGIN_OK, me: () => ({ status, data: { message: 'nope' } }) })
      await expectBffError(service.login({ username: 'admin', password: 'x' }, { clientIp: '203.0.113.9' }), 401, 'login_verification_failed')
      expect(store.size()).toBe(0)
    }
  })

  it('rejects a /me identity that does not match the login response id', async () => {
    const { store, service } = createHarness({
      login: () => LOGIN_OK,
      me: () => ({ status: 200, data: { id: 99, username: 'other', role: 'super_admin', avatar: null, twofa_enabled: 0 } }),
    })
    await expectBffError(service.login({ username: 'admin', password: 'x' }, { clientIp: '203.0.113.9' }), 502, 'upstream_invalid_response')
    expect(store.size()).toBe(0)
  })
})

describe('protected verification uses fresh upstream identity', () => {
  it('returns the current identity and upstream token to the route layer only', async () => {
    const { service } = createHarness({ login: () => LOGIN_OK, me: () => ME_OK })
    const login = await service.login({ username: 'admin', password: 'x' }, { clientIp: '203.0.113.9' })
    const verified = await service.verify(login.sessionId)
    expect(verified.identity).toEqual({ id: 1, username: 'admin', role: 'super_admin', avatar: null })
    expect(verified.twofaEnabled).toBe(true)
    expect(verified.upstreamToken).toBe(bearerToken())
    expect(verified.identityChanged).toBe(false)
  })

  it('applies the freshly fetched role so a downgrade loses super-admin authority', async () => {
    let role = 'super_admin'
    const { store, service } = createHarness({
      login: () => LOGIN_OK,
      me: () => ({ status: 200, data: { id: 1, username: 'admin', role, avatar: null, twofa_enabled: 0 } }),
    })
    const login = await service.login({ username: 'admin', password: 'x' }, { clientIp: '203.0.113.9' })
    role = 'admin'
    const verified = await service.verify(login.sessionId)
    expect(verified.identityChanged).toBe(true)
    expect(verified.identity.role).toBe('admin')
    await expectBffError(service.verify(login.sessionId, { superAdmin: true }), 403, 'forbidden')
    // A permission denial keeps the session; only 401 revokes it.
    expect(store.get(hashSessionId(login.sessionId), NOW)?.identity.role).toBe('admin')
  })

  it.each([
    ['revoked or invalid token', 403],
    ['token_version change', 401],
    ['deleted user', 404],
  ])('treats upstream %s as session expiry and deletes the record', async (_label, status) => {
    // The login flow verifies identity with its own `/me` call; only the second
    // (protected) call may fail, otherwise the login itself would be rejected.
    let meCalls = 0
    const { store, service } = createHarness({
      login: () => LOGIN_OK,
      me: () => {
        meCalls += 1
        return meCalls === 1 ? ME_OK : { status, data: { message: 'gone' } }
      },
    })
    const login = await service.login({ username: 'admin', password: 'x' }, { clientIp: '203.0.113.9' })
    await expectBffError(service.verify(login.sessionId), 401, 'session_expired')
    expect(store.get(hashSessionId(login.sessionId), NOW)).toBeUndefined()
  })

  it('expires a record without any upstream call and deletes it', async () => {
    const { clock, store, service, upstream } = createHarness({ login: () => LOGIN_OK, me: () => ME_OK })
    const login = await service.login({ username: 'admin', password: 'x' }, { clientIp: '203.0.113.9' })
    clock.value = login.expiresAt + 1
    await expectBffError(service.verify(login.sessionId), 401, 'session_expired')
    expect(store.get(hashSessionId(login.sessionId), NOW)).toBeUndefined()
    expect(upstream.calls).toHaveLength(2)
  })

  it('keeps the session and reports 503 when identity cannot be verified', async () => {
    // Login's own `/me` must succeed; the protected re-check is the one that
    // hits an upstream failure.
    let meCalls = 0
    const { store, service } = createHarness({
      login: () => LOGIN_OK,
      me: () => {
        meCalls += 1
        return meCalls === 1 ? ME_OK : { status: 500, data: {} }
      },
    })
    const login = await service.login({ username: 'admin', password: 'x' }, { clientIp: '203.0.113.9' })
    await expectBffError(service.verify(login.sessionId), 503, 'upstream_unavailable')
    expect(store.get(hashSessionId(login.sessionId), NOW)).toBeDefined()
  })

  it('refuses an unknown session id and an implausible cookie value', async () => {
    const { service } = createHarness({ login: () => LOGIN_OK, me: () => ME_OK })
    await expectBffError(service.verify('x'.repeat(43)), 401, 'session_expired')
    await expectBffError(service.verify('short'), 401, 'session_expired')
  })

  it('does not resurrect a session revoked while /me was in flight', async () => {
    let releaseMe: (() => void) | undefined
    // The login-time `/me` resolves immediately; the protected one is held open
    // so the concurrent logout can win the race.
    let meCalls = 0
    const { store, service } = createHarness({
      login: () => LOGIN_OK,
      me: () => {
        meCalls += 1
        if (meCalls === 1) return ME_OK
        return new Promise((resolve) => {
          releaseMe = () => resolve(ME_OK)
        })
      },
    })
    const login = await service.login({ username: 'admin', password: 'x' }, { clientIp: '203.0.113.9' })
    const pending = service.verify(login.sessionId)
    await service.logout(login.sessionId)
    releaseMe?.()
    await expectBffError(pending, 401, 'session_expired')
    expect(store.size()).toBe(0)
  })

  it('does not resurrect a session rotated away while /me was in flight', async () => {
    let releaseMe: (() => void) | undefined
    let meCalls = 0
    const { store, service } = createHarness({
      login: () => LOGIN_OK,
      me: () => {
        meCalls += 1
        // 1: login #1 verification, 2: the in-flight protected read,
        // 3: login #2 (rotation) verification.
        if (meCalls === 2) {
          return new Promise((resolve) => {
            releaseMe = () => resolve(ME_OK)
          })
        }
        return ME_OK
      },
    })
    const first = await service.login({ username: 'admin', password: 'x' }, { clientIp: '203.0.113.9' })
    const pending = service.verify(first.sessionId)
    const second = await service.login({ username: 'admin', password: 'x' }, { clientIp: '203.0.113.9', currentSessionId: first.sessionId })
    releaseMe?.()
    await expectBffError(pending, 401, 'session_expired')
    expect(store.get(hashSessionId(first.sessionId), NOW)).toBeUndefined()
    expect(store.get(hashSessionId(second.sessionId), NOW)).toBeDefined()
  })

  it('keeps two clients distinct and revokes only the logged-out one', async () => {
    const { store, service } = createHarness({ login: () => LOGIN_OK, me: () => ME_OK })
    const first = await service.login({ username: 'admin', password: 'x' }, { clientIp: '203.0.113.9' })
    const second = await service.login({ username: 'admin', password: 'x' }, { clientIp: '203.0.113.10' })
    expect(first.sessionId).not.toBe(second.sessionId)
    await service.logout(first.sessionId)
    expect(store.size()).toBe(1)
    await expect(service.verify(second.sessionId)).resolves.toMatchObject({ identity: { id: 1 } })
  })

  it('ignores a browser-supplied role: authority comes from the record and /me only', async () => {
    const { service } = createHarness({ login: () => LOGIN_OK, me: () => ({ status: 200, data: { id: 1, username: 'admin', role: 'admin', avatar: null, twofa_enabled: 0 } }) })
    const login = await service.login({ username: 'admin', password: 'x' }, { clientIp: '203.0.113.9' })
    const verified = await service.verify(login.sessionId)
    expect(verified.identity.role).toBe('admin')
  })

  it('revokes every session for a user on demand', async () => {
    const { store, service } = createHarness({ login: () => LOGIN_OK, me: () => ME_OK })
    const first = await service.login({ username: 'admin', password: 'x' }, { clientIp: '203.0.113.9' })
    const second = await service.login({ username: 'admin', password: 'x' }, { clientIp: '203.0.113.10' })
    expect(service.revokeForUser(1)).toBe(2)
    expect(store.size()).toBe(0)
    await expectBffError(service.verify(first.sessionId), 401, 'session_expired')
    await expectBffError(service.verify(second.sessionId), 401, 'session_expired')
  })
})

describe('store contract', () => {
  it('exposes the same delete/get surfaces the routes rely on', () => {
    const store: BffSessionStore = createMemorySessionStore()
    expect(typeof store.deleteByUserId).toBe('function')
    expect(store.size()).toBe(0)
  })
})
