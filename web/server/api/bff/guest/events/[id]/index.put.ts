import { getRouterParam } from 'h3'
import { bffAuthHandler } from '../../../../../utils/bff-auth-context'
import { BffError } from '../../../../../utils/bff-errors'
import {
  assertGuestWrite,
  enforceGuestLimit,
  guestContext,
  guestDraftContext,
  guestLimiters,
  guestUpstream,
  guestUpstreamError,
  invalidateAfterGuestMutation,
  parseGuestDraftSave,
  projectSavedEvent,
  readGuestJson
} from '../../../../../utils/guest-bff'

const positiveId = (raw: unknown): number => {
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0 || id > Number.MAX_SAFE_INTEGER) {
    throw new BffError(404, 'not_found', '找不到该活动')
  }
  return id
}

/**
 * Saves the guest's own draft and submits it for review (`submit:true` only).
 *
 * Guessed, foreign or already-submitted ids are rejected before any upstream call;
 * the body schema refuses publication/status/settlement/result fields at every
 * depth. An identical payload that already succeeded returns the recorded receipt
 * without repeating the mutation; a different payload for a submitted draft is
 * rejected. A save that is already in flight for the same draft answers 409
 * `submission_in_progress` instead of repeating the upstream write. An upstream
 * timeout stays indeterminate — the client may retry, and the BFF never retries
 * on its own and never claims exactly-once delivery.
 */
export default bffAuthHandler(async (event) => {
  const context = guestContext(event)
  const guestIp = await assertGuestWrite(event, context.runtime)
  const id = positiveId(getRouterParam(event, 'id'))

  const draft = await guestDraftContext(event, context.runtime, context.origin, guestIp)
  if (!draft.store.owns(draft.intent, id)) {
    throw new BffError(404, 'not_found', '找不到该活动')
  }
  enforceGuestLimit(guestLimiters.save, `save:${guestIp}`)

  const payload = parseGuestDraftSave(await readGuestJson(event, context.runtime))
  const digest = draft.store.digest(draft.intent, payload)
  const state = draft.store.beginSubmission(draft.intent, id, digest)
  if (state.kind === 'replay') return projectSavedEvent(state.id)
  if (state.kind === 'busy') {
    // `owns()` stays true until the write is confirmed, so a second identical
    // save would otherwise reach the frozen backend twice. The in-flight marker
    // makes the second one wait instead of repeating the mutation.
    throw new BffError(409, 'submission_in_progress', '该活动正在提交中，请稍候')
  }

  const response = await guestUpstream(context.runtime, context).request({
    operation: { name: 'save', id },
    clientIp: guestIp,
    body: { type: payload.type, title: payload.title, content: payload.content, submit: true }
  }).catch((error: unknown) => {
    draft.store.abortSubmission(draft.intent, id)
    throw error
  })
  if (response.status !== 200) {
    draft.store.abortSubmission(draft.intent, id)
    throw guestUpstreamError(response.status)
  }

  // Receipt only after a confirmed successful write.
  draft.store.confirmSubmission(draft.intent, id, digest)
  invalidateAfterGuestMutation(['events', 'logs'])
  return projectSavedEvent(id)
})
