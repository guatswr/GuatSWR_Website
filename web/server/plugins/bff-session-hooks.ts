import { originalRequestPath } from '../utils/bff-request-path'

/**
 * Defense in depth around nuxt-auth-utils' own session hooks.
 *
 * The h3 stack guard in `bff-auth-guard.ts` already answers 404 for the whole
 * `/api/_auth` namespace. These hooks make the invariant explicit even if that
 * ordering ever changes:
 *  - the built-in `fetch` hook must never serve the sealed cookie session
 *    (stale identity) to a browser;
 *  - the built-in `clear` hook may only run from a server-owned internal
 *    cleanup (logout, expiry cleanup, failed cookie rotation), which sets
 *    `event.context.bffAuthInternalClear` for the duration of the call. A
 *    browser-reachable DELETE cannot set event context, and there is no query,
 *    body or header bypass.
 *
 * `replaceUserSession` (login rotation) clears h3's in-memory session manager,
 * not through this hook, so a successful login is unaffected.
 */
export default defineNitroPlugin(() => {
  sessionHooks.hook('fetch', (_session, event) => {
    const path = originalRequestPath(event)
    if (path === '/api/_auth' || path.startsWith('/api/_auth/')) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }
  })

  sessionHooks.hook('clear', (_session, event) => {
    if (event.context.bffAuthInternalClear === true) return
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  })
})
