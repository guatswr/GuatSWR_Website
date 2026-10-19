import { getRouterParam } from 'h3'
import { bffAuthHandler } from '../../../../../utils/bff-auth-context'
import { BffError } from '../../../../../utils/bff-errors'
import {
  guestContext,
  guestParticipantToken,
  guestUpstream,
  guestUpstreamError,
  projectSignupRecord
} from '../../../../../utils/guest-bff'

const positiveId = (raw: unknown): number => {
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0 || id > Number.MAX_SAFE_INTEGER) {
    throw new BffError(404, 'not_found', '找不到该活动')
  }
  return id
}

/**
 * The visitor's own signup only.
 *
 * An invalid or expired session cookie fails 401 instead of silently switching to
 * the IP identity; a valid session uses the server-only upstream token after a
 * fresh `/me`. The response carries only the shared signup fields — never
 * visitor_ip, user ids or timestamps — and a malformed upstream shape is a 502
 * rather than a silent "no signup".
 */
export default bffAuthHandler(async (event) => {
  const context = guestContext(event)
  const id = positiveId(getRouterParam(event, 'id'))
  const bearerToken = await guestParticipantToken(event, context.runtime)
  const response = await guestUpstream(context.runtime, context).request({
    operation: { name: 'signupRead', id },
    clientIp: context.ip,
    bearerToken
  })
  if (response.status === 404) throw new BffError(404, 'not_found', '找不到该活动')
  if (response.status !== 200) throw guestUpstreamError(response.status)
  return projectSignupRecord(response.data)
})
