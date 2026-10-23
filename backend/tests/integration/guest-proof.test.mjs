import { createHmac } from 'node:crypto'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import { fixture, token, bridgeKey, bridgeHeaders, png, get } from '../helpers/fixture.mjs'
const require = createRequire(import.meta.url)
const { guestDraftProofMessage } = require('@guatswr/shared')
const headers = (scope, eid, { ip = '127.0.0.1', expires = Math.floor(Date.now() / 1000) + 30 } = {}) => {
  const signature = createHmac('sha256', bridgeKey).update(guestDraftProofMessage({ scope, eid, expires, ip })).digest('base64url')
  return { ...bridgeHeaders(ip), 'x-bff-draft-proof': `v1.${eid}.${scope}.${expires}.${signature}` }
}
const strict = () => fixture({ env: { TRUST_PROXY_CIDRS: '127.0.0.1/32', GUEST_DRAFT_PROOF_MODE: 'required' } })

it('supports the explicit expand window but rejects an invalid presented proof', async () => {
  const f = await fixture({ env: { TRUST_PROXY_CIDRS: '127.0.0.1/32', GUEST_DRAFT_PROOF_MODE: 'optional' } })
  expect((await f.http.post('/api/event/draft').set(bridgeHeaders()).send({})).status).toBe(200)
  expect((await f.http.post('/api/event/draft').set({ ...bridgeHeaders(), 'x-bff-draft-proof': 'forged' }).send({})).status).toBe(403)
})
it('requires proofs by default even when the bridge credential and proxy peer are valid', async () => {
  const f = await fixture({ env: { TRUST_PROXY_CIDRS: '127.0.0.1/32' } })
  expect(f.context.configuration.guestDraftProofMode).toBe('required')
  const response = await f.http.post('/api/event/draft').set(bridgeHeaders()).send({})
  expect(response.status).toBe(403)
  expect((await f.http.post('/api/event/draft').set(headers('draft', 0)).send({})).status).toBe(200)
})
it('required mode binds writes to EID, operation, lifetime and the trusted forwarded address', async () => {
  const f = await strict()
  expect((await f.http.post('/api/event/draft').set(bridgeHeaders()).send({})).status).toBe(403)
  const a = await f.http.post('/api/event/draft').set(headers('draft', 0)).send({})
  const b = await f.http.post('/api/event/draft').set(headers('draft', 0)).send({})
  expect(a.status).toBe(200)
  expect(b.status).toBe(200)
  const proof = headers('save', a.body.id)
  expect((await f.http.put(`/api/event/${b.body.id}`).set(proof).send({ title: 'foreign draft' })).status).toBe(403)
  expect((await f.http.put(`/api/event/${a.body.id}`).set(headers('upload', a.body.id)).send({ title: 'wrong operation' })).status).toBe(403)
  expect((await f.http.put(`/api/event/${a.body.id}`).set(headers('save', a.body.id, { expires: Math.floor(Date.now() / 1000) })).send({ title: 'expired' })).status).toBe(403)
  expect((await f.http.put(`/api/event/${a.body.id}`).set({ ...proof, 'x-forwarded-for': '203.0.113.9' }).send({ title: 'forged address' })).status).toBe(403)
  expect(await get(f.db, 'SELECT title FROM events WHERE id=?', [b.body.id])).toEqual({ title: null })
  expect((await f.http.put(`/api/event/${a.body.id}`).set(proof).send({ title: 'owned draft' })).status).toBe(200)
  expect(await get(f.db, 'SELECT title FROM events WHERE id=?', [a.body.id])).toEqual({ title: 'owned draft' })
})
it('checks proof before multipart parsing and checks its EID again before publishing files', async () => {
  const f = await strict()
  const upload = proof => f.http.post('/api/upload/visitor').set(proof).field('eid', '2').attach('file', png, { filename: 'proof.png', contentType: 'image/png' })
  expect((await upload(bridgeHeaders())).status).toBe(403)
  expect(await f.fs.readdir(f.context.PRIVATE_UPLOADS_DIR)).toEqual([])
  expect((await upload(headers('save', 2))).status).toBe(403)
  expect((await upload(headers('upload', 3))).status).toBe(403)
  expect(await f.fs.readdir(f.context.PRIVATE_UPLOADS_DIR)).toEqual([])
  const allowed = await upload(headers('upload', 2))
  expect(allowed.status).toBe(200)
  expect(allowed.body.url).toContain('/uploads/img/events/2/')
  expect((await f.http.get(allowed.body.url)).status).toBe(200)
})
it('retains direct current-admin operations and public signup/avatar scope', async () => {
  const f = await strict()
  expect((await f.http.post('/api/event/draft').set('Authorization', `Bearer ${token(2, 'admin')}`).send({})).status).toBe(200)
  expect((await f.http.get('/api/event/1/signup').set(bridgeHeaders())).status).toBe(200)
  const avatar = await f.http.post('/api/upload/visitor/avatar').set(bridgeHeaders()).field('eid', '1').attach('file', png, { filename: 'avatar.png', contentType: 'image/png' })
  expect(avatar.status).toBe(200)
})
