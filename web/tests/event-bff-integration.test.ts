import { describe, expect, it, vi } from 'vitest'
import { createBffSessionCore } from '../app/utils/bff-session-core'
import { createEventTransport, EventTransportError, MAX_EVENT_RESPONSE_BYTES } from '../app/utils/event-transport'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

function harness(reply: (input: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { path: string; init: RequestInit }[] = []
  let tokens = 0
  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const path = String(input)
    calls.push({ path, init })
    if (path.endsWith('/auth/csrf')) return json({ csrfToken: `csrf-${++tokens}` })
    return reply(path, init)
  }
  const core = createBffSessionCore({ fetchImpl })
  return { calls, core, transport: createEventTransport({ fetch: fetchImpl, performMutation: core.performMutation }) }
}

describe('event client and real per-app CSRF coordinator', () => {
  it('leaves reads anonymous and refreshes only an explicit pre-write CSRF rejection', async () => {
    const qa = harness((_path, init) => {
      if (init.method === 'GET') return json({ data: null })
      return (init.headers as Record<string, string>)['x-csrf-token'] === 'csrf-2'
        ? json({ id: 27 })
        : json({ error: { code: 'csrf_invalid', message: 'not reflected' } }, 403)
    })
    await expect(qa.transport.readSignup(101)).resolves.toBeNull()
    expect(qa.calls.map(call => call.path)).toEqual(['/api/bff/guest/events/101/signup'])
    await expect(qa.transport.createDraft()).resolves.toEqual({ id: 27 })
    expect(qa.calls.map(call => call.path)).toEqual([
      '/api/bff/guest/events/101/signup', '/api/bff/auth/csrf',
      '/api/bff/guest/events/draft', '/api/bff/auth/csrf', '/api/bff/guest/events/draft',
    ])
    expect(qa.core.csrf.token()).toBe('csrf-2')
  })

  it.each([403, 500])('never retries HTTP %i without an explicit csrf_invalid code', async status => {
    const qa = harness(() => json({ error: { code: 'forbidden', message: 'raw upstream details' } }, status))
    await expect(qa.transport.createDraft()).rejects.toMatchObject({ status })
    expect(qa.calls.filter(call => call.path.endsWith('/draft'))).toHaveLength(1)
    expect(qa.calls.filter(call => call.path.endsWith('/csrf'))).toHaveLength(1)
  })

  it('bounds repeated CSRF rejection at two writes and never retries a lost response', async () => {
    const qa = harness(() => json({ error: { code: 'csrf_invalid' } }, 403))
    await expect(qa.transport.createDraft()).rejects.toMatchObject({ code: 'csrf-invalid' })
    expect(qa.calls.filter(call => call.path.endsWith('/draft'))).toHaveLength(2)
    const broken = harness(() => { throw new TypeError('response lost') })
    await expect(broken.transport.createDraft()).rejects.toMatchObject({ code: 'network' })
    expect(broken.calls.filter(call => call.path.endsWith('/draft'))).toHaveLength(1)
  })

  it('refreshes the actual multipart token without losing file, event or cancellation', async () => {
    const qa = harness(() => json({}))
    const tokens: (Record<string, string> | undefined)[] = []
    const file = new File(['image'], 'visitor.png', { type: 'image/png' })
    const controller = new AbortController()
    const transport = createEventTransport({ performMutation: qa.core.performMutation, upload: async (_url, sent, fields, options) => {
      expect(sent).toBe(file)
      expect(fields).toEqual({ eid: '101' })
      expect(options.signal).toBe(controller.signal)
      tokens.push(options.headers)
      if (tokens.length === 1) throw new EventTransportError('csrf-invalid', 'rejected', 403)
      return { url: '/uploads/avatar.png' }
    } })
    await expect(transport.uploadAvatar(file, 101, { signal: controller.signal })).resolves.toEqual({ url: '/uploads/avatar.png' })
    expect(tokens).toEqual([{ 'x-csrf-token': 'csrf-1' }, { 'x-csrf-token': 'csrf-2' }])
  })

  it('cancels a streamed response when its actual size exceeds the cap', async () => {
    const cancel = vi.fn()
    const qa = harness(() => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(MAX_EVENT_RESPONSE_BYTES + 1)) }, cancel,
    })))
    await expect(qa.transport.readSignup(101)).rejects.toMatchObject({ code: 'unavailable' })
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('enforces the request deadline through response body reading', async () => {
    vi.useFakeTimers()
    try {
      const qa = harness((_path, init) => new Response(new ReadableStream({ start(controller) {
        init.signal!.addEventListener('abort', () => controller.error(new DOMException('timeout', 'AbortError')), { once: true })
      } })))
      const pending = qa.transport.readSignup(101)
      const rejected = expect(pending).rejects.toMatchObject({ code: 'unavailable', message: '请求超时，请重试' })
      await vi.advanceTimersByTimeAsync(15_000)
      await rejected
      expect(qa.calls).toHaveLength(1)
      expect(vi.getTimerCount()).toBe(0)
    } finally { vi.useRealTimers() }
  })
})
