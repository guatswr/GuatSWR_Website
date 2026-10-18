import { createError, defineEventHandler, getRequestURL, sendStream, setResponseHeaders } from 'h3'
import { useRuntimeConfig } from '#imports'
import { fetchPublicImage, imageContentType, publicImageHeaders } from '../../utils/public-image'
import { uploadAssetUrlOrNull } from '../../utils/upstream'

/**
 * Same-origin read-only proxy for the archived `/uploads/**` image tree.
 *
 * Only validated image paths under `/uploads` are relayed from the private
 * origin; browser credentials, cookies and forwarding headers are never sent
 * upstream, redirects are denied, and the response is capped, `nosniff` and
 * (for SVG) sandboxed so active content can never run on the app origin.
 */
export default defineEventHandler(async (event) => {
  const { apiBase } = useRuntimeConfig(event)
  const { pathname } = getRequestURL(event)
  const expectedType = imageContentType(pathname)
  if (expectedType === null) throw createError({ statusCode: 404, statusMessage: 'Not Found' })

  // Traversal, encoded separators, over-long paths and unknown extensions are
  // never proxied; the rejection reason stays server-side.
  const upstream = uploadAssetUrlOrNull(apiBase, pathname)
  if (upstream === null) throw createError({ statusCode: 404, statusMessage: 'Not Found' })

  const image = await fetchPublicImage(upstream, expectedType)
  setResponseHeaders(event, publicImageHeaders(image.contentType))
  return sendStream(event, image.bytes)
})
