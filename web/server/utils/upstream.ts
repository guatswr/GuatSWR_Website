/**
 * Resolve and validate one private, administrator-set origin; browsers never
 * supply it. Exported so cache composition can fail closed *before* a warm
 * cache entry is consulted.
 */
export const assertUpstreamOrigin = (origin: string): URL => {
  const base = new URL(origin)
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password
    || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('NUXT_API_BASE must be an HTTP(S) origin without credentials or a path')
  }
  return base
}

/** Resolve only fixed API paths against a private, administrator-set origin. */
export function upstreamUrl(origin: string, path: string): string {
  const base = assertUpstreamOrigin(origin)
  if (!/^\/api\/[a-z0-9/_-]+$/i.test(path) || path.includes('//')) {
    throw new Error('Upstream path must be a fixed v1 API path')
  }
  return new URL(path, base).href
}

/** Extensions accepted by the frozen upload middleware (`middlewares/upload.js`). */
export const UPLOAD_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'] as const

const MAX_UPLOAD_PATH_LENGTH = 400
const MAX_UPLOAD_SEGMENTS = 10

const decodeUploadSegment = (segment: string): string => {
  let decoded: string
  try {
    decoded = decodeURIComponent(segment)
  }
  catch {
    throw new Error('Uploads path must be valid percent-encoding')
  }
  if (!decoded || decoded === '.' || decoded === '..') {
    throw new Error('Uploads path must not traverse directories')
  }
  if (/[/\\\p{Cc}]/u.test(decoded)) {
    throw new Error('Uploads path must not contain separators or control characters')
  }
  return decoded
}

/**
 * Resolve one browser `/uploads/**` request onto the private origin. Encoded
 * separators, traversal segments, unknown extensions and over-long paths are
 * rejected before any upstream request is made, so the image proxy can only
 * ever read the legacy upload tree it is meant to expose.
 */
export function uploadAssetUrl(origin: string, requestPath: string): string {
  const base = assertUpstreamOrigin(origin)
  if (requestPath.length > MAX_UPLOAD_PATH_LENGTH) throw new Error('Uploads path is too long')
  const match = /^\/uploads\/(.+)$/.exec(requestPath)
  if (!match) throw new Error('Uploads path must start with /uploads/')
  const raw = match[1] ?? ''
  if (/[\\?#\p{Cc}]/u.test(raw)) throw new Error('Uploads path must not contain query, fragment or backslash')
  const rawSegments = raw.split('/')
  if (rawSegments.length > MAX_UPLOAD_SEGMENTS) throw new Error('Uploads path is too deep')
  const segments = rawSegments.map(decodeUploadSegment)
  const filename = (segments[segments.length - 1] ?? '').toLowerCase()
  if (!UPLOAD_IMAGE_EXTENSIONS.some(extension => filename.endsWith(extension))) {
    throw new Error('Uploads path must reference an approved image file')
  }
  return new URL(`/uploads/${segments.map(encodeURIComponent).join('/')}`, base).href
}

/** Safe variant for request handlers: rejected paths resolve to `null`. */
export function uploadAssetUrlOrNull(origin: string, requestPath: string): string | null {
  try {
    return uploadAssetUrl(origin, requestPath)
  }
  catch {
    return null
  }
}
