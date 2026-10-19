import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  GUEST_MAX_JSON_BYTES,
  assertSignupOpen,
  createGuestUpstream,
  guestDraftStore,
  isSafeUploadUrl,
  parseGuestDraftSave,
  projectDraftId,
  projectSavedEvent,
  projectSignupRecord,
  projectUpload,
  resolveGuestOperation
} from '../server/utils/guest-bff'
import { createGuestDraftStore } from '../server/utils/guest-drafts'
import type { BffRuntime } from '../server/utils/bff-auth-context'

/**
 * Guest BFF boundary tests.
 *
 * They exercise the real modules with dependency injection (a recording `fetch`,
 * a streaming `Response`, a mock runtime shape) and never contact a network.
 * They import the auth batch's helpers, so they run after central integration.
 */

const runtimeShape = (csrfKey = createHmac('sha256', 'secret-a').digest(), store: object = {}) =>
  ({ csrfKey, store, config: { upstreamTimeoutMs: 8_000 } }) as unknown as BffRuntime

interface Call {
  url: string
  init: RequestInit
}

const recordingFetch = (responses: Array<Response | (() => Response)>) => {
  const calls: Call[] = []
  const impl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    calls.push({ url, init: init ?? {} })
    const next = responses.shift()
    if (!next) throw new Error('unexpected upstream call')
    return typeof next === 'function' ? next() : next
  }
  return { impl, calls }
}

describe('closed operation map', () => {
  it('maps every guest operation onto its exact frozen route and verb', () => {
    expect(resolveGuestOperation({ name: 'draft' })).toEqual({
      method: 'POST',
      path: '/api/event/draft'
    })
    expect(resolveGuestOperation({ name: 'save', id: 27 })).toEqual({
      method: 'PUT',
      path: '/api/event/27'
    })
    expect(resolveGuestOperation({ name: 'eventRead', id: 27 })).toEqual({
      method: 'GET',
      path: '/api/event/27'
    })
    expect(resolveGuestOperation({ name: 'signupRead', id: 27 })).toEqual({
      method: 'GET',
      path: '/api/event/27/signup'
    })
    expect(resolveGuestOperation({ name: 'signupSave', id: 27 })).toEqual({
      method: 'POST',
      path: '/api/event/27/signup'
    })
    expect(resolveGuestOperation({ name: 'signupDelete', id: 27 })).toEqual({
      method: 'DELETE',
      path: '/api/event/27/signup'
    })
    expect(resolveGuestOperation({ name: 'uploadContent' })).toEqual({
      method: 'POST',
      path: '/api/upload_visitor'
    })
    expect(resolveGuestOperation({ name: 'uploadAvatar' })).toEqual({
      method: 'POST',
      path: '/api/upload_visitor/avatar'
    })
  })

  it('never builds an arbitrary path or verb from hostile ids', async () => {
    for (const id of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 2,
      1e21
    ]) {
      expect(() => resolveGuestOperation({ name: 'save', id: id as number })).toThrow()
    }
    // A missing id is rejected instead of defaulting to /api/event/0.
    expect(() => resolveGuestOperation({ name: 'save' })).toThrow()
    // `Number(true)` style coercion must not slip through either.
    expect(() => resolveGuestOperation({ name: 'save', id: true as unknown as number })).toThrow()
  })

  it('reaches the frozen route through the injected transport and rejects hostile paths', async () => {
    const { impl, calls } = recordingFetch([() => new Response('{"id":12}', { status: 200 })])
    const upstream = createGuestUpstream({ origin: 'http://127.0.0.1:8080', fetch: impl })
    const response = await upstream.request({
      operation: { name: 'draft' },
      clientIp: '203.0.113.5'
    })
    expect(response.status).toBe(200)
    expect(calls[0]?.url).toBe('http://127.0.0.1:8080/api/event/draft')
    expect(calls[0]?.init.method).toBe('POST')
    expect(calls[0]?.init.redirect).toBe('manual')
    const headers = calls[0]?.init.headers as Record<string, string>
    expect(headers['x-forwarded-for']).toBe('203.0.113.5')
    expect(Object.keys(headers).map((name) => name.toLowerCase())).not.toContain('cookie')
    expect(Object.keys(headers).map((name) => name.toLowerCase())).not.toContain('origin')

    const hostile = createGuestUpstream({
      origin: 'http://127.0.0.1:8080',
      fetch: async () => {
        throw new Error('hostile request must never reach the network')
      }
    })
    await expect(
      hostile.request({
        operation: { name: 'save', id: 0 },
        clientIp: '203.0.113.5'
      })
    ).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('upstream response boundary', () => {
  it('cancels a chunked oversize body before buffering it', async () => {
    let cancelled = false
    const chunk = new Uint8Array(16 * 1024)
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(chunk)
      },
      cancel() {
        cancelled = true
      }
    })
    const upstream = createGuestUpstream({
      origin: 'http://127.0.0.1:8080',
      fetch: async () => new Response(stream, { status: 200 }),
      maxResponseBytes: 64 * 1024
    })
    await expect(
      upstream.request({ operation: { name: 'draft' }, clientIp: '203.0.113.5' })
    ).rejects.toMatchObject({ statusCode: 502 })
    expect(cancelled).toBe(true)
  })

  it('treats an unparseable success body, invalid UTF-8 and redirects as upstream failures', async () => {
    const cases: Array<() => Response> = [
      () => new Response('not json', { status: 200 }),
      () => new Response(new Uint8Array([0xff, 0xfe, 0xfd]), { status: 200 }),
      () => new Response(null, { status: 302, headers: { location: 'http://evil.example' } })
    ]
    for (const make of cases) {
      const upstream = createGuestUpstream({
        origin: 'http://127.0.0.1:8080',
        fetch: async () => make()
      })
      await expect(
        upstream.request({ operation: { name: 'draft' }, clientIp: '203.0.113.5' })
      ).rejects.toMatchObject({ statusCode: 502 })
    }
  })

  it('aborts a stalled response once the deadline passes', async () => {
    const upstream = createGuestUpstream({
      origin: 'http://127.0.0.1:8080',
      timeoutMs: 5,
      fetch: (async (_input: unknown, init?: RequestInit) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
        })) as typeof fetch
    })
    await expect(
      upstream.request({ operation: { name: 'draft' }, clientIp: '203.0.113.5' })
    ).rejects.toMatchObject({ statusCode: 502 })
  })

  it('bounds the JSON request body it is willing to send', async () => {
    const { impl, calls } = recordingFetch([() => new Response('{}', { status: 200 })])
    const upstream = createGuestUpstream({ origin: 'http://127.0.0.1:8080', fetch: impl })
    const body = { type: 'STG', title: 'x', content: { copy: 'y'.repeat(GUEST_MAX_JSON_BYTES) } }
    await upstream.request({ operation: { name: 'save', id: 5 }, clientIp: '203.0.113.5', body })
    expect(typeof calls[0]?.init.body).toBe('string')
    expect((calls[0]?.init.body as string).length).toBeGreaterThan(GUEST_MAX_JSON_BYTES)
  })
})

describe('output projections', () => {
  it('accepts only safe positive draft ids', () => {
    expect(projectDraftId({ id: 12 })).toBe(12)
    for (const payload of [{ id: true }, { id: '12' }, { id: 0 }, { id: 1.5 }, { id: null }, {}]) {
      expect(() => projectDraftId(payload)).toThrow()
    }
  })

  it('never echoes the upstream message and always projects signup self-data', () => {
    expect(projectSavedEvent(27)).toEqual({ id: 27, message: '保存成功' })
    expect(
      projectSignupRecord({
        data: {
          id: 3,
          common_id: '⑨',
          qq: '1',
          avatar: '/uploads/a.png',
          machine_sign: '冰',
          pilot_source: '桂航'
        }
      })
    ).toEqual({
      data: {
        id: 3,
        common_id: '⑨',
        qq: '1',
        avatar: '/uploads/a.png',
        machine_sign: '冰',
        pilot_source: '桂航'
      }
    })
    // No signup yet is a legitimate null, a malformed row is a 502.
    expect(projectSignupRecord({ data: null })).toEqual({ data: null })
    expect(() => projectSignupRecord({ data: { id: 'nope' } })).toThrow()
    expect(() => projectSignupRecord({ nope: true })).not.toThrow()
  })

  it('rejects unsafe upload URLs and keeps only same-origin image paths', () => {
    expect(isSafeUploadUrl('/uploads/img/events/1/a.png')).toBe(true)
    expect(projectUpload({ url: '/uploads/img/events/1/a.svg' })).toEqual({
      url: '/uploads/img/events/1/a.svg'
    })
    for (const url of [
      'http://127.0.0.1:8080/uploads/a.png',
      '//evil.example/uploads/a.png',
      '/uploads/../secret.png',
      '/uploads/%2e%2e/secret.png',
      '/uploads/%2fetc/passwd.png',
      '/uploads/a\\b.png',
      '/uploads/a.png?x=1',
      '/uploads/a.png#f',
      '/uploads/user:pass@host/a.png',
      '/uploads/a.txt',
      '/other/a.png'
    ]) {
      expect(isSafeUploadUrl(url), url).toBe(false)
      expect(() => projectUpload({ url }), url).toThrow()
    }
  })
})

describe('guest draft payload schema', () => {
  const payload = (type: string, content: Record<string, unknown>) => ({
    type,
    title: '标题',
    content,
    submit: true
  })

  it('accepts the payloads the guest form actually builds', () => {
    const accepted = [
      payload('悬赏令', {
        initiator: { id: '⑨', qq: '1', avatar: '/uploads/a.png' },
        challenge: '一命通关',
        requirements: '直播',
        reward: '吧唧',
        limit: '一次',
        deadline: '2026-11-01T14:00'
      }),
      payload('对赌协议', {
        a: { id: 'A', qq: '1', avatar: '/a.png', goal: '通关' },
        b: { id: 'B', qq: '2', avatar: '/b.png', goal: '一命' },
        penalty: '画画',
        deadline: '2026-11-01T14:00',
        proof_image: '/p.png'
      }),
      payload('对赌协议', { a: { id: 'A', avatar: '/a.png' }, b: null, penalty: '画画' }),
      payload('STG', { copy: '比赛', cover: '/c.png', time: '2026-11-01T14:00', rules: '双败' }),
      payload('则则', { copy: '比赛', rules: '双败', prizes: '纪念品', notes: '自带设备' }),
      payload('线下聚会', { cover: '/p.png', time: '下周六', location: '食堂', gather_type: '返校聚餐' })
    ]
    for (const body of accepted) {
      expect(() => parseGuestDraftSave(body), JSON.stringify(body)).not.toThrow()
    }
  })

  it('rejects protected, unknown, oversized and unrequired content', () => {
    const rejected: unknown[] = [
      payload('STG', { copy: 'x', results: [{ rank: 1, id: 'A' }] }),
      payload('STG', { copy: 'x', completion: { id: 'A' } }),
      payload('STG', { copy: 'x', status: 'published' }),
      payload('STG', { copy: 'x', created_by: 'admin' }),
      payload('STG', { copy: 'x', settlement: { paid: true } }),
      payload('STG', { copy: 'x', visitor_ip: '1.2.3.4' }),
      payload('STG', { copy: 'x', unknown_future_field: 1 }),
      payload('悬赏令', { initiator: { id: '⑨', avatar: '/a.png', role: 'admin' }, reward: '吧唧' }),
      payload('STG', { copy: 'x'.repeat(6_000) }),
      payload('STG', { copy: 'x', nested: { a: { b: { c: { d: 1 } } } } }),
      { ...payload('STG', { copy: 'x' }), submit: false },
      { ...payload('STG', { copy: 'x' }), status: 'published' },
      { ...payload('STG', { copy: 'x' }), type: 'nope' },
      { ...payload('STG', { copy: 'x' }), title: '   ' },
      payload('悬赏令', { challenge: 'x' }),
      payload('对赌协议', { a: { id: 'A' }, penalty: 'x' })
    ]
    for (const body of rejected) {
      expect(() => parseGuestDraftSave(body), JSON.stringify(body)).toThrow()
    }
  })
})

describe('signup rules', () => {
  const snapshot = (content: Record<string, unknown>, status = 'published', type = 'STG') => ({
    id: 1,
    type,
    status,
    content
  })

  it('only gates on an explicit, parseable deadline', () => {
    const now = Date.parse('2026-11-01T00:00:00+08:00')
    // The frozen `time` is the activity time: a past activity time never blocks signup.
    expect(() => assertSignupOpen(snapshot({ time: '2020-01-01T00:00' }), now)).not.toThrow()
    expect(() => assertSignupOpen(snapshot({ end_time: '2020-01-01T00:00' }), now)).not.toThrow()
    expect(() => assertSignupOpen(snapshot({ deadline: '2026-11-02T00:00' }), now)).not.toThrow()
    expect(() => assertSignupOpen(snapshot({ deadline: '2026-10-31T00:00' }), now)).toThrow()
    expect(() => assertSignupOpen(snapshot({ deadline: '下周六' }), now)).not.toThrow()
  })

  it('keeps the frozen type and status rules', () => {
    expect(() => assertSignupOpen(snapshot({}, 'published', '悬赏令'))).toThrow()
    expect(() => assertSignupOpen(snapshot({}, 'pending'))).toThrow()
    expect(() => assertSignupOpen(snapshot({}, 'ended'))).toThrow()
    expect(() => assertSignupOpen(snapshot({}, 'ongoing', '则则'))).not.toThrow()
  })
})

describe('draft store identity', () => {
  it('reuses one store for separate runtime wrappers with stable components', () => {
    const csrfKey = createHmac('sha256', 'stable-secret').digest()
    const sessionStore = { name: 'stable-store' }
    const first = guestDraftStore(runtimeShape(csrfKey, sessionStore), 'http://127.0.0.1:8080')
    const second = guestDraftStore(runtimeShape(csrfKey, sessionStore), 'http://127.0.0.1:8080')
    expect(second).toBe(first)
  })

  it('isolates stores by origin and by derived key', () => {
    const sessionStore = { name: 'stable-store' }
    const csrfKey = createHmac('sha256', 'stable-secret').digest()
    const base = guestDraftStore(runtimeShape(csrfKey, sessionStore), 'http://127.0.0.1:8080')
    const otherOrigin = guestDraftStore(runtimeShape(csrfKey, sessionStore), 'http://127.0.0.1:9090')
    expect(otherOrigin).not.toBe(base)
    const otherKey = guestDraftStore(
      runtimeShape(createHmac('sha256', 'another-secret').digest(), sessionStore),
      'http://127.0.0.1:8080'
    )
    expect(otherKey).not.toBe(base)
  })

  it('keeps the store factory independent of the store implementation contract', () => {
    const store = createGuestDraftStore(createHmac('sha256', 'k').digest(), { maxRecords: 2 })
    expect(store.size()).toBe(0)
  })
})
