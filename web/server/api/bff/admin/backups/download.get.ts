import { Readable } from 'node:stream'
import { getMethod, getQuery, sendStream, setHeader } from 'h3'
import { backupSelectorSchema } from '@guatswr/shared/admin-workflows'
import { bffProtectedHandler, requireBffSession } from '../../../../utils/bff-protected'
import { adminStatusError, parseAdminInput } from '../../../../utils/bff-admin-resources'
import { resolveEventClientIp } from '../../../../utils/bff-auth-context'
import { upstreamUrl } from '../../../../utils/upstream'
import { BffError } from '../../../../utils/bff-errors'

let activeDownloads = 0
const finite = (value: unknown, fallback: number, min: number, max: number) => {
  const number = Number(value)
  return Number.isFinite(number) && number >= min ? Math.min(Math.floor(number), max) : fallback
}

export default bffProtectedHandler(async event => {
  const session = await requireBffSession(event, { superAdmin: true })
  const selector = parseAdminInput(backupSelectorSchema, getQuery(event))
  const config = useRuntimeConfig(event).bffAdmin
  const maxBytes = finite(config.backupDownloadMaxBytes, 20 * 1024 ** 3, 1024, 1024 ** 4)
  const timeout = finite(config.backupDownloadTimeoutMs, 900_000, 1000, 3_600_000)
  const slots = finite(config.maxConcurrentDownloads, 2, 1, 8)
  if (activeDownloads >= slots) throw new BffError(503, 'service_unavailable', '下载繁忙，请稍后重试')
  activeDownloads += 1
  const controller = new AbortController()
  let binaryStream: Readable | undefined
  const abort = (reason: string) => {
    controller.abort()
    // A paused Node stream will not resume its generator merely because fetch
    // was aborted. Destroy it too, or a cancelled/stalled download leaks a slot.
    binaryStream?.destroy(new Error(reason))
  }
  const timer = setTimeout(() => abort('backup download timeout'), timeout)
  const close = () => { if (!event.node.res.writableFinished) abort('backup client disconnected') }
  event.node.res.once('close', close)
  let response: Response | undefined
  try {
    const url = new URL(upstreamUrl(session.runtime.apiBase, '/api/admin/backups/download'))
    url.searchParams.set('type', selector.type)
    url.searchParams.set('file', selector.file)
    const head = getMethod(event) === 'HEAD'
    try {
      response = await fetch(url, { method: head ? 'HEAD' : 'GET', redirect: 'manual', signal: controller.signal,
        headers: { accept: 'application/octet-stream', 'accept-encoding': 'identity', authorization: `Bearer ${session.upstreamToken}`, 'x-forwarded-for': resolveEventClientIp(event, session.runtime).ip.address } })
    } catch { throw new BffError(504, 'upstream_timeout', '备份下载连接失败，请重试') }
    if (response.status !== 200) throw adminStatusError(response.status)
    if (!/^attachment(?:;|$)/i.test(response.headers.get('content-disposition') ?? ''))
      throw new BffError(502, 'upstream_invalid_response', '备份响应异常')
    const declared = response.headers.get('content-length')
    const length = declared && /^\d+$/.test(declared) ? Number(declared) : undefined
    if (length !== undefined && (!Number.isSafeInteger(length) || length > maxBytes))
      throw new BffError(413, 'payload_too_large', '备份超过当前下载限额')
    if (!head && !response.body) throw new BffError(502, 'upstream_invalid_response', '备份响应异常')
    if (response.headers.get('content-encoding') && response.headers.get('content-encoding') !== 'identity')
      throw new BffError(502, 'upstream_invalid_response', '备份响应异常')
    setHeader(event, 'Content-Type', 'application/octet-stream')
    setHeader(event, 'Content-Disposition', `attachment; filename="${selector.file}"`)
    setHeader(event, 'X-Content-Type-Options', 'nosniff')
    if (length !== undefined) setHeader(event, 'Content-Length', length)
    if (head) return ''
    const reader = response.body!.getReader()
    async function* chunks() {
      let total = 0
      try {
        for (;;) {
          const part = await reader.read()
          if (part.done) break
          total += part.value.byteLength
          if (total > maxBytes) throw new Error('backup byte limit')
          yield part.value
        }
        if (length !== undefined && total !== length) throw new Error('backup truncated')
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
    }
    binaryStream = Readable.from(chunks(), { objectMode: false })
    try { await sendStream(event, binaryStream) }
    catch {
      // Headers/body may already have been sent. Abort a truncated download;
      // never append a JSON error (or raw upstream diagnostic) to an archive.
      controller.abort()
      event.node.res.destroy()
    }
  } finally {
    clearTimeout(timer)
    event.node.res.off('close', close)
    controller.abort()
    await response?.body?.cancel().catch(() => {})
    activeDownloads -= 1
  }
})
