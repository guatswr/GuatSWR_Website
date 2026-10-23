import type { Actor } from '../../actor.js'
import type { EventStateRepository } from './repository.js'

export const eventStatuses: readonly string[] = ['draft', 'pending', 'published', 'ongoing', 'ended', 'settled', 'rejected', 'deleted']
export class EventStateError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}
const parseContent = (raw: string | null): Record<string, unknown> => {
  // Object spread intentionally retains the legacy behavior for arrays and scalars.
  try { return { ...JSON.parse(raw || '{}') } } catch { return {} }
}
export type StateAction = 'approve' | 'reject' | 'status' | 'delete' | 'review'
export function createEventStateService(options: {
  repository: EventStateRepository
  audit(username: string, action: string, details: string): void
  reportAuditFailure(error: unknown): void
  notify(name: string, payload: unknown, actor: Actor): Promise<unknown>
}) {
  const audit = (actor: Actor, action: string, details: string) => {
    try { options.audit(actor.username, action, details) } catch (error) { options.reportAuditFailure(error) }
  }
  const notify = (name: string, payload: unknown, actor: Actor) => { void options.notify(name, payload, actor).catch(() => {}) }
  return {
    change: async (id: number | string, action: StateAction, status: string, actor: Actor) => {
      const result = await options.repository.status(id, status)
      if (!result.changes) throw new EventStateError(404, 'Event not found')
      if (action === 'review') {
        audit(actor, 'REVIEW_EVENT', `审核事件 EID: ${id} -> ${status}`)
        return
      }
      const metadata = {
        approve: ['APPROVE_EVENT', `审核通过 EID: ${id}`, 'event.approved'],
        reject: ['REJECT_EVENT', `驳回事件 EID: ${id}`, 'event.rejected'],
        status: ['UPDATE_EVENT_STATUS', `更新事件状态 EID: ${id} -> ${status}`, 'event.status'],
        delete: ['DELETE_EVENT', `软删除事件 EID: ${id}`, 'event.deleted']
      } as const
      const [auditAction, details, hook] = metadata[action]
      audit(actor, auditAction, details)
      notify(hook, action === 'status' ? { eventId: id, status } : { eventId: id }, actor)
    },
    settle: async (id: number, body: Record<string, unknown> | undefined, actor: Actor) => {
      const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {}
      const status = String(body?.status || 'settled')
      const event = await options.repository.transaction(async tx => {
        const event = await tx.event(id)
        if (!event) throw new EventStateError(404, 'Event not found')
        await tx.content(id, JSON.stringify({ ...parseContent(event.content), ...payload }), status)
        return event
      })
      audit(actor, 'SETTLE_EVENT', `结算事件 EID: ${id}`)
      notify('event.settled', { eventId: id, type: event.type, payload }, actor)
    },
    result: async (id: number, results: unknown[], actor: Actor) => {
      const event = await options.repository.transaction(async tx => {
        const event = await tx.event(id)
        if (!event) throw new EventStateError(404, 'Event not found')
        if (!['STG', '则则'].includes(event.type)) throw new EventStateError(400, '此活动不支持录入结果')
        await tx.content(id, JSON.stringify({ ...parseContent(event.content), results, results_updated_at: new Date().toISOString() }), 'ended')
        return event
      })
      audit(actor, 'SET_EVENT_RESULT', `录入比赛结果 EID: ${id}`)
      notify('event.result_set', { eventId: id, type: event.type, results }, actor)
    }
  }
}
export type EventStateService = ReturnType<typeof createEventStateService>
