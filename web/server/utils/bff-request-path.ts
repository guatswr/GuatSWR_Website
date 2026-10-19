import type { H3Event } from 'h3'

/**
 * The request path as the client sent it.
 *
 * h3's app handler rewrites `event._path` (and therefore `event.path`) to the
 * remainder after a matched stack-layer route, and Nitro may also rewrite
 * `req.url`. `req.originalUrl`, captured by h3 before any rewriting, is the
 * only reliable value inside a guard layer or a session hook.
 */
export function originalRequestPath(event: H3Event): string {
  const raw = event.node?.req?.originalUrl || event.node?.req?.url || event.path || ''
  const [path = ''] = String(raw).split('?')
  return path
}
