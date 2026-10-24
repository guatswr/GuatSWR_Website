import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import type { SqlExecutor } from '../database/sqlite.js'
import { legacyJsonBinding } from '../database/legacy-json-binding.js'
import { isSafePath, positiveId } from '../utils/storage-boundary.js'
import type { ImageStorage, UploadedImage } from './images.js'
import type { UploadRequest, UploadResponse, UploadNext } from './multipart.js'

const cleanup = async (...files: (string | null | undefined)[]) => {
  for (const filename of files) if (filename) await fs.promises.unlink(filename).catch(() => {})
}
const body = (req: UploadRequest) => req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {}
const thumbnail = (file: UploadedImage, filename: string) => sharp(file.path).resize({ width: 640, height: 640, fit: 'inside' }).webp({ quality: 75 }).toFile(filename)
export function createUploadControllers(options: {
  store: SqlExecutor; images: ImageStorage; imageRoot: string; iconRoot: string; publicRoot: string
  moveStagedFile(url: string, directory: string): Promise<string>
  matches(request: UploadRequest, eid: unknown): boolean
  audit(username: string, action: string, details: string): void; report(error: unknown): void
}) {
  const eventRoot = path.join(options.imageRoot, 'events')
  if (!fs.existsSync(eventRoot)) fs.mkdirSync(eventRoot, { recursive: true })
  const directory = async (filename: string) => {
    if (!isSafePath(options.publicRoot, filename)) throw new Error('Unsafe storage path')
    await fs.promises.mkdir(filename, { recursive: true })
  }
  const event = (eid: unknown) => options.store.get<{ id: number; status: string | null }>('SELECT id,status FROM events WHERE id=?', [legacyJsonBinding(eid)])
  return {
    adminParameters: (req: UploadRequest, res: UploadResponse, next: UploadNext) => {
      if (req.query.activityId !== undefined && !positiveId(req.query.activityId)) return res.status(400).json({ message: 'Invalid activity id' })
      return next()
    },
    admin: async (req: UploadRequest, res: UploadResponse) => {
      const file = req.file
      if (!file) return res.status(400).json({ message: '文件上传失败' })
      let thumbUrl: string | null = null, thumbPath: string | null = null
      try {
        if (!await options.images.validateUploadedFile(file)) { await fs.promises.unlink(file.path); return res.status(400).json({ message: '不支持的文件内容' }) }
        await fs.promises.chmod(file.path, 0o644)
        if (file.mimetype !== 'image/svg+xml') {
          // Record the intended path before Sharp starts, so a partial output is
          // removed when generation itself rejects.
          thumbPath = path.join(path.dirname(file.path), `${path.parse(file.filename).name}-thumb.webp`)
          await thumbnail(file, thumbPath)
          await fs.promises.chmod(thumbPath, 0o644)
          thumbUrl = `/uploads/upload/${path.basename(thumbPath)}`
        }
        await options.images.publishStagingFile(file, thumbPath)
      } catch { await cleanup(thumbPath, file.path); return res.status(400).json({ message: '文件校验失败' }) }
      try { options.audit(req.user?.username || 'System', 'UPLOAD', `上传文件: ${file.filename}`) } catch (error) { options.report(error) }
      let url = `/uploads/upload/${file.filename}`
      try {
        if (req.query.category === 'icon_svg') url = await options.moveStagedFile(url, options.iconRoot)
        else if (req.query.activityId) {
          url = await options.moveStagedFile(url, path.join(options.imageRoot, 'activity', String(req.query.activityId)))
          if (thumbUrl) thumbUrl = url.replace(/(\.[a-z0-9]+)$/i, '-thumb.webp')
        }
        return res.json({ url, thumbUrl })
      } catch { await cleanup(file.path); return res.status(500).json({ message: '文件保存失败' }) }
    },
    content: async (req: UploadRequest, res: UploadResponse) => {
      const file = req.file
      if (!file) return res.status(400).json({ message: '文件上传失败' })
      const eid = body(req).eid || req.query.eid
      if (!positiveId(String(eid || ''))) { await cleanup(file.path); return res.status(400).json({ message: '缺少 Event ID' }) }
      let thumb: string | null = null
      try {
        if (!options.matches(req, eid)) { await cleanup(file.path); return res.status(403).json({ message: '草稿凭据无效或已过期' }) }
        const row = await event(eid)
        if (!row) { await cleanup(file.path); return res.status(403).json({ message: 'Event not found' }) }
        if (!['draft', 'pending'].includes(row.status || '')) { await cleanup(file.path); return res.status(403).json({ message: `Event status is '${row.status}', upload not allowed` }) }
        if (!await options.images.validateUploadedFile(file)) { await cleanup(file.path); return res.status(400).json({ message: '不支持的文件内容' }) }
        if (file.mimetype !== 'image/svg+xml') {
          thumb = path.join(path.dirname(file.path), `${path.parse(file.filename).name}-thumb.webp`)
          await thumbnail(file, thumb)
        }
        const target = path.join(eventRoot, String(eid))
        await directory(target)
        const destination = path.join(target, file.filename)
        await options.images.moveVerifiedFile(file.path, destination); await fs.promises.chmod(destination, 0o644)
        let thumbName: string | null = null
        if (thumb && fs.existsSync(thumb)) {
          thumbName = path.basename(thumb)
          const destination = path.join(target, thumbName)
          await options.images.moveVerifiedFile(thumb, destination); await fs.promises.chmod(destination, 0o644)
        }
        return res.json({ message: 'Upload success', eid, url: `/uploads/img/events/${eid}/${file.filename}`, thumbUrl: thumbName ? `/uploads/img/events/${eid}/${thumbName}` : null })
      } catch (error) { options.report(error); await cleanup(file.path, thumb); return res.status(500).json({ message: '服务器内部错误' }) }
    },
    avatar: async (req: UploadRequest, res: UploadResponse) => {
      const file = req.file
      if (!file) return res.status(400).json({ message: '文件上传失败' })
      const eid = body(req).eid || req.query.eid
      if (!positiveId(String(eid || ''))) { await cleanup(file.path); return res.status(400).json({ message: '缺少 Event ID' }) }
      try {
        const row = await event(eid)
        if (!row) { await cleanup(file.path); return res.status(404).json({ message: 'Event not found' }) }
        if (!['published', 'ongoing', 'ended', 'settled'].includes(row.status || '')) { await cleanup(file.path); return res.status(403).json({ message: '当前状态不允许上传头像' }) }
        if (!await options.images.validateUploadedFile(file)) { await cleanup(file.path); return res.status(400).json({ message: '不支持的文件内容' }) }
        const target = path.join(eventRoot, String(eid), 'avatars')
        await directory(target)
        const destination = path.join(target, file.filename)
        await options.images.moveVerifiedFile(file.path, destination); await fs.promises.chmod(destination, 0o644)
        return res.json({ message: 'Upload success', eid, url: `/uploads/img/events/${eid}/avatars/${file.filename}` })
      } catch (error) { options.report(error); await cleanup(file.path); return res.status(500).json({ message: '服务器内部错误' }) }
    }
  }
}
