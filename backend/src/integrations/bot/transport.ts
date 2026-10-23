export type WebhookResult = { ok: true } | { skipped: true; reason: string }
export class WebhookError extends Error {
  constructor(readonly code: string, options?: ErrorOptions) {
    super(code, options)
    if (code === 'BOT_CANCELLED' || code === 'BOT_TIMEOUT') this.name = 'AbortError'
  }
}
export function createWebhookTransport(options: {
  url: string; token: string; timeoutMs: string | undefined; enabled: boolean; shutdown: AbortSignal
}) {
  const timeout = options.timeoutMs === undefined || options.timeoutMs === '' ? 5000 : Number(options.timeoutMs)
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 30000) throw new WebhookError('BOT_CONFIGURATION')
  if (options.url) {
    try { if (!['http:', 'https:'].includes(new URL(options.url).protocol)) throw new Error('protocol') }
    catch (cause) { throw new WebhookError('BOT_CONFIGURATION', { cause }) }
  }
  return async (payload: unknown): Promise<WebhookResult> => {
    if (!options.enabled) return { skipped: true, reason: 'External services disabled' }
    if (!options.url) return { skipped: true, reason: 'ASTRBOT_WEBHOOK_URL 未配置' }
    const deadline = new AbortController()
    const timer = setTimeout(() => deadline.abort(), timeout)
    let response: Response | undefined
    try {
      response = await fetch(options.url, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
        body: JSON.stringify(payload), signal: AbortSignal.any([deadline.signal, options.shutdown]), redirect: 'error'
      })
      if (!response.ok) {
        const reader = response.body?.getReader()
        try {
          let bytes = 0
          if (Number(response.headers.get('content-length')) > 65536) throw new WebhookError('BOT_RESPONSE_LIMIT')
          if (reader) while (true) {
            const chunk = await reader.read()
            if (chunk.done) break
            bytes += chunk.value.byteLength
            if (bytes > 65536) throw new WebhookError('BOT_RESPONSE_LIMIT')
          }
        } finally { if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock() } }
        throw new WebhookError('BOT_HTTP_FAILURE')
      }
      return { ok: true }
    } catch (cause) {
      if (options.shutdown.aborted) throw new WebhookError('BOT_CANCELLED', { cause })
      if (deadline.signal.aborted) throw new WebhookError('BOT_TIMEOUT', { cause })
      if (cause instanceof WebhookError) throw cause
      throw new WebhookError('BOT_REQUEST_FAILED', { cause })
    } finally {
      await response?.body?.cancel().catch(() => {})
      clearTimeout(timer)
    }
  }
}
