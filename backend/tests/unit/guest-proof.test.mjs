import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const vectors = require('../../../packages/shared/tests/fixtures/guest-proof.json')
const { verifyGuestDraftProof, createGuestDraftProofGuard } = require('../../dist/src/security/guest-draft-proof.js')
for (const vector of vectors) {
  it(`verifies the independent ${vector.scope} wire vector`, () => {
    expect(verifyGuestDraftProof(vector.secret, vector.token, vector.scope, vector.ip, vector.now)).toEqual({ eid: vector.eid, scope: vector.scope, expires: vector.expires, ip: vector.ip })
  })
}
it('rejects changed EID/scope/IP/signature, expiry and oversized or noncanonical encodings', () => {
  const v = vectors[1]
  for (const token of [v.token.replace('.7.', '.8.'), v.token.replace('.save.', '.upload.'), v.token.replace('.7.', '.07.'), `${v.token.slice(0, -1)}A`, `${v.token}.extra`, 'x'.repeat(161), '', null, [v.token]]) {
    expect(verifyGuestDraftProof(v.secret, token, 'save', v.ip, v.now)).toBeUndefined()
  }
  expect(verifyGuestDraftProof(v.secret, v.token, 'upload', v.ip, v.now)).toBeUndefined()
  expect(verifyGuestDraftProof(v.secret, v.token, 'save', '203.0.113.6', v.now)).toBeUndefined()
  expect(verifyGuestDraftProof(v.secret, v.token, 'save', v.ip, v.expires * 1000)).toBeUndefined()
  expect(verifyGuestDraftProof(v.secret, v.token, 'save', v.ip, v.now - 61000)).toBeUndefined()
  expect(verifyGuestDraftProof('wrong-secret', v.token, 'save', v.ip, v.now)).toBeUndefined()
  expect(verifyGuestDraftProof(v.secret, v.token, 'save', v.ip, Number.NaN)).toBeUndefined()
})
it('required multipart matching never accepts absent or invalid IDs', () => {
  const guard = createGuestDraftProofGuard({ secret: vectors[0].secret, mode: 'required' })
  const request = { headers: {}, params: {} }
  expect(guard.matches(request, undefined)).toBe(false)
  expect(guard.matches(request, 'invalid')).toBe(false)
  expect(guard.matches(request, 7)).toBe(false)
  request.guestDraftProof = { eid: 7, scope: 'save', expires: 1700000030, ip: '203.0.113.5' }
  expect(guard.matches(request, 7)).toBe(false)
})
