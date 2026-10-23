import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import { GUEST_DRAFT_PROOF_TTL_SECONDS, guestDraftProofMessage, validGuestDraftProofId, type GuestDraftProofScope } from '@guatswr/shared'
import { BffError } from './bff-errors'

/** This credential is constructed only after the route's cookie/CSRF/ownership checks. */
export function signGuestDraftProof(secret: string, scope: GuestDraftProofScope, eid: number, ip: string, now = Date.now()): string {
  if (!/^[\x21-\x7e]{32,256}$/.test(secret) || !isIP(ip) || !validGuestDraftProofId(eid, scope) || !Number.isFinite(now) || now < 0) {
    throw new BffError(503, 'upstream_unavailable', '访客入口暂时不可用')
  }
  const expires = Math.floor(now / 1000) + GUEST_DRAFT_PROOF_TTL_SECONDS
  const signature = createHmac('sha256', secret).update(guestDraftProofMessage({ eid, scope, expires, ip })).digest('base64url')
  return `v1.${eid}.${scope}.${expires}.${signature}`
}
