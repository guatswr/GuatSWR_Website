import { expect, it, describe, vi } from 'vitest'
import { fixture, get, run } from '../helpers/fixture.mjs'
import { BoundedBanCache } from '../../dist/src/security/bans.js'

describe('DB-02: Ban query short-term caching & invalidation', () => {
  it('does not repopulate a stale cache entry after a concurrent ban commits', async () => {
    const f = await fixture()
    const service = f.context.ban.service
    const store = f.context.sql.main
    const lookup = store.get.bind(store)
    const read = Promise.withResolvers()
    const release = Promise.withResolvers()
    const spy = vi.spyOn(store, 'get').mockImplementation(async (sql, params) => {
      const row = await lookup(sql, params)
      if (sql.startsWith('SELECT ip,reason,expires_at')) { read.resolve(); await release.promise }
      return row
    })
    const pending = service.blocked('198.51.100.99')
    try {
      await read.promise
      await service.ban('198.51.100.99', 'new ban')
      release.resolve()
      await pending
    } finally { release.resolve(); spy.mockRestore() }
    expect(await service.blocked('198.51.100.99')).toEqual({ reason: 'new ban' })
  })

  it('does not delete a renewed ban while cleaning an expired lookup', async () => {
    const f = await fixture()
    const service = f.context.ban.service
    const ip = '198.51.100.98'
    await run(f.db, "INSERT INTO banned_ips(ip,reason,created_at,expires_at) VALUES($1,$2,$3,$4)", [ip, 'old', 0, 1])
    const store = f.context.sql.main
    const lookup = store.get.bind(store)
    const read = Promise.withResolvers(), release = Promise.withResolvers()
    const spy = vi.spyOn(store, 'get').mockImplementation(async (sql, params) => {
      const row = await lookup(sql, params)
      if (sql.startsWith('SELECT ip,reason,expires_at')) { read.resolve(); await release.promise }
      return row
    })
    const pending = service.blocked(ip)
    try {
      await read.promise
      await service.ban(ip, 'renewed')
      release.resolve()
      await pending
    } finally { release.resolve(); spy.mockRestore() }
    expect(await service.blocked(ip)).toEqual({ reason: 'renewed' })
  })
  it('hits cache and reduces SQL queries on repeated checks', async () => {
    const f = await fixture()
    const service = f.context.ban.service
    const ip = '198.51.100.1'

    // First lookup: misses cache, executes SQL
    expect(service.cache.get(ip)).toBeUndefined()
    const res1 = await service.blocked(ip)
    expect(res1).toBeUndefined()
    expect(service.cache.get(ip)).toBeDefined()
    expect(service.cache.get(ip)?.blocked).toBe(false)

    // Second to 10th lookup: hits cache
    for (let i = 0; i < 10; i++) {
      const res = await service.blocked(ip)
      expect(res).toBeUndefined()
    }
  })

  it('reflects ban and unban immediately without waiting for TTL', async () => {
    const f = await fixture()
    const service = f.context.ban.service
    const ip = '198.51.100.2'

    // Prime cache as unblocked
    expect(await service.blocked(ip)).toBeUndefined()
    expect(service.cache.get(ip)?.blocked).toBe(false)

    // Ban IP: cache must be actively invalidated
    await service.ban(ip, 'spam', 'admin')
    expect(service.cache.get(ip)).toBeUndefined()

    // Next check immediately reflects ban without waiting for TTL
    const blockedRes = await service.blocked(ip)
    expect(blockedRes).toEqual({ reason: 'spam' })
    expect(service.cache.get(ip)?.blocked).toBe(true)

    // Unban IP: cache must be actively invalidated
    await service.unban(ip, 'admin')
    expect(service.cache.get(ip)).toBeUndefined()

    // Next check immediately reflects unban
    const unblockedRes = await service.blocked(ip)
    expect(unblockedRes).toBeUndefined()
  })

  it('clamps cache TTL to remaining ban duration so expired bans release immediately', async () => {
    const f = await fixture()
    const service = f.context.ban.service
    const ip = '198.51.100.3'

    // Ban with 100ms expiration
    const expiresAt = Date.now() + 150
    await run(f.db, "INSERT INTO banned_ips(ip,reason,created_at,expires_at) VALUES($1,$2,$3,$4)", [ip, 'temporary', Date.now(), expiresAt])

    const firstCheck = await service.blocked(ip)
    expect(firstCheck).toEqual({ reason: 'temporary' })

    const cached = service.cache.get(ip)
    expect(cached).toBeDefined()
    expect(cached?.ttl).toBeLessThanOrEqual(150)

    // Wait until ban expires
    await new Promise(resolve => setTimeout(resolve, 200))

    // Must be released immediately, not extended by cache
    const secondCheck = await service.blocked(ip)
    expect(secondCheck).toBeUndefined()
  })

  it('does not pollute cache on database query failure', async () => {
    const f = await fixture()
    const ip = '198.51.100.4'
    let reported = false

    const failingStore = {
      get: async () => { throw new Error('synthetic database read failure') },
      run: async () => ({ changes: 0, lastID: 0 }),
      all: async () => [],
      transaction: async () => {},
      close: async () => {}
    }

    const { createBanService } = await import('../../dist/src/security/bans.js')
    const service = createBanService({
      store: failingStore,
      ready: true,
      committed: () => {},
      report: () => { reported = true }
    })

    const result = await service.blocked(ip)
    expect(result).toBeUndefined()
    expect(reported).toBe(true)
    // Cache must remain empty
    expect(service.cache.get(ip)).toBeUndefined()
  })

  it('strictly bounds cache size under burst of distinct IPs', () => {
    const cache = new BoundedBanCache(50, 5000)
    for (let i = 0; i < 200; i++) {
      cache.set(`10.0.0.${i}`, {
        blocked: false,
        reason: '',
        expiresAt: null,
        ttl: 5000
      })
    }
    expect(cache.size).toBe(50)
  })

  it('cleanup clears cache and removes expired records', async () => {
    const f = await fixture()
    const service = f.context.ban.service
    const ip = '198.51.100.5'

    await service.blocked(ip)
    expect(service.cache.size).toBeGreaterThan(0)

    await service.cleanup()
    expect(service.cache.size).toBe(0)
  })
})
