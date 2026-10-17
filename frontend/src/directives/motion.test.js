import test from 'node:test'
import assert from 'node:assert/strict'
import { createRevealController, observeMotionScene } from './motion.js'

class Target {
  listeners = new Map()
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type).add(listener)
  }
  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener)
  }
  emit(type, detail = {}) {
    for (const listener of this.listeners.get(type) || [])
      listener({ currentTarget: this, ...detail })
  }
  count(type) {
    return this.listeners.get(type)?.size || 0
  }
}

function element() {
  const target = new Target()
  target.dataset = {}
  target.classList = new Set()
  target.styles = new Map()
  target.style = {
    setProperty: (name, value) => target.styles.set(name, value)
  }
  return target
}

function setup(reduced = false) {
  const preference = new Target()
  preference.matches = reduced
  const document = new Target()
  document.hidden = false
  const observers = []
  class Observer {
    targets = new Set()
    disconnected = false
    constructor(callback) {
      this.callback = callback
      observers.push(this)
    }
    observe(target) {
      this.targets.add(target)
    }
    unobserve(target) {
      this.targets.delete(target)
    }
    disconnect() {
      this.disconnected = true
      this.targets.clear()
    }
    intersect(target, isIntersecting) {
      this.callback([{ target, isIntersecting }])
    }
  }
  const environment = {
    document,
    matchMedia: () => preference,
    IntersectionObserver: Observer
  }
  return { environment, preference, document, observers }
}

test('missing APIs and reduced-motion preference leave content visible', () => {
  for (const environment of [
    undefined,
    {},
    { matchMedia: () => ({ matches: false }) },
    setup(true).environment
  ]) {
    const target = element()
    createRevealController(environment).mount(target)
    assert.equal(target.dataset.reveal, undefined)
    assert.equal(target.classList.has('club-reveal'), false)
  }
})

test('cards share an observer, reveal once and release all listeners', () => {
  const { environment, observers, preference } = setup()
  const controller = createRevealController(environment)
  const first = element(),
    second = element()
  controller.mount(first, { delay: 900, variant: 'scale' })
  controller.mount(second, -10)
  assert.equal(observers.length, 1)
  assert.equal(first.styles.get('--reveal-delay'), '240ms')
  assert.equal(first.styles.get('--reveal-mobile-delay'), '120ms')
  assert.equal(second.styles.get('--reveal-delay'), '0ms')
  assert.equal(first.dataset.revealVariant, 'scale')
  observers[0].intersect(first, false)
  assert.equal(first.dataset.reveal, 'pending')
  observers[0].intersect(first, true)
  assert.equal(first.dataset.reveal, 'visible')
  assert.equal(observers[0].targets.has(first), false)
  observers[0].intersect(first, false)
  assert.equal(first.dataset.reveal, 'visible')
  observers[0].intersect(second, true)
  assert.equal(observers[0].disconnected, true)
  assert.equal(first.count('focusin'), 0)
  assert.equal(preference.count('change'), 0)
})

test('late API cards can mount after the previous observer completed', () => {
  const { environment, observers, preference } = setup()
  const controller = createRevealController(environment)
  const first = element(),
    late = element()
  controller.mount(first)
  observers[0].intersect(first, true)
  controller.mount(late, 80)
  assert.equal(observers.length, 2)
  assert.equal(preference.count('change'), 1)
  assert.equal(late.dataset.reveal, 'pending')
  observers[1].intersect(late, true)
  assert.equal(late.dataset.reveal, 'visible')
  assert.equal(preference.count('change'), 0)
})

test('keyboard focus reveals the card immediately without stagger delay', () => {
  const { environment, observers } = setup()
  const target = element()
  createRevealController(environment).mount(target, 180)
  target.emit('focusin')
  assert.equal(target.dataset.reveal, 'visible')
  assert.equal(target.styles.get('--reveal-delay'), '0ms')
  assert.equal(target.styles.get('--reveal-mobile-delay'), '0ms')
  assert.equal(observers[0].disconnected, true)
})

test('turning reduced motion on reveals pending cards and skips later cards', () => {
  const { environment, observers, preference } = setup()
  const controller = createRevealController(environment)
  const first = element(),
    second = element(),
    late = element()
  controller.mount(first, 100)
  controller.mount(second, 200)
  preference.matches = true
  preference.emit('change', { matches: true })
  assert.equal(first.dataset.reveal, 'visible')
  assert.equal(second.dataset.reveal, 'visible')
  assert.equal(observers[0].disconnected, true)
  controller.mount(late)
  assert.equal(late.dataset.reveal, undefined)
})

test('unmount and dispose release pending observations and focus listeners', () => {
  const { environment, observers, preference } = setup()
  const controller = createRevealController(environment)
  const first = element(),
    second = element()
  controller.mount(first)
  controller.mount(second)
  controller.unmount(first)
  assert.equal(observers[0].targets.has(first), false)
  assert.equal(first.count('focusin'), 0)
  controller.dispose()
  assert.equal(second.dataset.reveal, 'visible')
  assert.equal(second.count('focusin'), 0)
  assert.equal(preference.count('change'), 0)
  assert.equal(observers[0].disconnected, true)
})

test('observer construction and observe failures fail open', () => {
  for (const failDuringObserve of [false, true]) {
    const { environment } = setup()
    environment.IntersectionObserver = class {
      constructor() {
        if (!failDuringObserve) throw Error('unavailable')
      }
      observe() {
        throw Error('unavailable')
      }
      unobserve() {}
      disconnect() {}
    }
    const target = element()
    assert.doesNotThrow(() => createRevealController(environment).mount(target))
    assert.notEqual(target.dataset.reveal, 'pending')
    assert.equal(target.count('focusin'), 0)
  }
})

test('scene pauses offscreen, in background and for reduced motion; cleanup detaches', () => {
  const { environment, observers, preference, document } = setup()
  const target = element()
  const cleanup = observeMotionScene(target, environment)
  assert.equal(target.dataset.sceneActive, 'true')
  observers[0].intersect(target, false)
  assert.equal(target.dataset.sceneActive, 'false')
  observers[0].intersect(target, true)
  assert.equal(target.dataset.sceneActive, 'true')
  document.hidden = true
  document.emit('visibilitychange')
  assert.equal(target.dataset.sceneActive, 'false')
  document.hidden = false
  document.emit('visibilitychange')
  assert.equal(target.dataset.sceneActive, 'true')
  preference.matches = true
  preference.emit('change')
  assert.equal(target.dataset.sceneActive, 'false')
  preference.matches = false
  preference.emit('change')
  assert.equal(target.dataset.sceneActive, 'true')
  cleanup()
  assert.equal(target.dataset.sceneActive, 'false')
  assert.equal(preference.count('change'), 0)
  assert.equal(document.count('visibilitychange'), 0)
  assert.equal(observers[0].disconnected, true)
})
