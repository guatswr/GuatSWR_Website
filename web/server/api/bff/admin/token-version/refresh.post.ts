import { bffProtectedHandler, requireBffBodylessMutation, requireBffSession } from '~~/server/utils/bff-protected'
import { clearCookieSession, clearCsrfCookie } from '~~/server/utils/bff-auth-context'
import { adminRefreshTokenVersion } from '~~/server/utils/bff-admin-resources'

export default bffProtectedHandler(async (event) => {
  const session = await requireBffSession(event, { superAdmin: true })
  await requireBffBodylessMutation(event, session.runtime)
  const result = await adminRefreshTokenVersion(session.admin)
  // The backend token_version bump invalidates every upstream JWT, including
  // this one; local records are revoked and the caller must sign in again.
  session.runtime.auth.revokeAll()
  await clearCookieSession(event, session.runtime)
  clearCsrfCookie(event, session.runtime)
  return { ...result, reauthenticate: true }
})
