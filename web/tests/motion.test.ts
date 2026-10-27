import { describe, expect, it } from 'vitest'
import { createRevealController, observeMotionScene } from '../app/utils/motion'
import type { MediaPreference, MotionElement, RevealEntry, RevealObserver } from '../app/utils/motion'
import { createScrollMotionController, scrollExitProgress, scrollProgress } from '../app/utils/scroll-motion'

type Handler = (event: Event & { relatedTarget?: unknown }) => void

interface FakeElement extends MotionElement {
  dataset: Record<string, string | undefined>
  classes: Set<string>
  styles: Map<string, string>
  rect: { top: number; height: number }
  getBoundingClientRect(): { top: number; height: number }
  contains(other: unknown): boolean
  emit(type: string, detail?: Record<string, unknown>): void
  count(type: string): number
}

function element(top = 740): FakeElement {
  const listeners = new Map<string, Set<Handler>>()
  const classes = new Set<string>()
  const styles = new Map<string, string>()
  const target: FakeElement = {
    dataset: {},
    classes,
    styles,
    rect: { top, height: 300 },
    classList: {
      add: (...names: string[]) => names.forEach((name) => classes.add(name)),
      remove: (...names: string[]) => names.forEach((name) => classes.delete(name))
    },
    style: {
      setProperty: (name: string, value: string) => styles.set(name, value),
      removeProperty: (name: string) => styles.delete(name)
    },
    getBoundingClientRect: () => target.rect,
    contains: (other: unknown) => other === target,
    addEventListener: (type: string, listener: Handler) => {
      const set = listeners.get(type) ?? new Set<Handler>()
      set.add(listener)
      listeners.set(type, set)
    },
    removeEventListener: (type: string, listener: Handler) => {
      listeners.get(type)?.delete(listener)
    },
    emit: (type: string, detail: Record<string, unknown> = {}) => {
      for (const listener of [...(listeners.get(type) ?? [])])
        listener(Object.assign(new Event(type), detail))
    },
    count: (type: string) => listeners.get(type)?.size ?? 0
  }
  return target
}

let observers: Observer[] = []

class Observer implements RevealObserver {
  targets = new Set<MotionElement>()
  disconnected = false
  constructor(private readonly callback: (entries: RevealEntry[]) => void) {
    observers.push(this)
  }
  observe(target: MotionElement): void {
    this.targets.add(target)
  }
  unobserve(target: MotionElement): void {
    this.targets.delete(target)
  }
  disconnect(): void {
    this.disconnected = true
    this.targets.clear()
  }
  intersect(target: FakeElement, isIntersecting: boolean): void {
    this.callback([
      { target, isIntersecting, boundingClientRect: target.getBoundingClientRect() }
    ])
  }
}

class Host {
  private map = new Map<string, Set<(...args: never[]) => void>>()
  addEventListener(type: string, listener: (...args: never[]) => void): void {
    const set = this.map.get(type) ?? new Set()
    set.add(listener)
    this.map.set(type, set)
  }
  removeEventListener(type: string, listener: (...args: never[]) => void): void {
    this.map.get(type)?.delete(listener)
  }
  emit(type: string, event: unknown = {}): void {
    for (const listener of [...(this.map.get(type) ?? [])])
      (listener as (value: unknown) => void)(event)
  }
  count(type: string): number {
    return this.map.get(type)?.size ?? 0
  }
}

function setup(reduced = false) {
  observers = []
  const preference = Object.assign(new Host(), { matches: reduced }) as Host &
    MediaPreference & { matches: boolean }
  const pageDocument = Object.assign(new Host(), { hidden: false }) as Host & {
    hidden: boolean
  }
  const windowHost = new Host()
  const frames = new Map<number, () => void>()
  let next = 0
  const environment = {
    innerWidth: 1440,
    innerHeight: 1000,
    matchMedia: () => preference,
    createObserver: (callback: (entries: RevealEntry[]) => void) => new Observer(callback),
    requestAnimationFrame: (callback: () => void) => {
      frames.set(++next, callback)
      return next
    },
    cancelAnimationFrame: (handle: number) => {
      frames.delete(handle)
    },
    addEventListener: (type: string, listener: () => void) =>
      windowHost.addEventListener(type, listener),
    removeEventListener: (type: string, listener: () => void) =>
      windowHost.removeEventListener(type, listener),
    document: {
      get hidden() {
        return pageDocument.hidden
      },
      addEventListener: (type: string, listener: () => void) =>
        pageDocument.addEventListener(type, listener),
      removeEventListener: (type: string, listener: () => void) =>
        pageDocument.removeEventListener(type, listener)
    }
  }
  const flush = (): void => {
    const callbacks = [...frames.values()]
    frames.clear()
    for (const callback of callbacks) callback()
  }
  return { environment, preference, pageDocument, windowHost, frames, flush }
}

describe('reveal controller', () => {
  it('fails open when APIs are missing or reduced motion is on', () => {
    for (const environment of [undefined, {}, setup(true).environment]) {
      const target = element()
      createRevealController(environment).mount(target)
      expect(target.dataset.reveal).toBeUndefined()
      expect(target.classes.has('club-reveal')).toBe(false)
    }
  })

  it('shares one observer, reveals once and releases every listener', () => {
    const qa = setup()
    const controller = createRevealController(qa.environment)
    const first = element()
    const second = element()
    controller.mount(first, { delay: 900, variant: 'scale' })
    controller.mount(second, -10)
    expect(observers.length).toBe(1)
    expect(first.styles.get('--reveal-delay')).toBe('240ms')
    expect(first.styles.get('--reveal-mobile-delay')).toBe('120ms')
    expect(second.styles.get('--reveal-delay')).toBe('0ms')
    expect(first.dataset.revealVariant).toBe('scale')
    observers[0]?.intersect(first, false)
    expect(first.dataset.reveal).toBe('pending')
    observers[0]?.intersect(first, true)
    expect(first.dataset.reveal).toBe('visible')
    expect(observers[0]?.targets.has(first)).toBe(false)
    observers[0]?.intersect(second, true)
    expect(observers[0]?.disconnected).toBe(true)
    expect(first.count('focusin')).toBe(0)
    expect(qa.preference.count('change')).toBe(0)
  })

  it('keyboard focus reveals the card immediately without stagger delay', () => {
    const qa = setup()
    const target = element()
    createRevealController(qa.environment).mount(target, 180)
    target.emit('focusin')
    expect(target.dataset.reveal).toBe('visible')
    expect(target.styles.get('--reveal-delay')).toBe('0ms')
    expect(target.styles.get('--reveal-mobile-delay')).toBe('0ms')
    expect(observers[0]?.disconnected).toBe(true)
  })

  it('reveals pending cards when reduced motion is turned on and skips later ones', () => {
    const qa = setup()
    const controller = createRevealController(qa.environment)
    const first = element()
    const second = element()
    controller.mount(first, 100)
    controller.mount(second, 200)
    qa.preference.matches = true
    qa.preference.emit('change', { matches: true })
    expect(first.dataset.reveal).toBe('visible')
    expect(second.dataset.reveal).toBe('visible')
    expect(observers[0]?.disconnected).toBe(true)
    const late = element()
    controller.mount(late)
    expect(late.dataset.reveal).toBeUndefined()
  })

  it('unmount and dispose release pending observations and focus listeners', () => {
    const qa = setup()
    const controller = createRevealController(qa.environment)
    const first = element()
    const second = element()
    controller.mount(first)
    controller.mount(second)
    controller.unmount(first)
    expect(observers[0]?.targets.has(first)).toBe(false)
    expect(first.count('focusin')).toBe(0)
    controller.dispose()
    expect(second.dataset.reveal).toBe('visible')
    expect(second.count('focusin')).toBe(0)
    expect(qa.preference.count('change')).toBe(0)
    expect(observers[0]?.disconnected).toBe(true)
  })

  it('observer construction and observe failures fail open', () => {
    for (const failDuringObserve of [false, true]) {
      const qa = setup()
      qa.environment.createObserver = () => {
        if (!failDuringObserve) throw Error('unavailable')
        return {
          observe() {
            throw Error('unavailable')
          },
          unobserve() {
            /* noop */
          },
          disconnect() {
            /* noop */
          }
        }
      }
      const target = element()
      expect(() => createRevealController(qa.environment).mount(target)).not.toThrow()
      expect(target.dataset.reveal).not.toBe('pending')
      expect(target.count('focusin')).toBe(0)
    }
  })
})

describe('scroll motion controller', () => {
  it('clamps entry progress, stays reversible and supports pixel staggering', () => {
    const at = (top: number, value?: number | { variant: string }) =>
      scrollProgress({ top, height: 300 }, 1000, value)
    expect(at(1100)).toBe(0)
    expect(at(940)).toBe(0)
    expect(at(740)).toBe(0.5)
    expect(at(540)).toBe(1)
    expect(at(-100)).toBe(1)
    expect(at(700)).toBeGreaterThan(at(740))
    expect(at(740, 48)).toBeLessThan(at(740))
    expect(scrollProgress({ top: -500, height: 1000 }, 1000, { variant: 'hero' })).toBe(0.5)
    expect(scrollProgress({ top: -500, height: 1000 }, 1000, { variant: 'hero' }, 390)).toBe(0)
    expect(scrollExitProgress({ top: 320, height: 180 }, 1000)).toBe(0)
    expect(scrollExitProgress({ top: 60, height: 180 }, 1000)).toBeGreaterThan(0)
    expect(scrollExitProgress({ top: -220, height: 180 }, 1000)).toBe(1)
  })

  it('hero frames coalesce scroll events and follow scroll in both directions', () => {
    const qa = setup()
    const controller = createScrollMotionController(qa.environment)
    const first = element(-150)
    controller.mount(first, { variant: 'hero' })
    expect(first.classes.has('club-scroll-reveal')).toBe(true)
    for (let index = 0; index < 10; index++) qa.windowHost.emit('scroll')
    expect(qa.frames.size).toBe(1)
    qa.flush()
    expect(first.styles.get('--scroll-progress')).toBe('0.5000')
    first.rect.top = -300
    qa.windowHost.emit('scroll')
    qa.flush()
    expect(first.styles.get('--scroll-progress')).toBe('1.0000')
    first.rect.top = 0
    qa.windowHost.emit('scroll')
    qa.flush()
    expect(first.styles.get('--scroll-progress')).toBe('0.0000')
  })

  it('keyboard focus reveals content immediately, including the hero exit state', () => {
    const qa = setup()
    const controller = createScrollMotionController(qa.environment)
    const text = element(940)
    const hero = element(-300)
    controller.mount(text)
    controller.mount(hero, { variant: 'hero' })
    qa.flush()
    text.emit('focusin')
    hero.emit('focusin')
    expect(text.dataset.reveal).toBe('visible')
    expect(hero.styles.get('--scroll-progress')).toBe('0.0000')
    text.emit('focusout', { relatedTarget: null })
    qa.flush()
    expect(text.dataset.reveal).toBe('visible')
  })

  it('reduced motion stays visible, cancels work and resumes without a reload', () => {
    const qa = setup(true)
    const controller = createScrollMotionController(qa.environment)
    const target = element()
    controller.mount(target, { variant: 'hero' })
    expect(target.classes.size).toBe(0)
    expect(qa.windowHost.count('scroll')).toBe(0)
    qa.preference.matches = false
    qa.preference.emit('change')
    expect(target.classes.has('club-scroll-reveal')).toBe(true)
    expect(qa.frames.size).toBe(1)
    qa.preference.matches = true
    qa.preference.emit('change')
    expect(qa.frames.size).toBe(0)
    expect(target.classes.size).toBe(0)
    expect(target.styles.size).toBe(0)
    expect(observers[0]?.targets.size).toBe(0)
  })

  it('hidden tabs pause work and the last unmount releases every listener', () => {
    const qa = setup()
    const controller = createScrollMotionController(qa.environment)
    const first = element()
    const second = element()
    controller.mount(first, { variant: 'hero' })
    controller.mount(second, { variant: 'hero' })
    qa.pageDocument.hidden = true
    qa.pageDocument.emit('visibilitychange')
    expect(qa.frames.size).toBe(0)
    qa.windowHost.emit('scroll')
    expect(qa.frames.size).toBe(0)
    qa.pageDocument.hidden = false
    qa.pageDocument.emit('visibilitychange')
    expect(qa.frames.size).toBe(1)
    controller.unmount(first)
    expect(qa.windowHost.count('scroll')).toBe(1)
    controller.unmount(second)
    expect(qa.frames.size).toBe(0)
    expect(qa.windowHost.count('scroll')).toBe(0)
    expect(qa.windowHost.count('resize')).toBe(0)
    expect(qa.pageDocument.count('visibilitychange')).toBe(0)
    expect(qa.preference.count('change')).toBe(0)
    expect(first.count('focusin')).toBe(0)
    expect(second.count('focusout')).toBe(0)
    expect(second.classes.size).toBe(0)
    expect(second.styles.size).toBe(0)
  })

  it('missing APIs fail open', () => {
    for (const environment of [undefined, {}]) {
      const target = element()
      createScrollMotionController(environment).mount(target)
      expect(target.classes.has('club-reveal')).toBe(false)
    }
  })

  it('content entrances reveal once and recede reversibly near the top', () => {
    const qa = setup()
    const controller = createScrollMotionController(qa.environment)
    const first = element()
    const second = element()
    controller.mount(first, 100)
    controller.mount(second, { variant: 'image', delay: 200 })
    expect(qa.windowHost.count('scroll')).toBe(1)
    expect(first.dataset.reveal).toBe('pending')
    expect(first.styles.get('--reveal-delay')).toBe('100ms')
    expect(second.dataset.revealVariant).toBe('scale')
    expect(second.styles.get('--reveal-delay')).toBe('200ms')
    observers[0]?.intersect(first, true)
    observers[0]?.intersect(second, true)
    expect(first.dataset.reveal).toBe('visible')
    expect(second.dataset.reveal).toBe('visible')
    expect(observers[0]?.targets.size).toBe(0)

    first.rect.top = -40
    qa.windowHost.emit('scroll')
    qa.flush()
    expect(first.dataset.scrollExit).toBe('true')
    expect(Number(first.styles.get('--scroll-exit'))).toBeGreaterThan(0)

    first.rect.top = 420
    qa.windowHost.emit('scroll')
    qa.flush()
    expect(first.dataset.scrollExit).toBeUndefined()
    expect(first.styles.get('--scroll-exit')).toBeUndefined()

    controller.unmount(first)
    controller.unmount(second)
    expect(first.classes.size).toBe(0)
    expect(qa.windowHost.count('scroll')).toBe(0)
    expect(qa.preference.count('change')).toBe(0)
  })
})

describe('motion scenes', () => {
  it('pauses offscreen, in background and for reduced motion, and cleans up', () => {
    const qa = setup()
    const target = element()
    const cleanup = observeMotionScene(target, qa.environment)
    expect(target.dataset.sceneActive).toBe('false')
    observers[0]?.intersect(target, true)
    expect(target.dataset.sceneActive).toBe('true')
    observers[0]?.intersect(target, false)
    expect(target.dataset.sceneActive).toBe('false')
    observers[0]?.intersect(target, true)
    expect(target.dataset.sceneActive).toBe('true')
    qa.pageDocument.hidden = true
    qa.pageDocument.emit('visibilitychange')
    expect(target.dataset.sceneActive).toBe('false')
    qa.pageDocument.hidden = false
    qa.pageDocument.emit('visibilitychange')
    expect(target.dataset.sceneActive).toBe('true')
    qa.preference.matches = true
    qa.preference.emit('change')
    expect(target.dataset.sceneActive).toBe('false')
    cleanup()
    expect(target.dataset.sceneActive).toBe('false')
    expect(qa.preference.count('change')).toBe(0)
    expect(qa.pageDocument.count('visibilitychange')).toBe(0)
    expect(observers[0]?.disconnected).toBe(true)
  })
  it('keeps scenes static when visibility cannot be observed', () => {
    const qa = setup()
    const target = element()
    const cleanup = observeMotionScene(target, { ...qa.environment, createObserver: undefined })
    expect(target.dataset.sceneActive).toBe('false')
    qa.pageDocument.emit('visibilitychange')
    expect(target.dataset.sceneActive).toBe('false')
    cleanup()
    expect(qa.preference.count('change')).toBe(0)
    expect(qa.pageDocument.count('visibilitychange')).toBe(0)
  })
})
