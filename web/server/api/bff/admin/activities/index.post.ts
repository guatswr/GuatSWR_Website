import { bffProtectedHandler, requireBffSession, requireBffWriteBody } from '~~/server/utils/bff-protected'
import { adminCreateActivity } from '~~/server/utils/bff-admin-resources'

export default bffProtectedHandler(async (event) => {
  const session = await requireBffSession(event, { role: 'admin' })
  const body = await requireBffWriteBody(event, session.runtime, 4 * 1024 * 1024)
  return adminCreateActivity(session.admin, body)
})
