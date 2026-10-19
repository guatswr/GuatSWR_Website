import { z } from 'zod'
import { BffError } from './bff-errors'
import { UpstreamFailure } from './bff-upstream'
import type { FixedUpstreamClient, UpstreamJsonResponse } from './bff-upstream'
import type { AdminUpstreamRouteName } from './bff-admin-upstream'
import type { SafeUser } from '@guatswr/shared'
import { invalidatePublicData } from './public-data'
import type { PublicDataKind } from './public-cache'
import {
  activityInputSchema,
  activityListQuerySchema,
  activityListResponseSchema,
  adminActivityRowSchema as activityRowSchema,
  adminConfigSchema,
  adminConfigWriteSchema,
  adminUserRowSchema,
  auditLogListResponseSchema,
  auditLogQuerySchema,
  historyInputSchema,
  historyListQuerySchema,
  adminHistoryRowSchema as historyRowSchema,
  memberInputSchema,
  memberListQuerySchema,
  adminMemberRowSchema as memberRowSchema,
  profileInputSchema,
  resetPasswordSchema,
} from '@guatswr/shared'

export type AdminClient = FixedUpstreamClient<AdminUpstreamRouteName>
export { adminCall as callAdminUpstream, parseInput as parseAdminInput, project as projectAdminResponse, statusError as adminStatusError }

/* --------------------------------------------------------- cache contract */

/**
 * Confirmed writes invalidate the actual public-data cache. No optional
 * registration/no-op seam: the application must wire this at compile time.
 */
export async function invalidateBffPublicData(kinds: readonly PublicDataKind[]): Promise<void> {
  try {
    invalidatePublicData([...new Set<PublicDataKind>([...kinds, 'logs'])])
  }
  catch {
    // The mutation already succeeded upstream; a cache failure must not be
    // reported as a failed write (the client would retry and duplicate it).
  }
}

/* ----------------------------------------------------------- error mapping */

function statusError(status: number, retryAfterSeconds?: number): BffError {
  if (status === 400) return new BffError(400, 'invalid_request', '请求参数无效')
  if (status === 401) return new BffError(401, 'session_expired', '登录状态已失效，请重新登录')
  if (status === 403) return new BffError(403, 'forbidden', '权限不足')
  if (status === 404) return new BffError(404, 'not_found', '目标不存在')
  if (status === 409) return new BffError(409, 'conflict', '操作冲突，请刷新后重试')
  if (status === 429) {
    return new BffError(429, 'rate_limited', '请求过于频繁，请稍后再试',
      retryAfterSeconds === undefined ? {} : { retryAfterSeconds })
  }
  return new BffError(502, 'upstream_error', '后端服务暂不可用')
}

/** Never forwards a raw upstream error body, SQL text or stack. */
export function mapAdminError(error: unknown): BffError {
  if (error instanceof BffError) return error
  if (error instanceof UpstreamFailure) {
    if (error.kind === 'timeout') return new BffError(504, 'upstream_timeout', '后端服务响应超时')
    if (error.kind === 'too_large' || error.kind === 'bad_response' || error.kind === 'redirect' || error.kind === 'request_too_large') {
      return new BffError(502, 'upstream_invalid_response', '后端服务响应异常')
    }
    return new BffError(503, 'upstream_unavailable', '后端服务暂不可用')
  }
  return new BffError(502, 'upstream_invalid_response', '后端服务响应异常')
}

async function adminCall(
  admin: AdminClient,
  request: Parameters<AdminClient['request']>[0],
): Promise<UpstreamJsonResponse> {
  try {
    const response = await admin.request(request)
    if (response.status < 200 || response.status >= 300) {
      throw statusError(response.status, response.retryAfterSeconds)
    }
    return response
  }
  catch (error) {
    throw mapAdminError(error)
  }
}

function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new BffError(400, 'invalid_request', '请求参数无效')
  return parsed.data
}

function project<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new BffError(502, 'upstream_invalid_response', '后端服务响应异常')
  return parsed.data
}

const createdIdSchema = z.object({ id: z.number().int().positive() })
// Frozen-backend quirk: routes/history.js reads `this.lastID` inside an arrow
// callback, so a successful create answers `{}`. Accept an absent id instead of
// turning a confirmed write into a 502; the archived admin UI reloads the list.
const optionalCreatedIdSchema = z.object({ id: z.number().int().positive().optional() })

/* -------------------------------------------------------------- activities */

export async function adminListActivities(admin: AdminClient, identity: SafeUser, rawQuery: unknown) {
  const query = parseInput(activityListQuerySchema, rawQuery)
  if (query.includeDeleted && identity.role !== 'super_admin') {
    throw new BffError(403, 'forbidden', '权限不足')
  }
  const response = await adminCall(admin, {
    route: 'activity.list',
    query: {
      all: '1',
      includeDeleted: query.includeDeleted ? '1' : undefined,
      page: query.page,
      limit: query.limit,
    },
  })
  return project(activityListResponseSchema, response.data)
}

export async function adminGetActivity(admin: AdminClient, id: number) {
  const response = await adminCall(admin, { route: 'activity.detail', params: { id } })
  return project(activityRowSchema, response.data)
}

export async function adminCreateActivityDraft(admin: AdminClient) {
  const response = await adminCall(admin, { route: 'activity.draft' })
  return project(createdIdSchema, response.data)
}

export async function adminCreateActivity(admin: AdminClient, input: unknown) {
  const body = parseInput(activityInputSchema, input)
  const response = await adminCall(admin, { route: 'activity.create', body })
  const created = project(createdIdSchema, response.data)
  await invalidateBffPublicData(['activities'])
  return created
}

export async function adminUpdateActivity(admin: AdminClient, id: number, input: unknown) {
  const body = parseInput(activityInputSchema, input)
  await adminCall(admin, { route: 'activity.update', params: { id }, body })
  await invalidateBffPublicData(['activities'])
  return { message: '更新成功' }
}

export async function adminDeleteActivity(admin: AdminClient, id: number) {
  await adminCall(admin, { route: 'activity.delete', params: { id } })
  await invalidateBffPublicData(['activities'])
  return { message: '已软删除' }
}

export async function adminRestoreActivity(admin: AdminClient, id: number) {
  await adminCall(admin, { route: 'activity.restore', params: { id } })
  await invalidateBffPublicData(['activities'])
  return { message: '已恢复' }
}

/* ----------------------------------------------------------------- members */

export async function adminListMembers(admin: AdminClient, identity: SafeUser, rawQuery: unknown) {
  const query = parseInput(memberListQuerySchema, rawQuery)
  if (query.includeDeleted && identity.role !== 'super_admin') {
    throw new BffError(403, 'forbidden', '权限不足')
  }
  const response = await adminCall(admin, {
    route: 'member.list',
    query: {
      includeDeleted: query.includeDeleted ? '1' : undefined,
      original: query.original ? '1' : undefined,
      school: query.school,
    },
  })
  return project(z.array(memberRowSchema), response.data)
}

export async function adminCreateMember(admin: AdminClient, input: unknown) {
  const body = parseInput(memberInputSchema, input)
  const response = await adminCall(admin, { route: 'member.create', body })
  const created = project(createdIdSchema, response.data)
  await invalidateBffPublicData(['members'])
  return created
}

export async function adminUpdateMember(admin: AdminClient, id: number, input: unknown) {
  const body = parseInput(memberInputSchema, input)
  await adminCall(admin, { route: 'member.update', params: { id }, body })
  await invalidateBffPublicData(['members'])
  return { message: '成员更新成功' }
}

export async function adminDeleteMember(admin: AdminClient, id: number) {
  await adminCall(admin, { route: 'member.delete', params: { id } })
  await invalidateBffPublicData(['members'])
  return { message: '已软删除' }
}

export async function adminRestoreMember(admin: AdminClient, id: number) {
  await adminCall(admin, { route: 'member.restore', params: { id } })
  await invalidateBffPublicData(['members'])
  return { message: '已恢复' }
}

/* ----------------------------------------------------------------- history */

export async function adminListHistory(admin: AdminClient, identity: SafeUser, rawQuery: unknown) {
  const query = parseInput(historyListQuerySchema, rawQuery)
  if (query.includeDeleted && identity.role !== 'super_admin') {
    throw new BffError(403, 'forbidden', '权限不足')
  }
  const response = await adminCall(admin, {
    route: 'history.list',
    query: { includeDeleted: query.includeDeleted ? '1' : undefined },
  })
  return project(z.array(historyRowSchema), response.data)
}

export async function adminCreateHistory(admin: AdminClient, input: unknown) {
  const body = parseInput(historyInputSchema, input)
  const response = await adminCall(admin, { route: 'history.create', body })
  const created = project(optionalCreatedIdSchema, response.data)
  await invalidateBffPublicData(['history'])
  return { id: created.id ?? null }
}

export async function adminUpdateHistory(admin: AdminClient, id: number, input: unknown) {
  const body = parseInput(historyInputSchema, input)
  await adminCall(admin, { route: 'history.update', params: { id }, body })
  await invalidateBffPublicData(['history'])
  return { message: '更新成功' }
}

export async function adminDeleteHistory(admin: AdminClient, id: number) {
  await adminCall(admin, { route: 'history.delete', params: { id } })
  await invalidateBffPublicData(['history'])
  return { message: '已软删除' }
}

export async function adminRestoreHistory(admin: AdminClient, id: number) {
  await adminCall(admin, { route: 'history.restore', params: { id } })
  await invalidateBffPublicData(['history'])
  return { message: '已恢复' }
}

/* ------------------------------------------------------------------ config */

export async function adminReadConfig(admin: AdminClient) {
  const response = await adminCall(admin, { route: 'config.read' })
  return project(adminConfigSchema, response.data)
}

export async function adminWriteConfig(admin: AdminClient, input: unknown) {
  const body = parseInput(adminConfigWriteSchema, input)
  await adminCall(admin, { route: 'config.write', body })
  await invalidateBffPublicData(['config'])
  return { message: '已保存' }
}

/* -------------------------------------------------------------------- logs */

export async function adminListLogs(admin: AdminClient, rawQuery: unknown) {
  const query = parseInput(auditLogQuerySchema, rawQuery)
  const response = await adminCall(admin, {
    route: 'log.list',
    query: {
      page: query.page,
      limit: query.limit,
      username: query.username,
      action: query.action,
    },
  })
  return project(auditLogListResponseSchema, response.data)
}

export async function adminDeleteLog(admin: AdminClient, id: number) {
  await adminCall(admin, { route: 'log.delete', params: { id } })
  await invalidateBffPublicData(['logs'])
  return { message: '删除成功' }
}

/* ------------------------------------------------------------------- users */

export async function adminListUsers(admin: AdminClient) {
  const response = await adminCall(admin, { route: 'user.list' })
  return project(z.array(adminUserRowSchema), response.data)
}

export async function adminDeleteUser(admin: AdminClient, id: number) {
  await adminCall(admin, { route: 'user.delete', params: { id } })
  return { message: '删除成功' }
}

export async function adminResetUserPassword(admin: AdminClient, id: number, input: unknown) {
  const body = parseInput(resetPasswordSchema, input)
  await adminCall(admin, { route: 'user.resetPassword', params: { id }, body })
  return { message: '重置成功' }
}

export async function adminResetUserTwofa(admin: AdminClient, id: number) {
  await adminCall(admin, { route: 'user.resetTwofa', params: { id } })
  return { message: '二步密码已重置' }
}

export async function adminRefreshTokenVersion(admin: AdminClient) {
  await adminCall(admin, { route: 'tokenVersion.refresh' })
  return { message: '已强制刷新登录状态' }
}

/* ----------------------------------------------------------------- profile */

export async function updateOwnProfile(admin: AdminClient, input: unknown) {
  const body = parseInput(profileInputSchema, input)
  await adminCall(admin, { route: 'profile.update', body })
  const credentialsChanged = body.password !== undefined
    || body.twofa_password !== undefined
    || body.twofa_enabled !== undefined
  return { message: '个人资料更新成功', credentialsChanged }
}
