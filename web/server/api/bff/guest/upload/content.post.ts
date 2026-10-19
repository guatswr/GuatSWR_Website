import { openAsBlob } from 'node:fs'
import { bffAuthHandler } from '../../../../utils/bff-auth-context'
import { BffError } from '../../../../utils/bff-errors'
import {
  assertGuestWrite,
  enforceGuestLimit,
  guestContext,
  guestDraftContext,
  guestLimiters,
  guestUpstream,
  guestUpstreamError,
  projectUpload
} from '../../../../utils/guest-bff'
import { assertImageMagic, readGuestUpload, UPLOAD_EXTENSIONS } from '../../../../utils/guest-upload'

/**
 * Content image for the guest's own draft.
 *
 * The `eid` must be a draft this BFF issued to this cookie/ IP; the file streams
 * to a private temp file, is magic-checked, then forwards as a multipart upload
 * without ever reusing the client filename. Only the same-origin URL is returned.
 */
export default bffAuthHandler(async (event) => {
  const context = guestContext(event)
  const guestIp = await assertGuestWrite(event, context.runtime)
  enforceGuestLimit(guestLimiters.upload, `upload:${guestIp}`)

  const upload = await readGuestUpload(event)
  try {
    const rawEid = upload.fields.eid ?? ''
    const eid = Number(rawEid)
    if (!/^[1-9]\d{0,11}$/.test(rawEid) || !Number.isSafeInteger(eid)) {
      throw new BffError(400, 'invalid_request', '缺少 Event ID')
    }

    const draft = await guestDraftContext(event, context.runtime, context.origin, guestIp)
    if (!draft.store.owns(draft.intent, eid)) {
      throw new BffError(403, 'forbidden', '禁止上传')
    }
    await assertImageMagic(upload)

    const form = new FormData()
    form.append(
      'file',
      await openAsBlob(upload.filePath, { type: upload.mimeType }),
      `upload${UPLOAD_EXTENSIONS[upload.mimeType] ?? ''}`
    )
    form.append('eid', String(eid))

    const response = await guestUpstream(context.runtime, context).request({
      operation: { name: 'uploadContent' },
      clientIp: guestIp,
      body: form
    })
    if (response.status !== 200) throw guestUpstreamError(response.status)
    return projectUpload(response.data)
  } finally {
    await upload.dispose()
  }
})
