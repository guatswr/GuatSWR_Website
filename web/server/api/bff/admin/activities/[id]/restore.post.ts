import { bffProtectedHandler, parseAdminId, requireBffSession, requireBffBodylessMutation } from '~~/server/utils/bff-protected'
import { adminRestoreActivity } from '~~/server/utils/bff-admin-resources'

export default bffProtectedHandler(async (event) => {
  const session = await requireBffSession(event, { superAdmin: true })
  await requireBffBodylessMutation(event, session.runtime)
  const id = parseAdminId(getRouterParam(event, 'id'))
  return adminRestoreActivity(session.admin, id)
})
