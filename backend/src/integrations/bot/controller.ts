import { activityNotifySchema, historyNotifySchema, memberNotifySchema, backendV1Error } from '@guatswr/shared/backend-v1'
import type { createBotNotifier } from './notifier.js'
import type { Actor } from '../../modules/actor.js'

interface Request { body?: unknown; user?: Actor }
interface Response { status(code: number): Response; json(body: unknown): unknown }
export function createBotController(notifier: ReturnType<typeof createBotNotifier>) {
  const failure = (response: Response, error: unknown) => response.status(502).json({ message: error instanceof Error && error.message ? error.message : '通知失败' })
  return {
    activity: async (request: Request, response: Response) => {
      const parsed = activityNotifySchema.safeParse(request.body, { error: backendV1Error })
      if (!parsed.success) return response.status(400).json({ message: parsed.error.issues[0]?.message || '参数错误' })
      try { await notifier.notifyActivityPublished(parsed.data, request.user); return response.json({ message: '已通知' }) }
      catch (error) { return failure(response, error) }
    },
    history: async (request: Request, response: Response) => {
      const parsed = historyNotifySchema.safeParse(request.body, { error: backendV1Error })
      if (!parsed.success) return response.status(400).json({ message: parsed.error.issues[0]?.message || '参数错误' })
      try { const { action, ...data } = parsed.data; await notifier.notifyHistoryUpdated(data, request.user, action); return response.json({ message: '已通知' }) }
      catch (error) { return failure(response, error) }
    },
    member: async (request: Request, response: Response) => {
      const parsed = memberNotifySchema.safeParse(request.body, { error: backendV1Error })
      if (!parsed.success) return response.status(400).json({ message: parsed.error.issues[0]?.message || '参数错误' })
      try { await notifier.notifyMemberAdded(parsed.data, request.user); return response.json({ message: '已通知' }) }
      catch (error) { return failure(response, error) }
    }
  }
}
