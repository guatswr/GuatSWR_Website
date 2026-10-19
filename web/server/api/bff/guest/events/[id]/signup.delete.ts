import { getRouterParam } from 'h3'
import { bffAuthHandler } from '../../../../../utils/bff-auth-context'
import { BffError } from '../../../../../utils/bff-errors'
import {
  assertGuestWrite,
  enforceGuestLimit,
  guestContext,
  guestLimiters,
  guestParticipantToken,
  guestUpstream,
  invalidateAfterGuestMutation
} from '../../../../../utils/guest-bff'

const positiveId = (raw: unknown): number => {
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0 || id > Number.MAX_SAFE_INTEGER) {
    throw new BffError(404, 'not_found', '找不到该活动')
  }
  return id
}

/**
 * Deletes the current visitor's own signup. Deletion stays available after the
 * signup window closes, so the id is validated but the deadline is not re-checked.
 */
export default bffAuthHandler(async (event) => {
  const context = guestContext(event)
  const guestIp = await assertGuestWrite(event, context.runtime)
  const id = positiveId(getRouterParam(event, 'id'))
  enforceGuestLimit(guestLimiters.signup, `signup-delete:${guestIp}`)

  const bearerToken = await guestParticipantToken(event, context.runtime)
  const response = await guestUpstream(context.runtime, context).request({
    operation: { name: 'signupDelete', id },
    clientIp: guestIp,
    bearerToken
  })
  if (response.status === 404) throw new BffError(404, 'not_found', '报名记录不存在')
  if (response.status === 403) throw new BffError(403, 'forbidden', '当前状态不允许该操作')
  if (response.status !== 200) {
    throw new BffError(502, 'upstream_unavailable', '服务暂时不可用，请稍后重试')
  }
  invalidateAfterGuestMutation(['events', 'logs'])
  return { message: '已删除报名' }
})
