import { describe, expect, it, vi } from 'vitest'
import { createBffSessionCore } from '../app/utils/bff-session-core'
import { BFF_AUTH_PATHS, BffRequestError } from '../app/utils/bff-client'
import { createPrivateCleanupRegistry } from '../app/utils/bff-private-cleanups'

// Generation/serialization semantics: delayed responses, repeated identity
// changes and CSRF rotation must never resurrect or overwrite newer state.

const ALICE = { id: 1, username: 'alice', role: 'super_admin' as const, avatar: null }
const BOB = { id: 2, username: 'bob', role: 'admin' as const, avatar: '/uploads/b.webp' }

interface Call {
  path: string
  init: RequestInit
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function createHarness() {
  const calls: Call[] = []
  const handlers = new Map<string, (call: Call) => Promise<Response> | Response>()
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { path: String(input), init: init ?? {} }
    calls.push(call)
    const handler = handlers.get(call.path)
    if (!handler) throw new Error(`no fixture handler for ${call.path}`)
    return handler(call)
  }) as unknown as typeof fetch
  handlers.set(BFF_AUTH_PATHS.csrf, () => json({ csrfToken: 'csrf-1', expiresIn: 7200 }))
  handlers.set(BFF_AUTH_PATHS.login, () => json({ user: ALICE, expiresAt: 1, csrfToken: 'csrf-a' }))
  handlers.set(BFF_AUTH_PATHS.logout, () => json({ loggedOut: true }))
  handlers.set(BFF_AUTH_PATHS.session, () => json({ authenticated: false }))
  return {
    calls,
    handlers,
    fetchImpl,
    count: (path: string) => calls.filter(call => call.path === path).length,
  }
}

describe('delayed responses cannot resurrect a session', () => {
  it('ignores a /me response that arrives after logout', async () => {
    const harness = createHarness()
    const slow = deferred<Response>()
    harness.handlers.set(BFF_AUTH_PATHS.session, () => slow.promise)
    const core = createBffSessionCore({ fetchImpl: harness.fetchImpl })

    await core.login({ username: 'alice', password: 'x' })
    expect(core.getSnapshot().status).toBe('authenticated')

    const pending = core.refresh()
    await core.logout()
    expect(core.getSnapshot()).toMatchObject({ status: 'anonymous', user: null })

    slow.resolve(json({ authenticated: true, user: ALICE, twofaEnabled: true, expiresAt: 9 }))
    await pending
    expect(core.getSnapshot()).toMatchObject({ status: 'anonymous', user: null })
  })

  it('ignores an old-user refresh that arrives after a newer login', async () => {
    const harness = createHarness()
    const slow = deferred<Response>()
    harness.handlers.set(BFF_AUTH_PATHS.session, () => slow.promise)
    harness.handlers.set(BFF_AUTH_PATHS.login, () => json({ user: BOB, expiresAt: 2, csrfToken: 'csrf-b' }))
    const core = createBffSessionCore({ fetchImpl: harness.fetchImpl })

    const pending = core.refresh()
    await core.login({ username: 'bob', password: 'x' })
    expect(core.getSnapshot().user?.username).toBe('bob')

    slow.resolve(json({ authenticated: true, user: ALICE, twofaEnabled: false, expiresAt: 9 }))
    await pending
    expect(core.getSnapshot().user).toEqual(BOB)
  })

  it('ignores a stale 401 that arrives after a newer login', async () => {
    const harness = createHarness()
    const slow = deferred<Response>()
    harness.handlers.set(BFF_AUTH_PATHS.session, () => slow.promise)
    harness.handlers.set(BFF_AUTH_PATHS.login, () => json({ user: BOB, expiresAt: 2, csrfToken: 'csrf-b' }))
    const onSessionLost = vi.fn()
    const core = createBffSessionCore({ fetchImpl: harness.fetchImpl, onSessionLost })

    const pending = core.refresh()
    await core.login({ username: 'bob', password: 'x' })
    const cleanupsAfterLogin = onSessionLost.mock.calls.length

    slow.resolve(json({ error: { code: 'session_expired', message: '登录状态已失效，请重新登录' } }, 401))
    await pending
    expect(core.getSnapshot().user).toEqual(BOB)
    expect(onSessionLost.mock.calls.length).toBe(cleanupsAfterLogin)
  })

  it('does not update state after disposal (late app unmount)', async () => {
    const harness = createHarness()
    const slow = deferred<Response>()
    harness.handlers.set(BFF_AUTH_PATHS.session, () => slow.promise)
    const core = createBffSessionCore({ fetchImpl: harness.fetchImpl })

    const pending = core.refresh()
    core.dispose()
    const before = core.getSnapshot()
    slow.resolve(json({ authenticated: true, user: ALICE, twofaEnabled: false, expiresAt: 3 }))
    await expect(pending).resolves.toEqual(before)
    expect(core.getSnapshot()).toEqual(before)
  })
})

describe('deduplicated refresh and CSRF', () => {
  it('shares one in-flight refresh', async () => {
    const harness = createHarness()
    const core = createBffSessionCore({ fetchImpl: harness.fetchImpl })
    await Promise.all([core.refresh(), core.refresh(), core.refresh()])
    expect(harness.count(BFF_AUTH_PATHS.session)).toBe(1)
  })

  it('shares one in-flight CSRF fetch', async () => {
    const harness = createHarness()
    const core = createBffSessionCore({ fetchImpl: harness.fetchImpl })
    const tokens = await Promise.all([core.ensureCsrf(), core.csrf.ensure(), core.ensureCsrf()])
    expect(harness.count(BFF_AUTH_PATHS.csrf)).toBe(1)
    expect(tokens).toEqual(['csrf-1', 'csrf-1', 'csrf-1'])
    expect(core.csrf.token()).toBe('csrf-1')
  })

  it('never lets an older CSRF fetch overwrite a newer rotation', async () => {
    const harness = createHarness()
    const slow = deferred<Response>()
    let csrfCalls = 0
    harness.handlers.set(BFF_AUTH_PATHS.csrf, () => {
      csrfCalls += 1
      return csrfCalls === 1 ? slow.promise : json({ csrfToken: 'new-token', expiresIn: 7200 })
    })
    const core = createBffSessionCore({ fetchImpl: harness.fetchImpl })

    const stale = core.csrf.invalidate()
    core.clearPrivateState()
    slow.resolve(json({ csrfToken: 'old-token', expiresIn: 7200 }))
    await stale
    expect(core.csrf.token()).toBe('')

    await expect(core.csrf.ensure()).resolves.toBe('new-token')
    expect(core.csrf.token()).toBe('new-token')
  })
})

describe('identity and role changes clear private data first', () => {
  it('clears before adopting a different user and reports the order', async () => {
    const harness = createHarness()
    const order: string[] = []
    let cached: string | null
    harness.handlers.set(BFF_AUTH_PATHS.session, () => json({ authenticated: true, user: BOB, twofaEnabled: false, expiresAt: 4 }))
    const core = createBffSessionCore({
      fetchImpl: harness.fetchImpl,
      onSessionLost: () => {
        order.push('cleanup')
        cached = null
      },
    })

    await core.login({ username: 'alice', password: 'x' })
    order.length = 0
    cached = 'cached-again'

    await core.refresh()
    expect(order).toEqual(['cleanup'])
    expect(cached).toBeNull()
    expect(core.getSnapshot().user).toEqual(BOB)
  })

  it('clears on a role change for the same user and survives repeated cycles', async () => {
    const harness = createHarness()
    let role: 'admin' | 'super_admin' = 'super_admin'
    harness.handlers.set(BFF_AUTH_PATHS.session, () => json({
      authenticated: true,
      user: { ...ALICE, role },
      twofaEnabled: false,
      expiresAt: 5,
    }))
    const onSessionLost = vi.fn()
    const core = createBffSessionCore({ fetchImpl: harness.fetchImpl, onSessionLost })

    await core.login({ username: 'alice', password: 'x' })
    // First adoption (anonymous -> user) has no previous user's cache to clear.
    expect(onSessionLost).not.toHaveBeenCalled()

    role = 'admin'
    await core.refresh()
    expect(core.getSnapshot().user?.role).toBe('admin')
    expect(onSessionLost).toHaveBeenCalledTimes(1)

    role = 'super_admin'
    await core.refresh()
    expect(core.getSnapshot().user?.role).toBe('super_admin')
    expect(onSessionLost).toHaveBeenCalledTimes(2)

    // Same identity and role again: no redundant cleanup.
    await core.refresh()
    expect(onSessionLost).toHaveBeenCalledTimes(2)
  })

  it('ignores an in-flight private query result that lands after the cache clear', async () => {
    const registry = createPrivateCleanupRegistry()
    const client = { inFlight: 1, applied: null as string | null }
    registry.register(() => {
      client.inFlight = 0
    })

    const late = Promise.resolve().then(() => {
      if (client.inFlight === 0) return
      client.applied = 'stale-query-result'
    })
    registry.runAll()
    await late
    expect(client.applied).toBeNull()
    expect(client.inFlight).toBe(0)
  })
})

describe('logout failure and facade retry bounds', () => {
  it('keeps the session on a logout network failure and clears on a later success', async () => {
    const harness = createHarness()
    let failLogout = true
    harness.handlers.set(BFF_AUTH_PATHS.logout, () => {
      if (failLogout) return Promise.reject(new TypeError('fetch failed'))
      return json({ loggedOut: true })
    })
    const core = createBffSessionCore({ fetchImpl: harness.fetchImpl })

    await core.login({ username: 'alice', password: 'x' })
    await expect(core.logout()).rejects.toBeInstanceOf(BffRequestError)
    expect(core.getSnapshot()).toMatchObject({ status: 'authenticated', lastErrorCode: 'network_error' })
    expect(core.getSnapshot().user).toEqual(ALICE)

    failLogout = false
    await core.logout()
    expect(core.getSnapshot()).toMatchObject({ status: 'anonymous', user: null })
  })

  it('retries a closed transport exactly once and only for an explicit CSRF rejection', async () => {
    const harness = createHarness()
    let csrfCalls = 0
    harness.handlers.set(BFF_AUTH_PATHS.csrf, () => json({ csrfToken: `csrf-${++csrfCalls}`, expiresIn: 7200 }))
    const core = createBffSessionCore({ fetchImpl: harness.fetchImpl })

    const send = vi.fn()
      .mockRejectedValueOnce(new BffRequestError(403, 'csrf_invalid', '请求校验失败，请刷新页面后重试'))
      .mockResolvedValueOnce('written')
    await expect(core.performMutation({ send })).resolves.toBe('written')
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[0]?.[0]).toBe('csrf-1')
    expect(send.mock.calls[1]?.[0]).toBe('csrf-2')

    const networkSend = vi.fn().mockRejectedValue(new BffRequestError(0, 'network_error', '服务器连接失败，请检查网络或后端状态'))
    await expect(core.performMutation({ send: networkSend })).rejects.toBeInstanceOf(BffRequestError)
    expect(networkSend).toHaveBeenCalledTimes(1)

    const forbiddenSend = vi.fn().mockRejectedValue(new BffRequestError(403, 'forbidden', '权限不足'))
    await expect(core.performMutation({ send: forbiddenSend })).rejects.toBeInstanceOf(BffRequestError)
    expect(forbiddenSend).toHaveBeenCalledTimes(1)
  })
})
