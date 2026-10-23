import type { createBackupScheduler } from './scheduler.js'
interface Request { body?: Record<string, unknown>; user: { username: string } }
interface Response { status(code: number): Response; json(body: unknown): unknown }
export function createBackupSettingsController(service: ReturnType<typeof createBackupScheduler>, audit: (username: string, action: string, details: string) => void, report: (error: unknown) => void) {
  const failure = (res: Response, error: unknown) => { report(error); return res.status(500).json({ message: '服务器错误' }) }
  return {
    read: async (_req: Request, res: Response) => {
      try { return res.json(await service.settings()) } catch (error) { return failure(res, error) }
    },
    update: async (req: Request, res: Response) => {
      const enabled = Boolean(req.body?.enabled), time = String(req.body?.time || '').trim()
      if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return res.status(400).json({ message: '时间格式需为 HH:mm' })
      const finalTime = time || '02:30'
      try {
        await service.updateSettings(enabled, finalTime)
        try { audit(req.user.username, 'UPDATE_BACKUP_SETTINGS', `自动备份: ${enabled ? '开启' : '关闭'} ${finalTime}`) } catch (error) { report(error) }
        return res.json({ message: '已保存', enabled, time: finalTime })
      } catch (error) { return failure(res, error) }
    }
  }
}
