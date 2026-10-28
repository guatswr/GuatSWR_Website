import { describe, expect, it } from 'vitest'
import { runInNewContext } from 'node:vm'
import { NAVBAR_BOOT_SCRIPT } from '../app/utils/navbar-boot'

function boot(scrollY = 0) {
  const attributes = new Set<string>()
  const listeners = new Map<string, () => void>()
  const window = {
    scrollY,
    addEventListener: (name: string, callback: () => void) => listeners.set(name, callback),
    removeEventListener: (name: string) => listeners.delete(name),
  }
  let ready = () => {}
  runInNewContext(NAVBAR_BOOT_SCRIPT, {
    window,
    document: {
      documentElement: {
        toggleAttribute(name: string, on: boolean) { if (on) attributes.add(name); else attributes.delete(name) },
        removeAttribute: (name: string) => attributes.delete(name),
      },
      addEventListener: (_name: string, callback: () => void) => { ready = callback },
    },
  })
  return {
    compact: () => attributes.has('data-nav-boot-compact'),
    scroll(y: number) { window.scrollY = y; listeners.get('scroll')?.() },
    ready: () => ready(),
    listeners,
  }
}

describe('navbar before application hydration', () => {
  it('keeps the same 36px / 12px hysteresis as the hydrated navbar', () => {
    const controller = boot()
    controller.scroll(36)
    expect(controller.compact()).toBe(false)
    controller.scroll(37)
    expect(controller.compact()).toBe(true)
    controller.scroll(24)
    expect(controller.compact()).toBe(true)
    controller.scroll(12)
    expect(controller.compact()).toBe(false)
    controller.scroll(24)
    expect(controller.compact()).toBe(false)
  })

  it('adopts restored scroll and releases its state and listeners on handoff', () => {
    const controller = boot(80)
    expect(controller.compact()).toBe(true)
    controller.ready()
    expect(controller.compact()).toBe(false)
    expect(controller.listeners.size).toBe(0)
    controller.scroll(100)
    expect(controller.compact()).toBe(false)
  })
})
