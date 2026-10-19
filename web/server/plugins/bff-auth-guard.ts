import { originalRequestPath } from '../utils/bff-request-path'

/**
 * Block the nuxt-auth-utils built-in session endpoints.
 *
 * `GET /api/_auth/session` would return whatever the sealed cookie contains
 * (including its own session id) and `DELETE /api/_auth/session` would clear
 * the cookie without deleting the BFF session record — an unguarded clear that
 * could race our explicit routes. Both live under `/api/_auth`, so that whole
 * namespace answers 404 before the module handler runs.
 *
 * The guard is unshifted onto the h3 stack because a Nitro `request` hook
 * cannot short-circuit a request (its errors are captured and the request
 * continues). Because h3 rewrites `event.path` for a matched stack layer, the
 * boundary check reads `req.originalUrl` instead.
 *
 * The BFF's own endpoints live under `/api/bff/auth/*` and are unaffected.
 */
export default defineNitroPlugin((nitroApp) => {
  const guard = eventHandler((event) => {
    const path = originalRequestPath(event)
    if (path !== '/api/_auth' && !path.startsWith('/api/_auth/')) return undefined
    setResponseHeader(event, 'Cache-Control', 'no-store, private')
    setResponseStatus(event, 404)
    return { statusCode: 404, statusMessage: 'Not Found' }
  })
  nitroApp.h3App.stack.unshift({ route: '/api/_auth', handler: guard })
})
