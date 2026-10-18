import test from 'node:test'
import assert from 'node:assert/strict'
import { createScrollMotionController, scrollProgress } from './scrollMotion.js'

class Target {
  listeners = new Map()
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type).add(callback)
  }
  removeEventListener(type, callback) {
    this.listeners.get(type)?.delete(callback)
  }
  emit(type, event = {}) {
    for (const callback of this.listeners.get(type) || [])
      callback({ currentTarget: this, ...event })
  }
  count(type) {
    return this.listeners.get(type)?.size || 0
  }
}

function setup(reduced = false) {
  const environment = new Target()
  environment.innerHeight = 1000
  environment.innerWidth = 1440
  environment.document = new Target()
  environment.document.hidden = false
  const preference = new Target()
  preference.matches = reduced
  environment.matchMedia = () => preference
  const frames = new Map()
  let nextFrame = 0
  environment.requestAnimationFrame = (callback) => {
    frames.set(++nextFrame, callback)
    return nextFrame
  }
  environment.cancelAnimationFrame = (id) => frames.delete(id)
  const observers = []
  environment.IntersectionObserver = class {
    targets = new Set()
    constructor(callback) {
      this.callback = callback
      observers.push(this)
    }
    observe(element) {
      this.targets.add(element)
    }
    unobserve(element) {
      this.targets.delete(element)
    }
    disconnect() {
      this.targets.clear()
    }
    intersect(element, isIntersecting) {
      this.callback([
        { target: element, isIntersecting, boundingClientRect: element.rect }
      ])
    }
  }
  function flush() {
    const callbacks = [...frames.values()]
    frames.clear()
    for (const callback of callbacks) callback()
  }
  const operations = []
  function element(top = 740) {
    const target = new Target()
    target.dataset = {}
    target.classes = new Set()
    target.classList = {
      add: (name) => target.classes.add(name),
      remove: (...names) => names.forEach((name) => target.classes.delete(name))
    }
    target.rect = { top, height: 300 }
    target.styles = new Map()
    target.style = {
      setProperty: (name, value) => {
        operations.push('write')
        target.styles.set(name, value)
      },
      removeProperty: (name) => target.styles.delete(name)
    }
    target.getBoundingClientRect = () => {
      operations.push('read')
      return target.rect
    }
    target.contains = (other) => other === target
    return target
  }
  return {
    environment,
    preference,
    frames,
    observers,
    flush,
    element,
    operations
  }
}

test('entry progress is clamped, reversible and supports pixel staggering', () => {
  const at = (top, value) => scrollProgress({ top, height: 300 }, 1000, value)
  assert.equal(at(1100), 0)
  assert.equal(at(940), 0)
  assert.equal(at(740), 0.5)
  assert.equal(at(540), 1)
  assert.equal(at(-100), 1)
  assert.ok(at(700) > at(740))
  assert.ok(at(740, 48) < at(740))
  assert.equal(at(740), at(740))
  assert.equal(
    scrollProgress({ top: -500, height: 1000 }, 1000, { variant: 'hero' }),
    0.5
  )
  assert.equal(
    scrollProgress({ top: -500, height: 1000 }, 1000, { variant: 'hero' }, 390),
    0
  )
})

test('hero frames batch reads before writes and follow scroll in both directions', () => {
  const qa = setup()
  const controller = createScrollMotionController(qa.environment)
  const first = qa.element(-150),
    second = qa.element(-150)
  controller.mount(first, { variant: 'hero' })
  controller.mount(second, { variant: 'hero' })
  for (let index = 0; index < 10; index++) qa.environment.emit('scroll')
  assert.equal(qa.frames.size, 1)
  assert.equal(qa.observers.length, 1)
  qa.flush()
  assert.deepEqual(qa.operations, ['read', 'read', 'write', 'write'])
  assert.equal(first.styles.get('--scroll-progress'), '0.5000')
  first.rect.top = -300
  qa.environment.emit('scroll')
  qa.flush()
  assert.equal(first.styles.get('--scroll-progress'), '1.0000')
  first.rect.top = 0
  qa.environment.emit('scroll')
  qa.flush()
  assert.equal(first.styles.get('--scroll-progress'), '0.0000')
  qa.observers[0].intersect(first, false)
  qa.flush()
  qa.operations.length = 0
  qa.environment.emit('scroll')
  qa.flush()
  assert.deepEqual(qa.operations, ['read']) // Only the active second element is measured.
})

test('reduced motion stays visible, cancels work, and can resume without reload', () => {
  const qa = setup(true)
  const controller = createScrollMotionController(qa.environment)
  const element = qa.element()
  controller.mount(element, { variant: 'hero' })
  assert.equal(element.classes.size, 0)
  assert.equal(qa.environment.count('scroll'), 0)
  qa.preference.matches = false
  qa.preference.emit('change')
  assert.equal(element.classes.has('club-scroll-reveal'), true)
  assert.equal(qa.frames.size, 1)
  qa.preference.matches = true
  qa.preference.emit('change')
  assert.equal(qa.frames.size, 0)
  assert.equal(element.classes.size, 0)
  assert.equal(element.styles.size, 0)
  assert.equal(qa.observers[0].targets.size, 0)
})

test('keyboard focus reveals content immediately, including the hero exit state', () => {
  const qa = setup()
  const controller = createScrollMotionController(qa.environment)
  const element = qa.element(940),
    hero = qa.element(-300)
  controller.mount(element)
  controller.mount(hero, { variant: 'hero' })
  qa.flush()
  element.emit('focusin')
  hero.emit('focusin')
  assert.equal(element.dataset.reveal, 'visible')
  assert.equal(hero.styles.get('--scroll-progress'), '0.0000')
  element.emit('focusout', { relatedTarget: null })
  qa.flush()
  assert.equal(element.dataset.reveal, 'visible')
})

test('hidden tabs pause work and the last unmount releases every listener', () => {
  const qa = setup()
  const controller = createScrollMotionController(qa.environment)
  const first = qa.element(),
    second = qa.element()
  controller.mount(first, { variant: 'hero' })
  controller.mount(second, { variant: 'hero' })
  qa.environment.document.hidden = true
  qa.environment.document.emit('visibilitychange')
  assert.equal(qa.frames.size, 0)
  qa.environment.emit('scroll')
  assert.equal(qa.frames.size, 0)
  qa.environment.document.hidden = false
  qa.environment.document.emit('visibilitychange')
  assert.equal(qa.frames.size, 1)
  controller.unmount(first)
  assert.equal(qa.environment.count('scroll'), 1)
  controller.unmount(second)
  assert.equal(qa.frames.size, 0)
  assert.equal(qa.environment.count('scroll'), 0)
  assert.equal(qa.environment.count('resize'), 0)
  assert.equal(qa.environment.document.count('visibilitychange'), 0)
  assert.equal(qa.preference.count('change'), 0)
  assert.equal(qa.observers[0].targets.size, 0)
  assert.equal(first.count('focusin'), 0)
  assert.equal(second.count('focusout'), 0)
  assert.equal(second.classes.size, 0)
  assert.equal(second.styles.size, 0)
  controller.mount(first, { variant: 'hero' })
  qa.flush()
  assert.equal(qa.environment.count('scroll'), 1)
  assert.equal(qa.observers.length, 2)
})

test('missing APIs and an unavailable observer fail open', () => {
  const qa = setup()
  for (const environment of [undefined, {}]) {
    const element = qa.element()
    createScrollMotionController(environment).mount(element)
    assert.equal(element.classes.has('club-reveal'), false)
  }
  qa.environment.IntersectionObserver = class {
    constructor() {
      throw Error('Unavailable')
    }
  }
  const element = qa.element()
  const controller = createScrollMotionController(qa.environment)
  controller.mount(element)
  assert.equal(element.classes.has('club-reveal'), false)
  assert.equal(qa.frames.size, 0)
  controller.unmount(element)
  assert.equal(qa.preference.count('change'), 0)
})

test('content entrances reveal once with a row stagger and without a scroll listener', () => {
  const qa = setup()
  const controller = createScrollMotionController(qa.environment)
  const first = qa.element(),
    second = qa.element()
  controller.mount(first, 100)
  controller.mount(second, { variant: 'image', delay: 200 })
  assert.equal(qa.environment.count('scroll'), 0)
  assert.equal(qa.frames.size, 0)
  assert.equal(first.dataset.reveal, 'pending')
  assert.equal(first.styles.get('--reveal-delay'), '100ms')
  assert.equal(second.dataset.revealVariant, 'scale')
  assert.equal(second.styles.get('--reveal-delay'), '200ms')
  qa.observers[0].intersect(first, true)
  qa.observers[0].intersect(second, true)
  assert.equal(first.dataset.reveal, 'visible')
  assert.equal(second.dataset.reveal, 'visible')
  assert.equal(qa.observers[0].targets.size, 0)
  first.rect.top = 1100
  qa.environment.emit('scroll')
  assert.equal(first.dataset.reveal, 'visible')
  controller.unmount(first)
  controller.unmount(second)
  assert.equal(first.classes.size, 0)
  assert.equal(qa.preference.count('change'), 0)
})
