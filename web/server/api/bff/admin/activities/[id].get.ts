import { bffProtectedHandler, requireBffSession } from '~~/server/utils/bff-protected'
import { adminGetActivity } from '~~/server/utils/bff-admin-resources'

export default bffProtectedHandler(async (event) => {
  const session = await requireBffSession(event, { role: 'admin' })
  return adminGetActivity(session.admin, parseAdminId(getRouterParam(event, 'id')))
})
