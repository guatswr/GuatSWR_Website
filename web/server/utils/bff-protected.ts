import { getHeader, getCookie } from 'h3'
import type { H3Event } from 'h3'
import type { SafeUser } from '@guatswr/shared'
import { BffError } from './bff-errors'
import {
  bffAuthHandler,
  clearCookieSession,
  clearCsrfCookie,
  getBffRuntime,
  getCsrfBinding,
  readCookieSession,
  readEventJsonBody,
  resolveEventClientIp,
} from './bff-auth-context'
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  assertAllowedOrigin,
  assertJsonContentType,
  assertOptionalJsonContentType,
  verifyCsrf,
  readBoundedJson,
  parseContentLengthHeader,
} from './bff-write'
import type { BffRoleRequirement } from './bff-auth-service'
import { createAdminUpstreamClient } from './bff-admin-upstream'
import type { AdminUpstreamRouteName } from './bff-admin-upstream'
import type { FixedUpstreamClient } from './bff-upstream'
import type { BffRuntime } from './bff-runtime'

export interface ProtectedSession {
  runtime: BffRuntime
  identity: SafeUser
  twofaEnabled: boolean
  expiresAt: number
  sessionKey: string
  /** Server-side JWT for the allowlisted upstream call. Never serialized. */
  upstreamToken: string
  admin: FixedUpstreamClient<AdminUpstreamRouteName>
}

/** Bind server-owned credentials once; callers cannot replace either value. */
export function createBoundAdminClient(runtime: { apiBase: string; config: Pick<BffRuntime['config'], 'upstreamTimeoutMs'> }, token: string, clientIp: string): FixedUpstreamClient<AdminUpstreamRouteName> {
  const upstream = createAdminUpstreamClient({ origin: runtime.apiBase, timeoutMs: runtime.config.upstreamTimeoutMs })
  return { request: request => upstream.request({ ...request, bearerToken: token, clientIp }) }
}

/**
 * Verify the encrypted cookie session against the live backend on every
 * protected operation and enforce the *current* role. Missing cookies are 401
 * `unauthenticated`; a stale/revoked session is 401 `session_expired` and is
 * cleared; a current permission denial is 403 and keeps the session.
 */
export async function requireBffSession(
  event: H3Event,
  requirement?: BffRoleRequirement,
): Promise<ProtectedSession> {
  const runtime = getBffRuntime(event)
  const cookie = await readCookieSession(event, runtime)
  if (cookie.status === 'none') {
    throw new BffError(401, 'unauthenticated', '请先登录')
  }
  if (cookie.status !== 'ok' || !cookie.id) {
    throw new BffError(401, 'session_expired', '登录状态已失效，请重新登录')
  }
  const verified = await runtime.auth.verify(cookie.id, requirement)
  return {
    runtime,
    identity: verified.identity,
    twofaEnabled: verified.twofaEnabled,
    expiresAt: verified.expiresAt,
    sessionKey: verified.sessionKey,
    upstreamToken: verified.upstreamToken,
    admin: createBoundAdminClient(runtime, verified.upstreamToken, resolveEventClientIp(event, runtime).ip.address),
  }
}

export async function requireBffWriteOrigin(event: H3Event, runtime: BffRuntime): Promise<void> {
  assertAllowedOrigin(getHeader(event, 'origin') ?? null, runtime.config.allowedOrigins)
  const binding = await getCsrfBinding(event, runtime)
  verifyCsrf({
    cookieToken: getCookie(event, CSRF_COOKIE),
    headerToken: getHeader(event, CSRF_HEADER),
    key: runtime.csrfKey,
    binding,
    now: Date.now(),
    maxAgeMs: runtime.config.csrfMaxAgeSeconds * 1000,
  })
}

/** Origin + CSRF + JSON + bounded body for a protected write. */
export async function requireBffWriteBody(
  event: H3Event,
  runtime: BffRuntime,
  maxBytes: number,
): Promise<unknown> {
  assertJsonContentType(getHeader(event, 'content-type') ?? null)
  await requireBffWriteOrigin(event, runtime)
  return readEventJsonBody(event, runtime, maxBytes)
}

/**
 * Origin + CSRF for a bodyless mutation (delete/restore). A small JSON or
 * empty body is tolerated and drained; anything larger is rejected.
 */
export async function requireBffBodylessMutation(
  event: H3Event,
  runtime: BffRuntime,
): Promise<void> {
  assertOptionalJsonContentType(getHeader(event, 'content-type') ?? null)
  await requireBffWriteOrigin(event, runtime)
  // Consume actual bytes, including chunked input with no Content-Length.
  // Normalize a genuinely empty stream to {} for the bounded object parser.
  const request = event.node.req
  async function* chunks() {
    let nonempty = false
    for await (const chunk of request) {
      if (chunk.length) nonempty = true
      yield chunk as Uint8Array
    }
    if (!nonempty) yield Buffer.from('{}')
  }
  await readBoundedJson({ chunks: chunks(), destroy: error => request.destroy(error) }, {
    maxBytes: runtime.config.maxLogoutBytes,
    timeoutMs: runtime.config.bodyTimeoutMs,
    declaredLength: parseContentLengthHeader(getHeader(event, 'content-length')),
  })
}

/** Positive integer route ids only; no raw path segment is ever forwarded. */
export function parseAdminId(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{1,15}$/.test(value)) {
    throw new BffError(400, 'invalid_request', '请求参数无效')
  }
  const id = Number.parseInt(value, 10)
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new BffError(400, 'invalid_request', '请求参数无效')
  }
  return id
}

/** Strict query flag: only 1/0/true/false are accepted, never `Boolean('0')`. */
export function parseQueryFlag(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback
  if (value === true || value === '1' || value === 'true') return true
  if (value === false || value === '0' || value === 'false') return false
  throw new BffError(400, 'invalid_request', '请求参数无效')
}

/**
 * Protected route wrapper: no-store everywhere, and any 401 (missing, expired
 * or backend-revoked session) clears the browser cookie and CSRF token before
 * the fixed error body is returned.
 */
export function bffProtectedHandler<T>(handler: (event: H3Event) => Promise<T> | T) {
  return bffAuthHandler(handler, {
    async onBffError(event, error) {
      if (error.statusCode !== 401) return
      const runtime = getBffRuntime(event)
      const cookie = await readCookieSession(event, runtime)
      if (cookie.status === 'ok' && cookie.id) await runtime.auth.logout(cookie.id)
      await clearCookieSession(event, runtime)
      clearCsrfCookie(event, runtime)
    },
  })
}
