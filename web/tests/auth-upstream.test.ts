import { describe, expect, it, vi } from 'vitest'
import { UpstreamFailure, createUpstreamClient } from '../server/utils/bff-upstream'
import { BffConfigError } from '../server/utils/bff-errors'

const ORIGIN = 'http://127.0.0.1:8080'

interface FetchCall {
  url: string
  init: RequestInit
}

function createFetch(handler: (url: string, init: RequestInit) => Promise<Response>) {
  const calls: FetchCall[] = []
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} })
    return handler(String(input), init ?? {})
  })
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls, raw: fetchImpl }
}

function jsonResponse(body: unknown, init: { status?: number, headers?: Record<string, string> } = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...init.headers },
  })
}

function failureKind(error: unknown): string {
  expect(error).toBeInstanceOf(UpstreamFailure)
  return (error as UpstreamFailure).kind
}

describe('allowlisted upstream calls', () => {
  it('sends a fixed POST login with only the validated body', async () => {
    const { fetchImpl, calls } = createFetch(() => Promise.resolve(jsonResponse({ token: 'a.b.c' })))
    const client = createUpstreamClient({ origin: ORIGIN, fetch: fetchImpl })
    const response = await client.request({ route: 'auth.login', body: { username: 'admin', password: 'secret' } })
    expect(response.status).toBe(200)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('http://127.0.0.1:8080/api/auth/login')
    expect(calls[0]?.init.method).toBe('POST')
    expect(calls[0]?.init.body).toBe('{"username":"admin","password":"secret"}')
    const headers = calls[0]?.init.headers as Headers
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('cookie')).toBeNull()
    expect(headers.get('origin')).toBeNull()
    expect(headers.get('authorization')).toBeNull()
    expect(calls[0]?.init.redirect).toBe('error')
    expect(calls[0]?.init.credentials).toBe('omit')
  })

  it('injects only a server bearer token and one validated X-Forwarded-For address', async () => {
    const { fetchImpl, calls } = createFetch(() => Promise.resolve(jsonResponse({ id: 1 })))
    const client = createUpstreamClient({ origin: ORIGIN, fetch: fetchImpl })
    await client.request({ route: 'auth.me', bearerToken: 'server.jwt.value', clientIp: '203.0.113.9' })
    const headers = calls[0]?.init.headers as Headers
    expect(headers.get('authorization')).toBe('Bearer server.jwt.value')
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.9')
    expect(calls[0]?.init.method).toBe('GET')
    expect(calls[0]?.init.body).toBeUndefined()
  })

  it('rejects a non-allowlisted route at runtime and an invalid origin at construction', async () => {
    const { fetchImpl } = createFetch(() => Promise.resolve(jsonResponse({})))
    const client = createUpstreamClient({ origin: ORIGIN, fetch: fetchImpl })
    await expect(client.request({ route: 'auth.admin' as never })).rejects.toThrow(BffConfigError)
    expect(() => createUpstreamClient({ origin: 'file:///etc/passwd', fetch: fetchImpl })).toThrow(BffConfigError)
    expect(() => createUpstreamClient({ origin: 'http://user:pass@127.0.0.1:8080', fetch: fetchImpl })).toThrow(BffConfigError)
  })

  it('refuses an oversized request body before calling upstream', async () => {
    const { fetchImpl, calls } = createFetch(() => Promise.resolve(jsonResponse({})))
    const client = createUpstreamClient({ origin: ORIGIN, fetch: fetchImpl, maxRequestBytes: 256 })
    try {
      await client.request({ route: 'auth.login', body: { note: 'x'.repeat(1024) } })
      throw new Error('expected a failure')
    }
    catch (error) {
      expect(failureKind(error)).toBe('request_too_large')
    }
    expect(calls).toHaveLength(0)
  })
})

describe('transport hardening', () => {
  it('never follows a redirect', async () => {
    const redirecting = createFetch(() => Promise.resolve(new Response(null, { status: 302, headers: { location: 'https://evil.example' } })))
    await expect(createUpstreamClient({ origin: ORIGIN, fetch: redirecting.fetchImpl }).request({ route: 'auth.me' }))
      .rejects.toMatchObject({ kind: 'redirect' })

    const throwing = createFetch(() => Promise.reject(Object.assign(new TypeError('fetch failed'), {
      cause: new Error('unexpected redirect'),
    })))
    try {
      await createUpstreamClient({ origin: ORIGIN, fetch: throwing.fetchImpl }).request({ route: 'auth.me' })
      throw new Error('expected a failure')
    }
    catch (error) {
      expect(failureKind(error)).toBe('redirect')
    }
  })

  it('aborts a hung upstream call and reports a timeout without retrying', async () => {
    const { fetchImpl, calls } = createFetch((_url, init) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    }))
    const client = createUpstreamClient({ origin: ORIGIN, fetch: fetchImpl, timeoutMs: 20 })
    try {
      await client.request({ route: 'auth.me' })
      throw new Error('expected a timeout')
    }
    catch (error) {
      expect(failureKind(error)).toBe('timeout')
    }
    expect(calls).toHaveLength(1)
  })

  it('maps an aborted caller signal without retrying', async () => {
    const { fetchImpl, calls } = createFetch((_url, init) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    }))
    const controller = new AbortController()
    const client = createUpstreamClient({ origin: ORIGIN, fetch: fetchImpl, timeoutMs: 5000 })
    const pending = client.request({ route: 'auth.me', signal: controller.signal })
    setTimeout(() => controller.abort(), 10)
    try {
      await pending
      throw new Error('expected an abort')
    }
    catch (error) {
      expect(failureKind(error)).toBe('aborted')
    }
    expect(calls).toHaveLength(1)
  })

  it('caps a streamed response, cancels the stream, and rejects invalid JSON', async () => {
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(700))
        controller.enqueue(new Uint8Array(700))
      },
      cancel() {
        cancelled = true
      },
    })
    const { fetchImpl } = createFetch(() => Promise.resolve(new Response(stream, { status: 200 })))
    try {
      await createUpstreamClient({ origin: ORIGIN, fetch: fetchImpl, maxResponseBytes: 1024 }).request({ route: 'auth.me' })
      throw new Error('expected a size failure')
    }
    catch (error) {
      expect(failureKind(error)).toBe('too_large')
    }
    expect(cancelled).toBe(true)

    const declared = createFetch(() => Promise.resolve(jsonResponse({ ok: true }, { headers: { 'content-length': '999999' } })))
    try {
      await createUpstreamClient({ origin: ORIGIN, fetch: declared.fetchImpl, maxResponseBytes: 1024 }).request({ route: 'auth.me' })
      throw new Error('expected a size failure')
    }
    catch (error) {
      expect(failureKind(error)).toBe('too_large')
    }

    const invalid = createFetch(() => Promise.resolve(new Response('not json', { status: 200 })))
    try {
      await createUpstreamClient({ origin: ORIGIN, fetch: invalid.fetchImpl }).request({ route: 'auth.me' })
      throw new Error('expected a parse failure')
    }
    catch (error) {
      expect(failureKind(error)).toBe('bad_response')
    }
  })

  it('rejects an empty 200 body but accepts an empty 204 body', async () => {
    const emptyOk = createFetch(() => Promise.resolve(new Response('', { status: 200 })))
    try {
      await createUpstreamClient({ origin: ORIGIN, fetch: emptyOk.fetchImpl }).request({ route: 'auth.me' })
      throw new Error('expected a failure')
    }
    catch (error) {
      expect(failureKind(error)).toBe('bad_response')
    }

    const noContent = createFetch(() => Promise.resolve(new Response(null, { status: 204 })))
    await expect(createUpstreamClient({ origin: ORIGIN, fetch: noContent.fetchImpl }).request({ route: 'auth.me' }))
      .resolves.toEqual({ status: 204, data: null })
  })

  it('bounds a Retry-After hint and ignores malformed values', async () => {
    const hint = createFetch(() => Promise.resolve(jsonResponse({ message: 'slow down' }, { status: 429, headers: { 'retry-after': '60' } })))
    await expect(createUpstreamClient({ origin: ORIGIN, fetch: hint.fetchImpl }).request({ route: 'auth.login', body: {} }))
      .resolves.toMatchObject({ status: 429, retryAfterSeconds: 60 })

    const huge = createFetch(() => Promise.resolve(jsonResponse({ message: 'slow down' }, { status: 429, headers: { 'retry-after': '100000' } })))
    await expect(createUpstreamClient({ origin: ORIGIN, fetch: huge.fetchImpl }).request({ route: 'auth.login', body: {} }))
      .resolves.toMatchObject({ retryAfterSeconds: 900 })

    const malformed = createFetch(() => Promise.resolve(jsonResponse({ message: 'slow down' }, { status: 429, headers: { 'retry-after': 'soon' } })))
    await expect(createUpstreamClient({ origin: ORIGIN, fetch: malformed.fetchImpl }).request({ route: 'auth.login', body: {} }))
      .resolves.toMatchObject({ status: 429 })
  })

  it('does not retry an upstream failure', async () => {
    const { fetchImpl, calls } = createFetch(() => Promise.resolve(jsonResponse({ message: 'boom' }, { status: 500 })))
    const response = await createUpstreamClient({ origin: ORIGIN, fetch: fetchImpl }).request({ route: 'auth.me' })
    expect(response.status).toBe(500)
    expect(calls).toHaveLength(1)
  })
})
