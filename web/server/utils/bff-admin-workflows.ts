import { getQuery, getRouterParam } from 'h3'
import { z } from 'zod'
import {
  adminEventInputSchema, adminEventUpdateSchema, adminEventQuerySchema,
  adminEventRowSchema, adminEventPageSchema, adminEventStatusSchema,
  adminEventParticipantSchema, adminEventResultsSchema, adminEventSettlementSchema,
  adminRegisterSchema, adminBanInputSchema, adminBanRowSchema,
  backupSelectorSchema, backupSettingsInputSchema, backupSettingsSchema, backupRowSchema,
} from '@guatswr/shared/admin-workflows'
import { BffError } from './bff-errors'
import { createFixedUpstreamClient } from './bff-upstream'
import { resolveEventClientIp } from './bff-auth-context'
import { bffProtectedHandler, parseAdminId, requireBffBodylessMutation, requireBffSession, requireBffWriteBody } from './bff-protected'
import { adminStatusError, callAdminUpstream, invalidateBffPublicData, mapAdminError, parseAdminInput, projectAdminResponse } from './bff-admin-resources'

// Every route file selects one literal operation. No browser-selected path,
// method, arbitrary query forwarding, role hint or upstream origin is accepted.
const POLICIES = {
  'event.list': 'read', 'event.detail': 'read', 'event.participants': 'read',
  'event.create': 'json', 'event.update': 'json', 'event.status': 'json',
  'event.settle': 'json', 'event.results': 'json',
  'event.approve': 'empty', 'event.reject': 'empty', 'event.delete': 'empty',
  'user.create': 'json', 'ban.list': 'read', 'ban.create': 'json',
  'backup.settings': 'read', 'backup.configure': 'json', 'backup.list': 'read',
  'backup.delete': 'empty', 'backup.run': 'empty', 'recycle.purge': 'empty',
} as const
export type AdminWorkflow = keyof typeof POLICIES

export function adminWorkflowHandler(operation: AdminWorkflow) {
  return bffProtectedHandler(async event => {
    const session = await requireBffSession(event, operation.startsWith('event.') ? { role: 'admin' } : { superAdmin: true })
    const policy = POLICIES[operation]
    const body = policy === 'json'
      ? await requireBffWriteBody(event, session.runtime, ['event.create', 'event.update'].includes(operation) ? 4 * 1024 * 1024 : 64 * 1024)
      : undefined
    if (policy === 'empty') await requireBffBodylessMutation(event, session.runtime)
    const id = operation.startsWith('event.') && !['event.list', 'event.create'].includes(operation) ? parseAdminId(getRouterParam(event, 'id')) : undefined
    const params = id === undefined ? undefined : { id }

    switch (operation) {
      case 'event.list': {
        const query = parseAdminInput(adminEventQuerySchema, getQuery(event))
        const response = await callAdminUpstream(session.admin, { route: operation, query })
        return projectAdminResponse(adminEventPageSchema, response.data)
      }
      case 'event.detail': {
        const response = await callAdminUpstream(session.admin, { route: operation, params })
        return projectAdminResponse(adminEventRowSchema, response.data)
      }
      case 'event.participants': {
        const response = await callAdminUpstream(session.admin, { route: operation, params })
        return projectAdminResponse(z.object({ items: z.array(adminEventParticipantSchema) }), response.data)
      }
      case 'event.create': {
        const input = parseAdminInput(adminEventInputSchema, body)
        const response = await callAdminUpstream(session.admin, { route: operation, body: input })
        const created = projectAdminResponse(z.object({ id: z.number().int().positive() }), response.data)
        await invalidateBffPublicData(['events', 'logs'])
        return { ...created, message: '创建成功' }
      }
      case 'event.update':
      case 'event.status':
      case 'event.settle':
      case 'event.results': {
        const schema = operation === 'event.update' ? adminEventUpdateSchema
          : operation === 'event.status' ? z.object({ status: adminEventStatusSchema })
            : operation === 'event.settle' ? adminEventSettlementSchema : adminEventResultsSchema
        const parsed = schema.safeParse(body)
        if (!parsed.success) throw new BffError(400, 'invalid_request', '活动信息未通过校验')
        await callAdminUpstream(session.admin, { route: operation, params, body: parsed.data })
        await invalidateBffPublicData(['events', 'logs'])
        return { id, message: operation === 'event.results' ? '结果已保存' : '更新成功' }
      }
      case 'event.approve':
      case 'event.reject':
      case 'event.delete':
        await callAdminUpstream(session.admin, { route: operation, params })
        await invalidateBffPublicData(['events', 'logs'])
        return { message: operation === 'event.approve' ? '已发布' : operation === 'event.reject' ? '已驳回' : '已删除' }
      case 'user.create':
        await callAdminUpstream(session.admin, { route: operation, body: parseAdminInput(adminRegisterSchema, body) })
        await invalidateBffPublicData(['logs'])
        return { message: '添加成功' }
      case 'ban.list': {
        const response = await callAdminUpstream(session.admin, { route: operation })
        return projectAdminResponse(z.object({ bans: z.array(adminBanRowSchema) }), response.data)
      }
      case 'ban.create':
        await callAdminUpstream(session.admin, { route: operation, body: parseAdminInput(adminBanInputSchema, body) })
        await invalidateBffPublicData(['logs'])
        return { message: '已封禁' }
      case 'backup.settings': {
        const response = await callAdminUpstream(session.admin, { route: operation })
        return projectAdminResponse(backupSettingsSchema, response.data)
      }
      case 'backup.list': {
        const response = await callAdminUpstream(session.admin, { route: operation })
        return projectAdminResponse(z.object({ full: z.array(backupRowSchema) }), response.data)
      }
      case 'backup.configure':
        await callAdminUpstream(session.admin, { route: operation, body: parseAdminInput(backupSettingsInputSchema, body) })
        await invalidateBffPublicData(['logs'])
        return { message: '已保存' }
      case 'backup.delete':
        await callAdminUpstream(session.admin, { route: operation, query: parseAdminInput(backupSelectorSchema, getQuery(event)) })
        await invalidateBffPublicData(['logs'])
        return { message: '已删除' }
      case 'backup.run': {
        // The frozen operation may take minutes. Only this fixed route receives
        // a five-minute deadline; it never retries an indeterminate task.
        const upstream = createFixedUpstreamClient({ origin: session.runtime.apiBase, timeoutMs: 300_000, maxResponseBytes: 64 * 1024,
          routes: { run: { method: 'POST', path: '/api/admin/backups/run' } } })
        try {
          const response = await upstream.request({ route: 'run', bearerToken: session.upstreamToken, clientIp: resolveEventClientIp(event, session.runtime).ip.address })
          if (response.status !== 200) throw adminStatusError(response.status, response.retryAfterSeconds)
        } catch (error) { throw mapAdminError(error) }
        await invalidateBffPublicData(['logs'])
        return { message: '备份完成' }
      }
      case 'recycle.purge': {
        const response = await callAdminUpstream(session.admin, { route: operation })
        const result = projectAdminResponse(z.object({ result: z.object({ activities: z.number().int().nonnegative(), members: z.number().int().nonnegative(), history: z.number().int().nonnegative() }) }), response.data)
        await invalidateBffPublicData(['activities', 'members', 'history'])
        return { ...result, message: '已清空回收站' }
      }
    }
  })
}
