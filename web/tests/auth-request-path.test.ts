import { describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'
import { originalRequestPath } from '../server/utils/bff-request-path'

// h3 rewrites `event.path` for a matched stack layer, so the auth guard and
// session hooks must read the original URL. These cases pin that behavior
// without booting Nuxt.

function eventLike(value: unknown): H3Event {
  return value as H3Event
}

describe('original request path', () => {
  it('prefers the original URL captured before h3 rewrote the layer path', () => {
    expect(originalRequestPath(eventLike({
      path: '/session',
      node: { req: { originalUrl: '/api/_auth/session?x=1', url: '/session' } },
    }))).toBe('/api/_auth/session')
  })

  it('falls back to req.url when originalUrl is absent', () => {
    expect(originalRequestPath(eventLike({ node: { req: { url: '/api/bff/auth/login' } } }))).toBe('/api/bff/auth/login')
  })

  it('falls back to event.path and strips any query string', () => {
    expect(originalRequestPath(eventLike({ path: '/api/_auth/session?probe=1' }))).toBe('/api/_auth/session')
    expect(originalRequestPath(eventLike({ path: '/api/bff/auth/session' }))).toBe('/api/bff/auth/session')
  })

  it('never returns a value that could match the guarded namespace by accident', () => {
    for (const value of [undefined, null, 0, {}]) {
      const path = originalRequestPath(eventLike({ node: { req: value } }))
      expect(path === '/api/_auth' || path.startsWith('/api/_auth/')).toBe(false)
    }
  })
})
