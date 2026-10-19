import { EventTransportError, eventResponseError, MAX_EVENT_RESPONSE_BYTES, parseEventResponseText } from './event-transport'
import type { UploadOptions, UploadSender } from './event-transport'

/**
 * Multipart upload with real progress, browser-managed boundaries and abort.
 *
 * Loaded lazily on first upload intent (see `useEventApi`), so the public event
 * routes never pay for it. The browser sets the multipart `Content-Type`; only
 * injected session/CSRF headers are added, and `withCredentials` keeps the
 * same-origin session cookie on the request.
 */
export const sendUploadWithProgress: UploadSender = (
  url: string,
  file: File,
  fields: Record<string, string>,
  options: UploadOptions
) =>
  new Promise<{ url: string }>((resolve, reject) => {
    const request = new XMLHttpRequest()
    let settled = false
    const finish = (callback: () => void): void => {
      if (settled) return
      settled = true
      options.signal?.removeEventListener('abort', abort)
      callback()
    }
    function abort(): void {
      request.abort()
    }
    if (options.signal?.aborted) {
      reject(new EventTransportError('network', '上传已取消'))
      return
    }
    options.signal?.addEventListener('abort', abort, { once: true })

    request.open('POST', url, true)
    request.withCredentials = true
    request.responseType = 'text'
    // Server allows 30 s for ingress plus 8 s upstream; leave bounded headroom.
    request.timeout = 60_000
    request.setRequestHeader('accept', 'application/json')
    for (const [name, value] of Object.entries(options.headers ?? {})) {
      // Never let a caller override the multipart boundary the browser chooses.
      if (name.toLowerCase() === 'content-type') continue
      request.setRequestHeader(name, value)
    }
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable || !event.total) return
      options.onProgress?.({
        loaded: event.loaded,
        total: event.total,
        percent: Math.round((event.loaded / event.total) * 100)
      })
    }
    request.onerror = () =>
      finish(() => reject(new EventTransportError('network', '图片上传失败，请重试')))
    request.onabort = () =>
      finish(() => reject(new EventTransportError('network', '上传已取消')))
    request.ontimeout = () =>
      finish(() => reject(new EventTransportError('unavailable', '上传超时，请重试')))
    request.onprogress = event => {
      if (event.loaded > MAX_EVENT_RESPONSE_BYTES) {
        finish(() => reject(new EventTransportError('unavailable', '服务响应超出限制，请重试')))
        request.abort()
      }
    }
    request.onload = () =>
      finish(() => {
        let payload: unknown
        try { payload = parseEventResponseText(request.responseText || '{}') }
        catch (error) { reject(error); return }
        if (request.status < 200 || request.status >= 300) {
          reject(eventResponseError(request.status, payload))
          return
        }
        if (payload === undefined) {
          reject(new EventTransportError('unavailable', '上传响应无法解析，请重试'))
          return
        }
        const value =
          payload && typeof payload === 'object'
            ? (payload as { url?: unknown }).url
            : undefined
        if (typeof value !== 'string' || !value) {
          reject(new EventTransportError('unavailable', '图片上传未返回地址，请重试'))
          return
        }
        resolve({ url: value })
      })

    const data = new FormData()
    data.append('file', file)
    for (const [name, value] of Object.entries(fields)) data.append(name, value)
    request.send(data)
  })

export default sendUploadWithProgress
