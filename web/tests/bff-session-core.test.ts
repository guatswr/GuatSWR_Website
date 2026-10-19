import { describe, expect, it, vi } from 'vitest'
import { BFF_AUTH_PATHS, BffRequestError } from '../app/utils/bff-client'
import { createBffSessionCore } from '../app/utils/bff-session-core'

// Per-Nuxt-application controller behavior without a browser: injected fetch,
// explicit CSRF handling and registered private-cleanup callbacks.

const ADMIN = { id: 1, username: 'admin', role: 'super_admin', avatar: null }
const EDITOR = { id: 2, username: 'editor', role: 'admin', avatar: '/uploads/e.webp' }

interface FetchCall {
  path: string
  init: RequestInit
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function errorBody(status: number, code: string, message: string) {
  return json({ error: { code, message } }, status)
}

interface BackendOptions {
  session?: () => Promise<Response> | Response
  csrf?: () => Promise<Response> | Response
  login?: (call: FetchCall) => Promise<Response> | Response
  logout?: (call: FetchCall) => Promise<Response> | Response
}

function createBackend(options: BackendOptions = {}) {
  const calls: FetchCall[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { path: String(input), init: init ?? {} }
    calls.push(call)
    if (call.path === BFF_AUTH_PATHS.session) {
      return options.session ? options.session() : json({ authenticated: false })
    }
    if (call.path === BFF_AUTH_PATHS.csrf) {
      return options.csrf ? options.csrf() : json({ csrfToken: 'csrf-1', expiresIn: 7200 })
    }
    if (call.path === BFF_AUTH_PATHS.login) {
      return options.login ? options.login(call) : json({ user: ADMIN, expiresAt: 1, csrfToken: 'csrf-login' })
    }
    if (call.path === BFF_AUTH_PATHS.logout) {
      return options.logout ? options.logout(call) : json({ loggedOut: true })
    }
    throw new Error(`unexpected path ${call.path}`)
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}

function csrfHeader(call: FetchCall): string | null {
  return (call.init.headers as Headers).get('x-csrf-token')
}

describe('session refresh', () => {
  it('stays anonymous without touching CSRF or private state', async () => {
    const onSessionLost = vi.fn()
    const backend = createBackend()
    const core = createBffSessionCore({ fetchImpl: backend.fetchImpl, onSessionLost })
    const snapshot = await core.refresh()
    expect(snapshot).toMatchObject({ status: 'anonymous', user: null, twofaEnabled: false })
    expect(backend.calls.map(call => call.path)).toEqual([BFF_AUTH_PATHS.session])
    expect(onSessionLost).not.toHaveBeenCalled()
  })

  it('stores only the safe user projection and the twofa hint', async () => {
    const backend = createBackend({
      session: () => json({
        authenticated: true,
        user: { ...ADMIN, role: 'super_admin', token: 'jwt-should-not-exist' },
        twofaEnabled: true,
        expiresAt: 1234,
      }),
    })
    const core = createBffSessionCore({ fetchImpl: backend.fetchImpl })
    const snapshot = await core.refresh()
    expect(snapshot.user).toEqual(ADMIN)
    expect(snapshot.twofaEnabled).toBe(true)
    expect(snapshot.expiresAt).toBe(1234)
    expect(JSON.stringify(snapshot)).not.toContain('jwt-should-not-exist')
  })

  it('clears safe auth and private state on 401 and keeps the session on 403', async () => {
    const onSessionLost = vi.fn()
    const unauthorized = createBackend({ session: () => errorBody(401, 'session_expired', '登录状态已失效，请重新登录') })
    const lostCore = createBffSessionCore({ fetchImpl: unauthorized.fetchImpl, onSessionLost })
    lostCore.subscribe(() => {})
    await lostCore.refresh()
    expect(lostCore.getSnapshot().status).toBe('anonymous')
    expect(onSessionLost).toHaveBeenCalledTimes(1)

    const forbidden = createBackend({
      session: () => errorBody(403, 'forbidden', '权限不足'),
    })
    const deniedCore = createBffSessionCore({ fetchImpl: forbidden.fetchImpl, onSessionLost })
    await deniedCore.refresh()
    expect(deniedCore.getSnapshot().status).toBe('unavailable')
    expect(deniedCore.getSnapshot().lastErrorCode).toBe('forbidden')
    // Only the 401 above ran cleanup; the 403 never does.
    expect(onSessionLost).toHaveBeenCalledTimes(1)

    // A previously authenticated session survives a permission denial intact.
    let call = 0
    const deniedAfterLogin = createBackend({
      session: () => {
        call += 1
        return call === 1
          ? json({ authenticated: true, user: EDITOR, twofaEnabled: false, expiresAt: 5 })
          : errorBody(403, 'forbidden', '权限不足')
      },
    })
    const retained = createBffSessionCore({ fetchImpl: deniedAfterLogin.fetchImpl, onSessionLost })
    await retained.refresh()
    await retained.refresh()
    expect(retained.getSnapshot()).toMatchObject({ status: 'authenticated', lastErrorCode: 'forbidden', user: EDITOR })
  })

  it('keeps an authenticated user through a 502 outage but reports unavailable', async () => {
    let sessionCalls = 0
    const backend = createBackend({
      session: () => {
        sessionCalls += 1
        if (sessionCalls === 1) return json({ authenticated: true, user: EDITOR, twofaEnabled: false, expiresAt: 99 })
        return errorBody(503, 'service_unavailable', '服务暂不可用')
      },
    })
    const core = createBffSessionCore({ fetchImpl: backend.fetchImpl })
    await core.refresh()
    expect(core.getSnapshot().status).toBe('authenticated')
    await core.refresh()
    expect(core.getSnapshot()).toMatchObject({ status: 'unavailable', lastErrorCode: 'service_unavailable' })
    expect(core.getSnapshot().user).toEqual(EDITOR)
  })

  it('refuses a malformed authenticated payload without clearing anything', async () => {
    const backend = createBackend({ session: () => json({ authenticated: true, user: { id: 'nope' } }) })
    const core = createBffSessionCore({ fetchImpl: backend.fetchImpl })
    const snapshot = await core.refresh()
    expect(snapshot.status).toBe('unavailable')
    expect(snapshot.lastErrorCode).toBe('invalid_response')
  })

  it('runs private cleanup when a previously authenticated session becomes anonymous', async () => {
    let call = 0
    const backend = createBackend({
      session: () => {
        call += 1
        return call === 1 ? json({ authenticated: true, user: ADMIN, twofaEnabled: false, expiresAt: 1 }) : json({ authenticated: false })
      },
    })
    const onSessionLost = vi.fn()
    const core = createBffSessionCore({ fetchImpl: backend.fetchImpl, onSessionLost })
    await core.refresh()
    expect(core.getSnapshot().status).toBe('authenticated')
    await core.refresh()
    expect(core.getSnapshot().status).toBe('anonymous')
    expect(onSessionLost).toHaveBeenCalledTimes(1)
  })
})

describe('login', () => {
  it('fetches CSRF, sends the normalized input, and stores the rotated token in memory', async () => {
    const backend = createBackend()
    const core = createBffSessionCore({ fetchImpl: backend.fetchImpl })
    const snapshot = await core.login({ username: 'admin', password: 'adminpass' })
    expect(snapshot.status).toBe('authenticated')
    expect(snapshot.user).toEqual(ADMIN)
    expect(core.csrfToken()).toBe('csrf-login')
    expect(backend.calls.map(call => call.path)).toEqual([BFF_AUTH_PATHS.csrf, BFF_AUTH_PATHS.login])
    expect(csrfHeader(backend.calls[1]!)).toBe('csrf-1')
    expect(backend.calls[1]?.init.body).toBe('{"username":"admin","password":"adminpass"}')
    expect(backend.calls[1]?.init.credentials).toBe('same-origin')
  })

  it('ignores a duplicate submit while the first is in flight', async () => {
    let release: (() => void) | undefined
    let notifyStarted: () => void = () => {}
    // The login fetch only happens after the CSRF fetch resolves, so the test
    // waits for the request itself instead of guessing a microtask count.
    const loginStarted = new Promise<void>((resolve) => { notifyStarted = resolve })
    const backend = createBackend({
      login: () => {
        notifyStarted()
        return new Promise((resolve) => {
          release = () => resolve(json({ user: ADMIN, expiresAt: 1, csrfToken: 'csrf-login' }))
        })
      },
    })
    const core = createBffSessionCore({ fetchImpl: backend.fetchImpl })
    const first = core.login({ username: 'admin', password: 'x' })
    await loginStarted
    const duplicate = await core.login({ username: 'admin', password: 'x' })
    expect(duplicate.submitting).toBe(true)
    release?.()
    await first
    expect(backend.calls.filter(call => call.path === BFF_AUTH_PATHS.login)).toHaveLength(1)
    expect(core.getSnapshot().submitting).toBe(false)
  })

  it('surfaces the sanitized credential error and returns to anonymous', async () => {
    const backend = createBackend({
      login: () => errorBody(401, 'invalid_credentials', '用户名或密码错误 (剩余 4 次)'),
    })
    const core = createBffSessionCore({ fetchImpl: backend.fetchImpl })
    await expect(core.login({ username: 'admin', password: 'x' })).rejects.toMatchObject({
      status: 401,
      code: 'invalid_credentials',
    })
    expect(core.getSnapshot()).toMatchObject({ status: 'anonymous', user: null, submitting: false })
  })

  it('never stores a user when the login response is malformed', async () => {
    const backend = createBackend({ login: () => json({ user: { id: 'nope' }, csrfToken: 'csrf-login' }) })
    const core = createBffSessionCore({ fetchImpl: backend.fetchImpl })
    await expect(core.login({ username: 'admin', password: 'x' })).rejects.toBeInstanceOf(BffRequestError)
    expect(core.getSnapshot().status).toBe('anonymous')
    expect(core.getSnapshot().user).toBeNull()
  })
})

describe('logout', () => {
  it('clears the cookie-backed state and private caches only after the server confirms', async () => {
    const onSessionLost = vi.fn()
    const backend = createBackend()
    const core = createBffSessionCore({ fetchImpl: backend.fetchImpl, onSessionLost })
    await core.login({ username: 'admin', password: 'adminpass' })
    onSessionLost.mockClear()
    await core.logout()
    expect(core.getSnapshot().status).toBe('anonymous')
    expect(core.csrfToken()).toBe('')
    expect(onSessionLost).toHaveBeenCalledTimes(1)
    expect(backend.calls.at(-1)?.path).toBe(BFF_AUTH_PATHS.logout)
  })

  it('keeps the authenticated state and reports a retryable failure when logout cannot reach the BFF', async () => {
    const backend = createBackend({ logout: () => Promise.reject(new TypeError('fetch failed')) })
    const core = createBffSessionCore({ fetchImpl: backend.fetchImpl })
    await core.login({ username: 'admin', password: 'adminpass' })
    const error = await core.logout().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(BffRequestError)
    expect((error as BffRequestError).retryable).toBe(true)
    expect(core.getSnapshot()).toMatchObject({ status: 'authenticated', lastErrorCode: 'network_error' })
    expect(core.getSnapshot().user).toEqual(ADMIN)
  })

  it('treats a 401 during logout as an already-gone session', async () => {
    const backend = createBackend({ logout: () => errorBody(401, 'session_expired', '登录状态已失效，请重新登录') })
    const core = createBffSessionCore({ fetchImpl: backend.fetchImpl })
    await core.login({ username: 'admin', password: 'adminpass' })
    await core.logout()
    expect(core.getSnapshot().status).toBe('anonymous')
  })
})

describe('shared mutation helper', () => {
  it('refreshes CSRF once when the server rejected the write explicitly', async () => {
    let tokens = 0
    let loginCalls = 0
    const backend = createBackend({
      csrf: () => {
        tokens += 1
        return json({ csrfToken: `csrf-${tokens}` })
      },
      login: (call) => {
        loginCalls += 1
        return csrfHeader(call) === 'csrf-2'
          ? json({ user: ADMIN, expiresAt: 1, csrfToken: 'csrf-login' })
          : errorBody(403, 'csrf_invalid', '请求校验失败，请刷新页面后重试')
      },
    })
    const core = createBffSessionCore({ fetchImpl: backend.fetchImpl })
    await core.mutate(BFF_AUTH_PATHS.login, { username: 'admin', password: 'x' })
    expect(loginCalls).toBe(2)
    expect(tokens).toBe(2)
  })
})

describe('per-application isolation', () => {
  it('keeps two controllers fully independent', async () => {
    const lostA = vi.fn()
    const backendA = createBackend()
    const backendB = createBackend({ session: () => errorBody(401, 'session_expired', '登录状态已失效，请重新登录') })
    const coreA = createBffSessionCore({ fetchImpl: backendA.fetchImpl, onSessionLost: lostA })
    const coreB = createBffSessionCore({ fetchImpl: backendB.fetchImpl })

    await coreA.login({ username: 'admin', password: 'x' })
    await coreB.refresh()

    expect(coreA.getSnapshot().status).toBe('authenticated')
    expect(coreB.getSnapshot().status).toBe('anonymous')
    expect(coreA.csrfToken()).toBe('csrf-login')
    expect(coreB.csrfToken()).toBe('')
    expect(lostA).not.toHaveBeenCalled()
  })
})
