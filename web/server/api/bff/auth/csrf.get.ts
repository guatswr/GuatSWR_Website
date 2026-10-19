import { createCsrfToken } from '../../../utils/bff-write'
import { bffAuthHandler, getBffRuntime, getCsrfBinding, setCsrfCookie } from '../../../utils/bff-auth-context'

/**
 * GET /api/bff/auth/csrf
 *
 * Read-only token issue endpoint. Returns an opaque, HMAC-bound token and
 * mirrors it in an HttpOnly cookie so a cross-site page can neither read nor
 * forge it. No-store, no identity data.
 */
export default bffAuthHandler(async (event) => {
  const runtime = getBffRuntime(event)
  const binding = await getCsrfBinding(event, runtime)
  const token = createCsrfToken(runtime.csrfKey, binding, Date.now(), runtime.config.csrfMaxAgeSeconds * 1000)
  setCsrfCookie(event, runtime, token)
  return { csrfToken: token, expiresIn: runtime.config.csrfMaxAgeSeconds }
})
