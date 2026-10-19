import { describe, expect, it } from 'vitest'
import { backupDownloadUrl, downloadBufferedBackup, MAX_BUFFERED_BACKUP_BYTES } from '../app/utils/admin-download'

class FakeXhr {
  method = ''; url = ''; responseType = ''; timeout = 0; sent = false; aborted = false
  status = 200; response: Blob = new Blob(['backup'])
  headers: Record<string, string> = {}
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  ontimeout: (() => void) | null = null
  onprogress: ((event: { loaded: number; total: number; lengthComputable: boolean }) => void) | null = null
  open(method: string, url: string) { this.method = method; this.url = url }
  setRequestHeader(key: string, value: string) { this.headers[key] = value }
  send() { this.sent = true }
  abort() { this.aborted = true; this.onabort?.() }
}

function start(signal = new AbortController().signal) {
  const xhr = new FakeXhr(), progress: number[] = []
  const promise = downloadBufferedBackup('full_fixture.tar.gz', { signal, onProgress: value => progress.push(value), createXhr: () => xhr as unknown as XMLHttpRequest })
  return { xhr, promise, progress }
}

describe('bounded private backup download', () => {
  it('accepts only a fixed BFF route and safe full-backup basenames', () => {
    expect(backupDownloadUrl('full_fixture.tar.gz')).toBe('/api/bff/admin/backups/download?type=full&file=full_fixture.tar.gz')
    for (const file of ['../private', '%2e%2e', '/db', 'a\r\nx']) expect(() => backupDownloadUrl(file)).toThrow()
  })
  it('keeps byte-exact blobs, reports real progress and sends no Authorization', async () => {
    const { xhr, promise, progress } = start()
    expect(xhr.method).toBe('GET')
    expect(xhr.headers).toEqual({ accept: 'application/octet-stream' })
    expect(xhr.responseType).toBe('blob')
    xhr.onprogress?.({ loaded: 2, total: 4, lengthComputable: true })
    xhr.onload?.()
    expect(await (await promise).text()).toBe('backup')
    expect(progress).toEqual([50])
    expect(xhr.onload).toBeNull()
  })
  it('aborts an oversized response before buffering the rest of it', async () => {
    const { xhr, promise } = start()
    const rejected = expect(promise).rejects.toMatchObject({ code: 'invalid_response' })
    xhr.onprogress?.({ loaded: 1, total: MAX_BUFFERED_BACKUP_BYTES + 1, lengthComputable: true })
    await rejected
    expect(xhr.aborted).toBe(true)
  })
  it('cancels active requests and never starts an already-aborted request', async () => {
    const controller = new AbortController()
    const active = start(controller.signal)
    const rejection = expect(active.promise).rejects.toMatchObject({ code: 'aborted' })
    controller.abort()
    await rejection
    expect(active.xhr.aborted).toBe(true)
    const early = start(controller.signal)
    await expect(early.promise).rejects.toMatchObject({ code: 'aborted' })
    expect(early.xhr.sent).toBe(false)
  })
  it.each([401, 403, 500])('returns a fixed error for HTTP %s rather than downloading an error Blob', async status => {
    const { xhr, promise } = start()
    xhr.status = status; xhr.response = new Blob(['private diagnostic'])
    const rejection = expect(promise).rejects.toMatchObject({ status, code: status === 401 ? 'session_expired' : status === 403 ? 'forbidden' : 'upstream_error' })
    xhr.onload?.()
    await rejection
  })
  it('rejects a deadline without retrying the download', async () => {
    const { xhr, promise } = start()
    const rejection = expect(promise).rejects.toMatchObject({ code: 'request_timeout' })
    xhr.ontimeout?.()
    await rejection
  })
})
