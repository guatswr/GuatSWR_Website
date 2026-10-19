/**
 * Port of the archived `frontend/src/directives/scrollMotion.js`.
 *
 * Read the stable wrapper; animate its children so transforms cannot feed back
 * into the next frame's geometry. Progress is reversible, without scroll
 * control. Only the full-screen hero keeps a scroll-linked parallax; every other
 * element gets a once-only entrance so it finishes even when scrolling stops.
 */
import { browserMotionEnvironment, createRevealController } from './motion'
import type {
  MediaPreference,
  MotionElement,
  MotionEnvironment,
  MotionRect,
  RevealController,
  RevealDirectiveValue,
  RevealObserver
} from './motion'

export type ScrollVariant = 'hero' | 'image' | 'card' | 'text'

export interface ScrollRevealOptions {
  variant?: string
  offset?: number
  delay?: number
}

export type ScrollRevealValue = number | ScrollRevealOptions | undefined

export interface ScrollMotionElement extends MotionElement {
  getBoundingClientRect(): MotionRect
  contains(other: unknown): boolean
}

interface ResolvedOptions {
  variant: ScrollVariant
  offset: number
}

interface HeroRecord {
  element: ScrollMotionElement
  config: ResolvedOptions
  focused: boolean
  last?: string
  focusIn: () => void
  focusOut: (event: Event & { relatedTarget?: unknown }) => void
}

export interface ScrollMotionController {
  mount(element: ScrollMotionElement, value?: ScrollRevealValue): void
  update(element: ScrollMotionElement, value?: ScrollRevealValue): void
  unmount(element: ScrollMotionElement): void
}

const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, value))

function resolveVariant(value: string | undefined): ScrollVariant {
  return value === 'hero' || value === 'image' || value === 'card'
    ? value
    : 'text'
}

function resolveOptions(value: ScrollRevealValue): ResolvedOptions {
  const input: ScrollRevealOptions =
    typeof value === 'number' ? { offset: value } : value || {}
  return {
    variant: resolveVariant(input.variant),
    offset: clamp(Number(input.offset) || 0, 0, 120)
  }
}

export function scrollProgress(
  rect: MotionRect,
  viewportHeight: number,
  value?: ScrollRevealValue,
  viewportWidth = 1280
): number {
  const config = resolveOptions(value)
  if (config.variant === 'hero') {
    return viewportWidth < 1024 ? 0 : clamp(-rect.top / Math.max(rect.height, 1))
  }
  const progress = clamp(
    (viewportHeight * 0.94 - rect.top - config.offset) / (viewportHeight * 0.4)
  )
  return progress * progress * (3 - 2 * progress)
}

interface HeroController {
  mount(element: ScrollMotionElement, value?: ScrollRevealValue): void
  update(element: ScrollMotionElement, value?: ScrollRevealValue): void
  unmount(element: ScrollMotionElement): void
}

// Product-page entrances finish smoothly even when the visitor stops scrolling.
// Only the full-screen hero retains a small, reversible scroll-linked parallax.
function createHeroMotionController(
  environment: Partial<MotionEnvironment> | undefined
): HeroController {
  const records = new Map<MotionElement, HeroRecord>()
  const active = new Set<HeroRecord>()
  const pageDocument = environment?.document
  const createObserver = environment?.createObserver
  const requestFrame = environment?.requestAnimationFrame
  const cancelFrameRequest = environment?.cancelAnimationFrame
  const matchMedia = environment?.matchMedia
  const listen = environment?.addEventListener
  const unlisten = environment?.removeEventListener
  let preference: MediaPreference | undefined
  let observer: RevealObserver | undefined
  let frame: number | undefined
  const supported = Boolean(
    createObserver &&
      requestFrame &&
      cancelFrameRequest &&
      matchMedia &&
      listen &&
      pageDocument
  )

  function cancelFrame(): void {
    if (frame !== undefined) cancelFrameRequest?.(frame)
    frame = undefined
  }

  function clear(record: HeroRecord): void {
    record.element.classList.remove('club-scroll-reveal')
    record.element.style.removeProperty('--scroll-progress')
    delete record.element.dataset.scrollVariant
    record.last = undefined
  }

  function write(record: HeroRecord, progress: number): void {
    const value = record.focused
      ? record.config.variant === 'hero'
        ? 0
        : 1
      : progress
    const rounded = value.toFixed(4)
    if (record.last === rounded) return
    record.element.style.setProperty('--scroll-progress', rounded)
    record.last = rounded
  }

  function render(): void {
    frame = undefined
    // Read through a `const` so the guard's narrowing survives into the map
    // closure below (TypeScript does not preserve it for the captured parameter).
    const env = environment
    if (!env || pageDocument?.hidden || !observer) return
    // All layout reads happen before any style writes.
    const updates = [...active].map(
      (record) =>
        [
          record,
          scrollProgress(
            record.element.getBoundingClientRect(),
            env.innerHeight ?? 0,
            record.config,
            env.innerWidth
          )
        ] as const
    )
    for (const [record, progress] of updates) write(record, progress)
  }

  function schedule(): void {
    if (frame === undefined && observer && !pageDocument?.hidden) {
      frame = requestFrame?.(render)
    }
  }

  function visibilityChanged(): void {
    if (pageDocument?.hidden) cancelFrame()
    else schedule()
  }

  function activate(record: HeroRecord): void {
    record.element.dataset.scrollVariant = record.config.variant
    record.element.classList.add('club-scroll-reveal')
    active.add(record)
    observer?.observe(record.element)
  }

  function stop(): void {
    cancelFrame()
    observer?.disconnect()
    observer = undefined
    active.clear()
    unlisten?.('scroll', schedule)
    unlisten?.('resize', schedule)
    pageDocument?.removeEventListener('visibilitychange', visibilityChanged)
    for (const record of records.values()) clear(record)
  }

  function preferenceChanged(): void {
    stop()
    if (preference?.matches) return
    if (!createObserver || !listen || !pageDocument) return
    if (!observer) {
      try {
        observer = createObserver(
          (entries) => {
            for (const entry of entries) {
              const record = records.get(entry.target)
              if (!record) continue
              if (entry.isIntersecting) active.add(record)
              else {
                active.delete(record)
                write(
                  record,
                  scrollProgress(
                    entry.boundingClientRect,
                    environment?.innerHeight ?? 0,
                    record.config,
                    environment?.innerWidth
                  )
                )
              }
            }
            schedule()
          },
          { threshold: 0, rootMargin: '160px 0px' }
        )
        listen('scroll', schedule, { passive: true })
        listen('resize', schedule, { passive: true })
        pageDocument.addEventListener('visibilitychange', visibilityChanged)
      } catch {
        stop() // Unsupported environments keep all content visible.
        return
      }
    }
    for (const record of records.values()) activate(record)
    schedule()
  }

  return {
    mount(element: ScrollMotionElement, value?: ScrollRevealValue): void {
      if (!supported || !matchMedia || records.has(element)) return
      const record: HeroRecord = {
        element,
        config: resolveOptions(value),
        focused: false,
        focusIn: () => {
          record.focused = true
          write(record, 1)
        },
        focusOut: (event) => {
          record.focused = element.contains(event.relatedTarget)
          schedule()
        }
      }
      records.set(element, record)
      element.addEventListener('focusin', record.focusIn)
      element.addEventListener('focusout', record.focusOut)
      if (!preference) {
        preference = matchMedia('(prefers-reduced-motion: reduce)')
        preference.addEventListener?.('change', preferenceChanged)
        preferenceChanged()
      } else if (observer) {
        activate(record)
        schedule()
      }
    },
    update(element: ScrollMotionElement, value?: ScrollRevealValue): void {
      const record = records.get(element)
      if (!record) return
      record.config = resolveOptions(value)
      if (observer) element.dataset.scrollVariant = record.config.variant
      schedule()
    },
    unmount(element: ScrollMotionElement): void {
      const record = records.get(element)
      if (!record) return
      observer?.unobserve(element)
      active.delete(record)
      element.removeEventListener('focusin', record.focusIn)
      element.removeEventListener('focusout', record.focusOut)
      clear(record)
      records.delete(element)
      if (!records.size) {
        stop()
        preference?.removeEventListener?.('change', preferenceChanged)
        preference = undefined
      }
    }
  }
}

export function createScrollMotionController(
  environment: Partial<MotionEnvironment> | undefined
): ScrollMotionController {
  const hero = createHeroMotionController(environment)
  const reveal: RevealController = createRevealController(environment)
  const modes = new WeakMap<MotionElement, boolean>()
  return {
    mount(element: ScrollMotionElement, value?: ScrollRevealValue): void {
      if (modes.has(element)) return
      const isHero = typeof value === 'object' && value?.variant === 'hero'
      modes.set(element, isHero)
      if (isHero) hero.mount(element, value)
      else {
        element.classList.add('club-entrance')
        const revealValue: RevealDirectiveValue = {
          delay:
            typeof value === 'number'
              ? value
              : (value?.delay ?? value?.offset ?? 0),
          variant:
            typeof value === 'object' &&
            (value?.variant === 'image' || value?.variant === 'card')
              ? 'scale'
              : 'up'
        }
        reveal.mount(element, revealValue)
      }
    },
    update(element: ScrollMotionElement, value?: ScrollRevealValue): void {
      if (modes.get(element)) hero.update(element, value)
    },
    unmount(element: ScrollMotionElement): void {
      if (modes.get(element)) hero.unmount(element)
      else {
        reveal.unmount(element)
        element.classList.remove('club-entrance', 'club-reveal')
        delete element.dataset.reveal
        delete element.dataset.revealVariant
        element.style.removeProperty('--reveal-delay')
        element.style.removeProperty('--reveal-mobile-delay')
      }
      modes.delete(element)
    }
  }
}

let sharedController: ScrollMotionController | undefined
const browser = (): Window | undefined =>
  typeof window === 'undefined' ? undefined : window
const controller = (): ScrollMotionController =>
  (sharedController ||= createScrollMotionController(
    browserMotionEnvironment(browser())
  ))

export const vScrollReveal = {
  mounted(
    element: ScrollMotionElement,
    binding: { value?: ScrollRevealValue }
  ): void {
    controller().mount(element, binding.value)
  },
  updated(
    element: ScrollMotionElement,
    binding: { value?: ScrollRevealValue }
  ): void {
    controller().update(element, binding.value)
  },
  beforeUnmount(element: ScrollMotionElement): void {
    controller().unmount(element)
  }
}
