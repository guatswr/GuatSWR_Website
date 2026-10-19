import { bffAuthHandler } from '../../../../utils/bff-auth-context'
import {
  assertGuestWrite,
  enforceGuestLimit,
  guestContext,
  guestDraftContext,
  guestLimiters,
  guestUpstream,
  guestUpstreamError,
  issueGuestDraft,
  projectDraftId,
  setGuestCookie
} from '../../../../utils/guest-bff'

/**
 * Issues the guest's draft id.
 *
 * One draft per intent: the draft-cookie record (or, for a visitor without a
 * cookie yet, a digest of the bound CSRF token) keeps the last issued id for a
 * short window and serializes concurrent calls, so a retried or double-clicked
 * request cannot create two upstream drafts. The id is bound to this client's
 * validated IP; nothing is trusted from the browser beyond the opaque cookie.
 */
export default bffAuthHandler(async (event) => {
  const context = guestContext(event)
  const guestIp = await assertGuestWrite(event, context.runtime)
  enforceGuestLimit(guestLimiters.draft, `draft:${guestIp}`)

  const draft = await guestDraftContext(event, context.runtime, context.origin, guestIp)
  const issued = await issueGuestDraft(draft, async () => {
    const response = await guestUpstream(context.runtime, context).request({
      operation: { name: 'draft' },
      clientIp: guestIp
    })
    if (response.status !== 200 && response.status !== 201) {
      throw guestUpstreamError(response.status)
    }
    return projectDraftId(response.data)
  })

  setGuestCookie(event, context.runtime, issued.cookieId)
  return { id: issued.id }
})
