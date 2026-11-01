import { useRuntimeConfig } from '#imports'
import { bffProtectedHandler, requireBffSession, requireBffWriteBody } from '../../../../utils/bff-protected'
import { parseAdminInput } from '../../../../utils/bff-admin-resources'
import { resourceMutationSchema } from '../../../../../shared/resource-admin'
import { mutateManagedResources } from '../../../../utils/resource-management'

export default bffProtectedHandler(async event => {
  const session = await requireBffSession(event, { role: 'admin' })
  const body = await requireBffWriteBody(event, session.runtime, 32 * 1024)
  const input = parseAdminInput(resourceMutationSchema, body)
  const result = await mutateManagedResources(useRuntimeConfig(event).openlist ?? {}, input)
  console.info(JSON.stringify({ event: 'resources.mutation', actor: session.identity.id, action: input.action, path: input.path, count: 'names' in input ? input.names.length : 1 }))
  return result
})
