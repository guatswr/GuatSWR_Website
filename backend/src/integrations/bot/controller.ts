import { activityNotifySchema, historyNotifySchema, memberNotifySchema, backendV1Error } from '@guatswr/shared/backend-v1'
import type { createBotNotifier } from './notifier.js'
import type { Actor } from '../../modules/actor.js'

interface Request { body?: unknown; user?: Actor }
interface Response { status(code: number): Response; json(body: unknown): unknown }
export function createBotController(notifier: ReturnType<typeof createBotNotifier>) {
  const failure = (response: Response, error: unknown) => response.status(502).json({ message: error instanceof Error && error.message ? error.message : '通知失败' })
  const result = (response: Response, value: Awaited<ReturnType<typeof notifier.notifyActivityPublished>>) => response.json(
    'skipped' in value ? { message: '未发送', status: 'skipped', reason: value.reason }
      : 'queued' in value ? { message: value.status === 'queued' ? '已加入通知队列' : '未发送', status: value.status, event_id: value.id }
        : { message: '已通知', status: 'sent' })
  return {
    activity: async (request: Request, response: Response) => {
      const parsed = activityNotifySchema.safeParse(request.body, { error: backendV1Error })
      if (!parsed.success) return response.status(400).json({ message: parsed.error.issues[0]?.message || '参数错误' })
      try { return result(response, await notifier.notifyActivityPublished(parsed.data, request.user)) }
      catch (error) { return failure(response, error) }
    },
    history: async (request: Request, response: Response) => {
      const parsed = historyNotifySchema.safeParse(request.body, { error: backendV1Error })
      if (!parsed.success) return response.status(400).json({ message: parsed.error.issues[0]?.message || '参数错误' })
      try { const { action, ...data } = parsed.data; return result(response, await notifier.notifyHistoryUpdated(data, request.user, action)) }
      catch (error) { return failure(response, error) }
    },
    member: async (request: Request, response: Response) => {
      const parsed = memberNotifySchema.safeParse(request.body, { error: backendV1Error })
      if (!parsed.success) return response.status(400).json({ message: parsed.error.issues[0]?.message || '参数错误' })
      try { return result(response, await notifier.notifyMemberAdded(parsed.data, request.user)) }
      catch (error) { return failure(response, error) }
    }
  }
}
