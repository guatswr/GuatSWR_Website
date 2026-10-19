import { bffProtectedHandler, requireBffSession, requireBffWriteBody } from '~~/server/utils/bff-protected'
import { updateOwnProfile } from '~~/server/utils/bff-admin-resources'
import { clearCookieSession, clearCsrfCookie } from '~~/server/utils/bff-auth-context'

export default bffProtectedHandler(async (event) => {
  const session = await requireBffSession(event)
  const body = await requireBffWriteBody(event, session.runtime, 16 * 1024)
  const result = await updateOwnProfile(session.admin, body)
  if (result.credentialsChanged) {
    // Confirmed password/second-password change: the frozen backend keeps the
    // old JWT valid, so the BFF revokes every local session for this user.
    session.runtime.auth.revokeForUser(session.identity.id)
    await clearCookieSession(event, session.runtime)
    clearCsrfCookie(event, session.runtime)
    return { message: result.message, reauthenticate: true }
  }
  return { message: result.message }
})
