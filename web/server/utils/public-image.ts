import { createError } from 'h3'

/**
 * Pure helpers for the `/uploads/**` read proxy. They are kept separate from
 * the route so the extension/content-type allowlist, the redirect policy, the
 * byte cap and the response headers can be unit tested without an HTTP event.
 */

/** Content types the proxy relays, keyed by the approved legacy extension. */
export const PUBLIC_IMAGE_CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}

/** Matches the frozen upload middleware limit (`middlewares/upload.js`, 50 MB). */
export const PUBLIC_IMAGE_MAX_BYTES = 50 * 1024 * 1024
export const PUBLIC_IMAGE_CACHE_SECONDS = 3_600
export const PUBLIC_IMAGE_TIMEOUT_MS = 8_000

/** A directly navigated SVG must not run scripts or load subresources. */
export const PUBLIC_IMAGE_SVG_CSP = "sandbox; default-src 'none'; style-src 'unsafe-inline'"

export const publicImageNotFound = () => createError({ statusCode: 404, statusMessage: 'Not Found' })

export const publicImageUnavailable = () => createError({
  statusCode: 502,
  statusMessage: 'Image upstream unavailable',
})

const extensionOf = (pathname: string): string => {
  const filename = pathname.slice(pathname.lastIndexOf('/') + 1).toLowerCase()
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.slice(dot)
}

/** Expected content type for a request path, or null when it is not servable. */
export const imageContentType = (pathname: string): string | null =>
  PUBLIC_IMAGE_CONTENT_TYPES[extensionOf(pathname)] ?? null

/** Type spoofing is rejected: the upstream type must match the extension family. */
export const matchesImageContentType = (declared: string, expected: string): boolean =>
  declared.split(';')[0]?.trim().toLowerCase() === expected

/**
 * Enforce the byte cap while streaming instead of buffering the whole body.
 * Exceeding the cap cancels the upstream body, and a downstream cancel (client
 * disconnect, aborted response) is propagated so the source is released.
 */
export const capImageStream = (
  source: ReadableStream<Uint8Array>,
  limit: number = PUBLIC_IMAGE_MAX_BYTES,
): ReadableStream<Uint8Array> => {
  const reader = source.getReader()
  let total = 0
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read()
      if (done) {
        controller.close()
        return
      }
      total += value.byteLength
      if (total > limit) {
        await reader.cancel().catch(() => {})
        controller.error(new Error('Upstream image exceeds the public size limit'))
        return
      }
      controller.enqueue(value)
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => {})
    },
  })
}

export const publicImageHeaders = (contentType: string): Record<string, string> => ({
  'cache-control': `public, max-age=${PUBLIC_IMAGE_CACHE_SECONDS}`,
  'content-type': contentType,
  'x-content-type-options': 'nosniff',
  ...(contentType === 'image/svg+xml' ? { 'content-security-policy': PUBLIC_IMAGE_SVG_CSP } : {}),
})

export interface PublicImageUpstream {
  contentType: string
  bytes: ReadableStream<Uint8Array>
}

/**
 * Read one validated image from the private origin. Only a fixed `Accept`
 * header is sent (never browser credentials), redirects are denied, the
 * declared type must match the approved extension family, and the body is
 * streamed through the byte cap.
 */
export const fetchPublicImage = async (
  url: string,
  expectedType: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PublicImageUpstream> => {
  let response: Response
  try {
    response = await fetchImpl(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(PUBLIC_IMAGE_TIMEOUT_MS),
      headers: { accept: 'image/*' },
    })
  }
  catch {
    throw publicImageUnavailable()
  }
  // Rejected headers never read the body; release the upstream socket instead.
  const rejectWith = (error: Error): Error => {
    void response.body?.cancel().catch(() => {})
    return error
  }

  if (response.status === 404) throw rejectWith(publicImageNotFound())
  if (!response.ok) throw rejectWith(publicImageUnavailable())
  if (!matchesImageContentType(response.headers.get('content-type') ?? '', expectedType)) {
    throw rejectWith(publicImageUnavailable())
  }
  const declaredLength = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(declaredLength) && declaredLength > PUBLIC_IMAGE_MAX_BYTES) {
    throw rejectWith(publicImageUnavailable())
  }
  const body = response.body
  if (!body) throw rejectWith(publicImageUnavailable())
  return { contentType: expectedType, bytes: capImageStream(body) }
}
