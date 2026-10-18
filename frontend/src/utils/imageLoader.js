// A stale decode must never reveal an older source after navigation or fallback.
export function createImageLoader(environment, onChange) {
  let config = {},
    entered = false,
    disposed = false,
    version = 0
  let requestSequence = 0
  let image,
    retryTimer,
    slowTimer,
    decodeTimer,
    releaseDecode,
    fallbackUsed = false
  let state = {
    source: '',
    status: 'idle',
    slow: false,
    retries: 0,
    width: 0,
    height: 0
  }
  const publish = () => onChange({ ...state })
  const clearTimer = (timer) => {
    if (timer !== undefined) environment.clearTimeout(timer)
  }
  function cancel() {
    version++
    clearTimer(retryTimer)
    clearTimer(slowTimer)
    clearTimer(decodeTimer)
    releaseDecode?.()
    decodeTimer = releaseDecode = undefined
    retryTimer = slowTimer = undefined
    if (image) image.onload = image.onerror = null
    image = undefined
  }
  const current = (request, token) =>
    !disposed && image === request && token === version
  function failure(request, token) {
    if (!current(request, token)) return
    cancel()
    if (
      !fallbackUsed &&
      config.fallbackSrc &&
      config.fallbackSrc !== state.source
    ) {
      fallbackUsed = true
      state = {
        ...state,
        source: config.fallbackSrc,
        retries: 0,
        width: 0,
        height: 0
      }
      load()
      return
    }
    state.slow = false
    if (state.retries < 3) {
      state.retries++
      state.status = 'retrying'
      const retryVersion = version
      retryTimer = environment.setTimeout(() => {
        retryTimer = undefined
        if (!disposed && retryVersion === version) load()
      }, 1500 * state.retries)
    } else state.status = 'error'
    publish()
  }
  function load() {
    if (disposed || !entered || image || !state.source) return
    const token = version
    const request = new environment.Image()
    image = request
    state.requestId = ++requestSequence
    state.status = 'loading'
    state.slow = false
    publish()
    slowTimer = environment.setTimeout(() => {
      if (!current(request, token)) return
      state.slow = true
      publish()
    }, 4500)
    request.fetchPriority = config.eager ? 'high' : 'auto'
    request.loading = 'eager'
    request.decoding = 'async'
    request.onload = async () => {
      if (!current(request, token)) return
      state.status = 'decoding'
      state.width = request.naturalWidth
      state.height = request.naturalHeight
      publish()
      let watchdog, release
      try {
        if (typeof request.decode === 'function') {
          // Background tabs and some browser decoders can leave decode() pending
          // even after a complete download. Never strand a usable image forever.
          const decoded = request.decode()
          const deadline = new Promise((resolve) => {
            release = resolve
            watchdog = environment.setTimeout(resolve, 1500)
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
    request.onerror = () => failure(request, token)
    request.src = state.source
  }
  function retry() {
    if (disposed || !['error', 'retrying'].includes(state.status)) return
    cancel()
    state.retries = 0
    load()
  }
  environment.addEventListener?.('online', retry)
  return {
    configure(input) {
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
      if (config.eager) {
        entered = true
        if (image) image.fetchPriority = 'high'
      }
      if (entered && !image && ['idle', 'empty'].includes(state.status)) load()
    },
    enter() {
      entered = true
      if (state.status === 'idle') load()
    },
    dispose() {
      disposed = true
      cancel()
      environment.removeEventListener?.('online', retry)
    }
  }
}
