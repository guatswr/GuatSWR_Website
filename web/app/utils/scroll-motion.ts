/**
 * Port of the archived `frontend/src/directives/scrollMotion.js`.
 *
 * Read the stable wrapper; animate its children or compensate for applied lift
 * so transforms cannot feed back into the next frame's geometry. Progress is
 * reversible, without scroll control. Entrances finish smoothly even when
 * scrolling stops, while elements scrolling past the top of the viewport
 * gently fade and recede upward.
 */
import { browserMotionEnvironment, createRevealController } from './motion'
import { hasHeroTimeline, hasSectionTimeline, mountHeroTimeline, mountSectionTimeline, supportsScrollTimeline, unmountHeroTimeline, unmountSectionTimeline } from './hero-timeline'
import { scrollExitRange } from './scroll-range'
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

interface ScrollRecord {
  element: ScrollMotionElement
  config: ResolvedOptions
  mode: 'hero' | 'exit'
  focused: boolean
  last?: string
  lastNumeric: number
  geometry?: { top: number; height: number }
  stopResize?: () => void
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
  _viewportWidth = 1280
): number {
  const config = resolveOptions(value)
  if (config.variant === 'hero') {
    const progress = clamp(-rect.top / Math.max(rect.height, 1))
    // Keep the hero intact until 30% has scrolled out, then complete
    // its exit by 80% with the same easing as the following content sections.
    const exit = clamp((progress - 0.3) / 0.5)
    return exit * exit * (3 - 2 * exit)
  }
  const progress = clamp(
    (viewportHeight * 0.94 - rect.top - config.offset) / (viewportHeight * 0.4)
  )
  return progress * progress * (3 - 2 * progress)
}

export function scrollExitProgress(
  rect: MotionRect,
  viewportHeight: number,
  viewportWidth = 1280
): number {
  if (viewportHeight <= 0) return 0
  const { startTop, span } = scrollExitRange(rect.height, viewportHeight, viewportWidth)
  if (rect.top >= startTop) return 0
  const progress = clamp((startTop - rect.top) / Math.max(span, 1))
  return progress * progress * (3 - 2 * progress)
}

interface HeroController {
  mount(
    element: ScrollMotionElement,
    value?: ScrollRevealValue,
    mode?: 'hero' | 'exit'
  ): void
  update(element: ScrollMotionElement, value?: ScrollRevealValue): void
  unmount(element: ScrollMotionElement): void
}

function createHeroMotionController(
  environment: Partial<MotionEnvironment> | undefined
): HeroController {
  const records = new Map<MotionElement, ScrollRecord>()
  const active = new Set<ScrollRecord>()
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
  let layoutDirty = true
  let stopPageResize: (() => void) | undefined

  function invalidateLayout() {
    layoutDirty = true
    // A resized section can move inactive sections below it as well.
    for (const record of records.values()) record.geometry = undefined
    schedule()
  }
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

  function clear(record: ScrollRecord): void {
    if (record.mode === 'hero') {
      record.element.classList.remove('club-scroll-reveal')
      record.element.style.removeProperty('--scroll-progress')
      delete record.element.dataset.scrollVariant
    } else {
      record.element.style.removeProperty('--scroll-exit')
      delete record.element.dataset.scrollExit
    }
    record.last = undefined
    record.lastNumeric = 0
    record.geometry = undefined
    record.stopResize?.()
    record.stopResize = undefined
  }

  function computeRecordProgress(
    record: ScrollRecord,
    rect: MotionRect,
    viewportHeight: number,
    viewportWidth = 1280
  ): number {
    if (record.mode === 'hero') {
      if (viewportWidth >= 1024 && environment?.getNavbarCollapseScroll) {
        const anchor = environment.getNavbarCollapseScroll()
        if (anchor === undefined) return 0
        // Desktop exit starts 30% of a hero-height beyond the navbar's settled
        // scroll position; the existing 30%-80% curve remains reversible.
        const scrollY = environment.scrollY ?? -rect.top
        return scrollProgress(
          { top: anchor - scrollY, height: rect.height },
          viewportHeight,
          record.config,
          viewportWidth
        )
      }
      return scrollProgress(rect, viewportHeight, record.config, viewportWidth)
    }
    if (record.geometry) return scrollExitProgress(rect, viewportHeight, viewportWidth)
    const liftPx = viewportWidth < 640 ? 32 : 38
    const naturalRect: MotionRect = {
      top: rect.top + record.lastNumeric * liftPx,
      height: rect.height
    }
    return scrollExitProgress(naturalRect, viewportHeight, viewportWidth)
  }

  function write(record: ScrollRecord, progress: number): void {
    if (record.mode === 'exit') {
      const value = record.focused ? 0 : progress
      if (value > 0.0005) {
        record.lastNumeric = value
        const rounded = value.toFixed(4)
        if (record.element.dataset.reveal === 'pending') {
          record.element.dataset.reveal = 'visible'
        }
        record.element.style.removeProperty('--reveal-delay')
        record.element.style.removeProperty('--reveal-mobile-delay')
        record.element.dataset.scrollExit = 'true'
        if (record.last === rounded) return
        record.element.style.setProperty('--scroll-exit', rounded)
        record.last = rounded
      } else {
        record.lastNumeric = 0
        if (record.last !== undefined) {
          delete record.element.dataset.scrollExit
          record.element.style.removeProperty('--scroll-exit')
          record.last = undefined
        }
      }
      return
    }
    const value = record.focused
      ? record.config.variant === 'hero'
        ? 0
        : 1
      : progress
    record.lastNumeric = value
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
    const scrollY = env.scrollY ?? 0
    const needsMeasurement = layoutDirty
    layoutDirty = false
    // All layout reads happen before any style writes.
    const updates = [...active].map(
      (record) => {
        let rect: MotionRect
        if (env.measureNaturalRect) {
          if (needsMeasurement || !record.geometry) {
            const measured = env.measureNaturalRect(record.element)
            record.geometry = { top: measured.top + scrollY, height: measured.height }
          }
          rect = { top: record.geometry.top - scrollY, height: record.geometry.height }
        } else rect = record.element.getBoundingClientRect()
        return [
          record,
          computeRecordProgress(
            record,
            rect,
            env.innerHeight ?? 0,
            env.innerWidth
          )
        ] as const
      }
    )
    const apply = () => {
      if (!observer) return
      for (const [record, progress] of updates) {
        if (records.has(record.element)) write(record, progress)
      }
    }
    if (env.writeFrame) env.writeFrame(apply)
    else apply()
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

  function activate(record: ScrollRecord): void {
    record.stopResize ??= environment?.observeResize?.(record.element, invalidateLayout)
    layoutDirty = true
    if (record.mode === 'hero') {
      record.element.dataset.scrollVariant = record.config.variant
      record.element.classList.add('club-scroll-reveal')
    }
    active.add(record)
    observer?.observe(record.element)
  }

  function stop(): void {
    cancelFrame()
    observer?.disconnect()
    observer = undefined
    active.clear()
    unlisten?.('scroll', schedule)
    unlisten?.('resize', invalidateLayout)
    stopPageResize?.()
    stopPageResize = undefined
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
                  computeRecordProgress(
                    record,
                    record.geometry
                      ? { top: record.geometry.top - (environment?.scrollY ?? 0), height: record.geometry.height }
                      : entry.boundingClientRect,
                    environment?.innerHeight ?? 0,
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
        listen('resize', invalidateLayout, { passive: true })
        stopPageResize = environment?.observePageResize?.(invalidateLayout)
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
    mount(
      element: ScrollMotionElement,
      value?: ScrollRevealValue,
      mode: 'hero' | 'exit' = 'hero'
    ): void {
      if (!supported || !matchMedia || records.has(element)) return
      const record: ScrollRecord = {
        element,
        config: resolveOptions(value),
        mode,
        focused: false,
        lastNumeric: 0,
        focusIn: () => {
          record.focused = true
          write(record, mode === 'exit' ? 0 : 1)
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
      if (observer && record.mode === 'hero') {
        element.dataset.scrollVariant = record.config.variant
      }
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
      if (isHero) hero.mount(element, value, 'hero')
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
        hero.mount(element, value, 'exit')
      }
    },
    update(element: ScrollMotionElement, value?: ScrollRevealValue): void {
      hero.update(element, value)
    },
    unmount(element: ScrollMotionElement): void {
      if (modes.get(element)) hero.unmount(element)
      else {
        hero.unmount(element)
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
let nativeReveal: RevealController | undefined
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
    if (typeof binding.value === 'object' && binding.value?.variant === 'hero'
      && mountHeroTimeline(element as unknown as HTMLElement)) return
    if (typeof ResizeObserver !== 'undefined' && supportsScrollTimeline()
      && !(typeof binding.value === 'object' && binding.value?.variant === 'hero')) {
      element.classList.add('club-entrance')
      nativeReveal ??= createRevealController(browserMotionEnvironment(browser()))
      const value = binding.value
      nativeReveal.mount(element, {
        delay: typeof value === 'number' ? value : (value?.delay ?? value?.offset ?? 0),
        variant: typeof value === 'object' && (value?.variant === 'image' || value?.variant === 'card') ? 'scale' : 'up',
      })
      mountSectionTimeline(element as unknown as HTMLElement)
      return
    }
    controller().mount(element, binding.value)
  },
  updated(
    element: ScrollMotionElement,
    binding: { value?: ScrollRevealValue }
  ): void {
    if (hasHeroTimeline(element as unknown as HTMLElement) || hasSectionTimeline(element as unknown as HTMLElement)) return
    controller().update(element, binding.value)
  },
  beforeUnmount(element: ScrollMotionElement): void {
    if (unmountHeroTimeline(element as unknown as HTMLElement)) return
    if (unmountSectionTimeline(element as unknown as HTMLElement)) {
      nativeReveal?.unmount(element)
      element.classList.remove('club-entrance', 'club-reveal')
      delete element.dataset.reveal
      delete element.dataset.revealVariant
      element.style.removeProperty('--reveal-delay')
      element.style.removeProperty('--reveal-mobile-delay')
      return
    }
    controller().unmount(element)
  }
}
