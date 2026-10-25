import type { Actor } from '../../actor.js'
import { SignupError, type SignupService } from './service.js'
interface Request { params: { id: string }; body?: Record<string, unknown>; user?: Actor; ip: string; botIdentityId?: string }
interface Response { status(code: number): Response; json(body: unknown): unknown }
export function createSignupController(service: SignupService, reportFailure: (error: unknown) => void) {
  const handle = (action: 'signup' | 'find' | 'remove' | 'list', failure: string) => async (req: Request, res: Response) => {
    const id = Number(req.params.id || 0)
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid event id' })
    const identity = { userId: req.user ? req.user.id : null, visitorIp: req.ip, ...(req.botIdentityId ? { botIdentityId:req.botIdentityId } : {}) }
    try {
      if (action === 'list') return res.json({ items: await service.list(id) })
      if (action === 'find') return res.json({ data: await service.find(id, identity) })
      if (action === 'remove') { await service.remove(id, identity); return res.json({ message: '已删除报名' }) }
      const actor = req.user ? { id: req.user.id, username: req.user.username, role: req.user.role } : null
      await service.signup(id, identity, req.body, actor)
      return res.json({ message: '报名成功', eventId: id })
    } catch (error) {
      if (error instanceof SignupError) return res.status(error.status).json({ message: error.message })
      reportFailure(error)
      return res.status(500).json({ message: failure })
    }
  }
  return { signup: handle('signup', '报名失败'), find: handle('find', '读取失败'), remove: handle('remove', '删除失败'), list: handle('list', '加载失败') }
}
