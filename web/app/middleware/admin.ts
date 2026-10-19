import { safeLocalReturnPath } from '~/utils/bff-client'

/**
 * Guard for future admin pages (`definePageMeta({ middleware: 'admin' })`).
 *
 * It re-verifies the current BFF session (which re-checks the backend identity
 * and role) before entering, redirects unauthenticated visitors to `/login`
 * with a same-origin return path only, and refuses super-admin pages for a
 * downgraded role. `requiresSuperAdmin` from route meta can only *restrict*;
 * it never grants access, because the server-side BFF remains authoritative for
 * every protected operation.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (!import.meta.client) return

  const session = useBffSession()
  await session.refresh()
  const snapshot = session.state.value

  if (snapshot.status === 'unavailable') {
    // A 5xx/BFF outage is not an anonymous visitor.
    throw createError({ statusCode: 502, statusMessage: '会话服务暂不可用' })
  }

  if (snapshot.status !== 'authenticated' || !snapshot.user) {
    const redirect = safeLocalReturnPath(to.fullPath)
    return navigateTo({ path: '/login', query: redirect ? { redirect } : undefined, replace: true })
  }

  if (to.meta.requiresSuperAdmin && snapshot.user.role !== 'super_admin') {
    throw createError({ statusCode: 403, statusMessage: '权限不足' })
  }
})
