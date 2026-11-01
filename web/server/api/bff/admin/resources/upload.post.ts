import { openAsBlob } from 'node:fs'
import { getQuery } from 'h3'
import { useRuntimeConfig } from '#imports'
import { bffProtectedHandler, requireBffSession, requireBffWriteOrigin } from '../../../../utils/bff-protected'
import { parseAdminInput } from '../../../../utils/bff-admin-resources'
import { resourceUploadQuerySchema } from '../../../../../shared/resource-admin'
import { assertResourceWritable, uploadManagedResource } from '../../../../utils/resource-management'
import { receiveResourceUpload } from '../../../../utils/resource-upload'

export default bffProtectedHandler(async event => {
  const session = await requireBffSession(event, { role: 'admin' })
  await requireBffWriteOrigin(event, session.runtime)
  const query = parseAdminInput(resourceUploadQuerySchema, getQuery(event))
  const config = useRuntimeConfig(event).openlist ?? {}
  await assertResourceWritable(config, query.path)
  const upload = await receiveResourceUpload(event.node.req, config.uploadTempDir || undefined)
  try {
    const result = await uploadManagedResource(config, query.path, query.name, await openAsBlob(upload.filename, { type: 'application/octet-stream' }))
    console.info(JSON.stringify({ event: 'resources.mutation', actor: session.identity.id, action: 'upload', path: query.path, bytes: upload.size }))
    return result
  } finally { await upload.dispose() }
})
