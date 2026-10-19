import { bffProtectedHandler, parseAdminId, requireBffSession, requireBffWriteBody } from '~~/server/utils/bff-protected'
import { adminResetUserPassword } from '~~/server/utils/bff-admin-resources'
import { clearCookieSession, clearCsrfCookie } from '~~/server/utils/bff-auth-context'

export default bffProtectedHandler(async (event) => {
  const session = await requireBffSession(event, { superAdmin: true })
  const body = await requireBffWriteBody(event, session.runtime, 16 * 1024)
  const id = parseAdminId(getRouterParam(event, 'id'))
  const result = await adminResetUserPassword(session.admin, id, body)
  // The frozen backend does not bump token_version on a forced reset.
  session.runtime.auth.revokeForUser(id)
  if (id === session.identity.id) {
    await clearCookieSession(event, session.runtime)
    clearCsrfCookie(event, session.runtime)
    return { ...result, reauthenticate: true }
  }
  return result
})
