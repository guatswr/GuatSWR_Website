import { getQuery } from 'h3'
import { z } from 'zod'
import { useRuntimeConfig } from '#imports'
import { bffProtectedHandler, requireBffSession } from '../../../../utils/bff-protected'
import { parseAdminInput } from '../../../../utils/bff-admin-resources'
import { resourceAdminPathSchema } from '../../../../../shared/resource-admin'
import { getOpenListResourceDetail } from '../../../../utils/openlist'
import { BffError } from '../../../../utils/bff-errors'

export default bffProtectedHandler(async event => {
  await requireBffSession(event, { role: 'admin' })
  const query = parseAdminInput(z.object({ path: resourceAdminPathSchema }).strict(), getQuery(event))
  try { return await getOpenListResourceDetail(useRuntimeConfig(event).openlist ?? {}, query.path) }
  catch { throw new BffError(502, 'resource_detail', '暂时无法读取文件详情') }
})
