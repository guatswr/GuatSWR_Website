import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  GUEST_DRAFT_COOKIE,
  GUEST_DRAFT_REUSE_MS,
  boundedOption,
  createGuestDraftStore,
  hashGuestCookieId,
  newGuestCookieId
} from '../server/utils/guest-drafts'
import type { GuestIntent } from '../server/utils/guest-drafts'

/**
 * Guest draft store: concurrency, identity binding, retention bounds and
 * confirmed-submission receipts.
 */

const key = createHmac('sha256', 'test-secret').update('guest-drafts').digest()

function setup(
  options: { ttlMs?: number, maxRecords?: number, maxDrafts?: number, maxReceipts?: number, maxInflight?: number, reuseMs?: number } = {}
) {
  let now = 1_000_000
  const store = createGuestDraftStore(key, { ...options, now: () => now })
  let next = 100
  return {
    store,
    create: async () => next++,
    advance(ms: number) {
      now += ms
    },
    intent(cookieId?: string, clientIp = '203.0.113.5', intentKey?: string): GuestIntent {
      return { cookieId, clientIp, intentKey }
    }
  }
}

describe('guest draft intents', () => {
  it('reuses the issued response when the first Set-Cookie was lost', async () => {
    const qa = setup()
    const intent = qa.intent(undefined, '203.0.113.5', 'csrf-digest-lost-response')
    const first = await qa.store.issue(intent, qa.create)
    const retry = await qa.store.issue(intent, qa.create)
    expect(retry).toEqual({ ...first, reused: true })
    expect(qa.store.owns(qa.intent(retry.cookieId), retry.id)).toBe(true)
    qa.advance(GUEST_DRAFT_REUSE_MS + 1)
    expect((await qa.store.issue(intent, qa.create)).id).not.toBe(first.id)
  })

  it('separates simultaneous intents on different visitor addresses', async () => {
    const qa = setup()
    const [first, second] = await Promise.all([
      qa.store.issue(qa.intent(undefined, '203.0.113.5', 'csrf-digest-identical-key'), qa.create),
      qa.store.issue(qa.intent(undefined, '198.51.100.5', 'csrf-digest-identical-key'), qa.create),
    ])
    expect(first.id).not.toBe(second.id)
    expect(first.cookieId).not.toBe(second.cookieId)
  })
  it('collapses concurrent first requests with one intent key into one draft', async () => {
    const qa = setup()
    let created = 0
    const create = async () => {
      created += 1
      return 27
    }
    const intentKey = 'csrf-digest-value-0123456789'
    const [first, second] = await Promise.all([
      qa.store.issue(qa.intent(undefined, '203.0.113.5', intentKey), create),
      qa.store.issue(qa.intent(undefined, '203.0.113.5', intentKey), create)
    ])
    expect(created).toBe(1)
    expect(first.id).toBe(27)
    expect(second.id).toBe(27)
    expect(first.cookieId).toBe(second.cookieId)
    expect(first.cookieId).toMatch(/^[A-Za-z0-9_-]{32,96}$/)
  })

  it('separates distinct visitors, distinct intent keys and distinct IPs', async () => {
    const qa = setup({ reuseMs: 0 })
    const visitorA = await qa.store.issue(
      qa.intent(undefined, '203.0.113.5', 'csrf-digest-value-aaaaaaaaaa'),
      qa.create
    )
    const visitorB = await qa.store.issue(
      qa.intent(undefined, '203.0.113.5', 'csrf-digest-value-bbbbbbbbbb'),
      qa.create
    )
    expect(visitorA.id).not.toBe(visitorB.id)
    const otherIp = await qa.store.issue(
      qa.intent(undefined, '198.51.100.9', 'csrf-digest-value-aaaaaaaaaa'),
      qa.create
    )
    expect(otherIp.id).not.toBe(visitorA.id)
  })

  it('reuses the last id inside the window, then issues a new one', async () => {
    const qa = setup()
    const first = await qa.store.issue(qa.intent(), qa.create)
    const repeated = await qa.store.issue(qa.intent(first.cookieId), qa.create)
    expect(repeated.id).toBe(first.id)
    expect(repeated.reused).toBe(true)
    qa.advance(GUEST_DRAFT_REUSE_MS + 1)
    const later = await qa.store.issue(qa.intent(first.cookieId), qa.create)
    expect(later.id).not.toBe(first.id)
    expect(later.cookieId).toBe(first.cookieId)
  })

  it('rotates a foreign or expired cookie instead of reassigning the record', async () => {
    const qa = setup({ ttlMs: 60_000 })
    const owner = await qa.store.issue(qa.intent(undefined, '203.0.113.5'), qa.create)
    const ownerRecord = qa.store.read(qa.intent(owner.cookieId, '203.0.113.5'))
    expect(ownerRecord).toBeDefined()

    // Same cookie, different client: a fresh opaque id, the owner's record intact.
    const intruder = await qa.store.issue(qa.intent(owner.cookieId, '198.51.100.9'), qa.create)
    expect(intruder.cookieId).not.toBe(owner.cookieId)
    expect(qa.store.read(qa.intent(owner.cookieId, '203.0.113.5'))?.drafts).toEqual([owner.id])
    expect(qa.store.owns(qa.intent(intruder.cookieId, '198.51.100.9'), owner.id)).toBe(false)

    // Expired cookie rotates too.
    qa.advance(61_000)
    expect(qa.store.read(qa.intent(owner.cookieId, '203.0.113.5'))).toBeUndefined()
    const refreshed = await qa.store.issue(qa.intent(owner.cookieId, '203.0.113.5'), qa.create)
    expect(refreshed.id).not.toBe(owner.id)
  })

  it('rejects malformed cookie ids and never stores the raw id', async () => {
    const qa = setup()
    for (const cookieId of ['short', '../../etc/passwd', 'x'.repeat(200)]) {
      expect(qa.store.read(qa.intent(cookieId))).toBeUndefined()
    }
    const issued = await qa.store.issue(qa.intent(), qa.create)
    const record = qa.store.read(qa.intent(issued.cookieId))
    expect(record?.key).toBe(hashGuestCookieId(key, issued.cookieId))
    expect(record?.key).not.toContain(issued.cookieId)
    expect(GUEST_DRAFT_COOKIE).toBe('bff_guest_drafts')
  })
})

describe('guest draft ownership and receipts', () => {
  it('keeps identical payload receipts separate for separate drafts', async () => {
    const qa = setup({ reuseMs: 0 })
    const first = await qa.store.issue(qa.intent(), qa.create)
    const intent = qa.intent(first.cookieId)
    const second = await qa.store.issue(intent, qa.create)
    const digest = qa.store.digest(intent, { type: 'STG', title: '比赛', content: {} })
    for (const id of [first.id, second.id]) {
      expect(qa.store.beginSubmission(intent, id, digest)).toEqual({ kind: 'new' })
      qa.store.confirmSubmission(intent, id, digest)
    }
    for (const id of [first.id, second.id])
      expect(qa.store.beginSubmission(intent, id, digest)).toEqual({ kind: 'replay', id })
  })

  it('refuses extra concurrent submissions without evicting a live lock', async () => {
    const qa = setup({ maxInflight: 1, reuseMs: 0 })
    const first = await qa.store.issue(qa.intent(), qa.create)
    const intent = qa.intent(first.cookieId)
    const second = await qa.store.issue(intent, qa.create)
    expect(qa.store.beginSubmission(intent, first.id, 'a')).toEqual({ kind: 'new' })
    expect(qa.store.beginSubmission(intent, second.id, 'b')).toEqual({ kind: 'busy' })
    expect(qa.store.beginSubmission(intent, first.id, 'a')).toEqual({ kind: 'busy' })
    qa.store.abortSubmission(intent, first.id)
    expect(qa.store.beginSubmission(intent, second.id, 'b')).toEqual({ kind: 'new' })
  })
  it('retires submitted drafts and replays only an identical confirmed payload', async () => {
    const qa = setup()
    const issued = await qa.store.issue(qa.intent(), qa.create)
    const intent = qa.intent(issued.cookieId)
    expect(qa.store.owns(intent, issued.id)).toBe(true)

    const payload = { type: 'STG', title: '比赛', content: { rules: '双败' } }
    const digest = qa.store.digest(intent, payload)
    expect(qa.store.beginSubmission(intent, issued.id, digest)).toEqual({ kind: 'new' })
    qa.store.confirmSubmission(intent, issued.id, digest)

    expect(qa.store.owns(intent, issued.id)).toBe(false)
    // A retry with the identical body is a recorded receipt, not a new mutation.
    expect(qa.store.beginSubmission(intent, issued.id, digest)).toEqual({
      kind: 'replay',
      id: issued.id
    })
    // A conflicting payload is not replayed and the draft is no longer owned.
    const conflicting = qa.store.digest(intent, { type: 'STG', title: '别的', content: {} })
    expect(qa.store.beginSubmission(intent, issued.id, conflicting)).toEqual({ kind: 'conflict' })
    expect(qa.store.owns(intent, issued.id)).toBe(false)
  })

  it('locks a draft while its save is in flight so a concurrent save cannot repeat it', async () => {
    const qa = setup()
    const issued = await qa.store.issue(qa.intent(), qa.create)
    const intent = qa.intent(issued.cookieId)
    const digest = qa.store.digest(intent, { type: 'STG', title: '比赛', content: {} })

    // `owns()` stays true until the write is confirmed, so the store itself has
    // to reject the second concurrent save.
    expect(qa.store.owns(intent, issued.id)).toBe(true)
    expect(qa.store.beginSubmission(intent, issued.id, digest)).toEqual({ kind: 'new' })
    expect(qa.store.owns(intent, issued.id)).toBe(true)
    expect(qa.store.beginSubmission(intent, issued.id, digest)).toEqual({ kind: 'busy' })

    // A failed upstream write releases the marker, so the client may retry.
    qa.store.abortSubmission(intent, issued.id)
    expect(qa.store.beginSubmission(intent, issued.id, digest)).toEqual({ kind: 'new' })
    qa.store.confirmSubmission(intent, issued.id, digest)
    expect(qa.store.beginSubmission(intent, issued.id, digest)).toEqual({ kind: 'replay', id: issued.id })

    // A different draft id is not blocked by this one's marker.
    const other = await qa.store.issue(intent, qa.create)
    const otherIntent = qa.intent(other.cookieId)
    const otherDigest = qa.store.digest(otherIntent, { type: 'STG', title: '另一场', content: {} })
    expect(qa.store.beginSubmission(otherIntent, other.id, otherDigest)).toEqual({ kind: 'new' })
  })

  it('refuses a foreign client the owner’s in-flight marker', async () => {
    const qa = setup()
    const issued = await qa.store.issue(qa.intent(), qa.create)
    const owner = qa.intent(issued.cookieId)
    const digest = qa.store.digest(owner, { type: 'STG', title: '比赛', content: {} })
    expect(qa.store.beginSubmission(owner, issued.id, digest)).toEqual({ kind: 'new' })

    // Same cookie, different address: not the owner, so it must not free the
    // marker (which would re-open the concurrent-save race).
    const intruder = qa.intent(issued.cookieId, '198.51.100.9')
    qa.store.abortSubmission(intruder, issued.id)
    expect(qa.store.beginSubmission(owner, issued.id, digest)).toEqual({ kind: 'busy' })
  })

  it('bounds drafts and receipts per record', async () => {
    const qa = setup({ maxDrafts: 2, maxReceipts: 1, reuseMs: 0 })
    const first = await qa.store.issue(qa.intent(), qa.create)
    const intent = qa.intent(first.cookieId)
    const second = await qa.store.issue(intent, qa.create)
    const third = await qa.store.issue(intent, qa.create)
    const record = qa.store.read(intent)
    expect(record?.drafts).toEqual([second.id, third.id])

    qa.store.confirmSubmission(intent, second.id, 'a')
    qa.store.confirmSubmission(intent, third.id, 'b')
    const after = qa.store.read(intent)
    expect(after?.receipts.length).toBe(1)
    expect(after?.submitted.length).toBeLessThanOrEqual(2)
  })

  it('never exceeds the record bound and sanitizes hostile options', async () => {
    const qa = setup({ maxRecords: 2, reuseMs: 0 })
    for (const ip of ['203.0.113.1', '203.0.113.2', '203.0.113.3', '203.0.113.4']) {
      await qa.store.issue(qa.intent(undefined, ip), qa.create)
    }
    expect(qa.store.size()).toBeLessThanOrEqual(2)

    expect(boundedOption(Number.NaN, 10, 1, 100)).toBe(10)
    expect(boundedOption(Number.POSITIVE_INFINITY, 10, 1, 100)).toBe(10)
    expect(boundedOption(-5, 10, 1, 100)).toBe(10)
    expect(boundedOption(1e12, 10, 1, 100)).toBe(100)
    expect(boundedOption('7', 10, 1, 100)).toBe(7)

    const hostile = createGuestDraftStore(key, {
      now: () => 1_000,
      maxRecords: Number.NaN,
      maxDrafts: Number.POSITIVE_INFINITY,
      ttlMs: -1
    })
    const issued = await hostile.issue({ clientIp: '203.0.113.9' }, async () => 5)
    expect(issued.id).toBe(5)
    expect(hostile.size()).toBe(1)
  })

  it('caps in-flight work and releases the slot even when creation fails', async () => {
    const qa = setup({ maxInflight: 1, reuseMs: 0 })
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const slow = qa.store.issue(qa.intent(undefined, '203.0.113.5', 'csrf-digest-value-aaaaaaaaaa'), async () => {
      await gate
      return 1
    })
    await expect(
      qa.store.issue(qa.intent(undefined, '203.0.113.6', 'csrf-digest-value-bbbbbbbbbb'), qa.create)
    ).rejects.toThrow(/in-flight/)
    release?.()
    await slow
    expect(qa.store.inflight()).toBe(0)

    const failing = qa.store.issue(
      qa.intent(undefined, '203.0.113.7', 'csrf-digest-value-cccccccccc'),
      async () => {
        throw new Error('upstream down')
      }
    )
    await expect(failing).rejects.toThrow('upstream down')
    expect(qa.store.inflight()).toBe(0)
    expect(newGuestCookieId()).not.toBe(newGuestCookieId())
  })
})
