import { getRouterParam } from 'h3'
import { bffAuthHandler } from '../../../../../utils/bff-auth-context'
import { BffError } from '../../../../../utils/bff-errors'
import {
  assertGuestWrite,
  assertSignupOpen,
  enforceGuestLimit,
  guestContext,
  guestLimiters,
  guestParticipantToken,
  guestUpstream,
  guestUpstreamError,
  invalidateAfterGuestMutation,
  parseGuestSignupBody,
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
 * Upserts the current visitor's signup after the origin, CSRF and signup rules pass.
 * The guard only closes signups for an explicit, parseable `content.deadline`; the
 * frozen `time` field is the activity time and never gates. The backend remains the
 * final authority for status and content.
 */
export default bffAuthHandler(async (event) => {
  const context = guestContext(event)
  const guestIp = await assertGuestWrite(event, context.runtime)
  const id = positiveId(getRouterParam(event, 'id'))
  enforceGuestLimit(guestLimiters.signup, `signup:${guestIp}`)

  const input = parseGuestSignupBody(await readGuestJson(event, context.runtime))
  const upstream = guestUpstream(context.runtime, context)

  const snapshot = await upstream.request({
    operation: { name: 'eventRead', id },
    clientIp: guestIp
  })
  if (snapshot.status === 404) throw new BffError(404, 'not_found', '找不到该活动')
  if (snapshot.status !== 200) throw guestUpstreamError(snapshot.status)
  const record =
    typeof snapshot.data === 'object' && snapshot.data !== null
      ? (snapshot.data as Record<string, unknown>)
      : {}
  assertSignupOpen({
    id,
    type: typeof record.type === 'string' ? record.type : '',
    status: typeof record.status === 'string' ? record.status : '',
    content: record.content
  })

  const bearerToken = await guestParticipantToken(event, context.runtime)
  const response = await upstream.request({
    operation: { name: 'signupSave', id },
    clientIp: guestIp,
    body: input,
    bearerToken
  })
  if (response.status !== 200) throw guestUpstreamError(response.status)
  invalidateAfterGuestMutation(['events', 'logs'])
  return { message: '报名成功' }
})
