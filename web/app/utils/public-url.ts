/**
 * Crawler metadata may only point at this site's own origin. Configured values
 * are local upload paths, so anything that is not a plain same-origin path is
 * rejected instead of being reflected into an absolute URL.
 */

/** C0 controls and DEL: never valid in a same-origin upload path. */
const hasControlCharacter = (value: string): boolean => {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}
const ENCODED_DOT = /%2e/i

export function safeLocalPath(value: unknown): string {
  if (typeof value !== 'string') return ''
  const path = value.trim()
  if (!path.startsWith('/') || path.startsWith('//')) return ''
  if (path.includes('\\') || hasControlCharacter(path)) return ''
  const pathname = path.split(/[?#]/)[0] ?? ''
  if (ENCODED_DOT.test(pathname)) return ''
  for (const segment of pathname.split('/')) {
    if (segment === '.' || segment === '..') return ''
  }
  return path
}

/** Absolute URL for a local path, or '' when the value is not safe to publish. */
export function absoluteLocalUrl(value: unknown, origin: string): string {
  const path = safeLocalPath(value)
  if (!path || !origin) return ''
  try {
    return new URL(path, origin).href
  } catch {
    return ''
  }
}
