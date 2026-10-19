import { bffProtectedHandler, requireBffSession, requireBffBodylessMutation } from '~~/server/utils/bff-protected'
import { adminCreateActivityDraft } from '~~/server/utils/bff-admin-resources'

export default bffProtectedHandler(async (event) => {
  const session = await requireBffSession(event, { role: 'admin' })
  await requireBffBodylessMutation(event, session.runtime)
  return adminCreateActivityDraft(session.admin)
})
