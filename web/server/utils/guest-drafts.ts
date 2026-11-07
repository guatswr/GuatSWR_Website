import { stateDriver } from './postgres-state'
import { BffError } from './bff-errors'
import { durableRecords, createPostgresDurableStore } from './durable-records'
import type { DurableRecords } from './durable-records'
import { createHmac, randomBytes } from 'node:crypto'

/**
 * Server-side guest draft records.
 *
 * The browser only ever holds an unpredictable opaque id in an HttpOnly cookie.
 * Record indices map a keyed hash of that id (or of a cookie-less intent key) to the
 * draft ids issued for it, so a guessed `:id` can never modify another visitor's
 * draft. Records are hard-bounded, TTL'd, bound to the creating client IP, and
 * carry a small bounded set of *confirmed submission receipts* so a retry after a
 * lost response does not repeat a mutation. A separate bounded five-minute
 * response cache retains first-response cookies for a lost Set-Cookie retry;
 * these capabilities remain in server memory and never enter logs or JSON.
 *
 * Single-process store; BFF_STATE_DIR enables encrypted restart persistence.
 * Concurrent instances are not supported.
 */

export const GUEST_DRAFT_COOKIE = 'bff_guest_drafts'
export const GUEST_DRAFT_PURPOSE = 'guatswr:bff:guest-drafts:v1'

export const GUEST_RECORD_TTL_MS = 6 * 60 * 60 * 1000
export const GUEST_MAX_RECORDS = 5_000
export const GUEST_MAX_DRAFTS_PER_RECORD = 8
export const GUEST_MAX_RECEIPTS_PER_RECORD = 8
export const GUEST_MAX_INFLIGHT = 500
/** A repeated create within this window is the same intent and reuses its id. */
export const GUEST_DRAFT_REUSE_MS = 5 * 60 * 1000
export const GUEST_COOKIE_ID_PATTERN = /^[A-Za-z0-9_-]{32,96}$/

export interface GuestDraftReceipt {
  /** Hash of the submitted payload; a different payload is a conflict, not a replay. */
  digest: string
  id: number
}

export interface GuestDraftRecord {
  /** Keyed hash of the cookie id or intent key; the raw value is never stored. */
  key: string
  clientIp: string
  drafts: number[]
  submitted: number[]
  receipts: GuestDraftReceipt[]
  lastIssuedAt: number
  updatedAt: number
  inFlightDraftId?: number
  intentGeneration?: string
  submissionLeases?: Record<string, { token: string; until: number }>
}

export interface GuestIntent {
  /** Opaque cookie id when the browser already has one. */
  cookieId?: string | undefined
  /**
   * Stable per-visitor key when no draft cookie exists yet (for example a digest
   * of the bound CSRF token). Without it, two concurrent first requests cannot be
   * recognized as one intent.
   */
  intentKey?: string | undefined
  clientIp: string
}

export interface GuestDraftStoreOptions {
  now?: () => number
  ttlMs?: number
  maxRecords?: number
  maxDrafts?: number
  maxReceipts?: number
  maxInflight?: number
  namespace?: string
  reuseMs?: number
  driver?: 'sqlite' | 'postgres' | 'memory'
  connectionString?: string
  submissionLeaseMs?: number
}

export interface IssuedDraft {
  cookieId: string
  id: number
  /** True when an existing pending id was reused instead of creating upstream. */
  reused: boolean
}

export type GuestSubmissionState =
  | { kind: 'replay', id: number }
  | { kind: 'conflict' }
  /** Another submission for the same draft id is still in flight. */
  | { kind: 'busy' }
  | { kind: 'new' }

export interface GuestDraftStore {
  read(intent: GuestIntent): Promise<GuestDraftRecord | undefined> | GuestDraftRecord | undefined
  /**
   * Issues (or reuses) one draft id per intent. Concurrent calls for the same
   * record are serialized. A cookie that expired, is malformed, belongs to
   * another IP, or points at a record that no longer exists is *rotated* into a
   * fresh opaque id rather than being reassigned.
   */
  issue(intent: GuestIntent, create: () => Promise<number>): Promise<IssuedDraft>
  owns(intent: GuestIntent, id: number): Promise<boolean> | boolean
  /**
   * Confirmed-submission bookkeeping. `begin` reports a replay for an identical
   * payload that already succeeded, so the caller must not repeat the mutation.
   * It also takes an exclusive per-draft in-flight marker: `owns()` stays true
   * until `confirmSubmission` runs, so without the marker two concurrent
   * identical saves would both be told `new` and both reach the frozen backend.
   */
  beginSubmission(intent: GuestIntent, id: number, digest: string): Promise<GuestSubmissionState> | GuestSubmissionState
  confirmSubmission(intent: GuestIntent, id: number, digest: string): Promise<void> | void
  /** Releases the in-flight marker after a failed or abandoned submission. */
  abortSubmission(intent: GuestIntent, id: number): Promise<void> | void
  /** Canonical payload digest, derived from the store's own key. */
  digest(intent: GuestIntent, payload: unknown): string
  size(): Promise<number> | number
  inflight(): number
  close?: () => Promise<void> | void
  sweepBatch?: (batchSize?: number, nowTime?: number) => Promise<number> | number
}

/** Finite positive integers only; NaN/Infinity/huge options fall back to defaults. */
export function boundedOption(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback
  const floored = Math.floor(numeric)
  if (floored < min) return fallback
  return Math.min(floored, max)
}

export const newGuestCookieId = (): string => randomBytes(32).toString('base64url')

export function hashGuestCookieId(key: Buffer, cookieId: string): string {
  return createHmac('sha256', key).update(cookieId).digest('hex')
}

export function hashGuestIntentKey(key: Buffer, intentKey: string): string {
  return createHmac('sha256', key).update(`intent:${intentKey}`).digest('hex')
}

/** Canonical digest of a submitted payload, used for replay detection. */
export function digestGuestPayload(key: Buffer, payload: unknown): string {
  return createHmac('sha256', key).update(JSON.stringify(payload ?? null)).digest('hex')
}

export function createPostgresGuestDraftStore(key: Buffer, options: GuestDraftStoreOptions = {}): GuestDraftStore {
  const now = options.now ?? Date.now
  const ttl = boundedOption(options.ttlMs, GUEST_RECORD_TTL_MS, 1000, 7 * 86400000)
  const reuse = boundedOption(options.reuseMs, GUEST_DRAFT_REUSE_MS, 0, 3600000)
  const leaseMs = boundedOption(options.submissionLeaseMs, 30000, 1000, 120000)
  const maxDrafts = boundedOption(options.maxDrafts, GUEST_MAX_DRAFTS_PER_RECORD, 1, 64)
  const maxReceipts = boundedOption(options.maxReceipts, GUEST_MAX_RECEIPTS_PER_RECORD, 1, 64)
  const limit = boundedOption(options.maxInflight, GUEST_MAX_INFLIGHT, 1, 10000)
  const durable = createPostgresDurableStore<GuestDraftRecord>({ namespace: options.namespace ?? 'guest-drafts', secret: key,
    connectionString: options.connectionString, maxEntries: boundedOption(options.maxRecords, GUEST_MAX_RECORDS, 1, 100000) })
  const pending = new Map<string, Promise<IssuedDraft>>()
  const owners = new Map<string, { token: string; until: number }>()
  const keyFor = (intent: GuestIntent) => GUEST_COOKIE_ID_PATTERN.test(intent.cookieId || '')
    ? hashGuestCookieId(key, intent.cookieId!)
    : intent.intentKey && intent.intentKey.length >= 16 ? hashGuestIntentKey(key, `${intent.clientIp}\0${intent.intentKey}`) : ''
  const empty = (id: string, intent: GuestIntent): GuestDraftRecord => ({ key: id, clientIp: intent.clientIp, drafts: [], submitted: [], receipts: [], lastIssuedAt: 0, updatedAt: now() })
  const valid = (record: GuestDraftRecord | undefined, intent: GuestIntent) => record && record.clientIp === intent.clientIp && record.updatedAt >= now() - ttl
  const read = async (intent: GuestIntent) => {
    const id = keyFor(intent)
    if (!id) return undefined
    return durable.withLock(id, async ctx => {
      const record = await ctx.get(id)
      if (record && record.updatedAt < now() - ttl) { await ctx.delete(id); return undefined }
      return valid(record, intent) ? record : undefined
    })
  }
  const mutate = async <R>(intent: GuestIntent, action: (record: GuestDraftRecord) => R) => {
    const id = keyFor(intent)
    if (!id) throw new BffError(409, 'conflict', '草稿凭据已失效')
    return durable.withLock(id, async ctx => {
      const record = await ctx.get(id)
      if (!valid(record, intent)) throw new BffError(409, 'conflict', '草稿凭据已失效')
      const result = action(record!)
      await ctx.set(id, record!)
      return result
    })
  }
  return {
    read,
    async issue(intent, create) {
      const knownCookie = GUEST_COOKIE_ID_PATTERN.test(intent.cookieId || '') ? intent.cookieId : undefined
      const lockKey = keyFor(intent) || hashGuestCookieId(key, newGuestCookieId())
      const old = pending.get(lockKey)
      if (old) return old
      if (pending.size >= limit) throw new BffError(429, 'quota_exceeded', '草稿请求繁忙，请稍后再试')
      const work = durable.withLock(lockKey, async ctx => {
        const previous = await ctx.get(lockKey)
        let cookieId = knownCookie
        let authority: GuestDraftRecord | undefined
        let generation = valid(previous, intent) ? previous?.intentGeneration : undefined
        if (!knownCookie && generation) {
          cookieId = createHmac('sha256', key).update(`issued-cookie:${lockKey}:${generation}`).digest('base64url')
          authority = await ctx.get(hashGuestCookieId(key, cookieId))
        } else if (knownCookie) authority = previous
        if (cookieId && valid(authority, intent) && authority!.lastIssuedAt > 0 && now() - authority!.lastIssuedAt < reuse) {
          const id = authority!.drafts.at(-1)
          if (id !== undefined && !authority!.submitted.includes(id)) return { cookieId, id, reused: true }
        }
        if (!knownCookie || !valid(authority, intent)) {
          generation = randomBytes(16).toString('hex')
          cookieId = knownCookie ? newGuestCookieId() : createHmac('sha256', key).update(`issued-cookie:${lockKey}:${generation}`).digest('base64url')
          authority = undefined
        }
        const effective = cookieId!, id = hashGuestCookieId(key, effective)
        const record = authority ?? empty(id, intent)
        const created = await create()
        record.drafts.push(created)
        while (record.drafts.length > maxDrafts) { const removed = record.drafts.shift()!; if (record.submissionLeases) Reflect.deleteProperty(record.submissionLeases, String(removed)) }
        record.lastIssuedAt = record.updatedAt = now()
        await ctx.set(id, record)
        if (!knownCookie && intent.intentKey) await ctx.set(lockKey, { ...empty(lockKey, intent), intentGeneration: generation })
        return { cookieId: effective, id: created, reused: false }
      })
      pending.set(lockKey, work)
      void work.then(() => pending.delete(lockKey), () => pending.delete(lockKey))
      return work
    },
    async owns(intent, id) { const record = await read(intent); return Boolean(record?.drafts.includes(id) && !record.submitted.includes(id)) },
    digest(_intent, payload) { return digestGuestPayload(key, payload) },
    async beginSubmission(intent, id, digest) {
      for (const [owner, lease] of owners) if (lease.until <= now()) owners.delete(owner)
      if (owners.size >= limit && !owners.has(`${keyFor(intent)}:${id}`)) throw new BffError(503, 'upstream_unavailable', '提交请求繁忙，请稍后再试')
      return mutate<GuestSubmissionState>(intent, record => {
        if (!record.drafts.includes(id)) return { kind: 'conflict' }
        const receipt = record.receipts.find(r => r.id === id && r.digest === digest)
        if (receipt) return { kind: 'replay', id }
        if (record.submitted.includes(id)) return { kind: 'conflict' }
        const lease = record.submissionLeases?.[String(id)]
        if (lease && lease.until > now()) return { kind: 'busy' }
        const token = randomBytes(16).toString('hex')
        record.submissionLeases ??= {}
        record.submissionLeases[String(id)] = { token, until: now() + leaseMs }
        delete record.inFlightDraftId
        record.updatedAt = now()
        owners.set(`${record.key}:${id}`, { token, until: now() + leaseMs })
        return { kind: 'new' }
      })
    },
    async confirmSubmission(intent, id, digest) {
      try {
        await mutate(intent, record => {
          const token = owners.get(`${record.key}:${id}`)?.token
          if (!token || record.submissionLeases?.[String(id)]?.token !== token) throw new BffError(409, 'lease_lost', '提交结果待确认，请重试查询')
          Reflect.deleteProperty(record.submissionLeases, String(id))
          if (!record.submitted.includes(id)) record.submitted.push(id)
          record.submitted = record.submitted.slice(-maxDrafts)
          record.receipts = [...record.receipts.filter(r => r.id !== id), { id, digest }].slice(-maxReceipts)
          record.lastIssuedAt = 0; record.updatedAt = now()
        })
      } finally { owners.delete(`${keyFor(intent)}:${id}`) }
    },
    async abortSubmission(intent, id) {
      try {
        await mutate(intent, record => {
          const token = owners.get(`${record.key}:${id}`)?.token
          if (token && record.submissionLeases?.[String(id)]?.token === token) Reflect.deleteProperty(record.submissionLeases, String(id))
        })
      } finally { owners.delete(`${keyFor(intent)}:${id}`) }
    },
    size: () => durable.size(), inflight: () => pending.size,
    sweepBatch: (size = 100, time = now()) => durable.sweepBatch(size, record => record.updatedAt < time - ttl),
    close: () => durable.close(),
  }
}

export function createGuestDraftStore(
  key: Buffer,
  options: GuestDraftStoreOptions = {}
): GuestDraftStore {
  const driver = stateDriver(options.driver)
  if (driver === 'postgres') {
    return createPostgresGuestDraftStore(key, options)
  }

  const now = options.now ?? Date.now
  const ttlMs = boundedOption(options.ttlMs, GUEST_RECORD_TTL_MS, 1_000, 7 * 24 * 60 * 60 * 1000)
  const maxRecords = boundedOption(options.maxRecords, GUEST_MAX_RECORDS, 1, 100_000)
  const maxDrafts = boundedOption(options.maxDrafts, GUEST_MAX_DRAFTS_PER_RECORD, 1, 64)
  const maxReceipts = boundedOption(options.maxReceipts, GUEST_MAX_RECEIPTS_PER_RECORD, 1, 64)
  const maxInflight = boundedOption(options.maxInflight, GUEST_MAX_INFLIGHT, 1, 10_000)
  const reuseMs = boundedOption(options.reuseMs, GUEST_DRAFT_REUSE_MS, 0, 60 * 60 * 1000)
  const records = durableRecords<GuestDraftRecord>(options.namespace ?? 'guest-drafts', key)
  const inFlight = new Map<string, Promise<IssuedDraft>>()
  // A first response may be lost before Set-Cookie arrives. Retain the issued
  // response briefly for the same CSRF intent and address, with a hard bound.
  const firstResponses = new Map<string, { at: number, issued: IssuedDraft }>()
  /** Per-draft exclusive submission markers, `${recordKey}:${draftId}`. */
  const submissionsInFlight = new Set<string>()

  /**
   * Release a submission marker only for the record the caller actually owns:
   * `read` enforces the client-IP binding, so a foreign caller cannot free the
   * owner's marker (which would re-open the concurrent-save race).
   */
  function releaseMarker(intent: GuestIntent, id: number): void {
    const record = read(intent)
    if (record) submissionsInFlight.delete(`${record.key}:${id}`)
  }

  /** Keeps the record count bounded within maxRecords. */
  function enforceRecordBound(): void {
    while (records.size >= maxRecords) {
      const oldest = records.keys().next().value
      if (oldest === undefined) break
      discardRecord(oldest)
    }
  }

  function discardRecord(recordKey: string): void {
    records.delete(recordKey)
    for (const marker of submissionsInFlight) {
      if (marker.startsWith(`${recordKey}:`)) submissionsInFlight.delete(marker)
    }
  }

  function put(recordKey: string, record: GuestDraftRecord): void {
    records.delete(recordKey)
    records.set(recordKey, record)
    enforceRecordBound()
  }

  const validCookie = (cookieId: string | undefined): cookieId is string =>
    typeof cookieId === 'string' && GUEST_COOKIE_ID_PATTERN.test(cookieId)

  const keyFor = (intent: GuestIntent): { recordKey: string, cookieId: string | undefined } => {
    if (validCookie(intent.cookieId)) {
      return { recordKey: hashGuestCookieId(key, intent.cookieId), cookieId: intent.cookieId }
    }
    if (typeof intent.intentKey === 'string' && intent.intentKey.length >= 16) {
      return { recordKey: hashGuestIntentKey(key, `${intent.clientIp}\0${intent.intentKey}`), cookieId: undefined }
    }
    return { recordKey: '', cookieId: undefined }
  }

  function read(intent: GuestIntent): GuestDraftRecord | undefined {
    const { recordKey } = keyFor(intent)
    if (!recordKey) return undefined
    const record = records.get(recordKey)
    if (!record) return undefined
    if (record.updatedAt < now() - ttlMs) {
      discardRecord(recordKey)
      return undefined
    }
    return record.clientIp === intent.clientIp ? record : undefined
  }

  function emptyRecord(recordKey: string, intent: GuestIntent): GuestDraftRecord {
    return {
      key: recordKey,
      clientIp: intent.clientIp,
      drafts: [],
      submitted: [],
      receipts: [],
      lastIssuedAt: 0,
      updatedAt: now()
    }
  }

  async function issue(intent: GuestIntent, create: () => Promise<number>): Promise<IssuedDraft> {
    const { recordKey, cookieId } = keyFor(intent)
    if (!recordKey) {
      // No cookie and no intent key: a fresh opaque id per call, still one per call.
      const fresh = newGuestCookieId()
      const created = await create()
      const freshKey = hashGuestCookieId(key, fresh)
      const candidate: GuestDraftRecord = {
        ...emptyRecord(freshKey, intent),
        drafts: [created],
        lastIssuedAt: now(),
        updatedAt: now(),
      }
      put(freshKey, candidate)
      return { cookieId: fresh, id: created, reused: false }
    }
    const pending = inFlight.get(recordKey)
    if (pending) return await pending
    for (const [intentKey, response] of firstResponses) {
      if (now() - response.at >= Math.min(reuseMs, ttlMs)) firstResponses.delete(intentKey)
    }
    const first = cookieId === undefined ? firstResponses.get(recordKey) : undefined
    const firstRecord = first && read({ cookieId: first.issued.cookieId, clientIp: intent.clientIp })
    if (first && firstRecord?.drafts.includes(first.issued.id) && !firstRecord.submitted.includes(first.issued.id)) {
      return { ...first.issued, reused: true }
    }
    if (inFlight.size >= maxInflight) {
      throw new Error('guest draft store is at its in-flight limit')
    }

    const work = (async (): Promise<IssuedDraft> => {
      const stored = records.get(recordKey)
      // An expired record is treated as absent: its cookie is rotated below, never
      // reassigned, exactly like a foreign-IP or malformed one. Checking presence
      // alone would resurrect a record past its TTL.
      const existing = stored !== undefined && stored.updatedAt >= now() - ttlMs ? stored : undefined
      if (stored !== undefined && existing === undefined) discardRecord(recordKey)
      const sameOwner = existing !== undefined && existing.clientIp === intent.clientIp
      // A foreign, expired or missing record is never reassigned: rotate the cookie.
      const effectiveCookieId = sameOwner ? cookieId ?? newGuestCookieId() : newGuestCookieId()
      const effectiveKey = sameOwner ? recordKey : hashGuestCookieId(key, effectiveCookieId)
      const base = sameOwner ? existing! : emptyRecord(effectiveKey, intent)
      const candidate: GuestDraftRecord = {
        key: effectiveKey,
        clientIp: intent.clientIp,
        drafts: [...base.drafts],
        submitted: [...base.submitted],
        receipts: base.receipts.map(r => ({ ...r })),
        lastIssuedAt: base.lastIssuedAt,
        updatedAt: now(),
      }
      const reusable = candidate.drafts.at(-1)
      if (
        reusable !== undefined &&
        candidate.lastIssuedAt > 0 &&
        now() - candidate.lastIssuedAt < reuseMs &&
        !candidate.submitted.includes(reusable)
      ) {
        put(effectiveKey, candidate)
        return { cookieId: effectiveCookieId, id: reusable, reused: true }
      }
      const created = await create()
      candidate.drafts.push(created)
      while (candidate.drafts.length > maxDrafts) candidate.drafts.shift()
      candidate.lastIssuedAt = now()
      candidate.updatedAt = now()
      put(effectiveKey, candidate)
      return { cookieId: effectiveCookieId, id: created, reused: false }
    })()
    inFlight.set(recordKey, work)
    const release = (): void => {
      if (inFlight.get(recordKey) === work) inFlight.delete(recordKey)
    }
    void work.then(issued => {
      if (cookieId === undefined && reuseMs > 0) {
        firstResponses.set(recordKey, { at: now(), issued })
        while (firstResponses.size > maxRecords) firstResponses.delete(firstResponses.keys().next().value!)
      }
      release()
    }, release)
    return await work
  }

  return {
    read,
    issue,
    owns(intent, id) {
      const record = read(intent)
      return Boolean(record && record.drafts.includes(id) && !record.submitted.includes(id))
    },
    beginSubmission(intent, id, digest) {
      const record = read(intent)
      if (!record || !record.drafts.includes(id)) return { kind: 'conflict' }
      const receipt = record.receipts.find((entry) => entry.id === id && entry.digest === digest)
      if (receipt) return { kind: 'replay', id: receipt.id }
      if (record.submitted.includes(id)) return { kind: 'conflict' }
      const marker = `${record.key}:${id}`
      if (submissionsInFlight.has(marker)) return { kind: 'busy' }
      // Never evict an active lock: doing so would permit a duplicate write.
      if (submissionsInFlight.size >= maxInflight) return { kind: 'busy' }
      submissionsInFlight.add(marker)
      return { kind: 'new' }
    },
    digest(_intent, payload) {
      return digestGuestPayload(key, payload)
    },
    confirmSubmission(intent, id, digest) {
      releaseMarker(intent, id)
      const record = read(intent)
      if (!record) return
      const submitted = [...record.submitted]
      if (!submitted.includes(id)) submitted.push(id)
      while (submitted.length > maxDrafts) submitted.shift()
      const receipts = record.receipts.filter((entry) => entry.id !== id).map(r => ({ ...r }))
      receipts.push({ digest, id })
      while (receipts.length > maxReceipts) receipts.shift()
      const candidate: GuestDraftRecord = {
        key: record.key,
        clientIp: record.clientIp,
        drafts: [...record.drafts],
        submitted,
        receipts,
        lastIssuedAt: 0,
        updatedAt: now(),
      }
      put(record.key, candidate)
    },
    abortSubmission(intent, id) {
      releaseMarker(intent, id)
    },
    size() {
      enforceRecordBound()
      return records.size
    },
    inflight() {
      return inFlight.size
    },
    sweepBatch(batchSize: number = 100, nowTime?: number): number {
      const limit = typeof batchSize === 'number' && Number.isFinite(batchSize) && batchSize > 0
        ? Math.floor(batchSize)
        : 100
      const currentTime = typeof nowTime === 'number' && Number.isFinite(nowTime) ? nowTime : now()
      const cutoff = currentTime - ttlMs
      const expiredKeys: string[] = []
      for (const [recordKey, record] of records) {
        if (record.updatedAt < cutoff) {
          expiredKeys.push(recordKey)
          if (expiredKeys.length >= limit) break
        }
      }
      if (expiredKeys.length === 0) return 0
      for (const key of expiredKeys) {
        for (const marker of submissionsInFlight) {
          if (marker.startsWith(`${key}:`)) submissionsInFlight.delete(marker)
        }
      }
      const durable = records as Partial<DurableRecords<GuestDraftRecord>>
      if (typeof durable.deleteMany === 'function') {
        return durable.deleteMany(expiredKeys)
      }
      let removed = 0
      for (const key of expiredKeys) {
        if (records.delete(key)) removed += 1
      }
      return removed
    },
    close() {
      const durable = records as Partial<DurableRecords<GuestDraftRecord>>
      durable.close?.()
    }
  }
}
