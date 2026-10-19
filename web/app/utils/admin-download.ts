import { backupSelectorSchema } from '@guatswr/shared/admin-workflows'
import { BffRequestError } from './bff-client'

/** Small files retain the archived in-page progress; large files stream natively. */
export const MAX_BUFFERED_BACKUP_BYTES = 64 * 1024 * 1024
export function backupDownloadUrl(file: string): string {
  return `/api/bff/admin/backups/download?${new URLSearchParams(backupSelectorSchema.parse({ file }))}`
}

export function downloadBufferedBackup(file: string, options: {
  signal: AbortSignal
  onProgress: (percent: number) => void
  createXhr?: () => XMLHttpRequest
}): Promise<Blob> {
  const url = backupDownloadUrl(file)
  return new Promise((resolve, reject) => {
    const xhr = options.createXhr?.() ?? new XMLHttpRequest()
    let done = false
    function finish(error?: BffRequestError, blob?: Blob) {
      if (done) return
      done = true
      options.signal.removeEventListener('abort', abort)
      xhr.onload = xhr.onerror = xhr.onabort = xhr.ontimeout = xhr.onprogress = null
      if (error) reject(error)
      else if (blob) resolve(blob)
    }
    function abort() {
      finish(new BffRequestError(0, 'aborted', '下载已取消'))
      xhr.abort()
    }
    if (options.signal.aborted) { abort(); return }
    xhr.open('GET', url)
    xhr.responseType = 'blob'
    xhr.timeout = 600_000
    xhr.setRequestHeader('accept', 'application/octet-stream')
    xhr.onprogress = event => {
      if (event.loaded > MAX_BUFFERED_BACKUP_BYTES || (event.lengthComputable && event.total > MAX_BUFFERED_BACKUP_BYTES)) {
        finish(new BffRequestError(0, 'invalid_response', '文件过大，请使用浏览器下载'))
        xhr.abort()
      } else if (event.lengthComputable && event.total > 0) options.onProgress(Math.min(100, Math.round(event.loaded / event.total * 100)))
    }
    xhr.onload = () => {
      if (xhr.status !== 200) {
        finish(new BffRequestError(xhr.status, xhr.status === 401 ? 'session_expired' : xhr.status === 403 ? 'forbidden' : 'upstream_error', '下载失败，请重新确认登录与文件状态'))
      } else if (!(xhr.response instanceof Blob) || xhr.response.size > MAX_BUFFERED_BACKUP_BYTES) {
        finish(new BffRequestError(xhr.status, 'invalid_response', '备份响应无效'))
      } else finish(undefined, xhr.response)
    }
    xhr.onerror = () => finish(new BffRequestError(0, 'network_error', '下载连接中断'))
    xhr.ontimeout = () => finish(new BffRequestError(0, 'request_timeout', '下载超时'))
    xhr.onabort = () => finish(new BffRequestError(0, 'aborted', '下载已取消'))
    options.signal.addEventListener('abort', abort, { once: true })
    xhr.send()
  })
}
