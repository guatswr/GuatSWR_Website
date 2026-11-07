import { stateDriver } from './postgres-state'
import { durableRecords, createPostgresDurableStore } from './durable-records'
import type { DurableRecords } from './durable-records'
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from 'node:crypto'
import type { SafeUser } from '@guatswr/shared'
import { BffConfigError, TokenMetadataError } from './bff-errors'

/** Purpose-separated HKDF labels derived from the runtime session secret. */
export const UPSTREAM_TOKEN_PURPOSE = 'guatswr:bff:upstream-token:v1'
export const CSRF_KEY_PURPOSE = 'guatswr:bff:csrf:v1'

export const MAX_SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000
export const MIN_SESSION_SECRET_LENGTH = 32

const TOKEN_IV_BYTES = 12
const TOKEN_TAG_BYTES = 16
const MAX_SEALED_CIPHERTEXT_BYTES = 8192
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/

/** An upstream JWT encrypted with AES-256-GCM, stored server-side only. */
export interface SealedToken {
  iv: string
  tag: string
  ciphertext: string
}

export interface BffSessionRecord {
  /** Random per-record id, used to detect a replaced or deleted record. */
  recordId: string
  /** SHA-256 of the opaque cookie session id; the cookie id itself is never stored. */
  key: string
  identity: SafeUser
  token: SealedToken
  createdAt: number
  lastSeenAt: number
  expiresAt: number
}

export interface BffSessionStore {
  get: (key: string, now: number) => Promise<BffSessionRecord | undefined> | BffSessionRecord | undefined
  set: (record: BffSessionRecord) => Promise<void> | void
  replaceIfCurrent?: (previous: BffSessionRecord, next: BffSessionRecord) => Promise<boolean> | boolean
  delete: (key: string) => Promise<boolean> | boolean
  /** Used by the profile route when a password or second password changes. */
  deleteByUserId: (userId: number) => Promise<number> | number
  /** Revokes every local session (backend token_version refresh). */
  clear: () => Promise<number> | number
  size: () => Promise<number> | number
  close?: () => Promise<void> | void
  sweepBatch?: (batchSize?: number, now?: number) => Promise<number> | number
  onClose?: (callback: () => Promise<void> | void) => void
  onSweep?: (callback: (batchSize: number, now: number) => number | Promise<number>) => void
}

export function createOpaqueSessionId(): string {
  return randomBytes(32).toString('base64url')
}

export function hashSessionId(sessionId: string): string {
  if (typeof sessionId !== 'string' || sessionId.length < 20 || sessionId.length > 200) {
    throw new BffConfigError('Session id shape is invalid')
  }
  return createHash('sha256').update(sessionId, 'utf8').digest('hex')
}

/**
 * Derive a 256-bit key from the runtime session secret. The cookie secret and
 * these keys are cryptographically separated by purpose, and a missing or weak
 * secret fails closed instead of falling back to a default.
 */
export function derivePurposeKey(secret: string, purpose: string): Buffer {
  if (typeof secret !== 'string' || secret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new BffConfigError('NUXT_SESSION_PASSWORD must be configured with at least 32 characters')
  }
  return Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.alloc(0), Buffer.from(purpose, 'utf8'), 32))
}

function encodeBase64Url(value: Buffer): string {
  return value.toString('base64url')
}

function decodeBase64Url(value: string, expectedBytes?: number): Buffer | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 12_000 || !BASE64URL_PATTERN.test(value)) {
    return null
  }
  const decoded = Buffer.from(value, 'base64url')
  if (expectedBytes !== undefined && decoded.byteLength !== expectedBytes) return null
  return decoded
}

export function sealUpstreamToken(token: string, key: Buffer, aad: string): SealedToken {
  if (typeof token !== 'string' || token.length === 0 || token.length > 4096) {
    throw new TokenMetadataError('Upstream token shape is invalid')
  }
  const iv = randomBytes(TOKEN_IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return {
    iv: encodeBase64Url(iv),
    tag: encodeBase64Url(cipher.getAuthTag()),
    ciphertext: encodeBase64Url(ciphertext),
  }
}

/** Returns null for any tampered, foreign or malformed sealed token. */
export function openUpstreamToken(sealed: SealedToken, key: Buffer, aad: string): string | null {
  try {
    const iv = decodeBase64Url(sealed.iv, TOKEN_IV_BYTES)
    const tag = decodeBase64Url(sealed.tag, TOKEN_TAG_BYTES)
    const ciphertext = decodeBase64Url(sealed.ciphertext)
    if (!iv || !tag || !ciphertext || ciphertext.byteLength > MAX_SEALED_CIPHERTEXT_BYTES) return null
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAAD(Buffer.from(aad, 'utf8'))
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  }
  catch {
    return null
  }
}

/**
 * Read only the `exp` claim of an upstream JWT so the BFF can bound lifetime.
 * This is deliberately not authentication: `/api/auth/me` is the only source
 * of identity, and an unverifiable signature is never trusted.
 */
export function parseUpstreamTokenExpiry(token: string): number {
  if (typeof token !== 'string' || token.length === 0 || token.length > 4096) {
    throw new TokenMetadataError('Upstream token is missing')
  }
  const segments = token.split('.')
  if (segments.length !== 3 || segments.some(segment => segment.length === 0)) {
    throw new TokenMetadataError('Upstream token is not a well-formed JWT')
  }
  const payloadSegment = segments[1] as string
  const payloadBytes = decodeBase64Url(payloadSegment)
  if (!payloadBytes) throw new TokenMetadataError('Upstream token payload is not base64url')
  let payload: unknown
  try {
    payload = JSON.parse(payloadBytes.toString('utf8'))
  }
  catch {
    throw new TokenMetadataError('Upstream token payload is not JSON')
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new TokenMetadataError('Upstream token payload is not an object')
  }
  const exp = (payload as Record<string, unknown>).exp
  if (typeof exp !== 'number' || !Number.isInteger(exp) || exp <= 0 || exp > 9_999_999_999) {
    throw new TokenMetadataError('Upstream token has no usable expiry')
  }
  return exp * 1000
}

export interface SessionLifetime {
  expiresAt: number
  maxLifetimeMs: number
}

/**
 * Session lifetime is the smaller of the upstream token expiry and the 24 hour
 * BFF maximum. A token that is already expired cannot establish a session.
 */
export function computeSessionLifetime(
  upstreamExpiresAt: number,
  now: number,
  maxLifetimeMs: number = MAX_SESSION_LIFETIME_MS,
): SessionLifetime {
  if (!Number.isFinite(upstreamExpiresAt) || !Number.isFinite(now) || !Number.isFinite(maxLifetimeMs) || maxLifetimeMs <= 0) {
    throw new TokenMetadataError('Session lifetime inputs are invalid')
  }
  const expiresAt = Math.floor(Math.min(upstreamExpiresAt, now + maxLifetimeMs))
  if (expiresAt <= Math.floor(now)) {
    throw new TokenMetadataError('Upstream token is already expired')
  }
  return { expiresAt, maxLifetimeMs }
}

export interface CreateSessionRecordInput {
  sessionId: string
  identity: SafeUser
  token: string
  upstreamExpiresAt: number
  now: number
  tokenKey: Buffer
  maxLifetimeMs?: number
}

export function createSessionRecord(input: CreateSessionRecordInput): BffSessionRecord {
  const key = hashSessionId(input.sessionId)
  const { expiresAt } = computeSessionLifetime(
    input.upstreamExpiresAt,
    input.now,
    input.maxLifetimeMs ?? MAX_SESSION_LIFETIME_MS,
  )
  return {
    recordId: randomBytes(16).toString('base64url'),
    key,
    identity: input.identity,
    token: sealUpstreamToken(input.token, input.tokenKey, key),
    createdAt: Math.floor(input.now),
    lastSeenAt: Math.floor(input.now),
    expiresAt,
  }
}

export interface MemorySessionStoreOptions {
  secret?: string
  maxEntries?: number
  driver?: 'postgres' | 'memory'
  postgresUrl?: string
}

export function createPostgresSessionStore(options: {
  secret: string
  connectionString?: string
  maxConnections?: number
  maxEntries?: number
}): BffSessionStore {
  derivePurposeKey(options.secret, UPSTREAM_TOKEN_PURPOSE)
  const store = createPostgresDurableStore<BffSessionRecord>({
    namespace: 'sessions',
    secret: Buffer.from(options.secret),
    connectionString: options.connectionString,
    maxConnections: options.maxConnections,
    maxEntries: options.maxEntries,
  })

  const closeCallbacks = new Set<() => Promise<void> | void>()
  const sweepCallbacks = new Set<(batchSize: number, now: number) => number | Promise<number>>()

  return {
    async get(key, now) {
      return store.withLock(key, async ctx => {
        const record = await ctx.get(key)
        if (record && record.expiresAt <= now) { await ctx.delete(key); return undefined }
        return record
      })
    },
    async set(record) {
      await store.set(record.key, record)
    },
    async replaceIfCurrent(previous, next) {
      return store.compareAndSwap(previous.key, previous, next)
    },
    async delete(key) {
      return await store.delete(key)
    },
    async deleteByUserId(userId) {
      return store.deleteWhere(record => record.identity.id === userId)
    },
    async clear() {
      return await store.clear()
    },
    async size() {
      return await store.size()
    },
    async sweepBatch(batchSize = 100, now = Date.now()) {
      let count = 0
      for (const cb of sweepCallbacks) {
        count += await cb(batchSize, now)
      }
      const swept = await store.sweepBatch?.(batchSize, r => r.expiresAt <= now) ?? 0
      return count + swept
    },
    async close() {
      for (const cb of closeCallbacks) {
        try { await cb() } catch { /* Continue closing the state pool after callback failure. */ }
      }
      closeCallbacks.clear()
      sweepCallbacks.clear()
      await store.close()
    },
    onClose(cb) {
      closeCallbacks.add(cb)
    },
    onSweep(cb) {
      sweepCallbacks.add(cb)
    },
  }
}

/**
 * Bounded single-process storage. A configured BFF_STATE_DIR and secret enable
 * encrypted restart persistence; concurrent instances remain unsupported.
 */
export function createMemorySessionStore(options: MemorySessionStoreOptions = {}): BffSessionStore {
  const driver = stateDriver(options.driver)
  if (driver === 'postgres') {
    return createPostgresSessionStore({
      secret: options.secret || '',
      connectionString: options.postgresUrl,
      maxEntries: options.maxEntries,
    })
  }

  // A non-finite or sub-one capacity must never disable the bound.
  const maxEntries = typeof options.maxEntries === 'number' && Number.isFinite(options.maxEntries) && options.maxEntries >= 1
    ? Math.floor(options.maxEntries)
    : 10_000
  const records = options.secret ? durableRecords<BffSessionRecord>('sessions', Buffer.from(options.secret)) : new Map<string, BffSessionRecord>()
  const closeCallbacks = new Set<() => Promise<void> | void>()
  const sweepCallbacks = new Set<(batchSize: number, now: number) => number | Promise<number>>()

  const evictOldest = () => {
    let oldestKey: string | undefined
    let oldestCreatedAt = Number.POSITIVE_INFINITY
    for (const record of records.values()) {
      if (record.createdAt < oldestCreatedAt) {
        oldestCreatedAt = record.createdAt
        oldestKey = record.key
      }
    }
    if (oldestKey !== undefined) records.delete(oldestKey)
  }

  return {
    get(key, now) {
      const record = records.get(key)
      if (!record) return undefined
      if (record.expiresAt <= now) {
        records.delete(key)
        return undefined
      }
      return record
    },
    set(record) {
      if (!records.has(record.key) && records.size >= maxEntries) evictOldest()
      records.set(record.key, record)
    },
    replaceIfCurrent(previous, next) {
      const current = records.get(previous.key)
      if (!current || JSON.stringify(current) !== JSON.stringify(previous)) return false
      records.set(next.key, next)
      return true
    },
    delete(key) {
      return records.delete(key)
    },
    deleteByUserId(userId) {
      const keysToDelete: string[] = []
      for (const [key, record] of records) {
        if (record.identity.id === userId) {
          keysToDelete.push(key)
        }
      }
      if (keysToDelete.length === 0) return 0
      const durable = records as Partial<DurableRecords<BffSessionRecord>>
      if (typeof durable.deleteMany === 'function') {
        return durable.deleteMany(keysToDelete)
      }
      let removed = 0
      for (const key of keysToDelete) {
        if (records.delete(key)) removed += 1
      }
      return removed
    },
    sweepBatch(batchSize: number = 100, now: number = Date.now()): number | Promise<number> {
      const limit = typeof batchSize === 'number' && Number.isFinite(batchSize) && batchSize > 0
        ? Math.floor(batchSize)
        : 100
      const currentTime = typeof now === 'number' && Number.isFinite(now) ? now : Date.now()
      let relatedRemoved = 0
      const asyncCallbacks: Promise<number>[] = []
      for (const callback of sweepCallbacks) {
        const res = callback(limit, currentTime)
        if (res instanceof Promise) {
          asyncCallbacks.push(res)
        }
        else if (typeof res === 'number') {
          relatedRemoved += res
        }
      }
      const expiredKeys: string[] = []
      for (const [key, record] of records) {
        if (record.expiresAt <= currentTime) {
          expiredKeys.push(key)
          if (expiredKeys.length >= limit) break
        }
      }
      const durable = records as Partial<DurableRecords<BffSessionRecord>>
      const localRemoved = expiredKeys.length === 0
        ? 0
        : (typeof durable.deleteMany === 'function'
            ? durable.deleteMany(expiredKeys)
            : (() => {
                let count = 0
                for (const key of expiredKeys) {
                  if (records.delete(key)) count += 1
                }
                return count
              })())

      const totalSyncRemoved = relatedRemoved + localRemoved
      if (asyncCallbacks.length > 0) {
        return Promise.all(asyncCallbacks).then(results => totalSyncRemoved + results.reduce((a, b) => a + b, 0))
      }
      return totalSyncRemoved
    },
    close() {
      const pending: Promise<void>[] = []
      for (const cb of closeCallbacks) {
        try { pending.push(Promise.resolve(cb())) } catch { /* Continue closing remaining stores. */ }
      }
      closeCallbacks.clear()
      sweepCallbacks.clear()
      const durable = records as Partial<DurableRecords<BffSessionRecord>>
      durable.close?.()
      return Promise.allSettled(pending).then(() => {})
    },
    onClose(callback: () => Promise<void> | void) {
      closeCallbacks.add(callback)
    },
    onSweep(callback: (batchSize: number, now: number) => number | Promise<number>) {
      sweepCallbacks.add(callback)
    },
    clear() {
      const removed = records.size
      records.clear()
      return removed
    },
    size() {
      return records.size
    },
  }
}
