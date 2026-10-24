import type { BackupFiles } from './files.js'
import { BackupError } from './runner.js'
interface Request { query: Record<string, unknown>; user: { username: string } }
interface Response {
  status(code: number): Response; json(body: unknown): unknown
  download(filename: string, name: string): void
}
export function createBackupFilesController(files: BackupFiles, audit: (username: string, action: string, details: string) => void, report: (error: unknown) => void) {
  const log = (req: Request, action: string, details: string) => { try { audit(req.user.username, action, details) } catch (error) { report(error) } }
  return {
    list: async (_req: Request, res: Response) => {
      try { return res.json({ full: await files.listBackups('full') }) } catch (error) { report(error); return res.status(500).json({ message: '加载备份列表失败' }) }
    },
    download: async (req: Request, res: Response) => {
      if (req.query.type && req.query.type !== 'full') return res.status(400).json({ message: '仅支持完整备份下载' })
      const target = await files.resolveBackupPath(req.query.type, req.query.file)
      if (!target) return res.status(404).json({ message: '备份文件不存在' })
      log(req, 'DOWNLOAD_BACKUP', `下载备份: ${target.type}/${target.fileName}`)
      res.download(target.filePath, target.fileName)
    },
    remove: async (req: Request, res: Response) => {
      if (req.query.type && req.query.type !== 'full') return res.status(400).json({ message: '仅支持完整备份删除' })
      try {
        const target = await files.remove(req.query.type, req.query.file)
        if (!target) return res.status(404).json({ message: '备份文件不存在' })
        log(req, 'DELETE_BACKUP', `删除备份: ${target.type}/${target.fileName}`)
        return res.json({ message: '已删除' })
      } catch (error) {
        if (error instanceof BackupError && ['BACKUP_BUSY', 'BACKUP_LAST_VERIFIED', 'BACKUP_VERIFICATION_INVALID', 'BACKUP_VERIFICATION_PROTECTED'].includes(error.code)) {
          return res.status(409).json({ message: error.code === 'BACKUP_LAST_VERIFIED' ? '请保留至少一个已验证恢复点' : '备份正在使用或验证记录需要检查' })
        }
        report(error); return res.status(500).json({ message: '服务器错误' })
      }
    }
  }
}
