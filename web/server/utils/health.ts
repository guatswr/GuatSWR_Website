import { createReadinessProbe, publicConfigSchema } from '@guatswr/shared'
import { assertUpstreamOrigin } from './upstream'

export function createWebHealthProbe(origin: string, fetchImpl: typeof fetch = fetch) {
  const base = assertUpstreamOrigin(origin).origin
  const json = async (path: string, signal: AbortSignal): Promise<Record<string, unknown>> => {
    const response = await fetchImpl(new URL(path, base), { signal, redirect: 'error', headers: { accept: 'application/json' } })
    if (!response.ok || Number(response.headers.get('content-length')) > 1024 * 1024) {
      await response.body?.cancel().catch(() => {})
      throw new Error('Dependency unavailable')
    }
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Dependency body missing')
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      for (;;) {
        const part = await reader.read()
        if (part.done) break
        size += part.value.byteLength
        if (size > 1024 * 1024) throw new Error('Dependency response too large')
        chunks.push(part.value)
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
    const buffer = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength }
    const value: unknown = JSON.parse(new TextDecoder().decode(buffer))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid dependency response')
    return value as Record<string, unknown>
  }
  return createReadinessProbe({
    service: 'guatswr-web',
    checks: {
      backend: async signal => {
        const result = await json('/api/health/ready', signal)
        if (result.status !== 'ready' || result.service !== 'guatswr-backend') throw new Error('Backend not ready')
      },
      publicConfig: async signal => {
        // Deliberately uncached: a warm SWR result cannot mask a ban, database
        // outage, bad upstream origin or broken public request chain.
        const value = await json('/api/config', signal)
        const normalized = Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== null))
        if ('message' in value || 'error' in value || 'status' in value || !publicConfigSchema.safeParse(normalized).success) throw new Error('Public read failed')
      },
    },
  })
}

