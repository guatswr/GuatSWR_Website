import { describe, expect, it } from 'vitest'
import { createBffRuntimeFactory } from '../server/utils/bff-runtime'
import type { BffRuntimeInputs } from '../server/utils/bff-runtime'
import { createMemorySessionStore } from '../server/utils/bff-session'
import { createBffAuthService } from '../server/utils/bff-auth-service'
import { createUpstreamClient } from '../server/utils/bff-upstream'
import { BffConfigError } from '../server/utils/bff-errors'

const SECRET = 'runtime-factory-secret-long-enough-0123456789'

function inputs(overrides: Partial<BffRuntimeInputs> = {}): BffRuntimeInputs {
  return {
    rawBffAuth: {
      allowedOrigins: ['http://127.0.0.1:3100'],
      trustedProxyCidrs: [],
      memorySessionLimit: 100,
      upstreamTimeoutMs: 8000,
      maxUpstreamResponseBytes: 64 * 1024,
    },
    session: { password: SECRET, name: 'guatswr-next' },
    apiBase: 'http://127.0.0.1:8080',
    ...overrides,
  }
}

function createHarness() {
  const created = {
    stores: 0,
    limiter: 0,
    upstreamOrigins: [] as string[],
    authStores: [] as unknown[],
    auth: 0,
  }
  const factory = createBffRuntimeFactory({
    createStore: (options) => {
      created.stores += 1
      return createMemorySessionStore(options)
    },
    createLimiter: (options) => {
      created.limiter += 1
      return { check: () => ({ allowed: true, remaining: 1, retryAfterSeconds: 0 }), size: () => 0, ...options }
    },
    createUpstream: (options) => {
      created.upstreamOrigins.push(options.origin)
      return createUpstreamClient(options)
    },
    createAuth: (deps) => {
      created.auth += 1
      created.authStores.push(deps.store)
      return createBffAuthService(deps)
    },
  })
  return { factory, created }
}

describe('BFF runtime factory cache identity', () => {
  it('reuses every component while the validated inputs are unchanged', () => {
    const { factory, created } = createHarness()
    const first = factory.resolve(inputs())
    const second = factory.resolve(inputs())
    expect(second.auth).toBe(first.auth)
    expect(second.store).toBe(first.store)
    expect(second.loginLimiter).toBe(first.loginLimiter)
    expect(created.auth).toBe(1)
    expect(created.stores).toBe(1)
    expect(first.apiBase).toBe('http://127.0.0.1:8080')
  })

  it('rebuilds the auth service and upstream client when apiBase changes', () => {
    const { factory, created } = createHarness()
    factory.resolve(inputs())
    const changed = factory.resolve(inputs({ apiBase: 'http://127.0.0.1:9090' }))
    expect(created.auth).toBe(2)
    expect(created.upstreamOrigins).toEqual(['http://127.0.0.1:8080', 'http://127.0.0.1:9090'])
    expect(changed.apiBase).toBe('http://127.0.0.1:9090')
  })

  it('rebuilds the auth service when the session store instance is replaced', () => {
    const { factory, created } = createHarness()
    const first = factory.resolve(inputs())
    const second = factory.resolve(inputs({
      rawBffAuth: { ...inputs().rawBffAuth as object, memorySessionLimit: 200 },
    }))
    expect(created.stores).toBe(2)
    expect(created.auth).toBe(2)
    expect(created.authStores[1]).toBe(second.store)
    expect(second.store).not.toBe(first.store)
    // The service is bound to the current store, not the replaced one.
    const record = {
      recordId: 'r',
      key: 'k',
      identity: { id: 1, username: 'admin', role: 'admin' as const, avatar: null },
      token: { iv: '', tag: '', ciphertext: '' },
      createdAt: 0,
      lastSeenAt: 0,
      expiresAt: 1,
    }
    second.store.set(record)
    expect(first.store.size()).toBe(0)
    expect(second.store.size()).toBe(1)
  })

  it('rebuilds the auth service when the secret or limits change', () => {
    const { factory, created } = createHarness()
    factory.resolve(inputs())
    factory.resolve(inputs({ session: { password: `${SECRET}-rotated`, name: 'guatswr-next' } }))
    factory.resolve(inputs({ rawBffAuth: { ...inputs().rawBffAuth as object, upstreamTimeoutMs: 9000 } }))
    expect(created.auth).toBe(3)
  })

  it('keeps the memory bounds finite even for hostile configuration values', () => {
    const { factory } = createHarness()
    const runtime = factory.resolve(inputs({
      rawBffAuth: { memorySessionLimit: Number.POSITIVE_INFINITY, loginRateLimitMax: Number.NaN },
    }))
    expect(runtime.config.memorySessionLimit).toBe(10_000)
    expect(runtime.config.loginRateLimitMax).toBe(10)
  })
})

describe('runtime configuration fails closed without leaking values', () => {
  it('rejects a missing secret', () => {
    const { factory } = createHarness()
    expect(() => factory.resolve(inputs({ session: { name: 'guatswr-next' } }))).toThrow(BffConfigError)
  })

  it('does not embed a credential-bearing origin or proxy value in the error', () => {
    const { factory } = createHarness()
    const sensitive = 'https://user:super-secret-password@next.guatswr.top'
    try {
      factory.resolve(inputs({ rawBffAuth: { allowedOrigins: [sensitive] } }))
      throw new Error('expected configuration failure')
    }
    catch (error) {
      expect(error).toBeInstanceOf(BffConfigError)
      expect(String((error as Error).message)).not.toContain('super-secret-password')
      expect(String((error as Error).message)).not.toContain('next.guatswr.top')
    }

    try {
      factory.resolve(inputs({ rawBffAuth: { trustedProxyCidrs: ['10.0.0.0/99'] } }))
      throw new Error('expected configuration failure')
    }
    catch (error) {
      expect(String((error as Error).message)).not.toContain('10.0.0.0')
    }
  })

  it('rejects an invalid upstream origin at resolution time', () => {
    const { factory } = createHarness()
    expect(() => factory.resolve(inputs({ apiBase: 'file:///etc/passwd' }))).toThrow(BffConfigError)
    expect(() => factory.resolve(inputs({ apiBase: 'http://user:pass@127.0.0.1:8080' }))).toThrow(BffConfigError)
  })
})
