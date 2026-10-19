import { describe, expect, it } from 'vitest'
import {
  PUBLIC_CACHE_LIMITS,
  PUBLIC_DATA_POLICY,
  createPublicDataCache,
} from '../server/utils/public-cache'
import type { PublicCacheRead } from '../server/utils/public-cache'

const origin = 'http://127.0.0.1:8080'

const unavailable = () => Object.assign(new Error('upstream unavailable'), { statusCode: 502 })
const notFound = () => Object.assign(new Error('not public'), { statusCode: 404 })

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('public data cache', () => {
  it('serves a fresh value without calling the loader again', async () => {
    const cache = createPublicDataCache()
    let calls = 0
    const request: PublicCacheRead<string> = {
      kind: 'config',
      origin,
      parameters: ['config'],
      load: async () => {
        calls += 1
        return 'value'
      },
    }

    expect(await cache.read(request)).toBe('value')
    expect(await cache.read(request)).toBe('value')
    expect(calls).toBe(1)
    expect(cache.size).toBe(1)
  })

  it('keeps canonical parameters, kinds and backend origins separate', async () => {
    const cache = createPublicDataCache()
    let calls = 0
    const read = (kind: PublicCacheRead<number>['kind'], parameters: (string | number | null)[], target = origin) =>
      cache.read({
        kind,
        origin: target,
        parameters,
        load: async () => {
          calls += 1
          return calls
        },
      })

    expect(await read('activities', ['list', 1, 20])).toBe(1)
    expect(await read('activities', ['list', 1, 20])).toBe(1)
    expect(await read('activities', ['list', 2, 20])).toBe(2)
    expect(await read('activities', ['detail', 1])).toBe(3)
    expect(await read('events', ['list', 1, 20])).toBe(4)
    expect(await read('activities', ['list', 1, 20], 'http://127.0.0.1:9090')).toBe(5)
    // `null` (omitted filter) and the number 0 are distinct key parts.
    expect(await read('logs', ['list', 1, 20, null, null])).toBe(6)
    expect(await read('logs', ['list', 1, 20, 0, null])).toBe(7)
    expect(calls).toBe(7)
  })

  it('deduplicates concurrent fills for one key', async () => {
    const cache = createPublicDataCache()
    const gate = deferred<string>()
    let calls = 0
    const request: PublicCacheRead<string> = {
      kind: 'members',
      origin,
      parameters: ['list', null],
      load: () => {
        calls += 1
        return gate.promise
      },
    }

    const first = cache.read(request)
    const second = cache.read(request)
    const third = cache.read(request)
    expect(calls).toBe(1)

    gate.resolve('members')
    await expect(Promise.all([first, second, third])).resolves.toEqual(['members', 'members', 'members'])
    expect(calls).toBe(1)
  })

  it('returns stale data immediately and refreshes once in the background', async () => {
    const clock = { time: 1_000 }
    const cache = createPublicDataCache({ now: () => clock.time })
    let calls = 0
    let value = 'first'
    const request: PublicCacheRead<string> = {
      kind: 'logs',
      origin,
      parameters: ['list', 1, 20, null, null],
      load: async () => {
        calls += 1
        return value
      },
    }

    expect(await cache.read(request)).toBe('first')
    clock.time += PUBLIC_DATA_POLICY.logs.freshMs + 1
    value = 'second'
    expect(await cache.read(request)).toBe('first')
    expect(calls).toBe(2)

    await cache.settled()
    expect(await cache.read(request)).toBe('second')
    expect(calls).toBe(2)
  })

  it('waits for a fill after the max-stale window instead of serving stale data forever', async () => {
    const clock = { time: 0 }
    const cache = createPublicDataCache({ now: () => clock.time })
    let calls = 0
    let value = 'old'
    const request: PublicCacheRead<string> = {
      kind: 'history',
      origin,
      parameters: ['list'],
      load: async () => {
        calls += 1
        return value
      },
    }

    expect(await cache.read(request)).toBe('old')
    clock.time = PUBLIC_DATA_POLICY.history.freshMs + PUBLIC_DATA_POLICY.history.maxStaleMs + 1
    value = 'new'
    expect(await cache.read(request)).toBe('new')
    expect(calls).toBe(2)
    expect(await cache.read(request)).toBe('new')
    expect(calls).toBe(2)
  })

  it('never caches a rejected fill', async () => {
    const cache = createPublicDataCache()
    let calls = 0
    const failure = unavailable()
    const request: PublicCacheRead<string> = {
      kind: 'events',
      origin,
      parameters: ['detail', 1],
      load: async () => {
        calls += 1
        throw failure
      },
    }

    await expect(cache.read(request)).rejects.toBe(failure)
    await expect(cache.read(request)).rejects.toBe(failure)
    expect(calls).toBe(2)
    expect(cache.size).toBe(0)
  })

  it('keeps a stale value when a background refresh fails, then surfaces the failure at max stale', async () => {
    const clock = { time: 0 }
    const cache = createPublicDataCache({ now: () => clock.time })
    const failure = unavailable()
    let calls = 0
    let fail = false
    const request: PublicCacheRead<string> = {
      kind: 'members',
      origin,
      parameters: ['list', '桂航'],
      load: async () => {
        calls += 1
        if (fail) throw failure
        return 'members'
      },
    }

    expect(await cache.read(request)).toBe('members')
    clock.time = PUBLIC_DATA_POLICY.members.freshMs + 1
    fail = true
    expect(await cache.read(request)).toBe('members')
    await cache.settled()
    expect(await cache.read(request)).toBe('members')
    await cache.settled()
    expect(calls).toBe(3)

    clock.time = PUBLIC_DATA_POLICY.members.freshMs + PUBLIC_DATA_POLICY.members.maxStaleMs + 1
    await expect(cache.read(request)).rejects.toBe(failure)
    expect(cache.size).toBe(0)
  })

  it('drops a stale entry when its background refresh reports 404', async () => {
    const clock = { time: 0 }
    const cache = createPublicDataCache({ now: () => clock.time })
    const failure = notFound()
    let calls = 0
    let deleted = false
    const request: PublicCacheRead<string> = {
      kind: 'activities',
      origin,
      parameters: ['detail', 7],
      load: async () => {
        calls += 1
        if (deleted) throw failure
        return 'activity'
      },
    }

    expect(await cache.read(request)).toBe('activity')
    clock.time = PUBLIC_DATA_POLICY.activities.freshMs + 1
    deleted = true
    expect(await cache.read(request)).toBe('activity')
    await cache.settled()
    expect(cache.size).toBe(0)
    await expect(cache.read(request)).rejects.toBe(failure)
    expect(calls).toBe(3)
  })

  it('does not let an in-flight fill repopulate an invalidated generation or dedupe new requests to it', async () => {
    const cache = createPublicDataCache()
    const gate = deferred<string>()
    let calls = 0
    const request: PublicCacheRead<string> = {
      kind: 'events',
      origin,
      parameters: ['detail', 12],
      load: () => {
        calls += 1
        return calls === 1 ? gate.promise : Promise.resolve('fresh generation')
      },
    }

    const oldRead = cache.read(request)
    expect(cache.generation('events')).toBe(0)
    cache.invalidate(['events'])
    expect(cache.generation('events')).toBe(1)

    // A request that starts after the mutation must run in the new generation
    // while the obsolete fill is still pending: it is not deduped to it.
    expect(await cache.read(request)).toBe('fresh generation')
    expect(calls).toBe(2)
    expect(cache.size).toBe(1)

    gate.resolve('old generation')
    await expect(oldRead).resolves.toBe('old generation')
    await cache.settled()
    // The obsolete fill neither stored its value nor evicted the new one.
    expect(cache.size).toBe(1)
    expect(await cache.read(request)).toBe('fresh generation')
    expect(calls).toBe(2)
  })

  it('invalidates only the requested kinds', async () => {
    const cache = createPublicDataCache()
    let configCalls = 0
    let activityCalls = 0
    const config: PublicCacheRead<string> = {
      kind: 'config',
      origin,
      parameters: ['config'],
      load: async () => {
        configCalls += 1
        return 'config'
      },
    }
    const activity: PublicCacheRead<string> = {
      kind: 'activities',
      origin,
      parameters: ['detail', 1],
      load: async () => {
        activityCalls += 1
        return 'activity'
      },
    }

    expect(await cache.read(config)).toBe('config')
    expect(await cache.read(activity)).toBe('activity')
    cache.invalidate(['activities'])
    expect(await cache.read(config)).toBe('config')
    expect(configCalls).toBe(1)
    expect(await cache.read(activity)).toBe('activity')
    expect(activityCalls).toBe(2)
  })

  it('rejects unknown and inherited kind names instead of growing an untyped key space', async () => {
    const cache = createPublicDataCache()
    for (const kind of ['unknown', 'toString', '__proto__', 'constructor', 'hasOwnProperty']) {
      await expect(cache.read({
        kind: kind as never,
        origin,
        parameters: [],
        load: async () => 'value',
      })).rejects.toBeInstanceOf(TypeError)
      expect(() => cache.invalidate([kind as never])).toThrow(TypeError)
    }
    expect(cache.size).toBe(0)
    expect(cache.inflightCount).toBe(0)
  })

  it('bounds retained keys and evicts the least recently used entry', async () => {
    const cache = createPublicDataCache({ maxKeys: 2 })
    let calls = 0
    const read = (id: number) => cache.read({
      kind: 'activities' as const,
      origin,
      parameters: ['detail', id],
      load: async () => {
        calls += 1
        return id
      },
    })

    expect(await read(1)).toBe(1)
    expect(await read(2)).toBe(2)
    expect(await read(1)).toBe(1) // refresh recency of 1
    expect(await read(3)).toBe(3) // evicts 2
    expect(cache.size).toBe(2)
    expect(await read(2)).toBe(2)
    expect(calls).toBe(4)
  })

  it('serves but does not retain a body above the per-entry byte bound', async () => {
    const cache = createPublicDataCache({ maxEntryBytes: 64 })
    let calls = 0
    const value = 'x'.repeat(100)
    const request: PublicCacheRead<string> = {
      kind: 'activities',
      origin,
      parameters: ['list', 1, 20],
      load: async () => {
        calls += 1
        return value
      },
    }

    expect(await cache.read(request)).toBe(value)
    expect(cache.size).toBe(0)
    expect(await cache.read(request)).toBe(value)
    expect(calls).toBe(2)
  })

  it('keeps total retained bytes under the configured bound', async () => {
    const cache = createPublicDataCache({ maxTotalBytes: 120, maxEntryBytes: 120 })
    let calls = 0
    const read = (id: number) => cache.read({
      kind: 'activities' as const,
      origin,
      parameters: ['detail', id],
      load: async () => {
        calls += 1
        return 'x'.repeat(40)
      },
    })

    await read(1)
    await read(2)
    await read(3)
    expect(cache.retainedBytes).toBeLessThanOrEqual(120)
    expect(cache.size).toBe(2)
    expect(PUBLIC_CACHE_LIMITS.maxTotalBytes).toBeGreaterThan(PUBLIC_CACHE_LIMITS.maxEntryBytes)
    expect(calls).toBe(3)
  })
})
