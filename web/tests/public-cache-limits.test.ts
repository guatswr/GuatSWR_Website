import { describe, expect, it } from 'vitest'
import {
  PUBLIC_CACHE_HARD_LIMITS,
  PUBLIC_CACHE_LIMITS,
  PUBLIC_DATA_POLICY,
  createPublicDataCache,
} from '../server/utils/public-cache'
import type { PublicCacheRead } from '../server/utils/public-cache'

const origin = 'http://127.0.0.1:8080'

const unavailable = () => Object.assign(new Error('upstream unavailable'), { statusCode: 502 })

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('public data cache admission and hard limits', () => {
  it('clamps every option to the documented hard ceiling', () => {
    const cache = createPublicDataCache({
      maxKeys: 10_000_000,
      maxInflight: 10_000_000,
      maxEntryBytes: Number.MAX_SAFE_INTEGER,
      maxTotalBytes: Number.MAX_SAFE_INTEGER,
    })
    expect(cache.limits).toEqual({ ...PUBLIC_CACHE_HARD_LIMITS })

    const fallback = createPublicDataCache({
      maxKeys: 0,
      maxInflight: -1,
      maxEntryBytes: Number.NaN,
      maxTotalBytes: 1.5,
    })
    expect(fallback.limits).toEqual({ ...PUBLIC_CACHE_HARD_LIMITS })

    const lowered = createPublicDataCache({
      maxKeys: 2,
      maxInflight: 1,
      maxEntryBytes: 16,
      maxTotalBytes: 32,
    })
    expect(lowered.limits).toEqual({ maxKeys: 2, maxInflight: 1, maxEntryBytes: 16, maxTotalBytes: 32 })
    expect(PUBLIC_CACHE_LIMITS).toEqual(PUBLIC_CACHE_HARD_LIMITS)
  })

  it('admits at most maxInflight unique fills, dedupes admitted keys and refuses the rest with a public 503', async () => {
    const cache = createPublicDataCache({ maxInflight: 2 })
    const gates = [deferred<string>(), deferred<string>(), deferred<string>()]
    let calls = 0
    const read = (id: number) => cache.read({
      kind: 'events' as const,
      origin,
      parameters: ['detail', id],
      load: () => {
        calls += 1
        return gates[id - 1]!.promise
      },
    })

    const first = read(1)
    const second = read(2)
    expect(cache.inflightCount).toBe(2)
    expect(calls).toBe(2)

    // The same already-admitted key still deduplicates at capacity.
    const duplicate = read(1)
    expect(cache.inflightCount).toBe(2)
    expect(calls).toBe(2)

    const refused = await read(3).catch((error: unknown) => error) as {
      statusCode?: number
      message?: string
    }
    expect(refused.statusCode).toBe(503)
    expect(refused.message ?? '').not.toContain('127.0.0.1')
    expect(calls).toBe(2)
    expect(cache.inflightCount).toBe(2)

    gates[0]!.resolve('one')
    gates[1]!.resolve('two')
    await expect(Promise.all([first, second, duplicate])).resolves.toEqual(['one', 'two', 'one'])
    await cache.settled()
    expect(cache.inflightCount).toBe(0)

    // A slot freed by settling admits the next fill.
    gates[2]!.resolve('three')
    expect(await read(3)).toBe('three')
    expect(calls).toBe(3)
    expect(cache.inflightCount).toBe(0)
  })

  it('releases admission after a failed fill and does not cache the rejection', async () => {
    const cache = createPublicDataCache({ maxInflight: 1 })
    const failure = unavailable()
    let calls = 0
    const read = (id: number) => cache.read({
      kind: 'activities' as const,
      origin,
      parameters: ['detail', id],
      load: async () => {
        calls += 1
        if (id === 2) throw failure
        return `value-${id}`
      },
    })

    expect(await read(1)).toBe('value-1')
    expect(cache.inflightCount).toBe(0)

    await expect(read(2)).rejects.toBe(failure)
    await cache.settled()
    expect(cache.inflightCount).toBe(0)
    expect(cache.size).toBe(1)

    // The freed slot admits the next fill rather than staying exhausted.
    expect(await read(3)).toBe('value-3')
    expect(calls).toBe(3)
    expect(cache.inflightCount).toBe(0)
  })

  it('skips a background refresh at capacity while still serving the stale DTO', async () => {
    const clock = { time: 0 }
    const cache = createPublicDataCache({ now: () => clock.time, maxInflight: 1 })
    let calls = 0
    const request: PublicCacheRead<string> = {
      kind: 'history',
      origin,
      parameters: ['list'],
      load: async () => {
        calls += 1
        return `stale-${calls}`
      },
    }

    expect(await cache.read(request)).toBe('stale-1')
    clock.time = PUBLIC_DATA_POLICY.history.freshMs + 1

    const blocker = deferred<string>()
    const blockingRead = cache.read({
      kind: 'events',
      origin,
      parameters: ['detail', 99],
      load: () => blocker.promise,
    })
    expect(cache.inflightCount).toBe(1)

    // At capacity the stale value is still a successful read; the refresh is
    // skipped instead of turning into a 503.
    expect(await cache.read(request)).toBe('stale-1')
    expect(calls).toBe(1)
    expect(cache.inflightCount).toBe(1)

    blocker.resolve('blocked')
    await expect(blockingRead).resolves.toBe('blocked')
    await cache.settled()
    expect(cache.inflightCount).toBe(0)

    // Capacity is free again, so the next stale read refreshes normally.
    expect(await cache.read(request)).toBe('stale-1')
    await cache.settled()
    expect(await cache.read(request)).toBe('stale-2')
    expect(calls).toBe(2)
  })

  it('keeps pending fills bounded across repeated invalidation and releases them on settle', async () => {
    const cache = createPublicDataCache({ maxInflight: 3 })
    const gates = [deferred<string>(), deferred<string>(), deferred<string>()]
    const read = (id: number) => cache.read({
      kind: 'members' as const,
      origin,
      parameters: ['detail', id],
      load: () => gates[id - 1]!.promise,
    })

    const pending = [read(1), read(2), read(3)]
    expect(cache.inflightCount).toBe(3)

    for (let round = 0; round < 10; round += 1) cache.invalidate(['members'])
    expect(cache.inflightCount).toBe(3)
    expect(cache.size).toBe(0)

    const refused = await read(4).catch((error: unknown) => error) as { statusCode?: number }
    expect(refused.statusCode).toBe(503)
    expect(cache.inflightCount).toBe(3)

    for (const gate of gates) gate.resolve('settled')
    await expect(Promise.all(pending)).resolves.toEqual(['settled', 'settled', 'settled'])
    await cache.settled()
    expect(cache.inflightCount).toBe(0)
    // Obsolete-generation results were never retained under the new generation.
    expect(cache.size).toBe(0)
  })
})
