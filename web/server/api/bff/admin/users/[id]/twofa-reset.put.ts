import { bffProtectedHandler, parseAdminId, requireBffBodylessMutation, requireBffSession } from '~~/server/utils/bff-protected'
import { adminResetUserTwofa } from '~~/server/utils/bff-admin-resources'
import { clearCookieSession, clearCsrfCookie } from '~~/server/utils/bff-auth-context'

export default bffProtectedHandler(async (event) => {
  const session = await requireBffSession(event, { superAdmin: true })
  await requireBffBodylessMutation(event, session.runtime)
  const id = parseAdminId(getRouterParam(event, 'id'))
  const result = await adminResetUserTwofa(session.admin, id)
  session.runtime.auth.revokeForUser(id)
  if (id === session.identity.id) {
    await clearCookieSession(event, session.runtime)
    clearCsrfCookie(event, session.runtime)
    return { ...result, reauthenticate: true }
  }
  return result
})
