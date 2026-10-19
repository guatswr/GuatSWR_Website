import {
  CSRF_COOKIE,
  CSRF_HEADER,
  assertAllowedOrigin,
  assertOptionalJsonContentType,
  verifyCsrf,
} from '../../../utils/bff-write'
import {
  bffAuthHandler,
  clearCookieSession,
  clearCsrfCookie,
  getBffRuntime,
  getCsrfBinding,
  readCookieSession,
  readEventJsonBody,
} from '../../../utils/bff-auth-context'

/**
 * POST /api/bff/auth/logout
 *
 * Deletes the local session record (dropping the sealed upstream token) and
 * clears the session and CSRF cookies. The frozen backend has no logout or
 * revoke endpoint, so no upstream call is made and none is needed.
 */
export default bffAuthHandler(async (event) => {
  const runtime = getBffRuntime(event)

  assertAllowedOrigin(getHeader(event, 'origin') ?? null, runtime.config.allowedOrigins)
  assertOptionalJsonContentType(getHeader(event, 'content-type') ?? null)

  const binding = await getCsrfBinding(event, runtime)
  verifyCsrf({
    cookieToken: getCookie(event, CSRF_COOKIE),
    headerToken: getHeader(event, CSRF_HEADER),
    key: runtime.csrfKey,
    binding,
    now: Date.now(),
    maxAgeMs: runtime.config.csrfMaxAgeSeconds * 1000,
  })

  // Drain a bounded, ignored body so the connection is not left mid-request.
  await readEventJsonBody(event, runtime, runtime.config.maxLogoutBytes).catch(() => undefined)

  const cookieSession = await readCookieSession(event, runtime)
  if (cookieSession.status === 'ok' && cookieSession.id) {
    await runtime.auth.logout(cookieSession.id)
  }

  await clearCookieSession(event, runtime)
  clearCsrfCookie(event, runtime)

  return { loggedOut: true }
})
