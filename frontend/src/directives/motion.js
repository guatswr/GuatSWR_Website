// Vue equivalents of SCTA's once-only whileInView and staggered entrances.
// CSS remains readable until a working observer explicitly opts an element in.
export function createRevealController(environment) {
  const pending = new Set()
  let observer
  let preference

  const stop = () => {
    observer?.disconnect()
    observer = undefined
    preference?.removeEventListener?.('change', onPreferenceChange)
  }

  const show = (element, immediate = false) => {
    if (!pending.delete(element)) return
    element.removeEventListener('focusin', onFocus)
    observer?.unobserve(element)
    if (immediate) {
      element.style.setProperty('--reveal-delay', '0ms')
      element.style.setProperty('--reveal-mobile-delay', '0ms')
    }
    element.dataset.reveal = 'visible'
    if (!pending.size) stop()
  }

  const onFocus = (event) => show(event.currentTarget, true)
  const onPreferenceChange = (event) => {
    if (event.matches) for (const element of [...pending]) show(element, true)
  }

  return {
    mount(element, options = {}) {
      // Missing APIs, reduced motion, and initialization failures all fail open.
      if (!environment?.IntersectionObserver || !environment.matchMedia) return
      try {
        preference ||= environment.matchMedia(
          '(prefers-reduced-motion: reduce)'
        )
        if (preference.matches || pending.has(element)) return
        if (!observer) {
          observer = new environment.IntersectionObserver(
            (entries) => {
              for (const entry of entries)
                if (entry.isIntersecting) show(entry.target)
            },
            { threshold: 0.08, rootMargin: '0px 0px -24px 0px' }
          )
          preference.addEventListener?.('change', onPreferenceChange)
        }
        const input = typeof options === 'number' ? options : options?.delay
        const delay = Number.isFinite(Number(input))
          ? Math.min(240, Math.max(0, Number(input)))
          : 0
        element.style.setProperty('--reveal-delay', `${delay}ms`)
        element.style.setProperty(
          '--reveal-mobile-delay',
          `${Math.min(delay, 120)}ms`
        )
        element.dataset.revealVariant =
          options?.variant === 'scale' ? 'scale' : 'up'
        element.classList.add('club-reveal')
        element.dataset.reveal = 'pending'
        pending.add(element)
        element.addEventListener('focusin', onFocus)
        observer.observe(element)
      } catch {
        for (const target of [...pending]) show(target, true)
        stop()
      }
    },
    unmount(element) {
      if (!pending.delete(element)) return
      element.removeEventListener('focusin', onFocus)
      observer?.unobserve(element)
      if (!pending.size) stop()
    },
    dispose() {
      for (const element of [...pending]) show(element, true)
      stop()
    }
  }
}

export function observeMotionScene(element, environment) {
  if (!environment?.document || !environment.matchMedia) return () => {}
  const preference = environment.matchMedia('(prefers-reduced-motion: reduce)')
  const document = environment.document
  let inView = true
  let observer
  const update = () => {
    element.dataset.sceneActive = String(
      inView && !document.hidden && !preference.matches
    )
  }
  try {
    if (environment.IntersectionObserver) {
      observer = new environment.IntersectionObserver((entries) => {
        for (const entry of entries)
          if (entry.target === element) inView = entry.isIntersecting
        update()
      })
      observer.observe(element)
    }
  } catch {
    // No observer means a static scene, never a broken page.
    inView = false
  }
  preference.addEventListener?.('change', update)
  document.addEventListener('visibilitychange', update)
  update()
  return () => {
    observer?.disconnect()
    preference.removeEventListener?.('change', update)
    document.removeEventListener('visibilitychange', update)
    element.dataset.sceneActive = 'false'
  }
}

let sharedReveal
const sceneCleanups = new WeakMap()
const browser = () => (typeof window === 'undefined' ? undefined : window)

export const vReveal = {
  mounted(element, binding) {
    sharedReveal ||= createRevealController(browser())
    sharedReveal.mount(element, binding.value)
  },
  unmounted(element) {
    sharedReveal?.unmount(element)
  }
}

export const vMotionScene = {
  mounted(element) {
    sceneCleanups.set(element, observeMotionScene(element, browser()))
  },
  unmounted(element) {
    sceneCleanups.get(element)?.()
    sceneCleanups.delete(element)
  }
}
