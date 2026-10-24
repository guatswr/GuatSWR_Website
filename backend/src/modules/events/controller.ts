import type { Actor } from '../actor.js'
import { AppError } from '../../errors.js'
import type { EventsService } from './service.js'
interface Request { body?: unknown; params: { id: string }; query: Record<string, unknown>; ip: string; user?: Actor }
interface Response { status(code: number): Response; json(body: unknown): unknown; vary(name: string): void; setHeader(name: string, value: string): void }
const body = (request: Request) => request.body && typeof request.body === 'object' ? request.body as Record<string, unknown> : {}
export function createEventsController(service: EventsService, report: (error: unknown) => void) {
  const failure = (res: Response, error: unknown, message = '服务器错误') => {
    if (error instanceof AppError) return res.status(error.status).json({ message: error.message })
    report(error); return res.status(500).json({ message })
  }
  return {
    draft: async (req: Request, res: Response) => {
      try { return res.json({ id: await service.draft(req.user, req.ip), message: '草稿创建成功' }) } catch (error) { return failure(res, error) }
    },
    save: async (req: Request, res: Response) => {
      try { await service.save(req.params.id, body(req), req.user); return res.json({ message: '保存成功', id: req.params.id }) }
      catch (error) { return failure(res, error) }
    },
    list: async (req: Request, res: Response) => { try { return res.json(await service.list(req.query, false)) } catch (error) { return failure(res, error) } },
    detail: async (req: Request, res: Response) => {
      try {
        const result = await service.detail(req.params.id, req.user)
        res.vary('Authorization')
        if (result.privileged) res.setHeader('Cache-Control', 'private, no-store')
        return res.json(result.row)
      } catch (error) { return failure(res, error) }
    },
    adminList: async (req: Request, res: Response) => { try { return res.json(await service.list(req.query, true)) } catch (error) { return failure(res, error, '加载失败') } },
    create: async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ message: '未登录' })
      try { return res.json({ id: await service.create(body(req), req.user, req.ip), message: '创建成功' }) }
      catch (error) { return failure(res, error, '创建失败') }
    },
    participants: async (req: Request, res: Response) => {
      try { return res.json({ items: await service.participants(req.params.id) }) }
      catch (error) { return failure(res, error, '加载失败') }
    }
  }
}
