import { openAsBlob } from 'node:fs'
import { getQuery } from 'h3'
import { z } from 'zod'
import { bffProtectedHandler, requireBffSession, requireBffWriteOrigin } from '../../../utils/bff-protected'
import { callAdminUpstream, parseAdminInput } from '../../../utils/bff-admin-resources'
import { assertImageMagic, readGuestUpload, UPLOAD_EXTENSIONS } from '../../../utils/guest-upload'
import { projectUpload } from '../../../utils/guest-bff'

export default bffProtectedHandler(async event => {
  const session = await requireBffSession(event, { role: 'admin' })
  await requireBffWriteOrigin(event, session.runtime)
  const query = parseAdminInput(z.object({
    activityId: z.coerce.number().int().positive().max(999_999_999_999_999).optional(),
    category: z.literal('icon_svg').optional(),
  }).refine(value => !(value.activityId && value.category)), getQuery(event))
  const upload = await readGuestUpload(event)
  try {
    await assertImageMagic(upload)
    const form = new FormData()
    form.append('file', await openAsBlob(upload.filePath, { type: upload.mimeType }), `upload${UPLOAD_EXTENSIONS[upload.mimeType]}`)
    const response = await callAdminUpstream(session.admin, { route: 'upload.asset', query, body: form })
    return projectUpload(response.data)
  } finally { await upload.dispose() }
})
