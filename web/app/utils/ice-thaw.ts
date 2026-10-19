/**
 * Port of the archived `frontend/src/components/home/iceThaw.js`.
 *
 * Only observes native scrolling. Wheel, touch and navigation keys retain their
 * default behaviour; fracture progress never moves the document for the reader.
 */
import type { MediaPreference } from './motion'

export type ThawPhase = 'frozen' | 'shattering'

export interface ThawState {
  phase: ThawPhase
  progress: number
  reduced: boolean
}

export interface KeyEvent {
  readonly key?: string
  readonly repeat?: boolean
  readonly target?: unknown
  readonly defaultPrevented: boolean
  preventDefault(): void
}

export type ThawEventType = 'scroll' | 'resize' | 'keydown'

export interface ThawEnvironment {
  readonly scrollY: number
  readonly innerHeight: number
  matchMedia(query: string): MediaPreference
  requestAnimationFrame(callback: () => void): number
  cancelAnimationFrame(handle: number): void
  setTimeout(handler: () => void, delay: number): number
  clearTimeout(handle: number | undefined): void
  addEventListener(
    type: ThawEventType,
    listener: (event: KeyEvent) => void,
    options?: { passive: boolean }
  ): void
  removeEventListener(type: ThawEventType, listener: (event: KeyEvent) => void): void
}

export interface ThawOptions {
  onChange(state: ThawState): void
  onComplete(): void
}

export interface IceThawController {
  start(): void
  shatter(): void
  destroy(): void
}

const TYPING_TAGS: readonly string[] = ['INPUT', 'TEXTAREA', 'SELECT']
const SHATTER_MS = 1450
const REDUCED_SHATTER_MS = 160

export const thawDistance = (height: number): number =>
  Math.min(240, Math.max(120, height * 0.22))

export const thawProgress = (
  scrollY: number,
  origin: number,
  distance: number
): number => Math.min(1, Math.max(0, (scrollY - origin) / distance))

const isTypingTarget = (target: unknown): boolean => {
  if (target === null || typeof target !== 'object') return false
  const element: { isContentEditable?: unknown; tagName?: unknown } = target
  return (
    element.isContentEditable === true ||
    (typeof element.tagName === 'string' && TYPING_TAGS.includes(element.tagName))
  )
}

export function createIceThawController(
  environment: ThawEnvironment,
  { onChange, onComplete }: ThawOptions
): IceThawController {
  let started = false
  let finished = false
  let frame: number | undefined
  let timer: number | undefined
  let origin = 0
  let distance = 0
  let progress = 0
  let phase: ThawPhase = 'frozen'
  let reduced = false
  const preference = environment.matchMedia('(prefers-reduced-motion: reduce)')
  const notify = (): void => onChange({ progress, phase, reduced })
  const cancelFrame = (): void => {
    if (frame !== undefined) environment.cancelAnimationFrame(frame)
    frame = undefined
  }

  function detach(): void {
    cancelFrame()
    environment.clearTimeout(timer)
    environment.removeEventListener('scroll', schedule)
    environment.removeEventListener('resize', resize)
    environment.removeEventListener('keydown', keydown)
    preference.removeEventListener?.('change', preferenceChanged)
  }

  function complete(): void {
    if (finished) return
    finished = true
    detach()
    onComplete()
  }

  function shatter(): void {
    if (!started || finished || phase === 'shattering') return
    phase = 'shattering'
    progress = 1
    cancelFrame()
    notify()
    timer = environment.setTimeout(complete, reduced ? REDUCED_SHATTER_MS : SHATTER_MS)
  }

  function render(): void {
    frame = undefined
    if (finished || phase === 'shattering') return
    const next = Math.max(
      progress,
      thawProgress(environment.scrollY, origin, distance)
    )
    if (next === progress) return
    progress = next
    if (progress >= 1) shatter()
    else notify()
  }

  function schedule(): void {
    if (frame === undefined && !finished && phase !== 'shattering') {
      frame = environment.requestAnimationFrame(render)
    }
  }

  function resize(): void {
    distance = thawDistance(environment.innerHeight)
    schedule()
  }

  function keydown(event: KeyEvent): void {
    if (
      event.defaultPrevented ||
      event.repeat ||
      isTypingTarget(event.target)
    )
      return
    if ((event.key ?? '') === 'Escape') shatter()
  }

  function preferenceChanged(): void {
    reduced = preference.matches
    notify()
    if (reduced && phase === 'shattering') {
      environment.clearTimeout(timer)
      timer = environment.setTimeout(complete, REDUCED_SHATTER_MS)
    }
  }

  return {
    start(): void {
      if (started || finished) return
      started = true
      origin = environment.scrollY
      distance = thawDistance(environment.innerHeight)
      reduced = preference.matches
      environment.addEventListener('scroll', schedule, { passive: true })
      environment.addEventListener('resize', resize, { passive: true })
      environment.addEventListener('keydown', keydown)
      preference.addEventListener?.('change', preferenceChanged)
      notify()
    },
    shatter,
    destroy(): void {
      finished = true
      detach()
    }
  }
}
