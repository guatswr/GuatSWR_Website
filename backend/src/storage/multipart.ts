import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { UploadedImage } from './images.js'
import { isSafePath } from '../utils/storage-boundary.js'

export interface UploadRequest extends IncomingMessage {
  file?: UploadedImage; body?: unknown; query: Record<string, unknown>; user?: { id: number; username: string; role: string }
}
export interface UploadResponse extends ServerResponse {
  status(code: number): UploadResponse; json(body: unknown): unknown
}
export type UploadNext = (error?: unknown) => void
type Handler = (req: UploadRequest, res: UploadResponse, next: UploadNext) => unknown
type FileCallback = (error: Error | null, value?: string) => void
type IncomingFile = Pick<UploadedImage, 'originalname' | 'mimetype'>
const multer = createRequire(__filename)('multer') as {
  diskStorage(options: { destination(req: UploadRequest, file: IncomingFile, callback: FileCallback): void; filename(req: UploadRequest, file: IncomingFile, callback: FileCallback): void }): unknown
  (options: { storage: unknown; limits: { fileSize: number; files: number; fields: number; parts: number; fieldSize: number; fieldNameSize: number }; fileFilter(req: UploadRequest, file: IncomingFile, callback: (error: Error | null, accept?: boolean) => void): void }): { single(field: string): Handler }
}
export function createMultipartParser(privateDir: string) {
  const mimeTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'])
  const extensions = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'])
  const storage = multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, privateDir),
    filename: (_req, file, callback) => callback(null, `img-${randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
  })
  const parser = multer({ storage, limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 8, parts: 10, fieldSize: 16 * 1024, fieldNameSize: 100 },
    fileFilter: (_req, file, callback) => {
      if (!mimeTypes.has(file.mimetype) || !extensions.has(path.extname(file.originalname).toLowerCase())) return callback(new Error('不支持的文件类型'))
      callback(null, true)
    }
  })
  let active = 0
  const leases = new WeakMap<UploadRequest, () => void>()
  return { upload: { complete(request: UploadRequest) { leases.get(request)?.() }, single(field: string): Handler {
    const parse = parser.single(field)
    return (req, res, next) => {
      if (req.aborted || res.destroyed) return
      if (active >= 8) return res.status(429).json({ message: '上传并发过多，请稍后再试' })
      active++
      let released = false, parsing = true
      const release = () => {
        if (released) return
        released = true; active--
        leases.delete(req)
        res.removeListener('finish', closed); res.removeListener('close', closed); req.removeListener('aborted', closed)
      }
      const closed = () => { if (parsing) release() }
      leases.set(req, release)
      res.once('finish', closed); res.once('close', closed); req.once('aborted', closed)
      return parse(req, res, error => {
        if (error) { release(); next(error); return }
        if (released || req.aborted || res.destroyed) {
          release()
          if (req.file && isSafePath(privateDir, req.file.path)) void fs.unlink(req.file.path).catch(() => {})
          return
        }
        parsing = false
        next()
      })
    }
  } } }
}
