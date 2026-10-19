import { createHmac, randomBytes } from 'node:crypto'

/**
 * Server-side guest draft records.
 *
 * The browser only ever holds an unpredictable opaque id in an HttpOnly cookie.
 * The store maps a keyed hash of that id (or of a cookie-less intent key) to the
 * draft ids issued for it, so a guessed `:id` can never modify another visitor's
 * draft. Records are hard-bounded, TTL'd, bound to the creating client IP, and
 * carry a small bounded set of *confirmed submission receipts* so a retry after a
 * lost response does not repeat a mutation.
 *
 * Single-process default: a durable multi-instance store remains a
 * deployment-plan item (no Redis or installation here).
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
  reuseMs?: number
}

export interface IssuedDraft {
  cookieId: string
  id: number
  /** True when an existing pending id was reused instead of creating upstream. */
  reused: boolean
}

export type GuestSubmissionState =
  | { kind: 'replay', id: number }
  | { kind: 'new' }

export interface GuestDraftStore {
  read(intent: GuestIntent): GuestDraftRecord | undefined
  /**
   * Issues (or reuses) one draft id per intent. Concurrent calls for the same
   * record are serialized. A cookie that expired, is malformed, belongs to
   * another IP, or points at a record that no longer exists is *rotated* into a
   * fresh opaque id rather than being reassigned.
   */
  issue(intent: GuestIntent, create: () => Promise<number>): Promise<IssuedDraft>
  owns(intent: GuestIntent, id: number): boolean
  /**
   * Confirmed-submission bookkeeping. `begin` reports a replay for an identical
   * payload that already succeeded, so the caller must not repeat the mutation.
   */
  beginSubmission(intent: GuestIntent, id: number, digest: string): GuestSubmissionState
  confirmSubmission(intent: GuestIntent, id: number, digest: string): void
  /** Canonical payload digest, derived from the store's own key. */
  digest(intent: GuestIntent, payload: unknown): string
  size(): number
  inflight(): number
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

export function createGuestDraftStore(
  key: Buffer,
  options: GuestDraftStoreOptions = {}
): GuestDraftStore {
  const now = options.now ?? Date.now
  const ttlMs = boundedOption(options.ttlMs, GUEST_RECORD_TTL_MS, 1_000, 7 * 24 * 60 * 60 * 1000)
  const maxRecords = boundedOption(options.maxRecords, GUEST_MAX_RECORDS, 1, 100_000)
  const maxDrafts = boundedOption(options.maxDrafts, GUEST_MAX_DRAFTS_PER_RECORD, 1, 64)
  const maxReceipts = boundedOption(options.maxReceipts, GUEST_MAX_RECEIPTS_PER_RECORD, 1, 64)
  const maxInflight = boundedOption(options.maxInflight, GUEST_MAX_INFLIGHT, 1, 10_000)
  const reuseMs = boundedOption(options.reuseMs, GUEST_DRAFT_REUSE_MS, 0, 60 * 60 * 1000)
  const records = new Map<string, GuestDraftRecord>()
  const inFlight = new Map<string, Promise<IssuedDraft>>()

  /** Evicts expired entries first, then oldest, and never leaves the map oversized. */
  function enforceRecordBound(): void {
    const cutoff = now() - ttlMs
    for (const [recordKey, record] of records) {
      if (record.updatedAt < cutoff) records.delete(recordKey)
    }
    while (records.size >= maxRecords) {
      const oldest = records.keys().next().value
      if (oldest === undefined) break
      records.delete(oldest)
    }
  }

  function put(recordKey: string, record: GuestDraftRecord): void {
    enforceRecordBound()
    records.delete(recordKey)
    records.set(recordKey, record)
  }

  const validCookie = (cookieId: string | undefined): cookieId is string =>
    typeof cookieId === 'string' && GUEST_COOKIE_ID_PATTERN.test(cookieId)

  const keyFor = (intent: GuestIntent): { recordKey: string, cookieId: string | undefined } => {
    if (validCookie(intent.cookieId)) {
      return { recordKey: hashGuestCookieId(key, intent.cookieId), cookieId: intent.cookieId }
    }
    if (typeof intent.intentKey === 'string' && intent.intentKey.length >= 16) {
      return { recordKey: hashGuestIntentKey(key, intent.intentKey), cookieId: undefined }
    }
    return { recordKey: '', cookieId: undefined }
  }

  function read(intent: GuestIntent): GuestDraftRecord | undefined {
    const { recordKey } = keyFor(intent)
    if (!recordKey) return undefined
    const record = records.get(recordKey)
    if (!record || record.updatedAt < now() - ttlMs) return undefined
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
      put(hashGuestCookieId(key, fresh), { ...emptyRecord(hashGuestCookieId(key, fresh), intent), drafts: [created], lastIssuedAt: now() })
      return { cookieId: fresh, id: created, reused: false }
    }
    const pending = inFlight.get(recordKey)
    if (pending) return await pending
    if (inFlight.size >= maxInflight) {
      throw new Error('guest draft store is at its in-flight limit')
    }

    const work = (async (): Promise<IssuedDraft> => {
      const stored = records.get(recordKey)
      // An expired record is treated as absent: its cookie is rotated below, never
      // reassigned, exactly like a foreign-IP or malformed one. Checking presence
      // alone would resurrect a record past its TTL.
      const existing = stored !== undefined && stored.updatedAt >= now() - ttlMs ? stored : undefined
      if (stored !== undefined && existing === undefined) records.delete(recordKey)
      const sameOwner = existing !== undefined && existing.clientIp === intent.clientIp
      // A foreign, expired or missing record is never reassigned: rotate the cookie.
      const effectiveCookieId = sameOwner ? cookieId ?? newGuestCookieId() : newGuestCookieId()
      const effectiveKey = sameOwner ? recordKey : hashGuestCookieId(key, effectiveCookieId)
      const record = sameOwner
        ? (existing as GuestDraftRecord)
        : emptyRecord(effectiveKey, intent)
      record.clientIp = intent.clientIp
      record.updatedAt = now()
      const reusable = record.drafts.at(-1)
      if (
        reusable !== undefined &&
        record.lastIssuedAt > 0 &&
        now() - record.lastIssuedAt < reuseMs &&
        !record.submitted.includes(reusable)
      ) {
        put(effectiveKey, record)
        return { cookieId: effectiveCookieId, id: reusable, reused: true }
      }
      const created = await create()
      record.drafts.push(created)
      while (record.drafts.length > maxDrafts) record.drafts.shift()
      record.lastIssuedAt = now()
      record.updatedAt = now()
      put(effectiveKey, record)
      return { cookieId: effectiveCookieId, id: created, reused: false }
    })()
    inFlight.set(recordKey, work)
    const release = (): void => {
      if (inFlight.get(recordKey) === work) inFlight.delete(recordKey)
    }
    void work.then(release, release)
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
      if (!record) return { kind: 'new' }
      const receipt = record.receipts.find((entry) => entry.digest === digest)
      if (receipt && receipt.id === id) return { kind: 'replay', id: receipt.id }
      return { kind: 'new' }
    },
    digest(_intent, payload) {
      return digestGuestPayload(key, payload)
    },
    confirmSubmission(intent, id, digest) {
      const record = read(intent)
      if (!record) return
      if (!record.submitted.includes(id)) record.submitted.push(id)
      while (record.submitted.length > maxDrafts) record.submitted.shift()
      record.receipts = record.receipts.filter((entry) => entry.digest !== digest)
      record.receipts.push({ digest, id })
      while (record.receipts.length > maxReceipts) record.receipts.shift()
      record.lastIssuedAt = 0
      record.updatedAt = now()
      put(record.key, record)
    },
    size() {
      enforceRecordBound()
      return records.size
    },
    inflight() {
      return inFlight.size
    }
  }
}
