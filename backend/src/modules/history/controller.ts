import { historySchema, backendV1Error } from '@guatswr/shared/backend-v1'
import type { HistoryService } from './service.js'
import type { Actor } from '../actor.js'

interface Request { body?: unknown; user?: Actor; params: { id: string }; query: { includeDeleted?: unknown } }
interface Response { status(code: number): Response; json(body: unknown): unknown }
export function createHistoryController(service: HistoryService, reportFailure: (error: unknown) => void) {
  const fail = (response: Response, error: unknown) => {
    reportFailure(error)
    return response.status(500).json({ message: '服务器错误' })
  }
  const write = async (request: Request, response: Response, action: 'create' | 'update') => {
    if (!request.user) return response.status(401).json({ message: '未登录' })
    const parsed = historySchema.safeParse(request.body, { error: backendV1Error })
    if (!parsed.success) return response.status(400).json({ message: parsed.error.issues[0]?.message || '参数错误' })
    try {
      if (action === 'create') return response.json({ id: await service.create(parsed.data, request.user) })
      await service.update(request.params.id, parsed.data, request.user)
      return response.json({ message: '更新成功' })
    } catch (error) { return fail(response, error) }
  }
  const deletion = async (request: Request, response: Response, action: 'remove' | 'restore') => {
    if (!request.user) return response.status(401).json({ message: '未登录' })
    try {
      await service[action](request.params.id, request.user)
      return response.json({ message: action === 'remove' ? '已软删除' : '已恢复' })
    } catch (error) { return fail(response, error) }
  }
  return {
    list: async (request: Request, response: Response) => {
      try { return response.json(await service.list(request.query.includeDeleted === '1', request.user?.role)) }
      catch (error) { return fail(response, error) }
    },
    create: (request: Request, response: Response) => write(request, response, 'create'),
    update: (request: Request, response: Response) => write(request, response, 'update'),
    remove: (request: Request, response: Response) => deletion(request, response, 'remove'),
    restore: (request: Request, response: Response) => deletion(request, response, 'restore')
  }
}
