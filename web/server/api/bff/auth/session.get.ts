import { BffError } from '../../../utils/bff-errors'
import {
  bffAuthHandler,
  clearCookieSession,
  clearCsrfCookie,
  getBffRuntime,
  readCookieSession,
  updateCookieUser,
} from '../../../utils/bff-auth-context'

/**
 * GET /api/bff/auth/session
 *
 * Anonymous visitors get `{ authenticated: false }` with no session created.
 * A present-but-unusable cookie is cleared and answered with 401 so the client
 * can distinguish "logged out" from "expired/revoked". Every authenticated
 * read re-checks the current upstream identity and role.
 */
export default bffAuthHandler(async (event) => {
  const runtime = getBffRuntime(event)
  const cookieSession = await readCookieSession(event, runtime)

  if (cookieSession.status === 'none') {
    return { authenticated: false, user: null }
  }

  if (cookieSession.status === 'invalid') {
    await clearCookieSession(event, runtime)
    clearCsrfCookie(event, runtime)
    throw new BffError(401, 'session_expired', '登录状态已失效，请重新登录')
  }

  try {
    const sessionId = cookieSession.id
    if (!sessionId) throw new BffError(401, 'session_expired', '登录状态已失效，请重新登录')
    const verified = await runtime.auth.verify(sessionId)
    if (verified.identityChanged) {
      await updateCookieUser(event, runtime, verified.identity)
    }
    return {
      authenticated: true,
      user: verified.identity,
      twofaEnabled: verified.twofaEnabled,
      expiresAt: verified.expiresAt,
    }
  }
  catch (error) {
    if (error instanceof BffError && error.statusCode === 401) {
      await clearCookieSession(event, runtime)
      clearCsrfCookie(event, runtime)
    }
    throw error
  }
})
