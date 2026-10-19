import { openAsBlob } from 'node:fs'
import { supportsSignup } from '@guatswr/shared'
import { bffAuthHandler } from '../../../../utils/bff-auth-context'
import { BffError } from '../../../../utils/bff-errors'
import {
  assertGuestWrite,
  enforceGuestLimit,
  guestContext,
  guestLimiters,
  guestUpstream,
  guestUpstreamError,
  isPublicEventStatusForUpload,
  projectUpload
} from '../../../../utils/guest-bff'
import { assertImageMagic, readGuestUpload, UPLOAD_EXTENSIONS } from '../../../../utils/guest-upload'

/**
 * Avatar for a publicly visible signup event.
 *
 * Frozen route semantics: no draft ownership is required — only an `eid` whose
 * event is publicly visible (`published`/`ongoing`/`ended`/`settled`), which is
 * why an ended event can still accept an avatar without changing signup
 * eligibility. Documented restriction: only the two signup form types are
 * accepted, because the signup modal is the only caller.
 */
export default bffAuthHandler(async (event) => {
  const context = guestContext(event)
  const guestIp = await assertGuestWrite(event, context.runtime)
  enforceGuestLimit(guestLimiters.upload, `avatar:${guestIp}`)

  const upload = await readGuestUpload(event)
  try {
    const rawEid = upload.fields.eid ?? ''
    const eid = Number(rawEid)
    if (!/^[1-9]\d{0,11}$/.test(rawEid) || !Number.isSafeInteger(eid)) {
      throw new BffError(400, 'invalid_request', '缺少 Event ID')
    }

    const upstream = guestUpstream(context.runtime, context)
    const snapshot = await upstream.request({
      operation: { name: 'eventRead', id: eid },
      clientIp: guestIp
    })
    if (snapshot.status === 404) throw new BffError(404, 'not_found', '找不到该活动')
    if (snapshot.status !== 200) throw guestUpstreamError(snapshot.status)
    const record =
      typeof snapshot.data === 'object' && snapshot.data !== null
        ? (snapshot.data as Record<string, unknown>)
        : {}
    if (!supportsSignup(record.type)) {
      throw new BffError(400, 'signup_unsupported', '此活动不支持报名')
    }
    if (!isPublicEventStatusForUpload(record.status)) {
      throw new BffError(403, 'forbidden', '当前状态不允许上传头像')
    }
    await assertImageMagic(upload)

    const form = new FormData()
    form.append(
      'file',
      await openAsBlob(upload.filePath, { type: upload.mimeType }),
      `upload${UPLOAD_EXTENSIONS[upload.mimeType] ?? ''}`
    )
    form.append('eid', String(eid))

    const response = await upstream.request({
      operation: { name: 'uploadAvatar' },
      clientIp: guestIp,
      body: form
    })
    if (response.status !== 200) throw guestUpstreamError(response.status)
    return projectUpload(response.data)
  } finally {
    await upload.dispose()
  }
})
