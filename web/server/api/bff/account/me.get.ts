import { bffProtectedHandler, requireBffSession } from '~~/server/utils/bff-protected'

export default bffProtectedHandler(async (event) => {
  const session = await requireBffSession(event)
  return {
    user: session.identity,
    twofaEnabled: session.twofaEnabled,
    expiresAt: session.expiresAt,
  }
})
