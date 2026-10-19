import { bffProtectedHandler, parseAdminId, requireBffSession, requireBffWriteBody } from '~~/server/utils/bff-protected'
import { adminUpdateActivity } from '~~/server/utils/bff-admin-resources'

export default bffProtectedHandler(async (event) => {
  const session = await requireBffSession(event, { role: 'admin' })
  const body = await requireBffWriteBody(event, session.runtime, 4 * 1024 * 1024)
  const id = parseAdminId(getRouterParam(event, 'id'))
  return adminUpdateActivity(session.admin, id, body)
})
