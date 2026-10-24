import { resetPasswordSchema, backendV1Error } from '@guatswr/shared/backend-v1'
import { AppError } from '../errors.js'
import type { Actor } from '../modules/actor.js'
import type { AdminService } from './service.js'

interface Request { params: { id: string }; query: Record<string, unknown>; body?: unknown; user: Actor }
interface Response { status(code: number): Response; json(body: unknown): unknown }
export function createAdminController(service: AdminService, report: (error: unknown) => void) {
  const failure = (res: Response, error: unknown, unavailable?: string) => {
    if (error instanceof AppError) return res.status(error.status).json({ message: error.message })
    report(error)
    return res.status(unavailable ? 503 : 500).json({ message: unavailable || '服务器错误' })
  }
  return {
    users: async (_req: Request, res: Response) => { try { return res.json(await service.users()) } catch (error) { return failure(res, error) } },
    deleteUser: async (req: Request, res: Response) => {
      try { return res.json({ message: '删除成功', target: await service.deleteUser(req.params.id, req.user) }) }
      catch (error) { return failure(res, error, '管理员删除暂时不可用') }
    },
    resetPassword: async (req: Request, res: Response) => {
      const parsed = resetPasswordSchema.safeParse(req.body, { error: backendV1Error })
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || '参数错误' })
      try { await service.resetPassword(req.params.id, parsed.data.password, req.user); return res.json({ message: '重置成功' }) }
      catch (error) { return failure(res, error) }
    },
    resetSecondPassword: async (req: Request, res: Response) => {
      try { await service.resetSecondPassword(req.params.id, req.user); return res.json({ message: '二步密码已重置' }) }
      catch (error) { return failure(res, error) }
    },
    refreshVersion: async (req: Request, res: Response) => {
      try { return res.json({ message: '已强制刷新登录状态', version: await service.refreshVersion(req.user) }) }
      catch (error) { return failure(res, error, '登录状态刷新暂时不可用') }
    },
    logs: async (req: Request, res: Response) => { try { return res.json(await service.logs(req.query)) } catch (error) { return failure(res, error) } },
    deleteLog: async (req: Request, res: Response) => {
      try { await service.deleteLog(req.params.id, req.user); return res.json({ message: '删除成功' }) }
      catch (error) { return failure(res, error) }
    },
    pending: async (req: Request, res: Response) => { try { return res.json(await service.pending(req.query.page)) } catch (error) { return failure(res, error) } }
  }
}
