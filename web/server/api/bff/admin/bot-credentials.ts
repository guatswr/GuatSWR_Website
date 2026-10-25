import { z } from 'zod'
import { getMethod, getQuery } from 'h3'
import { botCredentialSchema, botCredentialCreatedSchema, botCredentialUpstreamListSchema, botCredentialSecretSchema } from '@guatswr/shared/bot'
import { bffProtectedHandler, requireBffSession, requireBffWriteBody } from '~~/server/utils/bff-protected'
import { callAdminUpstream, parseAdminInput, projectAdminResponse } from '~~/server/utils/bff-admin-resources'
import { BffError } from '~~/server/utils/bff-errors'

export default bffProtectedHandler(async event => {
  const method = getMethod(event)
  if (!['GET', 'POST', 'DELETE'].includes(method)) throw new BffError(404, 'not_found', '接口不存在')
  const session = await requireBffSession(event, { role: 'super_admin' })
  const action = getQuery(event).action
  if (action !== undefined && (action !== 'reveal' || method !== 'POST')) throw new BffError(400, 'invalid_request', '请求参数无效')
  if (method === 'GET') {
    const result = await callAdminUpstream(session.admin, { route: 'bot.credentials' })
    return projectAdminResponse(botCredentialUpstreamListSchema, result.data)
  }
  const body = await requireBffWriteBody(event, session.runtime, 16 * 1024)
  if (method === 'POST' && getQuery(event).action === 'reveal') {
    const id = parseAdminInput(z.string().uuid(), getQuery(event).id)
    const result = await callAdminUpstream(session.admin, { route: 'bot.revealCredential', params: { id } })
    return projectAdminResponse(botCredentialSecretSchema, result.data)
  }
  if (method === 'POST') {
    const result = await callAdminUpstream(session.admin, { route: 'bot.createCredential', body: parseAdminInput(botCredentialSchema, body) })
    // This is the only response that includes the newly generated secret.
    return projectAdminResponse(botCredentialCreatedSchema, result.data)
  }
  const id = parseAdminInput(z.string().uuid(), getQuery(event).id)
  const result = await callAdminUpstream(session.admin, { route: 'bot.revokeCredential', params: { id } })
  return projectAdminResponse(z.object({ revoked: z.literal(true) }), result.data)
})
