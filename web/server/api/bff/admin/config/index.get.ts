import { bffProtectedHandler, requireBffSession } from '~~/server/utils/bff-protected'
import { adminReadConfig } from '~~/server/utils/bff-admin-resources'

export default bffProtectedHandler(async (event) => {
  const session = await requireBffSession(event, { role: 'admin' })
  return adminReadConfig(session.admin)
})
