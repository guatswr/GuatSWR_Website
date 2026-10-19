import { describe, expect, it } from 'vitest'
import { createIceField } from '../app/utils/ice-geometry'
import { createIceThawController, thawDistance, thawProgress } from '../app/utils/ice-thaw'
import { createFreezeInteractionLock } from '../app/utils/freeze-interaction'

class Target {
  listeners = new Map<string, { callback: (event: never) => void; capture: boolean }[]>()
  addEventListener(
    type: string,
    callback: (event: never) => void,
    options: boolean | { capture?: boolean } = {}
  ): void {
    const entries = this.listeners.get(type) ?? []
    entries.push({
      callback,
      capture: options === true || (typeof options === 'object' && !!options.capture)
    })
    this.listeners.set(type, entries)
  }
  removeEventListener(
    type: string,
    callback: (event: never) => void,
    options: boolean | { capture?: boolean } = {}
  ): void {
    const capture = options === true || (typeof options === 'object' && !!options.capture)
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter(
        (entry) => entry.callback !== callback || entry.capture !== capture
      )
    )
  }
  dispatch(type: string, details: Record<string, unknown> = {}) {
    const event = {
      defaultPrevented: false,
      stopped: false,
      preventDefault() {
        this.defaultPrevented = true
      },
      stopImmediatePropagation() {
        this.stopped = true
      },
      ...details
    }
    const entries = [...(this.listeners.get(type) ?? [])].sort(
      (a, b) => Number(b.capture) - Number(a.capture)
    )
    for (const entry of entries) {
      ;(entry.callback as unknown as (value: unknown) => void)(event)
      if (event.stopped) break
    }
    return event
  }
  /** The thaw cases dispatch through `emit`; both names share one path. */
  emit(type: string, details: Record<string, unknown> = {}) {
    return this.dispatch(type, details)
  }
  count(type: string): number {
    return (this.listeners.get(type) ?? []).length
  }
}

function freezeSetup() {
  const environment = new Target()
  const attributes = new Map<string, string>()
  const background = {
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name)
  }
  const surface = {
    lastFocus: undefined as { preventScroll: boolean } | undefined,
    contains: (target: unknown) => Boolean((target as { insideSurface?: boolean })?.insideSurface),
    focus(options?: { preventScroll: boolean }) {
      environment.document.activeElement = surface
      this.lastFocus = options
    }
  }
  const originalFocus = {
    isConnected: true,
    calls: [] as { preventScroll: boolean }[],
    closest: () =>
      background.getAttribute('inert') !== null ? background : null,
    focus(options?: { preventScroll: boolean }) {
      if (options) this.calls.push(options)
      environment.document.activeElement = originalFocus
    }
  }
  environment.document = { activeElement: originalFocus }
  environment.scrollY = 0
  let escapes = 0
  const lock = createFreezeInteractionLock(
    environment as unknown as Parameters<typeof createFreezeInteractionLock>[0],
    {
      surface,
      background,
      onEscape: () => escapes++
    }
  )
  return {
    environment,
    background,
    surface,
    originalFocus,
    lock,
    get escapes() {
      return escapes
    }
  }
}

function thawSetup(reduced = false) {
  const environment = new Target() as Target & {
    scrollY: number
    innerHeight: number
    matchMedia: (query: string) => unknown
    requestAnimationFrame: (callback: () => void) => number
    cancelAnimationFrame: (handle: number) => void
    setTimeout: (callback: () => void, delay?: number) => number
    clearTimeout: (handle: number) => void
  }
  environment.scrollY = 300
  environment.innerHeight = 800
  const preference = new Target() as Target & { matches: boolean }
  preference.matches = reduced
  environment.matchMedia = () => preference
  const frames = new Map<number, () => void>()
  const timers = new Map<number, { callback: () => void; delay: number }>()
  const changes: { phase: string; progress: number; reduced: boolean }[] = []
  let id = 0
  let completions = 0
  environment.requestAnimationFrame = (callback: () => void) => {
    frames.set(++id, callback)
    return id
  }
  environment.cancelAnimationFrame = (handle: number) => {
    frames.delete(handle)
  }
  environment.setTimeout = (callback: () => void, delay = 0) => {
    timers.set(++id, { callback, delay })
    return id
  }
  environment.clearTimeout = (handle: number) => {
    timers.delete(handle)
  }
  const controller = createIceThawController(
    environment as unknown as Parameters<typeof createIceThawController>[0],
    {
      onChange: (value) => changes.push(value),
      onComplete: () => {
        completions++
      }
    }
  )
  const flush = () => {
    const callbacks = [...frames.values()]
    frames.clear()
    for (const callback of callbacks) callback()
  }
  const finish = () => {
    const callbacks = [...timers.values()]
    timers.clear()
    for (const entry of callbacks) entry.callback()
  }
  return {
    environment,
    preference,
    frames,
    timers,
    changes,
    controller,
    flush,
    finish,
    get completions() {
      return completions
    }
  }
}

describe('ice field geometry', () => {
  it('stays deterministic, bounded and keeps six wing crystals', () => {
    for (const [width, height] of [
      [320, 640],
      [390, 844],
      [1366, 660],
      [2560, 1440]
    ]) {
      const field = createIceField(width, height)
      expect(createIceField(width, height)).toEqual(field)
      expect(field.crystals.length).toBe(6)
      expect(field.panels.length).toBeLessThanOrEqual(48)
      expect(field.panels.length).toBeGreaterThanOrEqual(16)
      expect(new Set(field.panels.map((panel) => panel.id)).size).toBe(field.panels.length)
      for (const panel of field.panels) {
        expect(panel.facets.length).toBe(4)
        expect(panel.points + panel.crack).not.toMatch(/NaN|Infinity/)
        expect(panel.delay + 1180).toBeLessThan(1450)
        const pairs = panel.points.split(' ').map((pair) => pair.split(',').map(Number))
        const center = pairs.reduce(
          (point, [x = 0, y = 0]) => [point[0] + x / 4, point[1] + y / 4],
          [0, 0]
        )
        expect(
          (center[0] ?? 0) < width * 0.2 ||
            (center[0] ?? 0) > width * 0.8 ||
            (center[1] ?? 0) < height * 0.2 ||
            (center[1] ?? 0) > height * 0.8
        ).toBe(true)
      }
      // Adjacent top panels share both seam vertices, so fracture pieces replace
      // the visible frozen surface exactly, without gaps or unrelated sprites.
      const top = field.panels.filter((panel) => panel.id.startsWith('top-'))
      for (let index = 1; index < top.length; index++) {
        const previous = top[index - 1]?.points.split(' ') ?? []
        const current = top[index]?.points.split(' ') ?? []
        expect(previous[1]).toBe(current[0])
        expect(previous[2]).toBe(current[3])
      }
    }
  })
})

describe('ice thaw controller', () => {
  it('adapts the thaw distance to the screen and uses actual downward travel', () => {
    expect(thawDistance(320)).toBe(120)
    expect(thawDistance(800)).toBe(176)
    expect(thawDistance(1600)).toBe(240)
    expect(thawProgress(200, 300, 120)).toBe(0)
    expect(thawProgress(360, 300, 120)).toBe(0.5)
    expect(thawProgress(900, 300, 120)).toBe(1)
  })

  it('cracks progressively, never reseals and shares one frame per burst', () => {
    const qa = thawSetup()
    qa.controller.start()
    qa.controller.start()
    expect(qa.environment.count('scroll')).toBe(1)
    qa.environment.scrollY = 344
    for (let index = 0; index < 9; index++) qa.environment.emit('scroll')
    expect(qa.frames.size).toBe(1)
    qa.flush()
    expect(qa.changes.at(-1)?.progress).toBe(0.25)
    qa.environment.scrollY = 300
    qa.environment.emit('scroll')
    qa.flush()
    expect(qa.changes.at(-1)?.progress).toBe(0.25)
    expect(qa.changes.length).toBe(2)
    qa.environment.scrollY = 500
    qa.environment.emit('scroll')
    qa.flush()
    expect(qa.changes.at(-1)?.phase).toBe('shattering')
    expect(qa.timers.size).toBe(1)
    expect(qa.completions).toBe(0)
    qa.controller.shatter()
    qa.environment.emit('scroll')
    expect(qa.timers.size).toBe(1)
    qa.finish()
    expect(qa.completions).toBe(1)
    expect(qa.environment.count('scroll')).toBe(0)
    expect(qa.preference.count('change')).toBe(0)
  })

  it('keeps navigation keys native and ignores Escape in editing controls', () => {
    const qa = thawSetup()
    qa.controller.start()
    const preventDefault = () => {
      throw new Error('The effect must not capture native scrolling')
    }
    for (const key of ['ArrowDown', 'PageDown', ' ', 'End'])
      qa.environment.emit('keydown', { key, preventDefault })
    expect(qa.timers.size).toBe(0)
    qa.environment.emit('keydown', {
      key: 'Escape',
      target: { tagName: 'INPUT' },
      preventDefault
    })
    qa.environment.emit('keydown', {
      key: 'Escape',
      defaultPrevented: true,
      preventDefault
    })
    expect(qa.timers.size).toBe(0)
    qa.environment.emit('keydown', { key: 'Escape', preventDefault })
    expect(qa.changes.at(-1)?.phase).toBe('shattering')
    qa.finish()
    expect(qa.completions).toBe(1)
  })

  it('reduced motion dismisses quickly without waiting for CSS', () => {
    const qa = thawSetup(true)
    qa.controller.start()
    qa.controller.shatter()
    expect(qa.changes.at(-1)?.reduced).toBe(true)
    expect([...qa.timers.values()][0]?.delay).toBe(160)
    qa.finish()
    expect(qa.completions).toBe(1)
    const live = thawSetup()
    live.controller.start()
    live.controller.shatter()
    live.preference.matches = true
    live.preference.emit('change')
    expect(live.timers.size).toBe(1)
    expect([...live.timers.values()][0]?.delay).toBe(160)
  })

  it('destroy cancels listeners, frames and timers without callbacks', () => {
    for (const shatter of [false, true]) {
      const qa = thawSetup()
      qa.controller.start()
      qa.environment.emit('scroll')
      if (shatter) qa.controller.shatter()
      qa.controller.destroy()
      qa.controller.destroy()
      expect(qa.frames.size).toBe(0)
      expect(qa.timers.size).toBe(0)
      for (const type of ['scroll', 'resize', 'keydown'])
        expect(qa.environment.count(type)).toBe(0)
      expect(qa.preference.count('change')).toBe(0)
      qa.environment.emit('scroll')
      qa.flush()
      qa.finish()
      expect(qa.completions).toBe(0)
    }
  })
})

describe('freeze interaction lock', () => {
  it('suppresses pointer activation, context menus, forms and editing before app handlers', () => {
    const qa = freezeSetup()
    let activations = 0
    const types = [
      'click',
      'dblclick',
      'auxclick',
      'contextmenu',
      'submit',
      'reset',
      'dragstart',
      'beforeinput',
      'input',
      'change'
    ]
    for (const type of types) qa.environment.addEventListener(type, () => activations++)
    qa.lock.lock()
    qa.lock.lock()
    expect(qa.background.getAttribute('inert')).toBe('')
    expect(qa.background.getAttribute('data-cirno-frozen')).toBe('')
    expect(qa.environment.document.activeElement).toBe(qa.surface)
    for (const type of types) {
      expect(qa.environment.dispatch(type).defaultPrevented).toBe(true)
      expect(qa.environment.count(type)).toBe(2)
    }
    expect(activations).toBe(0)
    qa.lock.unlock()
    qa.environment.dispatch('click')
    expect(activations).toBe(1)
  })

  it('keeps native scrolling while blocking application shortcuts', () => {
    const qa = freezeSetup()
    let shortcuts = 0
    qa.environment.addEventListener('keydown', () => shortcuts++)
    qa.lock.lock()
    for (const type of ['touchstart', 'touchend', 'pointerdown', 'pointerup']) {
      const event = qa.environment.dispatch(type, { pointerType: 'touch' })
      expect(event.defaultPrevented).toBe(false)
      expect(event.stopped).toBe(true)
    }
    for (const type of ['wheel', 'touchmove', 'scroll']) {
      expect(qa.environment.count(type)).toBe(0)
      expect(qa.environment.dispatch(type).defaultPrevented).toBe(false)
    }
    for (const key of ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '])
      expect(qa.environment.dispatch('keydown', { key }).defaultPrevented).toBe(false)
    for (const key of ['Tab', 'Enter', '9', 'b', 'a', 'k']) {
      expect(qa.environment.dispatch('keydown', { key }).defaultPrevented).toBe(true)
      expect(qa.environment.dispatch('keyup', { key }).defaultPrevented).toBe(true)
      expect(qa.environment.dispatch('keypress', { key }).defaultPrevented).toBe(true)
    }
    expect(shortcuts).toBe(0)
    expect(
      qa.environment.dispatch('keydown', { key: 'l', ctrlKey: true }).defaultPrevented
    ).toBe(false)
    // Esc always escapes the modal, even if a stale editable target is reported.
    qa.environment.dispatch('keydown', { key: 'Escape', target: { tagName: 'INPUT' } })
    qa.environment.dispatch('keydown', { key: 'Escape', repeat: true })
    expect(qa.escapes).toBe(1)
    qa.lock.unlock()
  })

  it('keeps focus on the frozen surface and restores attributes and focus on unlock', () => {
    const qa = freezeSetup()
    qa.background.setAttribute('data-cirno-frozen', 'previous-value')
    qa.lock.lock()
    qa.environment.document.activeElement = { outside: true }
    qa.environment.dispatch('focusin', {
      target: qa.environment.document.activeElement
    })
    expect(qa.environment.document.activeElement).toBe(qa.surface)
    expect(qa.surface.lastFocus).toEqual({ preventScroll: true })
    qa.lock.unlock()
    qa.lock.unlock()
    expect(qa.background.getAttribute('inert')).toBeNull()
    expect(qa.background.getAttribute('data-cirno-frozen')).toBe('previous-value')
    expect(qa.originalFocus.calls).toEqual([{ preventScroll: true }])
    expect([...qa.environment.listeners.values()].flat().length).toBe(0)

    qa.background.setAttribute('inert', 'already-inert')
    qa.originalFocus.calls.length = 0
    qa.lock.lock()
    qa.lock.unlock()
    expect(qa.background.getAttribute('inert')).toBe('already-inert')
    expect(qa.originalFocus.calls.length).toBe(0)
  })

  it('keeps the lock until the fracture finishes for both scroll and Escape', () => {
    for (const trigger of ['scroll', 'escape']) {
      const qa = freezeSetup()
      const thaw = thawSetup()
      qa.environment.matchMedia = thaw.environment.matchMedia
      qa.environment.innerHeight = 800
      qa.environment.requestAnimationFrame = thaw.environment.requestAnimationFrame
      qa.environment.cancelAnimationFrame = thaw.environment.cancelAnimationFrame
      qa.environment.setTimeout = thaw.environment.setTimeout
      qa.environment.clearTimeout = thaw.environment.clearTimeout
      let activations = 0
      qa.environment.addEventListener('click', () => activations++)
      // The thaw controller and the interaction lock reference each other, so the
      // lock is published through one holder instead of a reassigned local.
      const lockRef: { current?: ReturnType<typeof createFreezeInteractionLock> } = {}
      const controller = createIceThawController(
        qa.environment as unknown as Parameters<typeof createIceThawController>[0],
        {
          onChange: () => {},
          onComplete: () => lockRef.current?.unlock()
        }
      )
      lockRef.current = createFreezeInteractionLock(
        qa.environment as unknown as Parameters<typeof createFreezeInteractionLock>[0],
        {
          surface: qa.surface,
          background: qa.background,
          onEscape: () => controller.shatter()
        }
      )
      lockRef.current.lock()
      controller.start()
      if (trigger === 'escape') qa.environment.dispatch('keydown', { key: 'Escape' })
      else {
        qa.environment.scrollY = 500
        qa.environment.dispatch('scroll')
        thaw.flush()
      }
      expect(qa.background.getAttribute('inert')).toBe('')
      qa.environment.dispatch('click')
      expect(activations).toBe(0)
      thaw.finish()
      expect(qa.background.getAttribute('inert')).toBeNull()
      qa.environment.dispatch('click')
      expect(activations).toBe(1)
      expect(qa.environment.count('keydown')).toBe(0)
      expect(thaw.preference.count('change')).toBe(0)
    }
  })
})
