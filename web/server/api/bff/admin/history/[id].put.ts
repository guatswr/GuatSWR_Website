import { bffProtectedHandler, parseAdminId, requireBffSession, requireBffWriteBody } from '~~/server/utils/bff-protected'
import { adminUpdateHistory } from '~~/server/utils/bff-admin-resources'

export default bffProtectedHandler(async (event) => {
  const session = await requireBffSession(event, { role: 'admin' })
  const body = await requireBffWriteBody(event, session.runtime, 64 * 1024)
  const id = parseAdminId(getRouterParam(event, 'id'))
  return adminUpdateHistory(session.admin, id, body)
})
