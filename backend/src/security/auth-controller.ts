import { loginSchema, profileSchema, registerSchema, backendV1Error } from '@guatswr/shared/backend-v1'
import type { Actor } from '../modules/actor.js'
import { AppError } from '../errors.js'
import type { AuthService } from './auth-service.js'

interface Request { ip: string; body?: unknown; user: Actor }
interface Response { status(code: number): Response; json(body: unknown): unknown }
export function createAuthController(service: AuthService, report: (error: unknown) => void) {
  const fail = (res: Response, error: unknown, login = false) => {
    if (error instanceof AppError) return res.status(error.status).json({ message: error.message })
    report(error)
    return res.status(login ? 503 : 500).json({ message: login ? '登录暂时不可用' : '服务器错误' })
  }
  return {
    login: async (req: Request, res: Response) => {
      try {
        const now = Date.now()
        await service.assertLoginAvailable(req.ip, now)
        const parsed = loginSchema.safeParse(req.body, { error: backendV1Error })
        if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || '参数错误' })
        return res.json(await service.login(parsed.data, req.ip, now))
      } catch (error) { return fail(res, error, true) }
    },
    profile: async (req: Request, res: Response) => {
      const parsed = profileSchema.safeParse(req.body || {}, { error: backendV1Error })
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || '参数错误' })
      try { await service.profile(parsed.data, req.user); return res.json({ message: '个人资料更新成功' }) }
      catch (error) { return fail(res, error) }
    },
    me: async (req: Request, res: Response) => {
      const user = await service.me(req.user.id).catch(() => undefined)
      return user ? res.json(user) : res.status(404).json({ message: '用户不存在' })
    },
    register: async (req: Request, res: Response) => {
      const parsed = registerSchema.safeParse(req.body, { error: backendV1Error })
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || '参数错误' })
      try { await service.register(parsed.data, req.user); return res.json({ message: '添加成功' }) }
      catch (error) { return fail(res, error) }
    }
  }
}
