import type { BffAuthService } from './bff-auth-service'
import { createBffAuthService } from './bff-auth-service'
import { BffConfigError } from './bff-errors'
import type { FixedWindowRateLimiter } from './bff-write'
import { createFixedWindowRateLimiter, parseAllowedOrigins } from './bff-write'
import type { TrustedProxyMatcher } from './bff-identity'
import { createTrustedProxyMatcher } from './bff-identity'
import { CSRF_KEY_PURPOSE, createMemorySessionStore, derivePurposeKey } from './bff-session'
import type { BffSessionStore } from './bff-session'
import type { UpstreamClient, UpstreamClientOptions } from './bff-upstream'
import { createUpstreamClient } from './bff-upstream'

export interface BffAuthRuntimeConfig {
  allowedOrigins: string[]
  trustedProxyCidrs: string[]
  allowInsecureLoopbackCookies: boolean
  sessionMaxAgeSeconds: number
  csrfMaxAgeSeconds: number
  maxJsonBytes: number
  maxLogoutBytes: number
  memorySessionLimit: number
  loginRateLimitMax: number
  loginRateLimitWindowMs: number
  bodyTimeoutMs: number
  upstreamTimeoutMs: number
  maxUpstreamResponseBytes: number
}

export interface BffRuntime {
  config: BffAuthRuntimeConfig
  /** Validated upstream origin used by the auth and admin clients. */
  apiBase: string
  store: BffSessionStore
  loginLimiter: FixedWindowRateLimiter
  auth: BffAuthService
  csrfKey: Buffer
  sessionCookieName: string
  trust: TrustedProxyMatcher
}

/** Values read from Nuxt runtime config for one request. */
export interface BffRuntimeInputs {
  rawBffAuth: unknown
  session: Record<string, unknown>
  apiBase: unknown
}

export interface BffRuntimeFactoryDeps {
  createStore?: (options: { maxEntries: number }) => BffSessionStore
  createLimiter?: (options: { limit: number, windowMs: number }) => FixedWindowRateLimiter
  createUpstream?: (options: UpstreamClientOptions) => UpstreamClient
  createAuth?: (deps: Parameters<typeof createBffAuthService>[0]) => BffAuthService
}

export interface BffRuntimeFactory {
  resolve: (inputs: BffRuntimeInputs) => BffRuntime
}

const DEFAULT_SESSION_COOKIE_NAME = 'guatswr-next'

function readRecord(raw: unknown): Record<string, unknown> {
  return typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {}
}

function readNumber(raw: unknown, fallback: number, min: number, max: number): number {
  const value = typeof raw === 'string' && /^\d{1,9}$/.test(raw.trim()) ? Number.parseInt(raw.trim(), 10) : raw
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(Math.max(Math.floor(value), min), max)
}

function readBoolean(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === 'boolean') return raw
  if (raw === 'true' || raw === '1') return true
  if (raw === 'false' || raw === '0') return false
  return fallback
}

function readStringArray(raw: unknown, field: string): string[] {
  if (raw === undefined || raw === null) return []
  if (typeof raw === 'string') return raw.split(',').map(entry => entry.trim()).filter(entry => entry.length > 0)
  if (Array.isArray(raw)) {
    return raw.map((entry) => {
      // Field-only diagnostics: never echo a configured value.
      if (typeof entry !== 'string') throw new BffConfigError(`${field} entries must be strings`)
      return entry.trim()
    }).filter(entry => entry.length > 0)
  }
  throw new BffConfigError(`${field} must be a string list`)
}

/** Normalize the private runtime defaults; malformed security settings fail closed. */
export function normalizeBffAuthRuntime(raw: unknown): BffAuthRuntimeConfig {
  const record = readRecord(raw)
  return {
    allowedOrigins: parseAllowedOrigins(record.allowedOrigins),
    trustedProxyCidrs: readStringArray(record.trustedProxyCidrs, 'trustedProxyCidrs'),
    allowInsecureLoopbackCookies: readBoolean(record.allowInsecureLoopbackCookies, false),
    sessionMaxAgeSeconds: readNumber(record.sessionMaxAgeSeconds, 24 * 60 * 60, 300, 24 * 60 * 60),
    csrfMaxAgeSeconds: readNumber(record.csrfMaxAgeSeconds, 2 * 60 * 60, 60, 2 * 60 * 60),
    maxJsonBytes: readNumber(record.maxJsonBytes, 16 * 1024, 256, 64 * 1024),
    maxLogoutBytes: readNumber(record.maxLogoutBytes, 1024, 64, 8 * 1024),
    memorySessionLimit: readNumber(record.memorySessionLimit, 10_000, 1, 1_000_000),
    loginRateLimitMax: readNumber(record.loginRateLimitMax, 10, 1, 1000),
    loginRateLimitWindowMs: readNumber(record.loginRateLimitWindowMs, 60_000, 1000, 60 * 60 * 1000),
    bodyTimeoutMs: readNumber(record.bodyTimeoutMs, 5_000, 500, 30_000),
    upstreamTimeoutMs: readNumber(record.upstreamTimeoutMs, 8_000, 1000, 30_000),
    maxUpstreamResponseBytes: readNumber(record.maxUpstreamResponseBytes, 64 * 1024, 1024, 1024 * 1024),
  }
}

function sessionSecretOf(session: Record<string, unknown>): string {
  return typeof session.password === 'string' ? session.password : ''
}

function sessionCookieNameOf(session: Record<string, unknown>): string {
  const name = session.name
  return typeof name === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(name) ? name : DEFAULT_SESSION_COOKIE_NAME
}

/**
 * Build a process-local runtime resolver with explicit identity caching.
 *
 * The auth service is rebuilt whenever its secret, upstream origin, limits or
 * *store instance* changes. In particular, replacing the session store (for
 * example after a capacity change) must not leave the service bound to the old
 * store, and an `apiBase` change must not reuse a client aimed at the previous
 * backend.
 */
export function createBffRuntimeFactory(deps: BffRuntimeFactoryDeps = {}): BffRuntimeFactory {
  const createStore = deps.createStore ?? (options => createMemorySessionStore(options))
  const createLimiter = deps.createLimiter ?? (options => createFixedWindowRateLimiter(options))
  const createUpstream = deps.createUpstream ?? (options => createUpstreamClient(options))
  const createAuth = deps.createAuth ?? (options => createBffAuthService(options))

  let store: BffSessionStore | undefined
  let storeLimit = -1
  let limiter: FixedWindowRateLimiter | undefined
  let limiterKey = ''
  let auth: BffAuthService | undefined
  let authSecret = ''
  let authApiBase = ''
  let cachedAuthOptionsKey = ''
  let authStore: BffSessionStore | undefined
  let csrfSecret = ''
  let csrfKey: Buffer | undefined
  let trust: TrustedProxyMatcher | undefined
  let trustKey = ''

  return {
    resolve(inputs) {
      const config = normalizeBffAuthRuntime(inputs.rawBffAuth)
      const secret = sessionSecretOf(inputs.session)
      if (secret.length === 0) {
        throw new BffConfigError('NUXT_SESSION_PASSWORD must be configured before auth endpoints are used')
      }
      const apiBase = typeof inputs.apiBase === 'string' ? inputs.apiBase : ''
      // Validate the origin once here (the auth client also validates it) so
      // the runtime exposes only a normalized HTTP(S) origin.
      let originForAdmin: string
      try {
        const parsed = new URL(apiBase)
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password
          || parsed.pathname !== '/' || parsed.search || parsed.hash) {
          throw new Error('invalid origin')
        }
        originForAdmin = parsed.origin
      }
      catch {
        throw new BffConfigError('apiBase must be an HTTP(S) origin without credentials or a path')
      }

      if (!store || storeLimit !== config.memorySessionLimit) {
        store = createStore({ maxEntries: config.memorySessionLimit })
        storeLimit = config.memorySessionLimit
      }
      const currentStore = store

      const currentLimiterKey = `${config.loginRateLimitMax}:${config.loginRateLimitWindowMs}`
      if (!limiter || limiterKey !== currentLimiterKey) {
        limiter = createLimiter({
          limit: config.loginRateLimitMax,
          windowMs: config.loginRateLimitWindowMs,
        })
        limiterKey = currentLimiterKey
      }

      const upstreamOptionsKey = `${config.upstreamTimeoutMs}:${config.maxUpstreamResponseBytes}`
      if (!auth
        || authSecret !== secret
        || authApiBase !== apiBase
        || cachedAuthOptionsKey !== upstreamOptionsKey
        || authStore !== currentStore) {
        auth = createAuth({
          store: currentStore,
          upstream: createUpstream({
            origin: apiBase,
            timeoutMs: config.upstreamTimeoutMs,
            maxResponseBytes: config.maxUpstreamResponseBytes,
          }),
          secret,
        })
        authSecret = secret
        authApiBase = apiBase
        cachedAuthOptionsKey = upstreamOptionsKey
        authStore = currentStore
      }

      if (csrfSecret !== secret || !csrfKey) {
        csrfKey = derivePurposeKey(secret, CSRF_KEY_PURPOSE)
        csrfSecret = secret
      }

      const currentTrustKey = config.trustedProxyCidrs.join(',')
      if (!trust || trustKey !== currentTrustKey) {
        trust = createTrustedProxyMatcher(config.trustedProxyCidrs)
        trustKey = currentTrustKey
      }

      return {
        config,
        apiBase: new URL(originForAdmin).origin,
        store: currentStore,
        loginLimiter: limiter,
        auth,
        csrfKey,
        sessionCookieName: sessionCookieNameOf(inputs.session),
        trust,
      }
    },
  }
}
