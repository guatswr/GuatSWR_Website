import { describe, expect, it } from 'vitest'
import { durableRecords, createAsyncDurableStore } from '../server/utils/durable-records'

describe('durableRecords in-memory capabilities and atomic updates', () => {
  it('manages records and atomic updates in memory', () => {
    const m = durableRecords<{ count: number }>('test', Buffer.from('secret'))
    m.set('k1', { count: 1 })
    expect(m.get('k1')).toEqual({ count: 1 })
    m.atomicUpdate('k1', curr => ({ count: (curr?.count || 0) + 1 }))
    expect(m.get('k1')).toEqual({ count: 2 })
    expect(m.size).toBe(1)
    m.deleteMany(['k1'])
    expect(m.size).toBe(0)
  })

  it('provides async durable store operations in memory mode', async () => {
    const store = createAsyncDurableStore<{ val: string }>({
      namespace: 'test-async',
      secret: Buffer.from('secret'),
      driver: 'memory'
    })
    await store.set('a', { val: 'alpha' })
    expect(await store.get('a')).toEqual({ val: 'alpha' })
    expect(await store.size()).toBe(1)
    await store.atomicUpdate('a', curr => ({ val: `${curr?.val}-updated` }))
    expect(await store.get('a')).toEqual({ val: 'alpha-updated' })
    const scanned = await store.scan?.()
    expect(scanned?.length).toBe(1)
    expect(scanned?.[0]?.item).toEqual({ val: 'alpha-updated' })
    expect(await store.delete('a')).toBe(true)
    expect(await store.size()).toBe(0)
    await store.close()
  })
})
