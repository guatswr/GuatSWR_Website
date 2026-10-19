import { describe, expect, it, vi } from 'vitest'
import {
  BFF_AUTH_PATHS,
  BffRequestError,
  bffErrorMessage,
  bffMutation,
  bffRequest,
  isCsrfRejection,
  safeLocalReturnPath,
} from '../app/utils/bff-client'

interface FetchCall {
  input: RequestInfo | URL
  init: RequestInit
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function errorResponse(status: number, code: string, message: string) {
  return jsonResponse({ error: { code, message } }, status)
}

function createFetch(handler: (call: FetchCall) => Promise<Response> | Response) {
  const calls: FetchCall[] = []
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { input, init: init ?? {} }
    calls.push(call)
    return handler(call)
  })
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls }
}

function headersOf(call: FetchCall): Headers {
  return call.init.headers as Headers
}

describe('BFF client request boundary', () => {
  it('issues only same-origin, allowlisted requests without browser credential headers', async () => {
    const { fetchImpl, calls } = createFetch(() => jsonResponse({ authenticated: false }))
    await bffRequest(BFF_AUTH_PATHS.session, { method: 'GET', fetchImpl })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.input).toBe('/api/bff/auth/session')
    expect(calls[0]?.init.method).toBe('GET')
    expect(calls[0]?.init.credentials).toBe('same-origin')
    expect(calls[0]?.init.body).toBeUndefined()
    const headers = headersOf(calls[0]!)
    expect(headers.get('accept')).toBe('application/json')
    expect(headers.get('authorization')).toBeNull()
    expect(headers.get('cookie')).toBeNull()
    expect(headers.get('origin')).toBeNull()
    expect(headers.get('x-csrf-token')).toBeNull()
    expect(headers.get('content-type')).toBeNull()
  })

  it('sends JSON plus the memory CSRF token on mutations, and nothing else', async () => {
    const { fetchImpl, calls } = createFetch(() => jsonResponse({ user: null }))
    await bffRequest(BFF_AUTH_PATHS.login, {
      method: 'POST',
      body: { username: 'admin', password: 'x' },
      csrfToken: 'memory-token',
      fetchImpl,
    })
    const headers = headersOf(calls[0]!)
    expect(calls[0]?.init.body).toBe('{"username":"admin","password":"x"}')
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('x-csrf-token')).toBe('memory-token')
    expect(headers.get('authorization')).toBeNull()
  })

  it('refuses a path outside the explicit allowlist', async () => {
    const { fetchImpl } = createFetch(() => jsonResponse({}))
    await expect(bffRequest('/api/admin/users' as never, { method: 'GET', fetchImpl })).rejects.toThrow(/allowlisted/)
    await expect(bffRequest('https://evil.example/api/bff/auth/login' as never, { method: 'POST', fetchImpl })).rejects.toThrow(/allowlisted/)
  })

  it('maps server error bodies, permission denial and transport failures distinctly', async () => {
    const unauthorized = createFetch(() => errorResponse(401, 'session_expired', '登录状态已失效，请重新登录'))
    await expect(bffRequest(BFF_AUTH_PATHS.session, { method: 'GET', fetchImpl: unauthorized.fetchImpl }))
      .rejects.toMatchObject({ status: 401, code: 'session_expired', retryable: false })

    const forbidden = createFetch(() => errorResponse(403, 'forbidden', '权限不足'))
    await expect(bffRequest(BFF_AUTH_PATHS.session, { method: 'GET', fetchImpl: forbidden.fetchImpl }))
      .rejects.toMatchObject({ status: 403, code: 'forbidden', retryable: false })

    const broken = createFetch(() => errorResponse(503, 'service_unavailable', '服务暂不可用'))
    await expect(bffRequest(BFF_AUTH_PATHS.session, { method: 'GET', fetchImpl: broken.fetchImpl }))
      .rejects.toMatchObject({ status: 503, code: 'service_unavailable', retryable: true })

    const offline = createFetch(() => Promise.reject(new TypeError('fetch failed')))
    await expect(bffRequest(BFF_AUTH_PATHS.session, { method: 'GET', fetchImpl: offline.fetchImpl }))
      .rejects.toMatchObject({ status: 0, code: 'network_error', retryable: true })

    const garbage = createFetch(() => new Response('not json', { status: 200 }))
    await expect(bffRequest(BFF_AUTH_PATHS.session, { method: 'GET', fetchImpl: garbage.fetchImpl }))
      .rejects.toMatchObject({ status: 200, code: 'invalid_response' })
  })

  it('times out a hung request without retrying or leaking an internal error', async () => {
    const { fetchImpl, calls } = createFetch((call) => new Promise<Response>((_resolve, reject) => {
      call.init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    }))
    await expect(bffRequest(BFF_AUTH_PATHS.session, { method: 'GET', fetchImpl, timeoutMs: 20 }))
      .rejects.toMatchObject({ status: 0, code: 'request_timeout' })
    expect(calls).toHaveLength(1)
  })
})

describe('bounded CSRF recovery', () => {
  const mutationOptions = (fetchImpl: typeof fetch, refreshCsrf: () => Promise<string>, csrfToken = 'stale-token') => ({
    body: { ok: true },
    fetchImpl,
    csrfToken: () => csrfToken,
    refreshCsrf,
  })

  it('retries exactly once when and only when the server rejected the write for CSRF', async () => {
    const { fetchImpl, calls } = createFetch((call) => {
      const token = headersOf(call).get('x-csrf-token')
      return token === 'fresh-token' ? jsonResponse({ ok: true }) : errorResponse(403, 'csrf_invalid', '请求校验失败，请刷新页面后重试')
    })
    const refreshCsrf = vi.fn(async () => 'fresh-token')
    const result = await bffMutation(BFF_AUTH_PATHS.logout, mutationOptions(fetchImpl, refreshCsrf))
    expect(result.data).toEqual({ ok: true })
    expect(result.csrfToken).toBe('fresh-token')
    expect(refreshCsrf).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(2)
    expect(headersOf(calls[1]!).get('x-csrf-token')).toBe('fresh-token')
  })

  it('never retries a permission denial, server error, timeout or network failure', async () => {
    const cases: Array<{ name: string, handler: (call: FetchCall) => Promise<Response> | Response }> = [
      { name: 'forbidden', handler: () => errorResponse(403, 'forbidden', '权限不足') },
      { name: 'server error', handler: () => errorResponse(500, 'internal_error', '服务暂不可用') },
      { name: 'network', handler: () => Promise.reject(new TypeError('fetch failed')) },
      {
        name: 'timeout',
        handler: call => new Promise<Response>((_resolve, reject) => {
          call.init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
        }),
      },
    ]

    for (const testCase of cases) {
      const { fetchImpl, calls } = createFetch(testCase.handler)
      const refreshCsrf = vi.fn(async () => 'fresh-token')
      const promise = bffMutation(BFF_AUTH_PATHS.logout, { ...mutationOptions(fetchImpl, refreshCsrf), timeoutMs: 20 })
      await expect(promise, testCase.name).rejects.toBeInstanceOf(BffRequestError)
      expect(refreshCsrf, testCase.name).not.toHaveBeenCalled()
      expect(calls, testCase.name).toHaveLength(1)
    }
  })

  it('retries at most once even when the refreshed token is also rejected', async () => {
    const { fetchImpl, calls } = createFetch(() => errorResponse(403, 'csrf_invalid', '请求校验失败，请刷新页面后重试'))
    const refreshCsrf = vi.fn(async () => 'another-stale-token')
    await expect(bffMutation(BFF_AUTH_PATHS.logout, mutationOptions(fetchImpl, refreshCsrf)))
      .rejects.toMatchObject({ code: 'csrf_invalid' })
    expect(calls).toHaveLength(2)
    expect(refreshCsrf).toHaveBeenCalledTimes(1)
  })

  it('classifies CSRF rejection without confusing it with permission denial', () => {
    expect(isCsrfRejection(new BffRequestError(403, 'csrf_invalid', 'x'))).toBe(true)
    expect(isCsrfRejection(new BffRequestError(403, 'forbidden', 'x'))).toBe(false)
    expect(isCsrfRejection(new BffRequestError(0, 'network_error', 'x'))).toBe(false)
  })
})

describe('safe post-login return path', () => {
  it.each([
    ['/admin/events', '/admin/events'],
    ['/admin/events?page=2', '/admin/events?page=2'],
    ['  /admin  ', '/admin'],
  ])('keeps the same-origin path %s', (input, expected) => {
    expect(safeLocalReturnPath(input)).toBe(expected)
  })

  it.each([
    'https://evil.example/admin',
    '//evil.example/admin',
    '/\\evil.example',
    'javascript:alert(1)',
    'http://127.0.0.1:3100/admin',
    '/login',
    '/login?redirect=/admin',
    '/login/again',
    '',
    '   ',
    undefined,
    null,
    42,
    `/admin/${'x'.repeat(600)}`,
  ])('rejects the unsafe or looping target %s', (input) => {
    expect(safeLocalReturnPath(input)).toBeUndefined()
  })
})

describe('user-visible error message', () => {
  it('uses the sanitized server message and otherwise the caller fallback', () => {
    expect(bffErrorMessage(new BffRequestError(401, 'invalid_credentials', '用户名或密码错误'), 'fallback'))
      .toBe('用户名或密码错误')
    expect(bffErrorMessage(new Error('boom'), '服务器连接失败，请检查网络或后端状态'))
      .toBe('服务器连接失败，请检查网络或后端状态')
    expect(bffErrorMessage(new BffRequestError(0, 'network_error', ''), 'fallback')).toBe('fallback')
  })
})

describe('transport hardening', () => {
  it('never follows a redirect and issues no second request (307 to a foreign origin)', async () => {
    const { fetchImpl, calls } = createFetch(() => {
      // A browser refusing to follow `redirect: 'error'` throws instead of
      // resending the credentialed payload.
      return Promise.reject(Object.assign(new TypeError('fetch failed'), {
        cause: new Error('unexpected redirect'),
      }))
    })
    await expect(bffRequest(BFF_AUTH_PATHS.login, {
      method: 'POST',
      body: { username: 'admin', password: 'x' },
      csrfToken: 'token',
      fetchImpl,
    })).rejects.toMatchObject({ status: 0, code: 'network_error' })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.init.redirect).toBe('error')
    expect(calls[0]?.init.credentials).toBe('same-origin')
    // The body was only ever sent to the internal path.
    expect(calls[0]?.input).toBe('/api/bff/auth/login')
  })

  it('does not issue a fetch for an already-aborted signal', async () => {
    const { fetchImpl, calls } = createFetch(() => jsonResponse({ ok: true }))
    const controller = new AbortController()
    controller.abort()
    await expect(bffRequest(BFF_AUTH_PATHS.session, { method: 'GET', fetchImpl, signal: controller.signal }))
      .rejects.toMatchObject({ status: 0, code: 'aborted' })
    expect(calls).toHaveLength(0)
  })

  it('caps a streamed response before buffering it', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(40 * 1024))
        controller.enqueue(new Uint8Array(40 * 1024))
      },
    })
    const { fetchImpl } = createFetch(() => new Response(stream, { status: 200 }))
    await expect(bffRequest(BFF_AUTH_PATHS.session, { method: 'GET', fetchImpl }))
      .rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('projects only known error codes and never reflects unknown upstream text', async () => {
    const unknown = createFetch(() => jsonResponse({ error: { code: 'db_error', message: 'SQLITE_ERROR: near "select"' } }, 500))
    const error = await bffRequest(BFF_AUTH_PATHS.session, { method: 'GET', fetchImpl: unknown.fetchImpl })
      .catch((caught: unknown) => caught) as BffRequestError
    expect(error.code).toBe('invalid_response')
    expect(error.message).not.toContain('SQLITE')

    const control = createFetch(() => jsonResponse({ error: { code: 'invalid_credentials', message: `bad\u0000${'x'.repeat(300)}` } }, 401))
    const controlError = await bffRequest(BFF_AUTH_PATHS.login, { method: 'POST', body: {}, fetchImpl: control.fetchImpl })
      .catch((caught: unknown) => caught) as BffRequestError
    expect(controlError.code).toBe('invalid_credentials')
    expect(controlError.message).toBe('登录状态已失效，请重新登录')
  })
})

describe('safe local return path normalization', () => {
  it.each([
    ['/admin', '/admin'],
    ['/admin/events?page=2', '/admin/events?page=2'],
    ['/admin#section', '/admin#section'],
  ])('keeps the local path %s', (input, expected) => {
    expect(safeLocalReturnPath(input)).toBe(expected)
  })

  it.each([
    '/%2f%2fevil.example',
    '/%2F%2Fevil.example',
    '/%252f%252fevil.example',
    '/%5cevil.example',
    '/\\evil.example',
    '/%6cogin',
    '/%6Cogin',
    '/LOGIN',
    '/Login',
    '/login/',
    '/login#x',
    '/login?redirect=/admin',
    '/%6cogin%2f',
    '/admin/../../evil',
    'javascript%3aalert(1)',
    'http%3a%2f%2fevil.example',
    '/admin\u0000',
    '/admin\nSet-Cookie: x=1',
    '/admin\t',
  ])('rejects the encoded or looping target %s', (input) => {
    expect(safeLocalReturnPath(input)).toBeUndefined()
  })

  it('never invents an external origin from a Host-like value', () => {
    expect(safeLocalReturnPath('//next.guatswr.top/admin')).toBeUndefined()
    expect(safeLocalReturnPath('https://next.guatswr.top/admin')).toBeUndefined()
    expect(safeLocalReturnPath('next.guatswr.top/admin')).toBeUndefined()
  })
})
