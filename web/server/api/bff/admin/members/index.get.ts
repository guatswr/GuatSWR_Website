import { bffProtectedHandler, requireBffSession } from '~~/server/utils/bff-protected'
import { adminListMembers } from '~~/server/utils/bff-admin-resources'

export default bffProtectedHandler(async (event) => {
  const session = await requireBffSession(event, { role: 'admin' })
  return adminListMembers(session.admin, session.identity, getQuery(event))
})
