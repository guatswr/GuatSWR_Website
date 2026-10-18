import test from 'node:test'
import assert from 'node:assert/strict'
import { createImageLoader } from './imageLoader.js'

function setup() {
  const requests = [],
    states = [],
    timers = new Map(),
    listeners = new Map()
  let id = 0
  class Image {
    naturalWidth = 1200
    naturalHeight = 800
    order = []
    constructor() {
      requests.push(this)
    }
    set src(value) {
      this.url = value
      this.order.push({ priority: this.fetchPriority, value })
    }
    decode = async () => {}
  }
  const environment = {
    Image,
    setTimeout(callback, delay) {
      timers.set(++id, { callback, delay })
      return id
    },
    clearTimeout(key) {
      timers.delete(key)
    },
    addEventListener(type, callback) {
      listeners.set(type, callback)
    },
    removeEventListener(type) {
      listeners.delete(type)
    }
  }
  const loader = createImageLoader(environment, (state) => states.push(state))
  const fire = (delay) => {
    for (const [key, timer] of [...timers])
      if (timer.delay === delay && timers.delete(key)) timer.callback()
  }
  return {
    loader,
    requests,
    states,
    timers,
    listeners,
    fire,
    get state() {
      return states.at(-1)
    }
  }
}
const deferred = () => {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

test('near-viewport entry starts a single request; hero priority is assigned before src', async () => {
  const qa = setup()
  qa.loader.configure({ src: '/photo.jpg', fallbackSrc: '' })
  assert.equal(qa.requests.length, 0)
  qa.loader.enter()
  qa.loader.enter()
  assert.equal(qa.requests.length, 1)
  qa.loader.configure({ src: '/photo.jpg', fallbackSrc: '', eager: true })
  assert.equal(qa.requests.length, 1)
  assert.equal(qa.requests[0].fetchPriority, 'high')
  const hero = setup()
  hero.loader.configure({ src: '/hero.jpg', eager: true })
  assert.deepEqual(hero.requests[0].order, [
    { priority: 'high', value: '/hero.jpg' }
  ])
  await hero.requests[0].onload()
  hero.loader.configure({ src: '/hero.jpg', eager: true })
  assert.equal(hero.requests.length, 1)
})

test('network completion does not reveal the image before its decode finishes', async () => {
  const qa = setup(),
    decode = deferred()
  qa.loader.configure({ src: '/photo.jpg', eager: true })
  qa.requests[0].decode = () => decode.promise
  const completion = qa.requests[0].onload()
  assert.equal(qa.state.status, 'decoding')
  assert.equal(qa.state.width, 1200)
  decode.resolve()
  await completion
  assert.equal(qa.state.status, 'ready')
  assert.equal(qa.timers.size, 0)
})

test('a late decode cannot replace the current source after navigation or rapid source changes', async () => {
  const qa = setup(),
    decode = deferred()
  qa.loader.configure({ src: '/old.jpg', eager: true })
  const staleError = qa.requests[0].onerror
  qa.requests[0].decode = () => decode.promise
  const completion = qa.requests[0].onload()
  qa.loader.configure({ src: '/new.jpg', eager: true })
  staleError()
  decode.resolve()
  await completion
  assert.equal(qa.state.source, '/new.jpg')
  assert.equal(qa.state.status, 'loading')
  await qa.requests[1].onload()
  assert.equal(qa.state.status, 'ready')
})

test('a missing thumbnail falls back immediately; later failures have bounded retries', () => {
  const qa = setup()
  qa.loader.configure({
    src: '/missing-thumb.webp',
    fallbackSrc: '/original.jpg',
    eager: true
  })
  qa.requests[0].onerror()
  assert.equal(qa.requests.length, 2)
  assert.equal(qa.state.source, '/original.jpg')
  for (const delay of [1500, 3000, 4500]) {
    qa.requests.at(-1).onerror()
    assert.equal(qa.state.status, 'retrying')
    qa.fire(delay)
  }
  qa.requests.at(-1).onerror()
  assert.equal(qa.requests.length, 5)
  assert.equal(qa.state.status, 'error')
  assert.equal(qa.timers.size, 0)
  qa.listeners.get('online')()
  assert.equal(qa.requests.length, 6)
  assert.equal(qa.state.status, 'loading')
})

test('slow downloads keep their placeholder state and settle cleanly when ready', async () => {
  const qa = setup()
  qa.loader.configure({ src: '/slow.jpg', eager: true })
  qa.fire(4500)
  assert.equal(qa.state.status, 'loading')
  assert.equal(qa.state.slow, true)
  await qa.requests[0].onload()
  assert.equal(qa.state.status, 'ready')
  assert.equal(qa.state.slow, false)
})

test('a recovered request gets a fresh DOM identity instead of reusing a broken image', async () => {
  const qa = setup()
  qa.loader.configure({ src: '/recover.jpg', eager: true })
  const firstId = qa.state.requestId
  qa.requests[0].onerror()
  qa.fire(1500)
  assert.notEqual(qa.state.requestId, firstId)
  await qa.requests[1].onload()
  assert.equal(qa.state.status, 'ready')
})

test('cached decode rejection and older engines still display usable images', async () => {
  for (const decode of [
    undefined,
    () => Promise.reject(Error('Already decoded'))
  ]) {
    const qa = setup()
    qa.loader.configure({ src: '/cached.jpg', eager: true })
    qa.requests[0].decode = decode
    await qa.requests[0].onload()
    assert.equal(qa.state.status, 'ready')
  }
})

test('a stalled background decoder cannot leave a downloaded image hidden forever', async () => {
  const qa = setup()
  qa.loader.configure({ src: '/background.jpg', eager: true })
  qa.requests[0].decode = () => new Promise(() => {})
  const completion = qa.requests[0].onload()
  assert.equal(qa.state.status, 'decoding')
  qa.fire(1500)
  await completion
  assert.equal(qa.state.status, 'ready')
  assert.equal(qa.timers.size, 0)
})

test('unmount detaches requests, online listener, retry timers and pending decodes', async () => {
  const qa = setup(),
    decode = deferred()
  qa.loader.configure({ src: '/photo.jpg', eager: true })
  qa.requests[0].decode = () => decode.promise
  const completion = qa.requests[0].onload()
  const count = qa.states.length
  qa.loader.dispose()
  decode.resolve()
  await completion
  assert.equal(qa.states.length, count)
  assert.equal(qa.requests[0].onload, null)
  assert.equal(qa.timers.size, 0)
  assert.equal(qa.listeners.size, 0)
  const retry = setup()
  retry.loader.configure({ src: '/broken.jpg', eager: true })
  retry.requests[0].onerror()
  retry.loader.dispose()
  retry.fire(1500)
  assert.equal(retry.requests.length, 1)
})

test('empty images and identical fallback URLs never create redundant requests', () => {
  const qa = setup()
  qa.loader.configure({ src: '', fallbackSrc: '', eager: true })
  assert.equal(qa.state.status, 'empty')
  assert.equal(qa.requests.length, 0)
  qa.loader.configure({
    src: '/same.jpg',
    fallbackSrc: '/same.jpg',
    eager: true
  })
  qa.requests[0].onerror()
  assert.equal(qa.requests.length, 1)
  assert.equal(qa.state.status, 'retrying')
})
