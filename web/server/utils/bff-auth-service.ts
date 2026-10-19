import type { AuthRole, LoginInput, SafeUser, UpstreamMe } from '@guatswr/shared'
import { isAdminRole, loginResponseSchema, projectSafeUser, upstreamMeSchema } from '@guatswr/shared'
import { BffError } from './bff-errors'
import {
  MAX_SESSION_LIFETIME_MS,
  UPSTREAM_TOKEN_PURPOSE,
  computeSessionLifetime,
  createOpaqueSessionId,
  createSessionRecord,
  derivePurposeKey,
  hashSessionId,
  openUpstreamToken,
  parseUpstreamTokenExpiry,
} from './bff-session'
import type { BffSessionRecord, BffSessionStore } from './bff-session'
import { UpstreamFailure } from './bff-upstream'
import type { UpstreamClient, UpstreamJsonResponse } from './bff-upstream'
import { sanitizeExpectedMessage } from './bff-write'

export interface BffAuthServiceDeps {
  store: BffSessionStore
  upstream: UpstreamClient
  /** Runtime session secret; cookie and token keys are purpose-separated from it. */
  secret: string
  now?: () => number
  maxSessionLifetimeMs?: number
}

export interface BffLoginContext {
  /** Trusted client address forwarded to the login endpoint for rate limiting. */
  clientIp: string
  /** Cookie session being replaced by this login, if any. */
  currentSessionId?: string | null
}

export interface BffLoginResult {
  sessionId: string
  user: SafeUser
  expiresAt: number
}

export interface BffRoleRequirement {
  role?: AuthRole
  superAdmin?: boolean
}

export interface BffVerifiedSession {
  sessionKey: string
  identity: SafeUser
  twofaEnabled: boolean
  expiresAt: number
  identityChanged: boolean
  /**
   * Server-side upstream JWT for allowlisted upstream calls. This value must
   * never be serialized into a browser-facing response.
   */
  upstreamToken: string
}

export interface BffAuthService {
  login: (input: LoginInput, context: BffLoginContext) => Promise<BffLoginResult>
  verify: (sessionId: string, requirement?: BffRoleRequirement) => Promise<BffVerifiedSession>
  logout: (sessionId: string) => Promise<void>
  /** Revokes every local session for a user; used when credentials change. */
  revokeForUser: (userId: number) => number
  /** Revokes every local session (backend token_version refresh). */
  revokeAll: () => number
}

function sessionExpired(): BffError {
  return new BffError(401, 'session_expired', '登录状态已失效，请重新登录')
}

function upstreamUnavailable(): BffError {
  return new BffError(503, 'upstream_unavailable', '登录服务暂不可用')
}

function mapUpstreamFailure(error: unknown): BffError {
  if (error instanceof UpstreamFailure) {
    if (error.kind === 'timeout') return new BffError(504, 'upstream_timeout', '登录服务响应超时')
    if (error.kind === 'too_large' || error.kind === 'bad_response' || error.kind === 'request_too_large' || error.kind === 'redirect') {
      return new BffError(502, 'upstream_invalid_response', '登录服务响应异常')
    }
  }
  return upstreamUnavailable()
}

function readMessage(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return undefined
  return (data as Record<string, unknown>).message
}

function boundedSeconds(value: number): number {
  return Math.min(Math.max(Math.floor(value), 1), 900)
}

/**
 * Expected backend login failures are mapped against the frozen backend's
 * known texts instead of echoing an arbitrary `message` field. This keeps the
 * second-password and remaining-attempt UX while never reflecting SQL, stack,
 * credentials or other upstream detail.
 */
function mapLoginMessage(status: number, rawMessage: unknown): { message: string, retryAfterSeconds?: number } {
  const message = typeof rawMessage === 'string' ? rawMessage : undefined
  if (status === 429) {
    const wait = message?.match(/请等待\s*(\d{1,3})\s*秒/)
    const lock = message?.match(/锁定\s*(\d{1,3})\s*分钟/)
    const retryAfterSeconds = wait
      ? boundedSeconds(Number.parseInt(wait[1] as string, 10))
      : lock
        ? boundedSeconds(Number.parseInt(lock[1] as string, 10) * 60)
        : undefined
    return retryAfterSeconds === undefined
      ? { message: '登录过于频繁，请稍后再试' }
      : { message: '登录过于频繁，请稍后再试', retryAfterSeconds }
  }
  if (status === 401) {
    if (message === '需要二步密码') return { message: '需要二步密码' }
    if (message?.startsWith('二步密码错误')) return { message: '二步密码错误' }
    const wrongCredentials = message?.match(/^用户名或密码错误(?:\s*\(剩余\s*(\d{1,2})\s*次\))?$/)
    if (wrongCredentials?.[1]) return { message: `用户名或密码错误 (剩余 ${wrongCredentials[1]} 次)` }
    return { message: '用户名或密码错误' }
  }
  return { message: '请求参数无效' }
}

function loginFailure(response: UpstreamJsonResponse, input: LoginInput): BffError {
  const mapped = mapLoginMessage(response.status, readMessage(response.data))
  // Defense in depth: the mapped text is already fixed, but any accidental
  // future interpolation still cannot reflect the submitted credentials.
  const message = sanitizeExpectedMessage(mapped.message, [input.username, input.password, input.twofa ?? ''])
    ?? '登录失败'
  if (response.status === 429) {
    const retryAfterSeconds = response.retryAfterSeconds ?? mapped.retryAfterSeconds
    return retryAfterSeconds === undefined
      ? new BffError(429, 'rate_limited', message)
      : new BffError(429, 'rate_limited', message, { retryAfterSeconds })
  }
  if (response.status === 400) {
    return new BffError(400, 'invalid_request', message)
  }
  if (response.status === 401) {
    return new BffError(401, 'invalid_credentials', message)
  }
  return new BffError(502, 'upstream_invalid_response', '登录服务响应异常')
}

function parseMe(data: unknown): UpstreamMe {
  const parsed = upstreamMeSchema.safeParse(data)
  if (!parsed.success) throw new BffError(502, 'upstream_invalid_response', '登录服务响应异常')
  return parsed.data
}

export function createBffAuthService(deps: BffAuthServiceDeps): BffAuthService {
  const now = deps.now ?? Date.now
  const maxSessionLifetimeMs = deps.maxSessionLifetimeMs ?? MAX_SESSION_LIFETIME_MS
  let cachedTokenKey: Buffer | undefined
  const tokenKey = () => {
    cachedTokenKey ??= derivePurposeKey(deps.secret, UPSTREAM_TOKEN_PURPOSE)
    return cachedTokenKey
  }

  const requestMe = async (token: string): Promise<UpstreamJsonResponse> => {
    try {
      return await deps.upstream.request({ route: 'auth.me', bearerToken: token })
    }
    catch (error) {
      throw mapUpstreamFailure(error)
    }
  }

  return {
    async login(input, context) {
      let loginResponse: UpstreamJsonResponse
      try {
        loginResponse = await deps.upstream.request({
          route: 'auth.login',
          body: input,
          clientIp: context.clientIp,
        })
      }
      catch (error) {
        throw mapUpstreamFailure(error)
      }

      if (loginResponse.status !== 200) throw loginFailure(loginResponse, input)

      const parsed = loginResponseSchema.safeParse(loginResponse.data)
      if (!parsed.success) throw new BffError(502, 'upstream_invalid_response', '登录服务响应异常')

      const meResponse = await requestMe(parsed.data.token)
      if (meResponse.status === 401 || meResponse.status === 403 || meResponse.status === 404) {
        // The freshly issued token already fails verification: never establish
        // a local session and never fall back to the login response identity.
        throw new BffError(401, 'login_verification_failed', '登录状态校验失败，请重新登录')
      }
      if (meResponse.status !== 200) throw new BffError(502, 'upstream_invalid_response', '登录服务响应异常')

      const me = parseMe(meResponse.data)
      if (me.id !== parsed.data.id) throw new BffError(502, 'upstream_invalid_response', '登录服务响应异常')

      const currentTime = now()
      let upstreamExpiresAt: number
      try {
        upstreamExpiresAt = parseUpstreamTokenExpiry(parsed.data.token)
        computeSessionLifetime(upstreamExpiresAt, currentTime, maxSessionLifetimeMs)
      }
      catch {
        throw new BffError(502, 'upstream_invalid_response', '登录服务响应异常')
      }

      // Rotation: the opaque id is new, so the previous cookie can never be
      // replayed into this record, and the previous record is dropped.
      const sessionId = createOpaqueSessionId()
      const record = createSessionRecord({
        sessionId,
        identity: projectSafeUser(me),
        token: parsed.data.token,
        upstreamExpiresAt,
        now: currentTime,
        tokenKey: tokenKey(),
        maxLifetimeMs: maxSessionLifetimeMs,
      })
      deps.store.set(record)
      if (typeof context.currentSessionId === 'string' && context.currentSessionId.length > 0) {
        try {
          deps.store.delete(hashSessionId(context.currentSessionId))
        }
        catch {
          // An implausible cookie id cannot name a live record.
        }
      }

      // The record owns the bounded lifetime: `min(upstream exp, now + 24h)`.
      return { sessionId, user: record.identity, expiresAt: record.expiresAt }
    },

    async verify(sessionId, requirement) {
      const currentTime = now()
      let key: string
      try {
        key = hashSessionId(sessionId)
      }
      catch {
        throw sessionExpired()
      }
      const initial = deps.store.get(key, currentTime)
      if (!initial) throw sessionExpired()

      const token = openUpstreamToken(initial.token, tokenKey(), key)
      if (!token) {
        deps.store.delete(key)
        throw sessionExpired()
      }

      const response = await requestMe(token)

      // Re-read after the upstream round trip: a concurrent logout, rotation or
      // expiry must not be resurrected by a stale in-flight verification.
      const current = deps.store.get(key, now())
      if (!current || current.recordId !== initial.recordId) throw sessionExpired()
      if (current.expiresAt <= now()) {
        deps.store.delete(key)
        throw sessionExpired()
      }

      if (response.status === 401 || response.status === 403 || response.status === 404) {
        // Upstream invalid/expired/revoked tokens and deleted users all revoke
        // the local session; permission denial is handled separately below.
        deps.store.delete(key)
        throw sessionExpired()
      }
      if (response.status !== 200) throw upstreamUnavailable()

      const me = parseMe(response.data)
      if (me.id !== current.identity.id) {
        deps.store.delete(key)
        throw sessionExpired()
      }

      const identity = projectSafeUser(me)
      const identityChanged = identity.id !== current.identity.id
        || identity.username !== current.identity.username
        || identity.role !== current.identity.role
        || identity.avatar !== current.identity.avatar
      const updated: BffSessionRecord = {
        ...current,
        identity,
        lastSeenAt: now(),
      }
      deps.store.set(updated)

      // Authorization uses the freshly fetched current role, never the role
      // captured at login or the role hinted by the browser.
      if (requirement?.superAdmin && identity.role !== 'super_admin') {
        throw new BffError(403, 'forbidden', '权限不足')
      }
      if (requirement?.role && !isAdminRole(identity.role)) {
        throw new BffError(403, 'forbidden', '权限不足')
      }

      return {
        sessionKey: key,
        identity,
        twofaEnabled: me.twofa_enabled ?? false,
        expiresAt: updated.expiresAt,
        identityChanged,
        upstreamToken: token,
      }
    },

    async logout(sessionId) {
      try {
        deps.store.delete(hashSessionId(sessionId))
      }
      catch {
        // Nothing to revoke for an implausible id.
      }
    },

    revokeForUser(userId) {
      return deps.store.deleteByUserId(userId)
    },

    revokeAll() {
      return deps.store.clear()
    },
  }
}
