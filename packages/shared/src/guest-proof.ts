// Public wire description only. Signing keys and Node APIs stay in server code.
export const GUEST_DRAFT_PROOF_HEADER = 'x-bff-draft-proof'
export const GUEST_DRAFT_PROOF_PURPOSE = 'guatswr:bff:guest-draft-proof:v1'
export const GUEST_DRAFT_PROOF_TTL_SECONDS = 30
export const GUEST_DRAFT_PROOF_MAX_FUTURE_SECONDS = 60
export type GuestDraftProofScope = 'draft' | 'save' | 'upload'
export interface GuestDraftProofClaims { eid: number; scope: GuestDraftProofScope; expires: number; ip: string }
export function guestDraftProofMessage(claims: GuestDraftProofClaims): string {
  return JSON.stringify([GUEST_DRAFT_PROOF_PURPOSE, claims.eid, claims.scope, claims.expires, claims.ip])
}
export function validGuestDraftProofId(eid: number, scope: GuestDraftProofScope): boolean {
  return Number.isSafeInteger(eid) && (scope === 'draft' ? eid === 0 : eid > 0)
}
