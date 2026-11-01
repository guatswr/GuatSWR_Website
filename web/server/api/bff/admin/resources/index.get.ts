import { getQuery } from 'h3'
import { useRuntimeConfig } from '#imports'
import { bffProtectedHandler, requireBffSession } from '../../../../utils/bff-protected'
import { parseAdminInput } from '../../../../utils/bff-admin-resources'
import { resourceAdminQuerySchema } from '../../../../../shared/resource-admin'
import { listManagedResources } from '../../../../utils/resource-management'

export default bffProtectedHandler(async event => {
  await requireBffSession(event, { role: 'admin' })
  const query = parseAdminInput(resourceAdminQuerySchema, getQuery(event))
  return listManagedResources(useRuntimeConfig(event).openlist ?? {}, query.path, query.page)
})
