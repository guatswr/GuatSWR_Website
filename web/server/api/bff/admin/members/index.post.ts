import { bffProtectedHandler, requireBffSession, requireBffWriteBody } from '~~/server/utils/bff-protected'
import { adminCreateMember } from '~~/server/utils/bff-admin-resources'

export default bffProtectedHandler(async (event) => {
  const session = await requireBffSession(event, { role: 'admin' })
  const body = await requireBffWriteBody(event, session.runtime, 64 * 1024)
  return adminCreateMember(session.admin, body)
})
