/**
 * Image sources the public pages may render.
 *
 * The deployed CSP is `img-src 'self' data:`, and the archived backend stores
 * relative `/uploads/...` paths. Accepting an arbitrary absolute origin here
 * would produce a browser-blocked image plus a CSP violation on every render,
 * so only same-origin paths and validated thumbnail paths are returned.
 * Markdown images are additionally validated by the shared sanitizer.
 */
import { safeImageSrc } from '#shared/markdown'
import { getThumbUrl } from './image-url'

/** Same-origin image path, or `null` when it cannot be rendered safely. */
export function displayImageSource(value: string | null | undefined): string | null {
  const source = safeImageSrc(value ?? '')
  if (!source) return null
  return source.startsWith('/') && !source.startsWith('//') ? source : null
}

/** Archived thumbnail naming (`-thumb.webp`), revalidated before use. */
export function displayThumbSource(value: string | null | undefined): string | null {
  const source = displayImageSource(value)
  return source ? displayImageSource(getThumbUrl(source)) : null
}

/** True when the control should render an image at all. */
export function hasDisplayImage(value: string | null | undefined): boolean {
  return displayImageSource(value) !== null
}
