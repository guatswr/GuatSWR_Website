import { createEventTransport } from '~/utils/event-transport'
import type { EventTransport, UploadSender } from '~/utils/event-transport'

/**
 * Builds the guest event transport for the interactive public UI.
 *
 * The CSRF coordinator belongs to this Nuxt application, never a module-global
 * callback. It is lazy: rendering an event board makes no auth request.
 */

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
  const session = useBffSession()
  return createEventTransport({
    upload: lazyUpload,
    canPublish: options.canPublish,
    performMutation: session.performMutation,
  })
}
