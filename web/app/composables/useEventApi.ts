import { createEventTransport } from '~/utils/event-transport'
import type { EventTransport, UploadSender } from '~/utils/event-transport'

/**
 * Builds the guest event transport for the interactive public UI.
 *
 * A transport is stateless, so a fresh instance per call is cheaper than any
 * app-level registry. The only app-wide seam is the header provider below: the
 * auth batch registers its CSRF/session helper once; this layer never stores,
 * decodes or re-creates tokens.
 */

type HeaderProvider = () =>
  | Record<string, string>
  | Promise<Record<string, string>>

let headerProvider: HeaderProvider | undefined

/** Called once by the auth/session integration (no-op until then). */
export function configureEventTransportHeaders(provider: HeaderProvider | undefined): void {
  headerProvider = provider
}

/** The upload implementation is a lazily imported chunk, loaded on first intent. */
const lazyUpload: UploadSender = async (url, file, fields, options) => {
  const { sendUploadWithProgress } = await import('~/utils/upload-progress')
  return await sendUploadWithProgress(url, file, fields, options)
}

export interface EventApiOptions {
  /**
   * Admin pages pass `true` together with a protected transport. The public
   * pages never can, so a guest submission always goes through the draft →
   * pending flow.
   */
  canPublish?: boolean
}

export function useEventApi(options: EventApiOptions = {}): EventTransport {
  return createEventTransport({
    upload: lazyUpload,
    canPublish: options.canPublish,
    getHeaders: () => headerProvider?.() ?? {}
  })
}
