import test from 'node:test'
import assert from 'node:assert/strict'
import { createIceField } from './iceGeometry.js'
import {
  createIceThawController,
  thawDistance,
  thawProgress
} from './iceThaw.js'

class Target {
  listeners = new Map()
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type).add(callback)
  }
  removeEventListener(type, callback) {
    this.listeners.get(type)?.delete(callback)
  }
  emit(type, value = {}) {
    for (const callback of this.listeners.get(type) || []) callback(value)
  }
  count(type) {
    return this.listeners.get(type)?.size || 0
  }
}

function setup(reduced = false) {
  const environment = new Target()
  environment.scrollY = 300
  environment.innerHeight = 800
  const preference = new Target()
  preference.matches = reduced
  environment.matchMedia = () => preference
  const frames = new Map(),
    timers = new Map(),
    changes = []
  let id = 0,
    completions = 0
  environment.requestAnimationFrame = (callback) => {
    frames.set(++id, callback)
    return id
  }
  environment.cancelAnimationFrame = (key) => frames.delete(key)
  environment.setTimeout = (callback, delay) => {
    timers.set(++id, { callback, delay })
    return id
  }
  environment.clearTimeout = (key) => timers.delete(key)
  const controller = createIceThawController(environment, {
    onChange: (value) => changes.push(value),
    onComplete: () => {
      completions++
    }
  })
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

test('responsive ice fields stay deterministic, bounded and retain six wing crystals', () => {
  for (const [width, height] of [
    [320, 640],
    [390, 844],
    [1366, 660],
    [2560, 1440]
  ]) {
    const field = createIceField(width, height)
    assert.deepEqual(createIceField(width, height), field)
    assert.equal(field.crystals.length, 6)
    assert.ok(field.panels.length <= 48)
    assert.ok(field.panels.length >= 16)
    assert.equal(
      new Set(field.panels.map((p) => p.id)).size,
      field.panels.length
    )
    for (const panel of field.panels) {
      assert.equal(panel.facets.length, 4)
      assert.ok(!/NaN|Infinity/.test(panel.points + panel.crack))
      assert.ok(panel.delay + 1180 < 1450)
      // Every polygon stays at the edge, leaving the middle readable.
      const pairs = panel.points
        .split(' ')
        .map((pair) => pair.split(',').map(Number))
      const center = pairs.reduce(
        (p, [x, y]) => [p[0] + x / 4, p[1] + y / 4],
        [0, 0]
      )
      assert.ok(
        center[0] < width * 0.2 ||
          center[0] > width * 0.8 ||
          center[1] < height * 0.2 ||
          center[1] > height * 0.8
      )
    }
    // Adjacent top panels share both seam vertices, so fracture pieces replace
    // the visible frozen surface exactly, without gaps or unrelated sprites.
    const top = field.panels.filter((p) => p.id.startsWith('top-'))
    for (let i = 1; i < top.length; i++) {
      const previous = top[i - 1].points.split(' '),
        current = top[i].points.split(' ')
      assert.equal(previous[1], current[0])
      assert.equal(previous[2], current[3])
    }
  }
})

test('thaw distance adapts to the screen and uses actual downward travel', () => {
  assert.equal(thawDistance(320), 120)
  assert.equal(thawDistance(800), 176)
  assert.equal(thawDistance(1600), 240)
  assert.equal(thawProgress(200, 300, 120), 0)
  assert.equal(thawProgress(360, 300, 120), 0.5)
  assert.equal(thawProgress(900, 300, 120), 1)
})

test('scrolling cracks progressively, upward scrolling does not reseal, and events share one frame', () => {
  const qa = setup()
  qa.controller.start()
  qa.controller.start()
  assert.equal(qa.environment.count('scroll'), 1)
  qa.environment.scrollY = 344
  for (let i = 0; i < 9; i++) qa.environment.emit('scroll')
  assert.equal(qa.frames.size, 1)
  qa.flush()
  assert.equal(qa.changes.at(-1).progress, 0.25)
  qa.environment.scrollY = 300
  qa.environment.emit('scroll')
  qa.flush()
  assert.equal(qa.changes.at(-1).progress, 0.25)
  assert.equal(qa.changes.length, 2)
  qa.environment.scrollY = 500
  qa.environment.emit('scroll')
  qa.flush()
  assert.equal(qa.changes.at(-1).phase, 'shattering')
  assert.equal(qa.timers.size, 1)
  assert.equal(qa.completions, 0)
  qa.controller.shatter()
  qa.environment.emit('scroll')
  assert.equal(qa.timers.size, 1)
  qa.finish()
  assert.equal(qa.completions, 1)
  assert.equal(qa.environment.count('scroll'), 0)
  assert.equal(qa.preference.count('change'), 0)
})

test('navigation keys remain native; Escape dismisses except in editing controls', () => {
  const qa = setup()
  qa.controller.start()
  const preventDefault = () =>
    assert.fail('The effect must not capture native scrolling')
  for (const key of ['ArrowDown', 'PageDown', ' ', 'End'])
    qa.environment.emit('keydown', { key, preventDefault })
  assert.equal(qa.timers.size, 0)
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
  assert.equal(qa.timers.size, 0)
  qa.environment.emit('keydown', { key: 'Escape', preventDefault })
  assert.equal(qa.changes.at(-1).phase, 'shattering')
  qa.finish()
  assert.equal(qa.completions, 1)
})

test('reduced motion keeps a static freeze and dismisses quickly without waiting for CSS events', () => {
  const qa = setup(true)
  qa.controller.start()
  qa.controller.shatter()
  assert.equal(qa.changes.at(-1).reduced, true)
  assert.equal([...qa.timers.values()][0].delay, 160)
  qa.finish()
  assert.equal(qa.completions, 1)
  const live = setup()
  live.controller.start()
  live.controller.shatter()
  live.preference.matches = true
  live.preference.emit('change')
  assert.equal(live.timers.size, 1)
  assert.equal([...live.timers.values()][0].delay, 160)
})

test('unmount cancels listeners, queued frames and fracture timers without callbacks', () => {
  for (const shatter of [false, true]) {
    const qa = setup()
    qa.controller.start()
    qa.environment.emit('scroll')
    if (shatter) qa.controller.shatter()
    qa.controller.destroy()
    qa.controller.destroy()
    assert.equal(qa.frames.size, 0)
    assert.equal(qa.timers.size, 0)
    for (const type of ['scroll', 'resize', 'keydown'])
      assert.equal(qa.environment.count(type), 0)
    assert.equal(qa.preference.count('change'), 0)
    qa.environment.emit('scroll')
    qa.flush()
    qa.finish()
    assert.equal(qa.completions, 0)
  }
})
