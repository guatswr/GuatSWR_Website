import { describe, expect, it } from 'vitest'
import { guestDraftProofMessage, type GuestDraftProofScope } from '@guatswr/shared'
import vectors from '../../packages/shared/tests/fixtures/guest-proof.json'
import { signGuestDraftProof } from '../server/utils/guest-proof'

describe('guest draft server proof wire', () => {
  for (const vector of vectors) {
    it(`signs the independent ${vector.scope} vector with the frozen canonical message`, () => {
      const scope = vector.scope as GuestDraftProofScope
      expect(guestDraftProofMessage({ ...vector, scope })).toBe(vector.message)
      expect(signGuestDraftProof(vector.secret, scope, vector.eid, vector.ip, vector.now)).toBe(vector.token)
    })
  }
  it('refuses malformed identities and configuration without echoing values', () => {
    const v = vectors[1]!
    for (const [secret, eid, ip] of [['private-short-key', 7, v.ip], [v.secret, 0, v.ip], [v.secret, 7, 'forged-address']] as const) {
      expect(() => signGuestDraftProof(secret, 'save', eid, ip, v.now)).toThrow('访客入口暂时不可用')
    }
  })
})
