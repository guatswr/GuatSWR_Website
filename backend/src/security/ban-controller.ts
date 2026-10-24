import { isIP } from 'node:net'
import type { Actor } from '../modules/actor.js'
import { AppError } from '../errors.js'
import { banExpiration, type BanService } from './bans.js'

interface Request { body?: unknown; params: { ip: string }; path: string; ip: string; user: Actor }
interface Response { status(code: number): Response; json(body: unknown): unknown }
type Next = (error?: unknown) => void
export function createBanController(service: BanService, report: (error: unknown) => void) {
  const failure = (res: Response, error: unknown) => {
    if (error instanceof AppError) return res.status(error.status).json({ message: error.message })
    report(error); return res.status(500).json({ message: '服务器错误' })
  }
  return {
    guard: async (req: Request, res: Response, next: Next) => {
      if (req.path.startsWith('/api/bot')) return next()
      const blocked = await service.blocked(req.ip)
      return blocked ? res.status(403).json({ message: 'IP 已被封禁', reason: blocked.reason }) : next()
    },
    list: async (_req: Request, res: Response) => {
      try { return res.json({ bans: await service.list() }) } catch (error) { return failure(res, error) }
    },
    ban: async (req: Request, res: Response) => {
      const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {}
      const ip = String(body.ip || '').trim(), reason = String(body.reason || '').trim()
      if (!isIP(ip)) return res.status(400).json({ message: 'IP 格式不正确' })
      try { await service.ban(ip, reason, req.user.username, banExpiration(body.minutes), req.user); return res.json({ message: '已封禁', ip }) }
      catch (error) { return failure(res, error) }
    },
    unban: async (req: Request, res: Response) => {
      const ip = String(req.params.ip || '').trim()
      if (!isIP(ip)) return res.status(400).json({ message: 'IP 格式不正确' })
      try { await service.unban(ip, req.user.username, req.user); return res.json({ message: '已解封', ip }) }
      catch (error) { return failure(res, error) }
    }
  }
}
