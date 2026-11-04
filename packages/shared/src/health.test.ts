import { afterEach, describe, expect, it, vi } from 'vitest'
import { createReadinessProbe } from './health'

function defer<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

afterEach(() => vi.useRealTimers())
describe('bounded readiness probes', () => {
  it('reports a failed dependency without disclosing its error and recovers on the next check', async () => {
    let broken = true
    const read = createReadinessProbe({ service: 'test', cacheMs: 0, checks: {
      database: async () => { if (broken) throw new Error('private database path and credential') },
    } })
    const failed = await read()
    expect(failed).toEqual({ service: 'test', status: 'not_ready', checks: { database: 'failed' } })
    expect(JSON.stringify(failed)).not.toContain('credential')
    broken = false
    expect((await read()).status).toBe('ready')
  })
  it('deduplicates concurrent probes and briefly caches the completed result', async () => {
    const gate = defer<void>()
    const check = vi.fn(() => gate.promise)
    const read = createReadinessProbe({ service: 'test', checks: { database: check } })
    const requests = Array.from({ length: 50 }, () => read())
    gate.resolve()
    expect((await Promise.all(requests)).every(value => value.status === 'ready')).toBe(true)
    await read()
    expect(check).toHaveBeenCalledTimes(1)
  })
  it('bounds timeouts and outstanding work even when a dependency ignores abort', async () => {
    vi.useFakeTimers()
    const gate = defer<void>()
    const check = vi.fn(() => gate.promise)
    const read = createReadinessProbe({ service: 'test', timeoutMs: 20, cacheMs: 0, checks: { database: check } })
    for (let index = 0; index < 30; index++) {
      const request = read()
      await vi.advanceTimersByTimeAsync(25)
      expect((await request).checks.database).toBe('timeout')
    }
    expect(check).toHaveBeenCalledTimes(1)
    gate.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect((await read()).status).toBe('ready')
    expect(check).toHaveBeenCalledTimes(2)
  })
  it('rejects empty checks and unbounded deadlines', () => {
    expect(() => createReadinessProbe({ service: 'test', checks: {} })).toThrow()
    expect(() => createReadinessProbe({ service: 'test', timeoutMs: Infinity, checks: { database: async () => {} } })).toThrow()
  })
})
