import { describe, expect, it } from 'vitest'
import {
  EVENT_BFF_PATHS,
  EventTransportError,
  createEventTransport,
  isUploadableImage
} from '../app/utils/event-transport'
import type { UploadOptions, UploadSender } from '../app/utils/event-transport'

interface Call {
  url: string
  init: RequestInit
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })

function setup(
  handler: (url: string, init: RequestInit) => Response | Promise<Response> = () =>
    json({ ok: true }),
  upload?: UploadSender
) {
  const calls: Call[] = []
  const fetchImpl: typeof fetch = async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    calls.push({ url, init: init ?? {} })
    return await handler(url, init ?? {})
  }
  const transport = createEventTransport({
    fetch: fetchImpl,
    upload:
      upload ??
      (async () => {
        throw new Error('unexpected upload')
      }),
    getHeaders: () => ({ 'x-csrf-token': 'csrf-1' })
  })
  return { transport, calls }
}

const bodyOf = (call: Call | undefined): unknown =>
  typeof call?.init.body === 'string' ? JSON.parse(call.init.body) : undefined

describe('guest event transport', () => {
  it('uses the proposed BFF paths, JSON bodies and injected headers only', async () => {
    const { transport, calls } = setup((url) => {
      if (url.endsWith('/draft')) return json({ id: 27 })
      if (url.endsWith('/signup')) return json({ data: { id: 3, common_id: '⑨', qq: '1', avatar: '/a.png' } })
      return json({ message: '保存成功' })
    })

    await expect(transport.createDraft()).resolves.toEqual({ id: 27 })
    expect(calls[0]?.url).toBe(EVENT_BFF_PATHS.guestDraft)
    expect(calls[0]?.init.method).toBe('POST')
    expect(calls[0]?.init.credentials).toBe('same-origin')
    expect(calls[0]?.init.redirect).toBe('error')
    const headers = calls[0]?.init.headers as Record<string, string>
    expect(headers.accept).toBe('application/json')
    expect(headers['x-csrf-token']).toBe('csrf-1')
    // No token layer of our own: never an Authorization header.
    expect(Object.keys(headers).map((name) => name.toLowerCase())).not.toContain('authorization')

    const payload = { type: 'STG', title: '比赛', content: { rules: '规则' } }
    await transport.saveDraft(27, { ...payload, submit: true })
    expect(calls[1]?.url).toBe('/api/bff/guest/events/27')
    expect(calls[1]?.init.method).toBe('PUT')
    expect(bodyOf(calls[1])).toEqual({ ...payload, submit: true })

    const record = await transport.readSignup(27)
    expect(calls[2]?.url).toBe('/api/bff/guest/events/27/signup')
    expect(calls[2]?.init.method).toBe('GET')
    expect(record?.common_id).toBe('⑨')

    await transport.saveSignup(27, {
      common_id: '⑨',
      qq: '1',
      avatar: '/a.png',
      machine_sign: '',
      pilot_source: '桂航'
    })
    expect(calls[3]?.init.method).toBe('POST')
    expect(bodyOf(calls[3])).toEqual({
      common_id: '⑨',
      qq: '1',
      avatar: '/a.png',
      machine_sign: '',
      pilot_source: '桂航'
    })

    await transport.deleteSignup(27)
    expect(calls[4]?.init.method).toBe('DELETE')
  })

  it('refuses to publish from a guest transport', async () => {
    const { transport, calls } = setup()
    await expect(
      transport.publishEvent({ type: 'STG', title: 'x', content: {} } as never)
    ).rejects.toMatchObject({ code: 'forbidden' })
    expect(calls).toHaveLength(0)
  })

  it('maps statuses to typed errors and never retries a mutation', async () => {
    const mapping = [
      [401, 'unauthenticated'],
      [403, 'forbidden'],
      [404, 'not-found'],
      [409, 'invalid'],
      [500, 'unavailable']
    ] as const
    for (const [status, code] of mapping) {
      const { transport, calls } = setup(() => json({ message: 'no' }, status))
      const error = await transport
        .saveDraft(7, { type: 'STG', title: 'x', content: {}, submit: false })
        .catch((reason: unknown) => reason)
      expect(error).toBeInstanceOf(EventTransportError)
      expect((error as EventTransportError).code).toBe(code)
      expect((error as EventTransportError).status).toBe(status)
      expect(calls).toHaveLength(1)
    }

    const { transport, calls } = setup(() => {
      throw new TypeError('fetch failed')
    })
    await expect(
      transport.saveDraft(7, { type: 'STG', title: 'x', content: {}, submit: false })
    ).rejects.toMatchObject({ code: 'network' })
    expect(calls).toHaveLength(1)
  })

  it('rejects invalid signup input locally without a request', async () => {
    const { transport, calls } = setup()
    await expect(
      transport.saveSignup(1, { common_id: '', qq: '', avatar: '' } as never)
    ).rejects.toMatchObject({ code: 'invalid' })
    expect(calls).toHaveLength(0)
  })

  it('shares one draft id between the avatar upload and the submission', async () => {
    const uploads: { url: string; fields: Record<string, string> }[] = []
    const upload: UploadSender = async (url, _file, fields) => {
      uploads.push({ url, fields })
      return { url: '/uploads/img/avatar.png' }
    }
    const { transport, calls } = setup((url) => {
      if (url.endsWith('/draft')) return json({ id: 27 })
      return json({ message: '保存成功' })
    }, upload)

    const session = transport.draftSession()
    const id = await session.ensureId()
    const result = await transport.uploadAvatar(
      new File(['x'], 'avatar.png', { type: 'image/png' }),
      id
    )
    expect(result.url).toBe('/uploads/img/avatar.png')
    expect(uploads[0]?.url).toBe(EVENT_BFF_PATHS.guestUploadAvatar)
    expect(uploads[0]?.fields).toEqual({ eid: '27' })

    const submitted = await transport.submit(
      { type: 'STG', title: '比赛', content: { rules: '规则' } },
      { eventId: null, isAdmin: false, draftSession: session }
    )
    expect(submitted.id).toBe(27)
    expect(calls.map((call) => `${call.init.method} ${call.url}`)).toEqual([
      'POST /api/bff/guest/events/draft',
      'PUT /api/bff/guest/events/27'
    ])
    expect(bodyOf(calls[1])).toMatchObject({ submit: true })
  })

  it('forwards progress hooks and abort signals to the uploader', async () => {
    let received: UploadOptions | undefined
    const upload: UploadSender = async (_url, _file, _fields, options) => {
      received = options
      options.onProgress?.({ loaded: 5, total: 10, percent: 50 })
      return { url: '/uploads/img/a.png' }
    }
    const { transport } = setup(() => json({}), upload)
    const controller = new AbortController()
    const percents: number[] = []
    await transport.uploadContent(new File(['x'], 'a.png', { type: 'image/png' }), 9, {
      signal: controller.signal,
      onProgress: (progress) => percents.push(progress.percent)
    })
    expect(received?.signal).toBe(controller.signal)
    expect(received?.headers).toEqual({ 'x-csrf-token': 'csrf-1' })
    expect(percents).toEqual([50])
  })
})

describe('upload guard', () => {
  it('accepts the archived formats up to 50 MB and nothing else', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'])
      expect(isUploadableImage(new File(['x'], 'a', { type }))).toBe(true)
    expect(isUploadableImage(new File(['x'], 'a', { type: 'application/pdf' }))).toBe(false)
    expect(isUploadableImage(new File(['x'], 'a', { type: '' }))).toBe(false)
    const big = new File(['x'], 'big.png', { type: 'image/png' })
    Object.defineProperty(big, 'size', { value: 50 * 1024 * 1024 + 1 })
    expect(isUploadableImage(big)).toBe(false)
  })
})
