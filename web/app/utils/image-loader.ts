/**
 * Progressive-image state machine ported from the archived
 * `frontend/src/utils/imageLoader.js`, with one deliberate change: it drives the
 * *live* `<img>` element instead of a detached `new Image()`. The archived
 * version probed every source with a second image object and could only insert
 * the rendered element after that probe resolved, so it double-fetched and could
 * never produce a server-rendered image. Adopting the rendered element keeps the
 * placeholder, decode gating, original-source fallback, escalating retry backoff
 * and cleanup behaviour while issuing exactly one fetch per attempt.
 *
 * `src`, `loading`, `decoding` and `fetchpriority` stay owned by the component
 * template, so the element is already a valid, readable image before any
 * JavaScript runs. The loader only re-writes `src` when it must force a fresh
 * attempt for the same URL after the retry backoff.
 */

export type ImageLoaderStatus =
  | 'idle'
  | 'empty'
  | 'loading'
  | 'decoding'
  | 'retrying'
  | 'ready'
  | 'error'

export interface ImageLoaderState {
  source: string
  status: ImageLoaderStatus
  slow: boolean
  retries: number
  /** Bumped for every attempt, so a retry can be observed and traced. */
  requestId?: number
  width: number
  height: number
}

export interface ImageLoaderConfig {
  src?: string
  fallbackSrc?: string
  eager?: boolean
}

/** Any browser or fake handler: the loader only assigns and clears it. */
export type ImageLoaderHandler = ((...args: never[]) => unknown) | null

/** The subset of `HTMLImageElement` the loader needs; the DOM element satisfies it. */
export interface ImageLoaderRequest {
  /** True once the element finished (or failed) the attempt it currently holds. */
  readonly complete: boolean
  readonly naturalWidth: number
  readonly naturalHeight: number
  src: string
  onload: ImageLoaderHandler
  onerror: ImageLoaderHandler
  getAttribute(name: string): string | null
  removeAttribute(name: string): void
  decode?: () => Promise<void>
}

export interface ImageLoaderEnvironment {
  /** The rendered `<img>` this loader owns, or null while it is not rendered. */
  image: () => ImageLoaderRequest | null
  setTimeout: (handler: () => void, delay: number) => number
  clearTimeout: (handle: number) => void
  addEventListener?: (type: 'online', listener: () => void) => void
  removeEventListener?: (type: 'online', listener: () => void) => void
}

export interface ImageLoader {
  configure: (input: ImageLoaderConfig) => void
  enter: () => void
  dispose: () => void
}

const DECODE_WATCHDOG_MS = 1500
const SLOW_NOTICE_MS = 4500
const RETRY_STEP_MS = 1500
const MAX_RETRIES = 3
/** Vue applies a changed source to the element after the synchronous state change. */
const MAX_DEFERRED_ADOPTIONS = 4

// A stale decode must never reveal an older source after navigation or fallback.
export function createImageLoader(
  environment: ImageLoaderEnvironment,
  onChange: (state: ImageLoaderState) => void
): ImageLoader {
  let config: ImageLoaderConfig = {}
  let entered = false
  let disposed = false
  let version = 0
  let requestSequence = 0
  let deferredAdoptions = 0
  let image: ImageLoaderRequest | undefined
  let retryTimer: number | undefined
  let slowTimer: number | undefined
  let decodeTimer: number | undefined
  let releaseDecode: (() => void) | undefined
  const adopterTimers = new Set<number>()
  let fallbackUsed = false
  let state: ImageLoaderState = {
    source: '',
    status: 'idle',
    slow: false,
    retries: 0,
    width: 0,
    height: 0
  }

  const publish = (): void => onChange({ ...state })
  const clearTimer = (timer: number | undefined): void => {
    if (timer !== undefined) environment.clearTimeout(timer)
  }

  function cancel(): void {
    version++
    clearTimer(retryTimer)
    clearTimer(slowTimer)
    clearTimer(decodeTimer)
    for (const timer of adopterTimers) clearTimer(timer)
    adopterTimers.clear()
    releaseDecode?.()
    decodeTimer = releaseDecode = undefined
    retryTimer = slowTimer = undefined
    deferredAdoptions = 0
    if (image) image.onload = image.onerror = null
    image = undefined
  }

  const current = (request: ImageLoaderRequest, token: number): boolean =>
    !disposed && image === request && token === version

  function failure(request: ImageLoaderRequest, token: number): void {
    if (!current(request, token)) return
    cancel()
    const fallback = config.fallbackSrc
    if (!fallbackUsed && fallback && fallback !== state.source) {
      fallbackUsed = true
      // Publish before loading: the component re-renders the element with the new
      // source, and the next attempt adopts that element instead of the failed one.
      state = {
        ...state,
        source: fallback,
        status: 'loading',
        slow: false,
        retries: 0,
        width: 0,
        height: 0
      }
      publish()
      load(false)
      return
    }
    state.slow = false
    if (state.retries < MAX_RETRIES) {
      state.retries++
      state.status = 'retrying'
      const retryVersion = version
      retryTimer = environment.setTimeout(
        () => {
          retryTimer = undefined
          // The same URL has to be requested again: the element already failed it.
          if (!disposed && retryVersion === version) load(true)
        },
        RETRY_STEP_MS * state.retries
      )
    } else state.status = 'error'
    publish()
  }

  async function settle(request: ImageLoaderRequest, token: number): Promise<void> {
    state.status = 'decoding'
    state.width = request.naturalWidth
    state.height = request.naturalHeight
    publish()
    let watchdog: number | undefined
    let release: (() => void) | undefined
    try {
      if (typeof request.decode === 'function') {
        // Background tabs and some browser decoders can leave decode() pending
        // even after a complete download. Never strand a usable image forever.
        const decoded = request.decode()
        const deadline = new Promise<void>((resolve) => {
          release = resolve
          watchdog = environment.setTimeout(resolve, DECODE_WATCHDOG_MS)
        })
        decodeTimer = watchdog
        releaseDecode = release
        await Promise.race([decoded, deadline])
      }
    } catch {
      // A few engines reject decode() for an already usable cached image.
      if (!request.naturalWidth) {
        failure(request, token)
        return
      }
    } finally {
      clearTimer(watchdog)
      if (decodeTimer === watchdog) decodeTimer = undefined
      if (releaseDecode === release) releaseDecode = undefined
    }
    if (!current(request, token)) return
    clearTimer(slowTimer)
    slowTimer = undefined
    request.onload = request.onerror = null
    image = undefined
    state.status = 'ready'
    state.slow = false
    publish()
  }

  function adoptLater(): void {
    if (deferredAdoptions >= MAX_DEFERRED_ADOPTIONS) return
    deferredAdoptions++
    // At most one pending adoption per render flush; every handle is tracked so
    // disposal clears them instead of leaving a stray callback behind.
    const timer = environment.setTimeout(() => {
      adopterTimers.delete(timer)
      load(false)
    }, 0)
    adopterTimers.add(timer)
  }

  function load(forceAttempt: boolean): void {
    if (disposed || !entered || image || !state.source) return
    const request = environment.image()
    // The element may not be rendered yet, or still hold the previous source
    // while Vue's pending render has not been applied.
    if (!request) return
    if (forceAttempt) {
      // Re-run the load algorithm for the same URL, once, at the backoff deadline.
      request.removeAttribute('src')
      request.src = state.source
    } else if (request.getAttribute('src') !== state.source) {
      adoptLater()
      return
    }
    const token = version
    image = request
    state.requestId = ++requestSequence
    state.status = 'loading'
    state.slow = false
    publish()
    slowTimer = environment.setTimeout(() => {
      if (!current(request, token)) return
      state.slow = true
      publish()
    }, SLOW_NOTICE_MS)
    request.onload = () => settle(request, token)
    request.onerror = () => failure(request, token)
    if (!forceAttempt && request.complete) {
      // A cached, already-painted or already-broken element never fires load.
      if (request.naturalWidth) void settle(request, token)
      else failure(request, token)
    }
  }

  function retry(): void {
    if (disposed || !['error', 'retrying'].includes(state.status)) return
    cancel()
    state.retries = 0
    load(true)
  }

  environment.addEventListener?.('online', retry)

  return {
    configure(input: ImageLoaderConfig): void {
      if (disposed) return
      const sameSource =
        config.src === input.src && config.fallbackSrc === input.fallbackSrc
      config = { ...input }
      if (!sameSource) {
        cancel()
        fallbackUsed = !config.src && !!config.fallbackSrc
        state = {
          source: config.src || config.fallbackSrc || '',
          status: 'idle',
          slow: false,
          retries: 0,
          width: 0,
          height: 0
        }
        if (!state.source) state.status = 'empty'
        publish()
      }
      if (config.eager) entered = true
      if (entered && !image && ['idle', 'empty'].includes(state.status)) load(false)
    },
    enter(): void {
      entered = true
      if (state.status === 'idle') load(false)
    },
    dispose(): void {
      disposed = true
      cancel()
      environment.removeEventListener?.('online', retry)
    }
  }
}
