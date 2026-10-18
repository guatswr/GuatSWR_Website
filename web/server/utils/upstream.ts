/** Resolve only fixed API paths against a private, administrator-set origin. */
export function upstreamUrl(origin: string, path: string): string {
  const base = new URL(origin)
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password
    || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('NUXT_API_BASE must be an HTTP(S) origin without credentials or a path')
  }
  if (!/^\/api\/[a-z0-9/-]+$/i.test(path) || path.includes('//')) {
    throw new Error('Upstream path must be a fixed v1 API path')
  }
  return new URL(path, base).href
}
