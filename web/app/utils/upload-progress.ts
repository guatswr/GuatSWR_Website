import { EventTransportError } from './event-transport'
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
    request.onload = () =>
      finish(() => {
        if (request.status === 401) {
          reject(new EventTransportError('unauthenticated', '登录状态已失效，请重新登录', 401))
          return
        }
        if (request.status === 403) {
          reject(new EventTransportError('forbidden', '没有权限上传该文件', 403))
          return
        }
        if (request.status < 200 || request.status >= 300) {
          reject(
            new EventTransportError(
              request.status >= 500 ? 'unavailable' : 'invalid',
              request.status >= 500 ? '服务暂时不可用，请稍后重试' : '图片未能上传，请重试',
              request.status
            )
          )
          return
        }
        let payload: unknown
        try {
          payload = JSON.parse(request.responseText || '{}')
        } catch {
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
