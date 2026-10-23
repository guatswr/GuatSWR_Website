import { createHmac, timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'
import {
  GUEST_DRAFT_PROOF_HEADER, GUEST_DRAFT_PROOF_MAX_FUTURE_SECONDS,
  guestDraftProofMessage, validGuestDraftProofId,
  type GuestDraftProofClaims, type GuestDraftProofScope
} from '@guatswr/shared'

export type GuestDraftProofMode = 'optional' | 'required'
const scopes: readonly string[] = ['draft', 'save', 'upload']
export function verifyGuestDraftProof(secret: string, value: unknown, expectedScope: GuestDraftProofScope, ip: string, now = Date.now()): GuestDraftProofClaims | undefined {
  if (!/^[\x21-\x7e]{32,256}$/.test(secret) || typeof value !== 'string' || value.length > 160 || !isIP(ip) || !Number.isFinite(now) || now < 0) return undefined
  const fields = value.split('.')
  if (fields.length !== 5) return undefined
  const [version, rawId, rawScope, rawExpires, signature] = fields
  if (version !== 'v1' || rawScope !== expectedScope || !scopes.includes(rawScope) || !rawId || !/^(0|[1-9]\d{0,15})$/.test(rawId)
    || !rawExpires || !/^[1-9]\d{0,15}$/.test(rawExpires) || !signature || !/^[a-zA-Z0-9_-]{43}$/.test(signature)) return undefined
  const eid = Number(rawId), expires = Number(rawExpires), seconds = Math.floor(now / 1000)
  if (!validGuestDraftProofId(eid, expectedScope) || !Number.isSafeInteger(expires) || expires <= seconds || expires > seconds + GUEST_DRAFT_PROOF_MAX_FUTURE_SECONDS) return undefined
  const claims = { eid, scope: expectedScope, expires, ip }
  const supplied = Buffer.from(signature, 'base64url')
  if (supplied.length !== 32 || supplied.toString('base64url') !== signature) return undefined
  const expected = createHmac('sha256', secret).update(guestDraftProofMessage(claims)).digest()
  return timingSafeEqual(supplied, expected) ? claims : undefined
}

interface Request {
  user?: { role?: unknown }
  headers: Record<string, string | string[] | undefined>
  params: Record<string, string | undefined>
  guestDraftProof?: GuestDraftProofClaims
}
interface Response { status(code: number): Response; json(value: unknown): unknown }
const admin = (request: Request) => request.user?.role === 'admin' || request.user?.role === 'super_admin'
const readId = (value: unknown): number | undefined => {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  if (!/^[1-9]\d{0,15}$/.test(String(value))) return undefined
  const eid = Number(value)
  return Number.isSafeInteger(eid) ? eid : undefined
}
export function createGuestDraftProofGuard(options: { secret: string; mode: GuestDraftProofMode; now?: () => number }) {
  const denied = (response: Response) => response.status(403).json({ message: '草稿凭据无效或已过期' })
  return {
    check: (scope: GuestDraftProofScope) => (request: Request, response: Response, next: () => unknown) => {
      if (admin(request)) return next()
      const token = request.headers[GUEST_DRAFT_PROOF_HEADER]
      if (token === undefined && options.mode === 'optional') return next()
      const ip = request.headers['x-forwarded-for']
      const proof = typeof ip === 'string' ? verifyGuestDraftProof(options.secret, token, scope, ip, options.now?.() ?? Date.now()) : undefined
      const expectedId = scope === 'draft' ? 0 : scope === 'save' ? readId(request.params.id) : proof?.eid
      if (!proof || proof.eid !== expectedId) return denied(response)
      request.guestDraftProof = proof
      return next()
    },
    // Multipart EID is known only after private parsing; never publish to a different EID.
    matches: (request: Request, eid: unknown) => admin(request) || (!request.guestDraftProof && options.mode === 'optional')
      || Boolean(request.guestDraftProof?.scope === 'upload' && request.guestDraftProof.eid === readId(eid))
  }
}
