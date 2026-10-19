import { describe, expect, it } from 'vitest'
import { createImageLoader } from '../app/utils/image-loader'
import type {
  ImageLoaderEnvironment,
  ImageLoaderHandler,
  ImageLoaderRequest,
  ImageLoaderState
} from '../app/utils/image-loader'

/** Mirrors the live `<img>`: the template sets `src` once, the loader adopts it. */
class FakeImage implements ImageLoaderRequest {
  complete = false
  naturalWidth = 0
  naturalHeight = 0
  onload: ImageLoaderHandler = null
  onerror: ImageLoaderHandler = null
  decode?: () => Promise<void>
  /** Network attempts for this element: one from its rendered src, plus forced retries. */
  fetches = 1
  private attribute: string | null

  constructor(src: string) {
    this.attribute = src
  }

  get src(): string {
    return this.attribute ?? ''
  }

  set src(value: string) {
    this.attribute = value
    this.fetches++
    this.complete = false
    this.naturalWidth = 0
    this.naturalHeight = 0
  }

  getAttribute(name: string): string | null {
    return name === 'src' ? this.attribute : null
  }

  removeAttribute(name: string): void {
    if (name === 'src') this.attribute = null
  }

  finish(width = 1200, height = 800): Promise<unknown> | unknown {
    this.complete = true
    this.naturalWidth = width
    this.naturalHeight = height
    return this.onload?.()
  }

  fail(): void {
    this.complete = true
    this.naturalWidth = 0
    this.onerror?.()
  }
}

function setup() {
  const timers = new Map<number, { callback: () => void; delay: number }>()
  const listeners = new Map<string, () => void>()
  const states: ImageLoaderState[] = []
  let id = 0
  let element: FakeImage | null = null

  const environment: ImageLoaderEnvironment = {
    image: () => element,
    setTimeout: (callback, delay) => {
      timers.set(++id, { callback, delay })
      return id
    },
    clearTimeout: (handle) => {
      timers.delete(handle)
    },
    addEventListener: (type, listener) => {
      listeners.set(type, listener)
    },
    removeEventListener: (type) => {
      listeners.delete(type)
    }
  }
  const loader = createImageLoader(environment, (state) => states.push(state))

  const fire = (delay: number): void => {
    for (const [key, timer] of [...timers]) {
      if (timer.delay === delay && timers.delete(key)) timer.callback()
    }
  }

  return {
    loader,
    states,
    timers,
    listeners,
    fire,
    render(src: string): FakeImage {
      element = new FakeImage(src)
      return element
    },
    drop(): void {
      element = null
    },
    get element(): FakeImage {
      if (!element) throw new Error('No rendered image')
      return element
    },
    get state(): ImageLoaderState {
      const last = states.at(-1)
      if (!last) throw new Error('No state published yet')
      return last
    }
  }
}

const deferred = () => {
  let resolve: () => void = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('progressive image loader', () => {
  it('adopts the rendered element and never re-fetches the first attempt', async () => {
    const qa = setup()
    const element = qa.render('/photo.jpg')
    qa.loader.configure({ src: '/photo.jpg', fallbackSrc: '' })
    expect(qa.states.length).toBe(1)
    qa.loader.enter()
    qa.loader.enter()
    expect(element.fetches).toBe(1)
    expect(qa.state.status).toBe('loading')
    element.finish()
    expect(qa.state.status).toBe('ready')
    expect(element.fetches).toBe(1)
    expect(qa.state.requestId).toBe(1)
  })

  it('waits for the re-rendered element when the source changes, without a stale fetch', () => {
    const qa = setup()
    const thumb = qa.render('/photo-thumb.webp')
    qa.loader.configure({ src: '/photo-thumb.webp', fallbackSrc: '/photo.jpg' })
    qa.loader.enter()
    thumb.fail()
    // The fallback is published immediately, but the element still holds the
    // failed thumbnail until Vue applies the new source.
    expect(qa.state.source).toBe('/photo.jpg')
    expect(qa.state.status).toBe('loading')
    const original = qa.render('/photo.jpg')
    qa.fire(0)
    expect(qa.state.status).toBe('loading')
    expect(thumb.fetches).toBe(1)
    expect(original.fetches).toBe(1)
    original.finish()
    expect(qa.state.status).toBe('ready')
    expect(qa.state.width).toBe(1200)
  })

  it('adopts the re-rendered element exactly once after the fallback', () => {
    const qa = setup()
    const thumb = qa.render('/photo-thumb.webp')
    qa.loader.configure({ src: '/photo-thumb.webp', fallbackSrc: '/photo.jpg', eager: true })
    thumb.fail()
    const original = qa.render('/photo.jpg')
    qa.fire(0)
    expect(qa.state.status).toBe('loading')
    expect(qa.state.source).toBe('/photo.jpg')
    expect([...qa.timers.values()].filter((timer) => timer.delay === 0)).toHaveLength(0)
    expect(original.fetches).toBe(1)
    // A second flush must neither re-adopt nor re-fetch.
    qa.fire(0)
    expect(original.fetches).toBe(1)
    original.finish()
    expect(qa.state.status).toBe('ready')
  })

  it('clears a pending fallback adoption on dispose', () => {
    const qa = setup()
    const thumb = qa.render('/photo-thumb.webp')
    qa.loader.configure({ src: '/photo-thumb.webp', fallbackSrc: '/photo.jpg', eager: true })
    thumb.fail()
    expect([...qa.timers.values()].filter((timer) => timer.delay === 0)).toHaveLength(1)
    qa.loader.dispose()
    expect(qa.timers.size).toBe(0)
    const original = qa.render('/photo.jpg')
    qa.fire(0)
    expect(qa.state.requestId).toBe(1)
    expect(original.fetches).toBe(1)
  })

  it('does not reveal the image before its decode finishes', async () => {
    const qa = setup()
    const element = qa.render('/photo.jpg')
    const decode = deferred()
    element.decode = () => decode.promise
    qa.loader.configure({ src: '/photo.jpg', eager: true })
    const completion = element.finish()
    expect(qa.state.status).toBe('decoding')
    expect(qa.state.width).toBe(1200)
    decode.resolve()
    await completion
    expect(qa.state.status).toBe('ready')
    expect(qa.timers.size).toBe(0)
  })

  it('a late decode cannot replace the current source after navigation', async () => {
    const qa = setup()
    const first = qa.render('/old.jpg')
    const decode = deferred()
    first.decode = () => decode.promise
    qa.loader.configure({ src: '/old.jpg', eager: true })
    const completion = first.finish()
    const second = qa.render('/new.jpg')
    qa.loader.configure({ src: '/new.jpg', eager: true })
    decode.resolve()
    await completion
    expect(qa.state.source).toBe('/new.jpg')
    expect(qa.state.status).toBe('loading')
    second.finish()
    expect(qa.state.status).toBe('ready')
  })

  it('a missing thumbnail falls back once, then retries with bounded backoff', () => {
    const qa = setup()
    const thumb = qa.render('/broken-thumb.webp')
    qa.loader.configure({
      src: '/broken-thumb.webp',
      fallbackSrc: '/broken.jpg',
      eager: true
    })
    thumb.fail()
    const original = qa.render('/broken.jpg')
    qa.fire(0)
    expect(qa.state.source).toBe('/broken.jpg')
    for (const delay of [1500, 3000, 4500]) {
      original.fail()
      expect(qa.state.status).toBe('retrying')
      expect([...qa.timers.values()].at(-1)?.delay).toBe(delay)
      qa.fire(delay)
    }
    original.fail()
    expect(qa.state.status).toBe('error')
    expect(original.fetches).toBe(4)
    expect(qa.timers.size).toBe(0)
  })

  it('going online retries immediately and re-runs the load algorithm', () => {
    const qa = setup()
    const element = qa.render('/photo.jpg')
    qa.loader.configure({ src: '/photo.jpg', eager: true })
    for (const delay of [1500, 3000, 4500]) {
      element.fail()
      qa.fire(delay)
    }
    element.fail()
    expect(qa.state.status).toBe('error')
    const before = qa.state.requestId
    qa.listeners.get('online')?.()
    expect(qa.state.status).toBe('loading')
    expect(element.fetches).toBe(5)
    expect(qa.state.requestId).not.toBe(before)
  })

  it('a recovered attempt gets a fresh request id on the same element', () => {
    const qa = setup()
    const element = qa.render('/photo.jpg')
    qa.loader.configure({ src: '/photo.jpg', eager: true })
    const first = qa.state.requestId
    element.fail()
    qa.fire(1500)
    expect(qa.state.requestId).not.toBe(first)
    expect(element.fetches).toBe(2)
    element.finish()
    expect(qa.state.status).toBe('ready')
  })

  it('slow downloads keep the placeholder state and settle cleanly', async () => {
    const qa = setup()
    const element = qa.render('/slow.jpg')
    qa.loader.configure({ src: '/slow.jpg', eager: true })
    qa.fire(4500)
    expect(qa.state.status).toBe('loading')
    expect(qa.state.slow).toBe(true)
    await element.finish()
    expect(qa.state.status).toBe('ready')
    expect(qa.state.slow).toBe(false)
  })

  it('cached decode rejection and older engines still display usable images', async () => {
    for (const decode of [undefined, () => Promise.reject(Error('Already decoded'))]) {
      const qa = setup()
      const element = qa.render('/cached.jpg')
      element.decode = decode
      qa.loader.configure({ src: '/cached.jpg', eager: true })
      await element.finish()
      expect(qa.state.status).toBe('ready')
    }
  })

  it('a stalled background decoder cannot leave a downloaded image hidden', async () => {
    const qa = setup()
    const element = qa.render('/background.jpg')
    element.decode = () => new Promise<void>(() => {})
    qa.loader.configure({ src: '/background.jpg', eager: true })
    const completion = element.finish()
    expect(qa.state.status).toBe('decoding')
    qa.fire(1500)
    await completion
    expect(qa.state.status).toBe('ready')
    expect(qa.timers.size).toBe(0)
  })

  it('dispose detaches handlers, listeners, timers and pending decodes', async () => {
    const qa = setup()
    const element = qa.render('/photo.jpg')
    const decode = deferred()
    element.decode = () => decode.promise
    qa.loader.configure({ src: '/photo.jpg', eager: true })
    const completion = element.finish()
    const count = qa.states.length
    qa.loader.dispose()
    decode.resolve()
    await completion
    expect(qa.states.length).toBe(count)
    expect(element.onload).toBeNull()
    expect(element.onerror).toBeNull()
    expect(qa.timers.size).toBe(0)
    expect(qa.listeners.size).toBe(0)
    element.fail()
    expect(element.fetches).toBe(1)
  })

  it('empty sources and identical fallbacks never issue redundant fetches', () => {
    const qa = setup()
    qa.render('/unused.jpg')
    qa.loader.configure({ src: '', fallbackSrc: '', eager: true })
    expect(qa.state.status).toBe('empty')
    expect(qa.state.requestId).toBeUndefined()

    const same = setup()
    const element = same.render('/same.jpg')
    same.loader.configure({ src: '/same.jpg', fallbackSrc: '/same.jpg', eager: true })
    element.fail()
    expect(element.fetches).toBe(1)
    expect(same.state.status).toBe('retrying')
  })

  it('waits for the element to render before starting an attempt', () => {
    const qa = setup()
    qa.drop()
    qa.loader.configure({ src: '/photo.jpg', eager: true })
    expect(qa.state.status).toBe('idle')
    expect(qa.state.requestId).toBeUndefined()
    const element = qa.render('/photo.jpg')
    qa.loader.enter()
    expect(qa.state.status).toBe('loading')
    expect(element.fetches).toBe(1)
  })
})
