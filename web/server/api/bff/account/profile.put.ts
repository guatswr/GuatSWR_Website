import { bffProtectedHandler, requireBffSession, requireBffWriteBody } from '~~/server/utils/bff-protected'
import { updateOwnProfile } from '~~/server/utils/bff-admin-resources'
import { clearCookieSession, clearCsrfCookie } from '~~/server/utils/bff-auth-context'

export default bffProtectedHandler(async (event) => {
  const session = await requireBffSession(event)
  const body = await requireBffWriteBody(event, session.runtime, 16 * 1024)
  const result = await updateOwnProfile(session.admin, body)
  if (result.credentialsChanged) {
    // Confirmed credential change: revoke opaque BFF sessions as well as the
    // backend's user-level JWT version so every browser must authenticate again.
    session.runtime.auth.revokeForUser(session.identity.id)
    await clearCookieSession(event, session.runtime)
    clearCsrfCookie(event, session.runtime)
    return { message: result.message, reauthenticate: true }
  }
  return { message: result.message }
})
