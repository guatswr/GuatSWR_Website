import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { isSafePath } from '../utils/storage-boundary.js'

export interface UploadedImage { path: string; filename: string; mimetype: string; originalname: string }
export function createImageStorage(options: { privateDir: string; publicDir: string; stagingDir: string }) {
  sharp.cache({ files: 0 })
  const formats = new Map([['image/jpeg', 'jpeg'], ['image/png', 'png'], ['image/gif', 'gif'], ['image/webp', 'webp'], ['image/svg+xml', 'svg']])
  const maxPixels = 40000000
  const validateUploadedFile = async (file: UploadedImage) => {
    try {
      if (!isSafePath(options.privateDir, file.path)) return false
      const config = { limitInputPixels: maxPixels, failOn: 'warning' as const }
      const meta = await sharp(file.path, config).metadata()
      if (meta.format !== formats.get(file.mimetype) || !meta.width || !meta.height || meta.width * meta.height * (meta.pages || 1) > maxPixels || (meta.pages || 1) > 200) return false
      await sharp(file.path, config).resize({ width: 1, height: 1, fit: 'inside' }).raw().toBuffer()
      return true
    } catch { return false }
  }
  const moveVerifiedFile = async (source: string, destination: string) => {
    if (!isSafePath(options.privateDir, source) || !isSafePath(options.publicDir, destination)) throw new Error('Unsafe storage path')
    try { await fs.rename(source, destination) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error
      await fs.copyFile(source, destination, constants.COPYFILE_EXCL)
      try { await fs.unlink(source) } catch (error) { await fs.unlink(destination).catch(() => {}); throw error }
    }
  }
  const publishStagingFile = async (file: UploadedImage, thumbPath?: string | null) => {
    const moved: string[] = []
    try {
      for (const source of [file.path, thumbPath].filter((value): value is string => Boolean(value))) {
        const destination = path.join(options.stagingDir, path.basename(source))
        await moveVerifiedFile(source, destination); moved.push(destination); await fs.chmod(destination, 0o644)
      }
      if (!moved[0]) throw new Error('Upload publication failed')
      file.path = moved[0]
    } catch (error) { await Promise.all(moved.map(filename => fs.unlink(filename).catch(() => {}))); throw error }
  }
  return { validateUploadedFile, moveVerifiedFile, publishStagingFile, maxPixels }
}
export type ImageStorage = ReturnType<typeof createImageStorage>
