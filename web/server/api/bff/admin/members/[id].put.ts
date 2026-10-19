import { bffProtectedHandler, parseAdminId, requireBffSession, requireBffWriteBody } from '~~/server/utils/bff-protected'
import { adminUpdateMember } from '~~/server/utils/bff-admin-resources'

export default bffProtectedHandler(async (event) => {
  const session = await requireBffSession(event, { role: 'admin' })
  const body = await requireBffWriteBody(event, session.runtime, 64 * 1024)
  const id = parseAdminId(getRouterParam(event, 'id'))
  return adminUpdateMember(session.admin, id, body)
})
