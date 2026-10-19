import { getRouterParam } from 'h3'
import { adminBanInputSchema } from '@guatswr/shared/admin-workflows'
import { bffProtectedHandler, requireBffSession, requireBffBodylessMutation } from '../../../../utils/bff-protected'
import { adminStatusError, invalidateBffPublicData, mapAdminError, parseAdminInput } from '../../../../utils/bff-admin-resources'
import { resolveEventClientIp } from '../../../../utils/bff-auth-context'
import { createFixedUpstreamClient } from '../../../../utils/bff-upstream'

export default bffProtectedHandler(async event => {
  const session = await requireBffSession(event, { superAdmin: true })
  await requireBffBodylessMutation(event, session.runtime)
  const { ip } = parseAdminInput(adminBanInputSchema.pick({ ip: true }), { ip: getRouterParam(event, 'ip') })
  const upstream = createFixedUpstreamClient({ origin: session.runtime.apiBase, timeoutMs: session.runtime.config.upstreamTimeoutMs,
    routes: { remove: { method: 'DELETE', path: `/api/admin/bans/${encodeURIComponent(ip)}` } } })
  try {
    const response = await upstream.request({ route: 'remove', bearerToken: session.upstreamToken, clientIp: resolveEventClientIp(event, session.runtime).ip.address })
    if (response.status !== 200) throw adminStatusError(response.status)
  } catch (error) { throw mapAdminError(error) }
  await invalidateBffPublicData(['logs'])
  return { message: '已解封' }
})
