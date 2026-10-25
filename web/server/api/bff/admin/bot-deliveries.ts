import { z } from 'zod'
import { getMethod, getQuery } from 'h3'
import { botDeliveryListSchema } from '@guatswr/shared/bot'
import { bffProtectedHandler, requireBffSession, requireBffWriteBody } from '~~/server/utils/bff-protected'
import { callAdminUpstream, parseAdminInput, projectAdminResponse } from '~~/server/utils/bff-admin-resources'
import { BffError } from '~~/server/utils/bff-errors'
export default bffProtectedHandler(async event => {
  const method = getMethod(event)
  if (!['GET','POST'].includes(method)) throw new BffError(404,'not_found','接口不存在')
  const session = await requireBffSession(event,{role:'super_admin'}), query = getQuery(event)
  if (method === 'POST') {
    await requireBffWriteBody(event,session.runtime,1024)
    const id = parseAdminInput(z.string().uuid(),query.id)
    const result = await callAdminUpstream(session.admin,{route:'bot.retryDelivery',params:{id}})
    return projectAdminResponse(z.object({status:z.literal('queued')}),result.data)
  }
  const input = parseAdminInput(z.object({page:z.string().regex(/^[1-9]\d*$/).transform(Number).refine(value=>value<=1000000).default(1),limit:z.string().regex(/^[1-9]\d*$/).transform(Number).refine(value=>value<=100).default(20)}),{page:query.page,limit:query.limit})
  const result = await callAdminUpstream(session.admin,{route:'bot.deliveries',query:input})
  return projectAdminResponse(botDeliveryListSchema,result.data)
})
