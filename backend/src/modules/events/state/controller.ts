import type { Actor } from '../../actor.js'
import { EventStateError, eventStatuses, type EventStateService, type StateAction } from './service.js'
interface Request { params: { id: string }; body?: Record<string, unknown>; user: Actor }
interface Response { status(code: number): Response; json(body: unknown): unknown }
export function createEventStateController(service: EventStateService, reportFailure: (error: unknown) => void) {
  const handler = (action: StateAction | 'settle' | 'result') => async (req: Request, res: Response) => {
    const actor = { id: req.user.id, username: req.user.username, role: req.user.role }
    try {
      if (action === 'review') {
        const review = req.body?.action
        if (review !== 'approve' && review !== 'reject') return res.status(400).json({ message: "Invalid action. Use 'approve' or 'reject'." })
        await service.change(req.params.id, 'review', review === 'approve' ? 'published' : 'rejected', actor)
        return res.json({ message: `操作成功，事件已${review === 'approve' ? '发布' : '驳回'}` })
      }
      const id = Number(req.params.id || 0)
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid event id' })
      if (action === 'settle') {
        await service.settle(id, req.body, actor)
        return res.json({ message: '已结算', id })
      }
      if (action === 'result') {
        if (!Array.isArray(req.body?.results)) return res.status(400).json({ message: 'results must be an array' })
        await service.result(id, req.body.results, actor)
        return res.json({ message: '结果已保存', id })
      }
      const status = action === 'approve' ? 'published' : action === 'reject' ? 'rejected' : action === 'delete' ? 'deleted' : String(req.body?.status || '').trim()
      if (action === 'status' && !eventStatuses.includes(status)) return res.status(400).json({ message: 'Invalid status' })
      await service.change(id, action, status, actor)
      const messages = { approve: '已发布', reject: '已驳回', delete: '已删除', status: '状态已更新' }
      return res.json({ message: messages[action] })
    } catch (error) {
      if (error instanceof EventStateError) return res.status(error.status).json({ message: error.message })
      reportFailure(error)
      const message = action === 'settle' ? '结算失败' : action === 'result' ? '录入失败' : action === 'delete' ? '删除失败' : action === 'review' ? '服务器错误' : '操作失败'
      return res.status(500).json({ message })
    }
  }
  return { approve: handler('approve'), reject: handler('reject'), status: handler('status'), remove: handler('delete'), settle: handler('settle'), result: handler('result'), review: handler('review') }
}
