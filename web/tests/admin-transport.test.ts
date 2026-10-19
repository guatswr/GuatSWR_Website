import { describe, expect, it, vi } from 'vitest'
import { adminRequestPath, createAdminTransport } from '../app/utils/admin-transport'
import { createBffSessionCore } from '../app/utils/bff-session-core'
import { BffRequestError } from '../app/utils/bff-client'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const user = { id: 1, username: 'admin', role: 'super_admin', avatar: null }
function harness(resource: (path: string, init: RequestInit) => Promise<Response> | Response) {
  let tokens = 0
  const requests: { path: string; init: RequestInit }[] = []
  const send = vi.fn(async (url: RequestInfo | URL, init: RequestInit = {}) => {
    const path = String(url)
    requests.push({ path, init })
    if (path === '/api/bff/auth/session') return json({ authenticated: true, user, twofaEnabled: false, expiresAt: Date.now() + 60_000 })
    if (path === '/api/bff/auth/csrf') return json({ csrfToken: `csrf-${++tokens}`, expiresIn: 7200 })
    if (path === '/api/bff/auth/logout') return json({ loggedOut: true })
    return resource(path, init)
  })
  const clear = vi.fn()
  const session = createBffSessionCore({ fetchImpl: send, onSessionLost: clear })
  return { session, api: createAdminTransport(session, send), requests, clear }
}

describe('private browser boundary', () => {
  it('builds only closed paths and rejects injected resources, actions, ids and query keys', () => {
    expect(adminRequestPath({ resource: 'members', query: { includeDeleted: false } })).toBe('/api/bff/admin/members?includeDeleted=0')
    expect(adminRequestPath({ resource: 'events', id: 8, action: 'approve', method: 'POST' })).toBe('/api/bff/admin/events/8/approve')
    for (const request of [
      { resource: '../auth/login' }, { resource: 'members', id: -1 },
      { resource: 'members', query: { origin: 'https://evil.example' } },
      { resource: 'members', id: 1, method: 'POST', action: 'approve' },
      { resource: 'events', id: 1, method: 'GET', action: 'approve' },
    ]) expect(() => adminRequestPath(request as Parameters<typeof adminRequestPath>[0])).toThrow()
  })

  it('uses the cookie and in-memory CSRF header, never browser Authorization', async () => {
    const { api, requests } = harness(() => json({ id: 3, private: 'discarded' }))
    expect(await api.request({ resource: 'members', method: 'POST', body: { name: '琪露诺' } }, value => {
      if (!value || typeof value !== 'object' || !('id' in value)) throw new Error('invalid')
      return { id: value.id }
    })).toEqual({ id: 3 })
    const request = requests.find(item => item.path === '/api/bff/admin/members')!
    expect(request.init.credentials).toBe('same-origin')
    expect(request.init.redirect).toBe('error')
    expect(new Headers(request.init.headers).get('authorization')).toBeNull()
    expect(new Headers(request.init.headers).get('x-csrf-token')).toBe('csrf-1')
  })

  it('retries exactly one explicit pre-write CSRF rejection with a fresh token', async () => {
    let calls = 0
    const { api, requests } = harness(() => ++calls === 1 ? json({ error: { code: 'csrf_invalid' } }, 403) : json({ message: 'ok' }))
    await api.request({ resource: 'history', method: 'POST', body: {} }, value => value)
    expect(calls).toBe(2)
    expect(requests.filter(item => item.path === '/api/bff/admin/history').map(item => new Headers(item.init.headers).get('x-csrf-token'))).toEqual(['csrf-1', 'csrf-2'])
  })

  it.each([500, 403])('does not replay an indeterminate write or ordinary denial (%s)', async status => {
    let calls = 0
    const { api } = harness(() => { calls++; return json({ error: { code: 'forbidden', message: 'private diagnostic' } }, status) })
    await expect(api.request({ resource: 'members', method: 'POST' }, value => value))
      .rejects.toThrow(status === 403 ? '权限不足' : '操作失败')
    expect(calls).toBe(1)
  })

  it('clears private state on a real resource 401, keeping a normal 403 authenticated', async () => {
    const denied = harness(() => json({ error: { code: 'forbidden' } }, 403))
    await denied.session.refresh()
    await expect(denied.api.request({ resource: 'users' }, value => value)).rejects.toMatchObject({ status: 403 })
    expect(denied.session.getSnapshot().status).toBe('authenticated')
    expect(denied.clear).not.toHaveBeenCalled()
    const expired = harness(() => json({ error: { code: 'session_expired' } }, 401))
    await expired.session.refresh()
    await expect(expired.api.request({ resource: 'members' }, value => value)).rejects.toMatchObject({ status: 401 })
    expect(expired.session.getSnapshot().status).toBe('anonymous')
    expect(expired.clear).toHaveBeenCalledOnce()
  })

  it('rejects a delayed private result after logout begins', async () => {
    let resolve!: (response: Response) => void
    let started!: () => void
    const ready = new Promise<void>(done => { started = done })
    const { api, session } = harness(() => { started(); return new Promise<Response>(done => { resolve = done }) })
    await session.refresh()
    const pending = api.request({ resource: 'members' }, value => value)
    const rejected = expect(pending).rejects.toBeInstanceOf(BffRequestError)
    await ready
    await session.logout()
    resolve(json([{ name: 'old private data' }]))
    await rejected
    expect(session.getSnapshot().status).toBe('anonymous')
  })

  it('rejects oversized streamed JSON before projecting private data', async () => {
    const { api } = harness(() => new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(4 * 1024 * 1024 + 1)); controller.close()
    } })))
    const project = vi.fn()
    await expect(api.request({ resource: 'activities' }, project)).rejects.toMatchObject({ code: 'invalid_response' })
    expect(project).not.toHaveBeenCalled()
  })

  it('sends multipart with a generated boundary and a fixed upload route', async () => {
    const { api, requests } = harness(() => json({ url: '/uploads/p.png' }))
    expect(await api.upload(new File(['png'], 'p.png', { type: 'image/png' }))).toBe('/uploads/p.png')
    const request = requests.find(item => item.path === '/api/bff/admin/upload')!
    expect(request.init.body).toBeInstanceOf(FormData)
    expect(new Headers(request.init.headers).has('content-type')).toBe(false)
    expect(new Headers(request.init.headers).get('x-csrf-token')).toBe('csrf-1')
  })
})
