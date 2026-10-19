import { bffProtectedHandler, requireBffSession } from '~~/server/utils/bff-protected'
import { adminListUsers } from '~~/server/utils/bff-admin-resources'

export default bffProtectedHandler(async (event) => {
  const session = await requireBffSession(event, { superAdmin: true })
  return adminListUsers(session.admin)
})
