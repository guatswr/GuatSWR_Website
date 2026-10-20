import { openAsBlob } from 'node:fs'
import { getRouterParam } from 'h3'
import { adminEventRowSchema } from '@guatswr/shared/admin-workflows'
import { bffProtectedHandler, parseAdminId, requireBffSession, requireBffWriteOrigin } from '../../../../../utils/bff-protected'
import { callAdminUpstream, projectAdminResponse } from '../../../../../utils/bff-admin-resources'
import { BffError } from '../../../../../utils/bff-errors'
import { assertImageMagic, readGuestUpload, UPLOAD_EXTENSIONS } from '../../../../../utils/guest-upload'
import { projectUpload } from '../../../../../utils/guest-bff'

/** Existing v1 event avatar storage, authenticated and CSRF protected by BFF. */
export default bffProtectedHandler(async event => {
  const session = await requireBffSession(event, { role: 'admin' })
  await requireBffWriteOrigin(event, session.runtime)
  const id = parseAdminId(getRouterParam(event, 'id'))
  const upload = await readGuestUpload(event)
  try {
    const snapshot = await callAdminUpstream(session.admin, { route: 'event.detail', params: { id } })
    const record = projectAdminResponse(adminEventRowSchema, snapshot.data)
    if (!['published', 'ongoing', 'ended', 'settled'].includes(record.status))
      throw new BffError(403, 'forbidden', '活动公开后才可上传排名或结算头像')
    await assertImageMagic(upload)
    const body = new FormData()
    body.append('file', await openAsBlob(upload.filePath, { type: upload.mimeType }), `upload${UPLOAD_EXTENSIONS[upload.mimeType]}`)
    body.append('eid', String(id))
    const response = await callAdminUpstream(session.admin, { route: 'upload.eventAvatar', body })
    return projectUpload(response.data)
  } finally { await upload.dispose() }
})
