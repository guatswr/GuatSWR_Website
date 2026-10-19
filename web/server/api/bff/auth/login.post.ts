import { loginSchema } from '@guatswr/shared'
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  assertAllowedOrigin,
  assertJsonContentType,
  createCsrfToken,
  firstValidationMessage,
  verifyCsrf,
} from '../../../utils/bff-write'
import {
  bffAuthHandler,
  clearCsrfCookie,
  getBffRuntime,
  getCsrfBinding,
  readCookieSession,
  readEventJsonBody,
  resolveEventClientIp,
  setCsrfCookie,
  writeCookieSession,
} from '../../../utils/bff-auth-context'
import { BffError } from '../../../utils/bff-errors'
import { hashSessionId } from '../../../utils/bff-session'

/**
 * POST /api/bff/auth/login
 *
 * Body: `{ username, password, twofa? }` (the frozen backend's optional second
 * password, not TOTP). The upstream JWT never leaves the server: it is sealed
 * into the BFF session record and only a safe identity is returned.
 */
export default bffAuthHandler(async (event) => {
  const runtime = getBffRuntime(event)

  assertAllowedOrigin(getHeader(event, 'origin') ?? null, runtime.config.allowedOrigins)
  assertJsonContentType(getHeader(event, 'content-type') ?? null)

  const clientIp = resolveEventClientIp(event, runtime)
  const limit = runtime.loginLimiter.check(clientIp.ip.address)
  if (!limit.allowed) {
    throw new BffError(429, 'rate_limited', '登录尝试过于频繁，请稍后再试', {
      retryAfterSeconds: limit.retryAfterSeconds,
    })
  }

  const binding = await getCsrfBinding(event, runtime)
  verifyCsrf({
    cookieToken: getCookie(event, CSRF_COOKIE),
    headerToken: getHeader(event, CSRF_HEADER),
    key: runtime.csrfKey,
    binding,
    now: Date.now(),
    maxAgeMs: runtime.config.csrfMaxAgeSeconds * 1000,
  })

  const body = await readEventJsonBody(event, runtime, runtime.config.maxJsonBytes)
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    throw new BffError(400, 'invalid_request', firstValidationMessage(parsed.error, '请求参数无效'))
  }

  const cookieSession = await readCookieSession(event, runtime)
  const result = await runtime.auth.login(parsed.data, {
    clientIp: clientIp.ip.address,
    currentSessionId: cookieSession.status === 'ok' ? cookieSession.id : null,
  })

  // Rotation: the pre-login token is bound to the anonymous/previous session
  // and is revoked here, then replaced with one bound to the new session.
  clearCsrfCookie(event, runtime)
  try {
    await writeCookieSession(event, runtime, result.sessionId, result.user)
  }
  catch (error) {
    try {
      runtime.store.delete(hashSessionId(result.sessionId))
    }
    catch {
      // The record key was produced by this process and is always hashable.
    }
    throw error
  }

  const rotatedToken = createCsrfToken(
    runtime.csrfKey,
    `session:${hashSessionId(result.sessionId)}`,
    Date.now(),
    runtime.config.csrfMaxAgeSeconds * 1000,
  )
  setCsrfCookie(event, runtime, rotatedToken)

  return {
    user: result.user,
    expiresAt: result.expiresAt,
    csrfToken: rotatedToken,
  }
})
