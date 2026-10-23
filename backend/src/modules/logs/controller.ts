import type { LogsService } from './service.js'
import type { createUmamiClient } from '../../integrations/umami/client.js'
interface Request { query: Record<string, unknown> }
interface Response { status(code: number): Response; json(body: unknown): unknown }
export function createLogsController(service: LogsService, umami: ReturnType<typeof createUmamiClient>, enabled: () => boolean, reportFailure: (error: unknown) => void, track: <T>(work: () => Promise<T>) => Promise<T>) {
  const integer = (value: unknown, fallback: number, max: number) => Math.min(max, Math.max(1, parseInt(String(value), 10) || fallback))
  const failure = (response: Response, error: unknown) => { reportFailure(error); return response.status(500).json({ message: '服务器错误' }) }
  return {
    list: async (req: Request, res: Response) => {
      const limit = integer(req.query.limit, 20, 100), page = integer(req.query.page, 1, Infinity)
      try { return res.json(await service.list(req.query.username || '', req.query.action || '', limit, (page - 1) * limit)) } catch (error) { return failure(res, error) }
    },
    stats: async (req: Request, res: Response) => {
      try { return res.json(await service.stats(integer(req.query.limit, 10, 100))) } catch (error) { return failure(res, error) }
    },
    umami: async (req: Request, res: Response) => {
      if (!umami.configured || !enabled()) return res.status(503).json({ message: 'Umami 未配置' })
      let endAt = Object.hasOwn(req.query, 'endAt') ? Number(req.query.endAt) : Date.now()
      if (!endAt || !Number.isFinite(endAt)) endAt = Date.now()
      let startAt = Object.hasOwn(req.query, 'startAt') ? Number(req.query.startAt) : endAt - 7 * 86400000
      if (!Number.isFinite(startAt)) startAt = endAt - 7 * 86400000
      const unit = typeof req.query.unit === 'string' && req.query.unit.length <= 64 && req.query.unit ? req.query.unit : 'day'
      const limit = Math.min(100, Math.max(1, Math.trunc(Number(req.query.limit) || 10)))
      const rawType = String(req.query.envType || 'browser').toLowerCase(), envType = ['browser', 'os', 'device'].includes(rawType) ? rawType : 'browser'
      try { return res.json(await track(() => umami.summary({ startAt, endAt, unit, limit, envType }))) }
      catch (error) { reportFailure(error); return res.status(502).json({ message: '无法获取统计数据' }) }
    }
  }
}
