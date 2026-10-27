import type { H3Event } from 'h3'
import type { SafeUser } from '@guatswr/shared'
import { safeUserSchema } from '@guatswr/shared'
import { BffConfigError, BffError, ClientIpError, bffErrorBody } from './bff-errors'
import { CSRF_COOKIE, parseContentLengthHeader, readBoundedJson } from './bff-write'
import {
  isLoopbackHostname,
  isLoopbackIp,
  parseIp,
  resolveClientIpFromHeaders,
} from './bff-identity'
import type { ClientIpResolution } from './bff-identity'
import { hashSessionId } from './bff-session'
import { createBffRuntimeFactory } from './bff-runtime'
import type { BffRuntime } from './bff-runtime'


function readRecord(raw: unknown): Record<string, unknown> {
  return typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {}
}

const runtimeFactory = createBffRuntimeFactory()

/**
 * Resolve the per-request runtime through the factory. The factory owns the
 * identity-checked caches (session store instance, upstream origin, limits,
 * secret), so a replaced store or a changed `apiBase` cannot reuse the previous
 * auth service. The memory store and limiter remain process-local.
 */
export function getBffRuntime(event: H3Event): BffRuntime {
  const runtimeConfig = readRecord(useRuntimeConfig(event))
  return runtimeFactory.resolve({
    rawBffAuth: runtimeConfig.bffAuth,
    session: readRecord(runtimeConfig.session),
    apiBase: runtimeConfig.apiBase,
  })
}

export interface CookieSessionState {
  status: 'none' | 'invalid' | 'ok'
  id?: string
  user?: SafeUser
}

function resolveSecureCookie(event: H3Event, runtime: BffRuntime): boolean {
  if (!runtime.config.allowInsecureLoopbackCookies) return true
  if (process.env.NODE_ENV === 'production') return true
  const socket = parseIp((event.node?.req?.socket?.remoteAddress || event.context?.clientAddress || (import.meta.dev ? '127.0.0.1' : undefined)))
  if (!socket || !isLoopbackIp(socket)) return true
  if (!isLoopbackHostname(event.node?.req?.headers?.host)) return true
  return false
}

function sessionCookieConfig(event: H3Event, runtime: BffRuntime, generateId?: () => string) {
  return {
    name: runtime.sessionCookieName,
    maxAge: runtime.config.sessionMaxAgeSeconds,
    // `false` (not `boolean`): SessionConfig only accepts a header name or false.
    sessionHeader: false as const,
    generateId,
    cookie: {
      httpOnly: true,
      sameSite: 'lax' as const,
      path: '/',
      secure: resolveSecureCookie(event, runtime),
    },
  }
}

/**
 * Read the encrypted cookie session without creating one for anonymous
 * visitors, and without trusting any field inside it for authorization.
 */
export async function readCookieSession(event: H3Event, runtime: BffRuntime): Promise<CookieSessionState> {
  if (!getCookie(event, runtime.sessionCookieName)) return { status: 'none' }
  const session = await getUserSession(event)
  const user = safeUserSchema.safeParse(session.user)
  if (typeof session.id !== 'string' || session.id.length === 0 || !user.success) {
    return { status: 'invalid' }
  }
  return { status: 'ok', id: session.id, user: user.data }
}

/**
 * Mark a clear as server-owned for the duration of the call. The
 * nuxt-auth-utils `clear` hook refuses browser-reachable clears (for example
 * the built-in `DELETE /api/_auth/session`) unless this event-context flag was
 * set by our own code. A browser cannot set `event.context`, and there is no
 * query/body/header bypass. The previous value is restored in `finally`.
 */
async function withInternalClear<T>(event: H3Event, operation: () => Promise<T>): Promise<T> {
  const previous = event.context.bffAuthInternalClear
  event.context.bffAuthInternalClear = true
  try {
    return await operation()
  }
  finally {
    if (previous === undefined) delete event.context.bffAuthInternalClear
    else event.context.bffAuthInternalClear = previous
  }
}

/** Establish the cookie for a freshly created server-side session id. */
export async function writeCookieSession(
  event: H3Event,
  runtime: BffRuntime,
  sessionId: string,
  user: SafeUser,
): Promise<void> {
  await replaceUserSession(event, { user }, sessionCookieConfig(event, runtime, () => sessionId))
  const stored = await getUserSession(event)
  if (stored.id !== sessionId) {
    await withInternalClear(event, () => clearUserSession(event, sessionCookieConfig(event, runtime)))
    throw new BffConfigError('Cookie session id did not match the created session')
  }
}

/** Refresh the safe identity in the existing cookie without rotating its id. */
export async function updateCookieUser(event: H3Event, runtime: BffRuntime, user: SafeUser): Promise<void> {
  await setUserSession(event, { user }, sessionCookieConfig(event, runtime))
}

export async function clearCookieSession(event: H3Event, runtime: BffRuntime): Promise<void> {
  await withInternalClear(event, () => clearUserSession(event, sessionCookieConfig(event, runtime)))
}

export function csrfCookieOptions(event: H3Event, runtime: BffRuntime) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: resolveSecureCookie(event, runtime),
  }
}

export function setCsrfCookie(event: H3Event, runtime: BffRuntime, token: string): void {
  setCookie(event, CSRF_COOKIE, token, {
    ...csrfCookieOptions(event, runtime),
    maxAge: runtime.config.csrfMaxAgeSeconds,
  })
}

export function clearCsrfCookie(event: H3Event, runtime: BffRuntime): void {
  deleteCookie(event, CSRF_COOKIE, csrfCookieOptions(event, runtime))
}

/**
 * CSRF tokens are bound to the current opaque session so logout and login
 * rotation revoke them; anonymous flows use a constant binding that is still
 * protected by the HttpOnly cookie mirror.
 */
export async function getCsrfBinding(event: H3Event, runtime: BffRuntime): Promise<string> {
  if (!getCookie(event, runtime.sessionCookieName)) return 'anonymous'
  const session = await getUserSession(event)
  if (typeof session.id !== 'string' || session.id.length === 0 || !session.user) return 'anonymous'
  try {
    return `session:${hashSessionId(session.id)}`
  }
  catch {
    return 'anonymous'
  }
}

export function resolveEventClientIp(event: H3Event, runtime: BffRuntime): ClientIpResolution {
  try {
    return resolveClientIpFromHeaders({
      remoteAddress: (event.node?.req?.socket?.remoteAddress || event.context?.clientAddress || (import.meta.dev ? '127.0.0.1' : undefined)),
      headers: (event.node?.req?.headers ?? {}) as Record<string, string | string[] | undefined>,
    }, runtime.trust)
  }
  catch (error) {
    if (error instanceof ClientIpError) {
      throw new BffError(400, 'invalid_request', '请求地址无效')
    }
    throw error
  }
}

export function readEventJsonBody(event: H3Event, runtime: BffRuntime, maxBytes: number): Promise<unknown> {
  const request = event.node?.req
  if (!request) throw new BffError(400, 'invalid_request', '请求内容无效')
  return readBoundedJson(
    {
      chunks: request,
      destroy: error => request.destroy(error),
    },
    {
      maxBytes,
      timeoutMs: runtime.config.bodyTimeoutMs,
      declaredLength: parseContentLengthHeader(request.headers['content-length']),
    },
  )
}

export function noStore(event: H3Event): void {
  setResponseHeader(event, 'Cache-Control', 'no-store, private')
  setResponseHeader(event, 'Pragma', 'no-cache')
}

/**
 * Auth route wrapper: every response is no-store, every expected failure is a
 * fixed public body, and unexpected errors never reflect raw upstream, SQL,
 * stack or credential values.
 */
export interface BffHandlerHooks {
  /**
   * Runs before an expected error response is rendered. Protected routes use
   * it to clear the cookie and CSRF token when a 401 proves the session is
   * gone. It must not throw or read request bodies.
   */
  onBffError?: (event: H3Event, error: BffError) => void | Promise<void>
}

export function bffAuthHandler<T>(
  handler: (event: H3Event) => Promise<T> | T,
  hooks: BffHandlerHooks = {},
) {
  return defineEventHandler(async (event) => {
    noStore(event)
    try {
      return await handler(event)
    }
    catch (error) {
      if (error instanceof BffError) {
        try {
          await hooks.onBffError?.(event, error)
        }
        catch {
          // Cleanup is best effort; the error response below still stands.
        }
        setResponseStatus(event, error.statusCode)
        if (error.retryAfterSeconds !== undefined) {
          setResponseHeader(event, 'Retry-After', error.retryAfterSeconds)
        }
        return bffErrorBody(error)
      }
      if (error instanceof BffConfigError) {
        setResponseStatus(event, 503)
        return { error: { code: 'service_unavailable', message: '服务暂不可用' } }
      }
      setResponseStatus(event, 500)
      return { error: { code: 'internal_error', message: '服务暂不可用' } }
    }
  })
}
