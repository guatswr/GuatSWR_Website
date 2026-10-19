import { bffProtectedHandler, requireBffSession } from '~~/server/utils/bff-protected'
import { adminListActivities } from '~~/server/utils/bff-admin-resources'

export default bffProtectedHandler(async (event) => {
  const session = await requireBffSession(event, { role: 'admin' })
  return adminListActivities(session.admin, session.identity, getQuery(event))
})
