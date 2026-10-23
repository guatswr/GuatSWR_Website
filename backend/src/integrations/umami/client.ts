type Json = Record<string, unknown>
interface Query { startAt: number; endAt: number; unit: string; limit: number; envType: string }
export class UmamiError extends Error { constructor(readonly code: string) { super(code) } }
const record = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
const fail = (code: string): never => { throw new UmamiError(code) }
const waitFor = <T>(promise: Promise<T>, signal: AbortSignal) => new Promise<T>((resolve, reject) => {
  const stop = () => { signal.removeEventListener('abort', stop); reject(new UmamiError('UMAMI_CANCELLED')) }
  if (signal.aborted) { void promise.catch(() => {}); stop(); return }
  signal.addEventListener('abort', stop, { once: true })
  promise.then(value => { signal.removeEventListener('abort', stop); resolve(value) }, error => { signal.removeEventListener('abort', stop); reject(error) })
})
export function createUmamiClient(options: { baseUrl: string; username: string; password: string; websiteId: string; timeoutMs?: string; ttlMs?: string; shutdown: AbortSignal; onUpstreamFailure?: (status: number) => void }) {
  const timeout = options.timeoutMs ? Number(options.timeoutMs) : 8000
  const ttl = options.ttlMs ? Number(options.ttlMs) : 60000
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 30000 || !Number.isInteger(ttl) || ttl < 0 || ttl > 3600000) fail('UMAMI_CONFIGURATION')
  try { if (!['http:', 'https:'].includes(new URL(options.baseUrl).protocol)) fail('UMAMI_CONFIGURATION') }
  catch { fail('UMAMI_CONFIGURATION') }
  const configured = Boolean(options.username && options.password && options.websiteId)
  const cache = new Map<string, { at: number; data: unknown; bytes: number }>()
  const flights = new Map<string, Promise<unknown>>()
  let cacheBytes = 0, active = 0, generation = 0
  const queue: { grant(): void; cancel(): void }[] = []
  const acquire = (signal: AbortSignal) => new Promise<() => void>((resolve, reject) => {
    if (signal.aborted) { reject(new UmamiError('UMAMI_CANCELLED')); return }
    const release = () => { active--; queue.shift()?.grant() }
    if (active < 8) { active++; resolve(release); return }
    if (queue.length >= 32) { reject(new UmamiError('UMAMI_BUSY')); return }
    const cleanup = () => signal.removeEventListener('abort', item.cancel)
    const item = {
      grant: () => { cleanup(); active++; resolve(release) },
      cancel: () => { const index = queue.indexOf(item); if (index >= 0) queue.splice(index, 1); cleanup(); reject(new UmamiError('UMAMI_CANCELLED')) }
    }
    queue.push(item)
    signal.addEventListener('abort', item.cancel, { once: true })
  })
  const request = async (pathname: string, query: Json, signal: AbortSignal, body?: unknown, token?: string) => {
    const release = await acquire(signal)
    let response: Response | undefined
    try {
      const url = new URL(options.baseUrl.replace(/\/+$/, '') + pathname)
      for (const [name, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== '') url.searchParams.set(name, String(value))
      response = await fetch(url, {
        method: body === undefined ? 'GET' : 'POST', headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal, redirect: 'error'
      })
      if (Number(response.headers.get('content-length')) > 1048576) fail('UMAMI_RESPONSE_LIMIT')
      const reader = response.body?.getReader(), chunks: Uint8Array[] = []
      let size = 0
      if (reader) try {
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          size += chunk.value.byteLength
          if (size > 1048576) fail('UMAMI_RESPONSE_LIMIT')
          chunks.push(chunk.value)
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
      const raw = Buffer.concat(chunks).toString('utf8')
      let data: unknown = null
      if (raw) try { data = JSON.parse(raw) } catch { fail('UMAMI_BAD_JSON') }
      return { status: response.status, data }
    } catch (error) {
      if (error instanceof UmamiError) throw error
      return fail(signal.aborted ? 'UMAMI_CANCELLED' : 'UMAMI_REQUEST_FAILED')
    } finally { await response?.body?.cancel().catch(() => {}); release() }
  }
  let credential = { token: '', expires: 0, generation: 0 }
  let login: Promise<typeof credential> | undefined
  const token = () => {
    if (credential.token && credential.expires - Date.now() > 60000) return Promise.resolve(credential)
    if (!login) {
      login = (async () => {
        const signal = AbortSignal.any([options.shutdown, AbortSignal.timeout(timeout)])
        for (const pathname of ['/api/auth/login', '/api/login']) {
          try {
            const response = await request(pathname, {}, signal, { username: options.username, password: options.password })
            const value = record(response.data).token
            if (response.status >= 200 && response.status < 300 && typeof value === 'string' && value.length <= 8192 && value) {
              let expires = Date.now() + 300000
              try { const exp = record(JSON.parse(Buffer.from(value.split('.')[1] || '', 'base64url').toString('utf8'))).exp; if (typeof exp === 'number' && Number.isFinite(exp)) expires = exp * 1000 } catch { /* Opaque tokens have a bounded local lifetime. */ }
              credential = { token: value, expires, generation: ++generation }
              return credential
            }
          } catch { if (signal.aborted) break }
        }
        return fail('UMAMI_LOGIN_FAILED')
      })().finally(() => { login = undefined })
    }
    return login
  }
  const get = async (pathname: string, query: Json, signal: AbortSignal) => {
    let auth = await waitFor(token(), signal)
    let response = await request(pathname, query, signal, undefined, auth.token)
    if (response.status === 401) {
      if (credential.generation === auth.generation) credential = { ...credential, token: '', expires: 0 }
      auth = await waitFor(token(), signal)
      response = await request(pathname, query, signal, undefined, auth.token)
    }
    if (response.status >= 200 && response.status < 300) return response.data
    try { options.onUpstreamFailure?.(response.status) } catch { /* Diagnostics do not change the frozen fallback response. */ }
    return null
  }
  const load = async (input: Query) => {
    const signal = AbortSignal.any([options.shutdown, AbortSignal.timeout(timeout)])
    let { startAt, endAt } = input
    const prefix = `/api/websites/${encodeURIComponent(options.websiteId)}`
    if (!startAt || startAt <= 0) {
      const range = record(await get(`${prefix}/daterange`, {}, signal))
      if (range.startDate) startAt = new Date(String(range.startDate)).getTime()
      if (range.endDate) endAt = new Date(String(range.endDate)).getTime()
      if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) fail('UMAMI_BAD_JSON')
    }
    const { unit, limit, envType } = input
    const [stats, pageviews, pages, environments] = await Promise.all([
      get(`${prefix}/stats`, { startAt, endAt }, signal), get(`${prefix}/pageviews`, { startAt, endAt, unit }, signal),
      get(`${prefix}/metrics`, { startAt, endAt, type: 'path', limit }, signal), get(`${prefix}/metrics`, { startAt, endAt, type: envType, limit }, signal)
    ])
    const series = record(pageviews)
    return { meta: { startAt, endAt, unit, limit, envType }, summary: stats || {}, series: { pageviews: series.pageviews || [], visitors: series.sessions || [] }, top: { pages: pages || [], environments: environments || [] } }
  }
  return {
    configured,
    async summary(input: Query): Promise<unknown> {
      if (!configured) fail('UMAMI_CONFIGURATION')
      if (options.shutdown.aborted) fail('UMAMI_CANCELLED')
      const key = JSON.stringify(input), entry = cache.get(key)
      if (entry) {
        cache.delete(key); cacheBytes -= entry.bytes
        if (Date.now() - entry.at < ttl) { cache.set(key, entry); cacheBytes += entry.bytes; return entry.data }
      }
      const existing = flights.get(key)
      if (existing) return existing
      if (flights.size >= 8) fail('UMAMI_BUSY')
      const work = load(input).then(data => {
        const bytes = Buffer.byteLength(JSON.stringify(data))
        if (bytes <= 1048576 && ttl > 0) {
          while (cache.size >= 64 || cacheBytes + bytes > 8388608) { const first = cache.keys().next().value; if (first === undefined) break; cacheBytes -= cache.get(first)!.bytes; cache.delete(first) }
          cache.set(key, { at: Date.now(), data, bytes }); cacheBytes += bytes
        }
        return data
      }).catch(error => {
        if (error instanceof UmamiError && error.code === 'UMAMI_CANCELLED' && !options.shutdown.aborted) throw new UmamiError('UMAMI_TIMEOUT')
        throw error
      }).finally(() => { flights.delete(key) })
      flights.set(key, work)
      return work
    }
  }
}
