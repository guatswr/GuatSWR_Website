import test from 'node:test'
import assert from 'node:assert/strict'
import { createFreezeInteractionLock } from './freezeInteraction.js'
import { createIceThawController } from './iceThaw.js'

class Target {
  listeners = new Map()
  addEventListener(type, callback, options = {}) {
    const entries = this.listeners.get(type) || []
    entries.push({ callback, capture: options === true || !!options.capture })
    this.listeners.set(type, entries)
  }
  removeEventListener(type, callback, options = {}) {
    const capture = options === true || !!options.capture
    this.listeners.set(
      type,
      (this.listeners.get(type) || []).filter(
        (entry) => entry.callback !== callback || entry.capture !== capture
      )
    )
  }
  dispatch(type, details = {}) {
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
    const entries = [...(this.listeners.get(type) || [])].sort(
      (a, b) => Number(b.capture) - Number(a.capture)
    )
    for (const entry of entries) {
      entry.callback(event)
      if (event.stopped) break
    }
    return event
  }
  count(type) {
    return (this.listeners.get(type) || []).length
  }
}

function setup() {
  const environment = new Target()
  const attributes = new Map()
  const background = {
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name)
  }
  const surface = {
    contains: (target) => target?.insideSurface,
    focus(options) {
      environment.document.activeElement = surface
      this.lastFocus = options
    }
  }
  const originalFocus = {
    isConnected: true,
    calls: [],
    closest: () =>
      background.getAttribute('inert') !== null ? background : null,
    focus(options) {
      this.calls.push(options)
      environment.document.activeElement = originalFocus
    }
  }
  environment.document = { activeElement: originalFocus }
  environment.scrollY = 0
  let escapes = 0
  const lock = createFreezeInteractionLock(environment, {
    background,
    surface,
    onEscape: () => escapes++
  })
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

test('freeze suppresses pointer activation, context menus, forms and editing before application handlers', () => {
  const qa = setup()
  let activations = 0
  for (const type of [
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
  ]) {
    qa.environment.addEventListener(type, () => activations++)
  }
  qa.lock.lock()
  qa.lock.lock()
  assert.equal(qa.background.getAttribute('inert'), '')
  assert.equal(qa.background.getAttribute('data-cirno-frozen'), '')
  assert.equal(qa.environment.document.activeElement, qa.surface)
  assert.equal(qa.environment.scrollY, 0)
  for (const type of [
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
  ]) {
    assert.equal(qa.environment.dispatch(type).defaultPrevented, true)
    assert.equal(qa.environment.count(type), 2)
  }
  assert.equal(activations, 0)
  qa.lock.unlock()
  qa.environment.dispatch('click')
  assert.equal(activations, 1)
})

test('touch, wheel and navigation keys keep native scrolling while application shortcuts stay blocked', () => {
  const qa = setup()
  let shortcuts = 0
  qa.environment.addEventListener('keydown', () => shortcuts++)
  qa.lock.lock()
  for (const type of ['touchstart', 'touchend', 'pointerdown', 'pointerup']) {
    const event = qa.environment.dispatch(type, { pointerType: 'touch' })
    assert.equal(event.defaultPrevented, false)
    assert.equal(event.stopped, true)
  }
  for (const type of ['wheel', 'touchmove', 'scroll']) {
    assert.equal(qa.environment.count(type), 0)
    assert.equal(qa.environment.dispatch(type).defaultPrevented, false)
  }
  for (const key of [
    'ArrowDown',
    'ArrowUp',
    'PageDown',
    'PageUp',
    'Home',
    'End',
    ' '
  ]) {
    assert.equal(
      qa.environment.dispatch('keydown', { key }).defaultPrevented,
      false
    )
  }
  for (const key of ['Tab', 'Enter', '9', 'b', 'a', 'k']) {
    assert.equal(
      qa.environment.dispatch('keydown', { key }).defaultPrevented,
      true
    )
    assert.equal(
      qa.environment.dispatch('keyup', { key }).defaultPrevented,
      true
    )
    assert.equal(
      qa.environment.dispatch('keypress', { key }).defaultPrevented,
      true
    )
  }
  assert.equal(shortcuts, 0)
  assert.equal(
    qa.environment.dispatch('keydown', { key: 'l', ctrlKey: true })
      .defaultPrevented,
    false
  )
  assert.equal(shortcuts, 0)
  // Esc always escapes the modal, even if a stale editable target is reported.
  qa.environment.dispatch('keydown', {
    key: 'Escape',
    target: { tagName: 'INPUT' }
  })
  qa.environment.dispatch('keydown', { key: 'Escape', repeat: true })
  assert.equal(qa.escapes, 1)
  qa.lock.unlock()
})

test('focus stays on the frozen surface; unmount restores prior attributes and focus without scrolling', () => {
  const qa = setup()
  qa.background.setAttribute('data-cirno-frozen', 'previous-value')
  qa.lock.lock()
  qa.environment.document.activeElement = { outside: true }
  qa.environment.dispatch('focusin', {
    target: qa.environment.document.activeElement
  })
  assert.equal(qa.environment.document.activeElement, qa.surface)
  assert.deepEqual(qa.surface.lastFocus, { preventScroll: true })
  qa.lock.unlock()
  qa.lock.unlock()
  assert.equal(qa.background.getAttribute('inert'), null)
  assert.equal(
    qa.background.getAttribute('data-cirno-frozen'),
    'previous-value'
  )
  assert.deepEqual(qa.originalFocus.calls, [{ preventScroll: true }])
  assert.equal([...qa.environment.listeners.values()].flat().length, 0)

  qa.background.setAttribute('inert', 'already-inert')
  qa.originalFocus.calls.length = 0
  qa.lock.lock()
  qa.lock.unlock()
  assert.equal(qa.background.getAttribute('inert'), 'already-inert')
  assert.equal(qa.originalFocus.calls.length, 0)
})

test('both scroll and Escape retain the interaction lock until the fracture finishes', () => {
  for (const trigger of ['scroll', 'escape']) {
    const qa = setup()
    const preference = new Target()
    preference.matches = false
    qa.environment.matchMedia = () => preference
    qa.environment.innerHeight = 800
    const frames = new Map(),
      timers = new Map(),
      changes = []
    let id = 0,
      activations = 0
    qa.environment.requestAnimationFrame = (callback) => {
      frames.set(++id, callback)
      return id
    }
    qa.environment.cancelAnimationFrame = (key) => frames.delete(key)
    qa.environment.setTimeout = (callback) => {
      timers.set(++id, callback)
      return id
    }
    qa.environment.clearTimeout = (key) => timers.delete(key)
    qa.environment.addEventListener('click', () => activations++)
    let interaction
    const thaw = createIceThawController(qa.environment, {
      onChange: (value) => changes.push(value),
      onComplete: () => interaction.unlock()
    })
    interaction = createFreezeInteractionLock(qa.environment, {
      surface: qa.surface,
      background: qa.background,
      onEscape: () => thaw.shatter()
    })
    interaction.lock()
    thaw.start()
    if (trigger === 'escape')
      qa.environment.dispatch('keydown', { key: 'Escape' })
    else {
      qa.environment.scrollY = 200
      qa.environment.dispatch('scroll')
      for (const callback of [...frames.values()]) callback()
      frames.clear()
    }
    assert.equal(changes.at(-1).phase, 'shattering')
    assert.equal(qa.background.getAttribute('inert'), '')
    qa.environment.dispatch('click')
    assert.equal(activations, 0)
    for (const callback of [...timers.values()]) callback()
    timers.clear()
    assert.equal(qa.background.getAttribute('inert'), null)
    qa.environment.dispatch('click')
    assert.equal(activations, 1)
    assert.equal(qa.environment.count('keydown'), 0)
    assert.equal(preference.count('change'), 0)
  }
})
