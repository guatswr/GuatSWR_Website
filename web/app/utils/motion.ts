/**
 * Vue equivalents of the archived `frontend/src/directives/motion.js`
 * (SCTA's once-only whileInView and staggered entrances). Only the DOM surface
 * the controllers actually touch is typed, so the same code runs against the
 * browser and against deterministic test doubles.
 *
 * CSS stays readable until a working observer explicitly opts an element in:
 * missing APIs, reduced motion and initialization failures all fail open.
 */

export interface MotionRect {
  top: number
  height: number
}

export type ElementFocusEvent = Event & { relatedTarget?: unknown }

export interface MotionElement {
  dataset: Record<string, string | undefined>
  classList: {
    add(...tokens: string[]): void
    remove(...tokens: string[]): void
  }
  style: {
    setProperty(name: string, value: string): void
    removeProperty(name: string): void
  }
  addEventListener(
    type: 'focusin' | 'focusout',
    listener: (event: ElementFocusEvent) => void
  ): void
  removeEventListener(
    type: 'focusin' | 'focusout',
    listener: (event: ElementFocusEvent) => void
  ): void
}

export interface RevealEntry {
  target: MotionElement
  isIntersecting: boolean
  boundingClientRect: MotionRect
}

export interface RevealObserver {
  observe(target: MotionElement): void
  unobserve(target: MotionElement): void
  disconnect(): void
}

export interface ObserverOptions {
  threshold: number
  rootMargin: string
}

/**
 * `Event` stays assignable to every listener parameter in this module, which is
 * what lets the browser objects (`window`, `document`, `MediaQueryList`) satisfy
 * these interfaces structurally instead of through casts.
 */
export type MediaMatchesEvent = Event & { matches?: boolean }

export interface MediaPreference {
  readonly matches: boolean
  addEventListener?(
    type: 'change',
    listener: (event: MediaMatchesEvent) => void
  ): void
  removeEventListener?(
    type: 'change',
    listener: (event: MediaMatchesEvent) => void
  ): void
}

export interface MotionDocument {
  readonly hidden: boolean
  addEventListener(type: 'visibilitychange', listener: () => void): void
  removeEventListener(type: 'visibilitychange', listener: () => void): void
}

export interface RevealEnvironment {
  matchMedia(query: string): MediaPreference
  createObserver(
    callback: (entries: RevealEntry[]) => void,
    options: ObserverOptions
  ): RevealObserver
}

export interface MotionEnvironment extends RevealEnvironment {
  readonly innerWidth: number
  readonly innerHeight: number
  requestAnimationFrame(callback: () => void): number
  cancelAnimationFrame(handle: number): void
  addEventListener(
    type: 'scroll' | 'resize',
    listener: () => void,
    options?: { passive: boolean }
  ): void
  removeEventListener(
    type: 'scroll' | 'resize',
    listener: () => void,
    options?: { passive: boolean }
  ): void
  document: MotionDocument
}

export interface RevealOptions {
  delay?: number
  variant?: 'up' | 'scale'
}

export interface RevealDirectiveValue {
  delay?: number
  variant?: 'up' | 'scale'
}

export interface RevealController {
  mount(element: MotionElement, options?: number | RevealDirectiveValue): void
  unmount(element: MotionElement): void
  dispose(): void
}

export type RevealEnvironmentLike = Partial<RevealEnvironment>

const MAX_STAGGER_MS = 240
const MAX_MOBILE_STAGGER_MS = 120

// The browser surface the controllers need, wired without leaking window
// internals (or a non-null assertion) into the pure modules.
export function browserMotionEnvironment(
  source: Window | undefined
): MotionEnvironment | undefined {
  if (!source) return undefined
  return {
    get innerWidth() {
      return source.innerWidth
    },
    get innerHeight() {
      return source.innerHeight
    },
    requestAnimationFrame: (callback) => source.requestAnimationFrame(callback),
    cancelAnimationFrame: (handle) => source.cancelAnimationFrame(handle),
    matchMedia: (query) => source.matchMedia(query),
    createObserver: (callback, options) => {
      // The global constructor is used rather than `source.IntersectionObserver`
      // (`Window` has no such property in the DOM types), and it is adapted to
      // this module's narrow contract: the browser observer only knows
      // `Element`, while callers here pass the structural `MotionElement`.
      const observer = new IntersectionObserver(
        (entries) => callback(entries as unknown as RevealEntry[]),
        options
      )
      return {
        observe: (target) => observer.observe(target as unknown as Element),
        unobserve: (target) => observer.unobserve(target as unknown as Element),
        disconnect: () => observer.disconnect()
      }
    },
    addEventListener: (type, listener, options) =>
      source.addEventListener(type, listener, options as AddEventListenerOptions),
    removeEventListener: (type, listener, options) =>
      source.removeEventListener(type, listener, options as AddEventListenerOptions),
    document: {
      get hidden() {
        return source.document.hidden
      },
      addEventListener: (type, listener) =>
        source.document.addEventListener(type, listener),
      removeEventListener: (type, listener) =>
        source.document.removeEventListener(type, listener)
    }
  }
}

export function createRevealController(
  environment: RevealEnvironmentLike | undefined
): RevealController {
  const pending = new Set<MotionElement>()
  let observer: RevealObserver | undefined
  let preference: MediaPreference | undefined

  const stop = (): void => {
    observer?.disconnect()
    observer = undefined
    preference?.removeEventListener?.('change', onPreferenceChange)
  }

  // Every listener closes over its own element, which is the only target it is
  // ever attached to; the archived version read `event.currentTarget` instead.
  const focusListeners = new WeakMap<MotionElement, () => void>()
  const onFocusFor = (element: MotionElement): (() => void) => {
    let listener = focusListeners.get(element)
    if (!listener) {
      listener = () => show(element, true)
      focusListeners.set(element, listener)
    }
    return listener
  }

  const show = (element: MotionElement, immediate = false): void => {
    if (!pending.delete(element)) return
    element.removeEventListener('focusin', onFocusFor(element))
    observer?.unobserve(element)
    if (immediate) {
      element.style.setProperty('--reveal-delay', '0ms')
      element.style.setProperty('--reveal-mobile-delay', '0ms')
    }
    element.dataset.reveal = 'visible'
    if (!pending.size) stop()
  }

  function onPreferenceChange(event: MediaMatchesEvent): void {
    if (event.matches) for (const element of [...pending]) show(element, true)
  }

  return {
    mount(element: MotionElement, options: number | RevealDirectiveValue = {}): void {
      // Missing APIs, reduced motion, and initialization failures all fail open.
      const createObserver = environment?.createObserver
      const matchMedia = environment?.matchMedia
      if (typeof createObserver !== 'function' || typeof matchMedia !== 'function') {
        return
      }
      try {
        preference ||= matchMedia('(prefers-reduced-motion: reduce)')
        if (preference.matches || pending.has(element)) return
        if (!observer) {
          observer = createObserver(
            (entries) => {
              for (const entry of entries)
                if (entry.isIntersecting) show(entry.target)
            },
            { threshold: 0.08, rootMargin: '0px 0px -24px 0px' }
          )
          preference.addEventListener?.('change', onPreferenceChange)
        }
        const input = typeof options === 'number' ? options : options.delay
        const delay = Number.isFinite(Number(input))
          ? Math.min(MAX_STAGGER_MS, Math.max(0, Number(input)))
          : 0
        element.style.setProperty('--reveal-delay', `${delay}ms`)
        element.style.setProperty(
          '--reveal-mobile-delay',
          `${Math.min(delay, MAX_MOBILE_STAGGER_MS)}ms`
        )
        element.dataset.revealVariant =
          typeof options !== 'number' && options.variant === 'scale'
            ? 'scale'
            : 'up'
        element.classList.add('club-reveal')
        element.dataset.reveal = 'pending'
        pending.add(element)
        element.addEventListener('focusin', onFocusFor(element))
        observer.observe(element)
      } catch {
        for (const target of [...pending]) show(target, true)
        stop()
      }
    },
    unmount(element: MotionElement): void {
      if (!pending.delete(element)) return
      element.removeEventListener('focusin', onFocusFor(element))
      observer?.unobserve(element)
      if (!pending.size) stop()
    },
    dispose(): void {
      for (const element of [...pending]) show(element, true)
      stop()
    }
  }
}

export function observeMotionScene(
  element: MotionElement,
  environment: Partial<MotionEnvironment> | undefined
): () => void {
  const pageDocument = environment?.document
  const matchMedia = environment?.matchMedia
  if (!pageDocument || typeof matchMedia !== 'function') return () => {}
  const preference = matchMedia('(prefers-reduced-motion: reduce)')
  let inView = true
  let observer: RevealObserver | undefined
  const update = (): void => {
    element.dataset.sceneActive = String(
      inView && !pageDocument.hidden && !preference.matches
    )
  }
  try {
    const createObserver = environment?.createObserver
    if (typeof createObserver === 'function') {
      observer = createObserver(
        (entries) => {
          for (const entry of entries)
            if (entry.target === element) inView = entry.isIntersecting
          update()
        },
        { threshold: 0, rootMargin: '0px' }
      )
      observer.observe(element)
    }
  } catch {
    // No observer means a static scene, never a broken page.
    inView = false
  }
  preference.addEventListener?.('change', update)
  pageDocument.addEventListener('visibilitychange', update)
  update()
  return () => {
    observer?.disconnect()
    preference.removeEventListener?.('change', update)
    pageDocument.removeEventListener('visibilitychange', update)
    element.dataset.sceneActive = 'false'
  }
}

let sharedReveal: RevealController | undefined
const sceneCleanups = new WeakMap<MotionElement, () => void>()
const browser = (): Window | undefined =>
  typeof window === 'undefined' ? undefined : window

export const vReveal = {
  mounted(element: MotionElement, binding: { value?: number | RevealDirectiveValue }): void {
    sharedReveal ||= createRevealController(browserMotionEnvironment(browser()))
    sharedReveal.mount(element, binding.value)
  },
  unmounted(element: MotionElement): void {
    sharedReveal?.unmount(element)
  }
}

export const vMotionScene = {
  mounted(element: MotionElement): void {
    sceneCleanups.set(element, observeMotionScene(element, browserMotionEnvironment(browser())))
  },
  unmounted(element: MotionElement): void {
    sceneCleanups.get(element)?.()
    sceneCleanups.delete(element)
  }
}
