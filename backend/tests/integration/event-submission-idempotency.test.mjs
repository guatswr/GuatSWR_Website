import { createHmac } from 'node:crypto'
import { createRequire } from 'node:module'
import { expect, it, describe } from 'vitest'
import { fixture, bridgeKey, bridgeHeaders, get, all, run } from '../helpers/fixture.mjs'

const require = createRequire(import.meta.url)
const { guestDraftProofMessage } = require('@guatswr/shared')
const { computeCanonicalPayloadDigest } = require('../../dist/src/modules/events/service.js')

const headers = (scope, eid, { ip = '127.0.0.1', expires = Math.floor(Date.now() / 1000) + 30, digest } = {}) => {
  const signature = createHmac('sha256', bridgeKey).update(guestDraftProofMessage({ scope, eid, expires, ip })).digest('base64url')
  const base = { ...bridgeHeaders(ip), 'x-bff-draft-proof': `v1.${eid}.${scope}.${expires}.${signature}` }
  if (digest) base['x-submission-digest'] = digest
  return base
}

const strict = () => fixture({
  env: {
    TRUST_PROXY_CIDRS: '127.0.0.1/32',
    GUEST_DRAFT_PROOF_MODE: 'required',
    BOT_PLATFORM_ENABLED: 'true'
  }
})

describe('AUTH-04: Event submission idempotency across crash and retry', () => {
  it('rejects changed payloads even if the caller reuses the digest header', async () => {
    const f = await strict()
    const draft = await f.http.post('/api/event/draft').set(headers('draft', 0)).send({})
    const eid = draft.body.id
    const proof = headers('save', eid, { digest: 'same-untrusted-header' })
    expect((await f.http.put(`/api/event/${eid}`).set(proof).send({ type: 'STG', title: 'original', submit: true })).status).toBe(200)
    expect((await f.http.put(`/api/event/${eid}`).set(proof).send({ type: 'STG', title: 'changed', submit: true })).status).toBe(409)
  })

  it('replays submissions with staged images after their source files have been cleaned', async () => {
    const f = await strict()
    const path = (await import('node:path')).default
    const draft = await f.http.post('/api/event/draft').set(headers('draft', 0)).send({})
    const eid = draft.body.id
    const source = path.join(f.context.PUBLIC_DIR, 'upload', 'retry-image.png')
    await f.fs.mkdir(path.dirname(source), { recursive: true })
    await f.fs.writeFile(source, 'synthetic image bytes')
    const payload = { type: 'STG', title: 'image retry', content: { image: '/uploads/upload/retry-image.png' }, submit: true }
    const first = await f.http.put(`/api/event/${eid}`).set(headers('save', eid)).send(payload)
    expect(first.status).toBe(200)
    await f.fs.rm(source, { force: true })
    const replay = await f.http.put(`/api/event/${eid}`).set(headers('save', eid)).send(payload)
    expect(replay.status).toBe(200)
    expect(replay.body.replayed).toBe(true)
    await run(f.db, "UPDATE events SET status='published' WHERE id=?", [eid])
    const approvedReplay = await f.http.put(`/api/event/${eid}`).set(headers('save', eid)).send(payload)
    expect(approvedReplay.status).toBe(200)
    expect(approvedReplay.body.replayed).toBe(true)
  })
  it('records event_submissions on first submit and replays idempotently without duplicate bot outbox', async () => {
    const f = await strict()
    const draftRes = await f.http.post('/api/event/draft').set(headers('draft', 0)).send({})
    expect(draftRes.status).toBe(200)
    const eid = draftRes.body.id
    const digest = 'test-sha256-digest-1234567890abcdef'

    const submitPayload = { type: 'STG', title: 'Idempotency Event', submit: true }
    const firstRes = await f.http.put(`/api/event/${eid}`)
      .set(headers('save', eid, { digest }))
      .send(submitPayload)

    expect(firstRes.status).toBe(200)
    expect(firstRes.body.id).toBe(eid)
    expect(firstRes.body.replayed).toBe(false)

    // Verify submission record was created in the same transaction
    const submission = await get(f.db, 'SELECT * FROM event_submissions WHERE event_id=?', [eid])
    expect(submission).toBeDefined()
    expect(submission.event_id).toBe(eid)
    expect(submission.digest).toBe(computeCanonicalPayloadDigest(submitPayload))
    expect(submission.capability_key).toBe(`proof:127.0.0.1:${eid}`)

    // Verify bot notification received exactly 1 message
    const notifications = await all(f.db, "SELECT * FROM bot_notifications WHERE event_name='event.pending'")
    expect(notifications.length).toBe(1)
    expect(JSON.parse(notifications[0].payload).data.eventId).toBe(eid)

    // Simulate crash and client retry with identical digest
    const replayRes = await f.http.put(`/api/event/${eid}`)
      .set(headers('save', eid, { digest }))
      .send(submitPayload)

    expect(replayRes.status).toBe(200)
    expect(replayRes.body.id).toBe(eid)
    expect(replayRes.body.replayed).toBe(true)

    // Verify no duplicate submission or duplicate notification
    const subCount = await get(f.db, 'SELECT count(*) as count FROM event_submissions WHERE event_id=?', [eid])
    expect(subCount.count).toBe(1)
    const notifsAfter = await all(f.db, "SELECT * FROM bot_notifications WHERE event_name='event.pending'")
    expect(notifsAfter.length).toBe(1)
  })

  it('rejects duplicate submission with different digest with 409 conflict', async () => {
    const f = await strict()
    const draftRes = await f.http.post('/api/event/draft').set(headers('draft', 0)).send({})
    expect(draftRes.status).toBe(200)
    const eid = draftRes.body.id

    const digestA = 'test-sha256-digest-A'
    const digestB = 'test-sha256-digest-B'

    const firstRes = await f.http.put(`/api/event/${eid}`)
      .set(headers('save', eid, { digest: digestA }))
      .send({ type: 'STG', title: 'Original Event', submit: true })
    expect(firstRes.status).toBe(200)

    const conflictRes = await f.http.put(`/api/event/${eid}`)
      .set(headers('save', eid, { digest: digestB }))
      .send({ type: 'STG', title: 'Tampered Event', submit: true })

    expect(conflictRes.status).toBe(409)
    expect(conflictRes.body.message).toContain('该活动已提交')

    // Notifications must still have only 1
    const notifications = await all(f.db, "SELECT * FROM bot_notifications WHERE event_name='event.pending'")
    expect(notifications.length).toBe(1)
  })

  it('rejects submission with forged capability key', async () => {
    const f = await strict()
    const draftRes = await f.http.post('/api/event/draft').set(headers('draft', 0)).send({})
    expect(draftRes.status).toBe(200)
    const eid = draftRes.body.id
    const digest = 'test-sha256-digest-C'

    // First submit with valid proof
    const firstRes = await f.http.put(`/api/event/${eid}`)
      .set(headers('save', eid, { digest }))
      .send({ type: 'STG', title: 'Event', submit: true })
    expect(firstRes.status).toBe(200)

    // Attempt replay with forged proof
    const forgedRes = await f.http.put(`/api/event/${eid}`)
      .set({ ...headers('save', eid, { digest }), 'x-bff-draft-proof': 'forged' })
      .send({ type: 'STG', title: 'Event', submit: true })
    expect(forgedRes.status).toBe(403)
  })

  it('handles concurrent identical submissions without duplicate notification', async () => {
    const f = await strict()
    const draftRes = await f.http.post('/api/event/draft').set(headers('draft', 0)).send({})
    const eid = draftRes.body.id
    const digest = 'test-sha256-concurrent-digest'
    const payload = { type: 'STG', title: 'Concurrent Event', submit: true }

    const [res1, res2] = await Promise.all([
      f.http.put(`/api/event/${eid}`).set(headers('save', eid, { digest })).send(payload),
      f.http.put(`/api/event/${eid}`).set(headers('save', eid, { digest })).send(payload)
    ])

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)

    // Exactly 1 bot notification
    const notifications = await all(f.db, "SELECT * FROM bot_notifications WHERE event_name='event.pending'")
    expect(notifications.length).toBe(1)

    // Exactly 1 submission receipt
    const subCount = await get(f.db, 'SELECT count(*) as count FROM event_submissions WHERE event_id=?', [eid])
    expect(subCount.count).toBe(1)
  })
})
