import { describe, expect, it } from 'vitest'
import { createScrollFrame } from '../app/utils/scroll-frame'

describe('shared scroll frame', () => {
  function setup() {
    const frames = new Map<number, () => void>()
    let next = 0
    let samples = 0
    const frame = createScrollFrame({
      request: callback => { frames.set(++next, callback); return next },
      cancel: id => { frames.delete(id) },
      snapshot: () => { samples++; return { scrollY: 120, width: 1440, height: 900 } },
    })
    const flush = () => {
      const pending = [...frames.values()]
      frames.clear()
      pending.forEach(callback => callback())
    }
    return { frame, frames, flush, samples: () => samples }
  }

  it('reads all consumers before any writes and samples the viewport once', () => {
    const qa = setup()
    const order: string[] = []
    for (const name of ['navbar', 'reveal']) {
      qa.frame.read(() => {
        order.push(`read:${name}`)
        expect(qa.frame.snapshot?.scrollY).toBe(120)
        qa.frame.write(() => order.push(`write:${name}`))
      })
    }
    expect(qa.frames.size).toBe(1)
    qa.flush()
    expect(order).toEqual(['read:navbar', 'read:reveal', 'write:navbar', 'write:reveal'])
    expect(qa.samples()).toBe(1)
    expect(qa.frame.snapshot).toBeUndefined()
    expect(qa.frames.size).toBe(0)
  })

  it('cancels work for unmounted consumers without losing the others', () => {
    const qa = setup()
    let calls = 0
    const cancelled = qa.frame.read(() => { throw Error('cancelled callback ran') })
    qa.frame.read(() => { calls++ })
    qa.frame.cancel(cancelled)
    qa.flush()
    expect(calls).toBe(1)
    const last = qa.frame.read(() => { calls++ })
    qa.frame.cancel(last)
    expect(qa.frames.size).toBe(0)
  })

  it('defers geometry requested during a write until the next frame', () => {
    const qa = setup()
    const order: string[] = []
    qa.frame.write(() => {
      order.push('write')
      qa.frame.read(() => order.push('next read'))
    })
    qa.flush()
    expect(order).toEqual(['write'])
    expect(qa.frames.size).toBe(1)
    qa.flush()
    expect(order).toEqual(['write', 'next read'])
  })
})
