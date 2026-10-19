import { bffProtectedHandler, parseAdminId, requireBffSession, requireBffBodylessMutation } from '~~/server/utils/bff-protected'
import { adminDeleteHistory } from '~~/server/utils/bff-admin-resources'

export default bffProtectedHandler(async (event) => {
  const session = await requireBffSession(event, { role: 'admin' })
  await requireBffBodylessMutation(event, session.runtime)
  const id = parseAdminId(getRouterParam(event, 'id'))
  return adminDeleteHistory(session.admin, id)
})
