import { describe, expect, it } from 'vitest'
import {
  CSRF_KEY_PURPOSE,
  MAX_SESSION_LIFETIME_MS,
  UPSTREAM_TOKEN_PURPOSE,
  computeSessionLifetime,
  createMemorySessionStore,
  createOpaqueSessionId,
  createSessionRecord,
  derivePurposeKey,
  hashSessionId,
  openUpstreamToken,
  parseUpstreamTokenExpiry,
  sealUpstreamToken,
} from '../server/utils/bff-session'
import { BffConfigError, TokenMetadataError } from '../server/utils/bff-errors'

const SECRET = 'test-session-secret-that-is-long-enough-0123456789'
const TOKEN_KEY = derivePurposeKey(SECRET, UPSTREAM_TOKEN_PURPOSE)
const NOW = 1_760_000_000_000

function tokenWithExpiry(expSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ id: 1, username: 'admin', role: 'admin', exp: expSeconds })).toString('base64url')
  return `${header}.${payload}.signature`
}

describe('opaque session ids', () => {
  it('generates 256-bit, URL-safe, unpredictable ids', () => {
    const first = createOpaqueSessionId()
    const second = createOpaqueSessionId()
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(Buffer.from(first, 'base64url').byteLength).toBe(32)
    expect(first).not.toBe(second)
  })

  it('stores only a stable hash of the id', () => {
    const id = createOpaqueSessionId()
    expect(hashSessionId(id)).toMatch(/^[a-f0-9]{64}$/)
    expect(hashSessionId(id)).toBe(hashSessionId(id))
    expect(hashSessionId(id)).not.toBe(hashSessionId(createOpaqueSessionId()))
  })

  it('rejects implausible ids instead of hashing attacker shapes', () => {
    expect(() => hashSessionId('short')).toThrow(BffConfigError)
    expect(() => hashSessionId('x'.repeat(201))).toThrow(BffConfigError)
  })
})

describe('purpose-separated key derivation', () => {
  it('fails closed without a long enough secret and never uses a fallback', () => {
    expect(() => derivePurposeKey('', UPSTREAM_TOKEN_PURPOSE)).toThrow(BffConfigError)
    expect(() => derivePurposeKey('too-short', UPSTREAM_TOKEN_PURPOSE)).toThrow(BffConfigError)
    // @ts-expect-error runtime guard for a missing secret
    expect(() => derivePurposeKey(undefined, UPSTREAM_TOKEN_PURPOSE)).toThrow(BffConfigError)
  })

  it('derives different 256-bit keys per purpose and is deterministic per purpose', () => {
    const tokenKey = derivePurposeKey(SECRET, UPSTREAM_TOKEN_PURPOSE)
    const csrfKey = derivePurposeKey(SECRET, CSRF_KEY_PURPOSE)
    expect(tokenKey.byteLength).toBe(32)
    expect(tokenKey.equals(csrfKey)).toBe(false)
    expect(tokenKey.equals(derivePurposeKey(SECRET, UPSTREAM_TOKEN_PURPOSE))).toBe(true)
    expect(tokenKey.equals(derivePurposeKey(`${SECRET}x`, UPSTREAM_TOKEN_PURPOSE))).toBe(false)
  })
})

describe('upstream token sealing', () => {
  it('round-trips through authenticated encryption with a fresh IV', () => {
    const token = tokenWithExpiry(1_760_003_600)
    const first = sealUpstreamToken(token, TOKEN_KEY, 'record-key')
    const second = sealUpstreamToken(token, TOKEN_KEY, 'record-key')
    expect(first.iv).not.toBe(second.iv)
    expect(first.ciphertext).not.toBe(second.ciphertext)
    expect(openUpstreamToken(first, TOKEN_KEY, 'record-key')).toBe(token)
    expect(JSON.stringify(first)).not.toContain('signature')
    expect(JSON.stringify(first)).not.toContain('admin')
  })

  it('refuses foreign keys, foreign records (AAD), and any tampering', () => {
    const token = tokenWithExpiry(1_760_003_600)
    const sealed = sealUpstreamToken(token, TOKEN_KEY, 'record-key')
    const otherKey = derivePurposeKey(SECRET, CSRF_KEY_PURPOSE)
    expect(openUpstreamToken(sealed, otherKey, 'record-key')).toBeNull()
    expect(openUpstreamToken(sealed, TOKEN_KEY, 'other-record')).toBeNull()
    // Appending a character to a base64url string whose length is already a
    // multiple of four only adds padding bits, which the decoder drops: the
    // decoded ciphertext would be unchanged. Flip an interior character so the
    // GCM authentication check is actually exercised.
    const tamperIndex = 4
    const tamperedCiphertext = sealed.ciphertext.slice(0, tamperIndex)
      + (sealed.ciphertext[tamperIndex] === 'A' ? 'B' : 'A')
      + sealed.ciphertext.slice(tamperIndex + 1)
    expect(tamperedCiphertext).not.toBe(sealed.ciphertext)
    expect(Buffer.from(tamperedCiphertext, 'base64url').equals(Buffer.from(sealed.ciphertext, 'base64url'))).toBe(false)
    expect(openUpstreamToken({ ...sealed, ciphertext: tamperedCiphertext }, TOKEN_KEY, 'record-key')).toBeNull()
    expect(openUpstreamToken({ ...sealed, tag: `${sealed.tag}A` }, TOKEN_KEY, 'record-key')).toBeNull()
    expect(openUpstreamToken({ ...sealed, iv: 'not-base64url!!' }, TOKEN_KEY, 'record-key')).toBeNull()
    expect(openUpstreamToken({ iv: '', tag: '', ciphertext: '' }, TOKEN_KEY, 'record-key')).toBeNull()
  })

  it('refuses to seal a missing or oversized token', () => {
    expect(() => sealUpstreamToken('', TOKEN_KEY, 'k')).toThrow(TokenMetadataError)
    expect(() => sealUpstreamToken('x'.repeat(4097), TOKEN_KEY, 'k')).toThrow(TokenMetadataError)
  })
})

describe('upstream token metadata', () => {
  it('reads a plausible numeric exp claim in milliseconds', () => {
    expect(parseUpstreamTokenExpiry(tokenWithExpiry(1_760_003_600))).toBe(1_760_003_600_000)
  })

  it.each([
    ['missing token', ''],
    ['two segments', 'a.b'],
    ['four segments', 'a.b.c.d'],
    ['empty payload segment', 'a..c'],
    ['payload not base64url', 'a.@@@@.c'],
    ['payload not JSON', `a.${Buffer.from('not json').toString('base64url')}.c`],
    ['payload array', `a.${Buffer.from('[1,2]').toString('base64url')}.c`],
    ['missing exp', `a.${Buffer.from('{"id":1}').toString('base64url')}.c`],
    ['string exp', `a.${Buffer.from('{"exp":"123"}').toString('base64url')}.c`],
    ['fractional exp', `a.${Buffer.from('{"exp":1.5}').toString('base64url')}.c`],
    ['zero exp', `a.${Buffer.from('{"exp":0}').toString('base64url')}.c`],
    ['oversized exp', `a.${Buffer.from('{"exp":99999999999}').toString('base64url')}.c`],
  ])('rejects malformed token metadata (%s)', (_label, token) => {
    expect(() => parseUpstreamTokenExpiry(token)).toThrow(TokenMetadataError)
  })
})

describe('session lifetime', () => {
  it('caps at 24 hours and never extends past the upstream expiry', () => {
    expect(computeSessionLifetime(NOW + 60_000, NOW).expiresAt).toBe(NOW + 60_000)
    expect(computeSessionLifetime(NOW + 48 * 60 * 60 * 1000, NOW).expiresAt).toBe(NOW + MAX_SESSION_LIFETIME_MS)
    expect(computeSessionLifetime(NOW + 48 * 60 * 60 * 1000, NOW, 60_000).expiresAt).toBe(NOW + 60_000)
  })

  it('refuses an already-expired or non-finite upstream token', () => {
    expect(() => computeSessionLifetime(NOW, NOW)).toThrow(TokenMetadataError)
    expect(() => computeSessionLifetime(NOW - 1, NOW)).toThrow(TokenMetadataError)
    expect(() => computeSessionLifetime(Number.NaN, NOW)).toThrow(TokenMetadataError)
  })
})

describe('session records', () => {
  it('stores identity, hashed key and a sealed token with bounded expiry', () => {
    const sessionId = createOpaqueSessionId()
    const token = tokenWithExpiry(Math.floor((NOW + 3_600_000) / 1000))
    const record = createSessionRecord({
      sessionId,
      identity: { id: 7, username: 'admin', role: 'admin', avatar: null },
      token,
      upstreamExpiresAt: NOW + 3_600_000,
      now: NOW,
      tokenKey: TOKEN_KEY,
    })
    expect(record.key).toBe(hashSessionId(sessionId))
    expect(record.key).not.toContain(sessionId)
    expect(record.identity).toEqual({ id: 7, username: 'admin', role: 'admin', avatar: null })
    expect(record.expiresAt).toBe(NOW + 3_600_000)
    expect(record.recordId).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(openUpstreamToken(record.token, TOKEN_KEY, record.key)).toBe(token)
    expect(JSON.stringify(record.token)).not.toContain(token)
  })
})

describe('in-memory session store', () => {
  function recordFor(sessionId: string, expiresAt: number, userId = 1, createdAt = NOW) {
    return {
      ...createSessionRecord({
        sessionId,
        identity: { id: userId, username: `user${userId}`, role: 'admin' as const, avatar: null },
        token: tokenWithExpiry(Math.floor(expiresAt / 1000)),
        upstreamExpiresAt: expiresAt,
        now: createdAt,
        tokenKey: TOKEN_KEY,
      }),
      createdAt,
    }
  }

  it('returns live records, deletes expired ones on read, and supports explicit delete', () => {
    const store = createMemorySessionStore()
    const id = createOpaqueSessionId()
    const key = hashSessionId(id)
    store.set(recordFor(id, NOW + 1000))
    expect(store.get(key, NOW)?.identity.id).toBe(1)
    expect(store.get(key, NOW + 1001)).toBeUndefined()
    expect(store.size()).toBe(0)

    store.set(recordFor(id, NOW + 1000))
    expect(store.delete(key)).toBe(true)
    expect(store.delete(key)).toBe(false)
    expect(store.get(key, NOW)).toBeUndefined()
  })

  it('revokes every session for one user without touching another user', () => {
    const store = createMemorySessionStore()
    const first = createOpaqueSessionId()
    const second = createOpaqueSessionId()
    const third = createOpaqueSessionId()
    store.set(recordFor(first, NOW + 1000, 1))
    store.set(recordFor(second, NOW + 1000, 1))
    store.set(recordFor(third, NOW + 1000, 2))
    expect(store.deleteByUserId(1)).toBe(2)
    expect(store.get(hashSessionId(first), NOW)).toBeUndefined()
    expect(store.get(hashSessionId(second), NOW)).toBeUndefined()
    expect(store.get(hashSessionId(third), NOW)?.identity.id).toBe(2)
  })

  it('bounds memory by evicting the oldest record first', () => {
    const store = createMemorySessionStore({ maxEntries: 2 })
    const first = createOpaqueSessionId()
    const second = createOpaqueSessionId()
    const third = createOpaqueSessionId()
    store.set(recordFor(first, NOW + 1000, 1, NOW))
    store.set(recordFor(second, NOW + 1000, 2, NOW + 1))
    store.set(recordFor(third, NOW + 1000, 3, NOW + 2))
    expect(store.size()).toBe(2)
    expect(store.get(hashSessionId(first), NOW)).toBeUndefined()
    expect(store.get(hashSessionId(third), NOW)?.identity.id).toBe(3)
  })

  it('replaces a record under the same key without growing the store', () => {
    const store = createMemorySessionStore()
    const id = createOpaqueSessionId()
    const key = hashSessionId(id)
    const original = recordFor(id, NOW + 1000)
    store.set(original)
    store.set({ ...original, identity: { ...original.identity, role: 'super_admin' } })
    expect(store.size()).toBe(1)
    expect(store.get(key, NOW)?.identity.role).toBe('super_admin')
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 0, -1])('never lets an invalid capacity (%s) disable the bound', (maxEntries) => {
    const store = createMemorySessionStore({ maxEntries })
    for (let index = 0; index < 10_001; index += 1) {
      // Each record must still be live at its own creation time; a fixed
      // absolute expiry made every record after the first 1000 already expired,
      // so the flood never reached the store.
      const createdAt = NOW + index
      store.set(recordFor(createOpaqueSessionId(), createdAt + 1000, index + 1, createdAt))
    }
    expect(store.size()).toBeLessThanOrEqual(10_000)
  })

  it('honours a finite capacity of one', () => {
    const store = createMemorySessionStore({ maxEntries: 1 })
    const first = createOpaqueSessionId()
    const second = createOpaqueSessionId()
    store.set(recordFor(first, NOW + 1000, 1, NOW))
    store.set(recordFor(second, NOW + 1000, 2, NOW + 1))
    expect(store.size()).toBe(1)
    expect(store.get(hashSessionId(first), NOW)).toBeUndefined()
    expect(store.get(hashSessionId(second), NOW)?.identity.id).toBe(2)
  })
})
