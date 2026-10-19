import { bffProtectedHandler, requireBffSession } from '~~/server/utils/bff-protected'
import { adminListLogs } from '~~/server/utils/bff-admin-resources'

export default bffProtectedHandler(async (event) => {
  const session = await requireBffSession(event, { role: 'admin' })
  return adminListLogs(session.admin, getQuery(event))
})
