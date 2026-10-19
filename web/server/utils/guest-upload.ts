import { randomBytes } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdtemp, open, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'
import Busboy from 'busboy'
import type { H3Event } from 'h3'
import { BffError } from './bff-errors'

/**
 * Bounded multipart parsing for the two guest upload routes.
 *
 * One file part streams straight to a private temp file; the reservation is taken
 * *before* the first await so the concurrency bound cannot be raced out. Limits
 * cover the file (50 MiB), the whole stanza, fields, parts and a request deadline.
 * The parser is `busboy@1.6.0` (the version the frozen backend already installs
 * through multer) rather than a hand-rolled parser.
 *
 * `dispose()` waits for the write pipeline to stop, detaches every listener and
 * removes the temp directory, so no writer can still hold the file when it is
 * deleted.
 */

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
export const MAX_UPLOAD_TOTAL_BYTES = MAX_UPLOAD_BYTES + 1024 * 1024
export const MAX_CONCURRENT_UPLOADS = 4
export const UPLOAD_TIMEOUT_MS = 30_000
export const MAX_UPLOAD_FIELDS = 4
export const MAX_UPLOAD_FIELD_BYTES = 512
const MAX_UPLOAD_PARTS = 8
const MAX_HEADER_PAIRS = 64
const MAGIC_PROBE_BYTES = 256

/** Own allowlist; deliberately not inherited from any shared table. */
const UPLOAD_MIME_EXTENSIONS: Readonly<Record<string, string>> = Object.freeze({
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg'
})

export const UPLOAD_EXTENSIONS = UPLOAD_MIME_EXTENSIONS

let activeUploads = 0

export interface GuestUpload {
  filePath: string
  size: number
  mimeType: string
  fields: Record<string, string>
  dispose: () => Promise<void>
}

interface BusboyFileInfo {
  mimeType?: string
  filename?: string
}

/** The exact fields the frozen upload route reads; duplicates are rejected. */
const ALLOWED_FIELDS: ReadonlySet<string> = new Set(['eid'])

export async function readGuestUpload(event: H3Event): Promise<GuestUpload> {
  // Reserve atomically before any await, otherwise parallel requests all pass.
  if (activeUploads >= MAX_CONCURRENT_UPLOADS) {
    throw new BffError(503, 'upload_busy', '上传繁忙，请稍后再试')
  }
  activeUploads += 1
  let released = false
  const release = (): void => {
    if (released) return
    released = true
    activeUploads = Math.max(0, activeUploads - 1)
  }

  const request = event.node?.req
  try {
    if (!request) throw new BffError(400, 'invalid_request', '请求内容无效')
    const contentType = request.headers['content-type']
    if (typeof contentType !== 'string' || !contentType.toLowerCase().startsWith('multipart/form-data')) {
      throw new BffError(400, 'invalid_request', '请求内容无效')
    }
    const directory = await mkdtemp(join(tmpdir(), 'guatswr-guest-'))
    const filePath = join(directory, `upload-${randomBytes(12).toString('hex')}`)

    let booted = false
    const dispose = async (): Promise<void> => {
      release()
      if (booted) return
      booted = true
      await rm(directory, { recursive: true, force: true }).catch(() => undefined)
    }

    try {
      const parsed = await parseMultipart(request, filePath)
      return {
        filePath,
        size: parsed.size,
        mimeType: parsed.mimeType,
        fields: parsed.fields,
        dispose
      }
    } catch (error) {
      await dispose()
      throw error
    }
  } catch (error) {
    release()
    throw error
  }
}

interface IncomingRequest extends Readable {
  headers: Record<string, string | string[] | undefined>
  unpipe: (destination?: NodeJS.WritableStream) => this
  resume: () => this
}

async function parseMultipart(
  request: IncomingRequest,
  filePath: string
): Promise<{ mimeType: string, size: number, fields: Record<string, string> }> {
  return await new Promise((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let writePipeline: Promise<void> | undefined
    let writeStream: ReturnType<typeof createWriteStream> | undefined
    let busboy: ReturnType<typeof Busboy> | undefined
    const onAborted = (): void => fail(new BffError(400, 'invalid_request', '上传已中断'))

    function detach(): void {
      if (timer) clearTimeout(timer)
      timer = undefined
      request.off?.('aborted', onAborted)
      request.unpipe?.()
      request.resume?.()
      busboy?.removeAllListeners?.()
      // Destroy the writer so a still-pending `pipeline` settles. Its listeners
      // must NOT be removed first: `removeAllListeners()` strips the listeners
      // `pipeline()` relies on, the promise never settles, and the aborted
      // request would hold its concurrency slot (and its temp directory)
      // forever instead of releasing it.
      writeStream?.destroy?.()
    }

    function fail(error: BffError): void {
      if (settled) return
      settled = true
      // Stop the writer and the parser before the caller removes the temp file.
      detach()
      const finish = (): void => reject(error)
      if (writePipeline) void writePipeline.then(finish, finish)
      else finish()
    }

    timer = setTimeout(() => {
      fail(new BffError(408, 'upload_timeout', '上传超时，请重试'))
    }, UPLOAD_TIMEOUT_MS)

    try {
      busboy = Busboy({
        headers: request.headers,
        limits: {
          fileSize: MAX_UPLOAD_BYTES,
          files: 1,
          fields: MAX_UPLOAD_FIELDS,
          fieldSize: MAX_UPLOAD_FIELD_BYTES,
          parts: MAX_UPLOAD_PARTS,
          headerPairs: MAX_HEADER_PAIRS
        }
      })
    } catch {
      fail(new BffError(400, 'invalid_request', '上传内容无效'))
      return
    }

    const fields: Record<string, string> = {}
    let fileSeen = false
    let mimeType = ''
    let fileTooLarge = false
    let malformed = false
    let totalBytes = 0

    busboy.on('field', (name: string, value: string) => {
      if (!ALLOWED_FIELDS.has(name) || name in fields) {
        malformed = true
        return
      }
      fields[name] = value
    })
    busboy.on('fieldsLimit', () => {
      malformed = true
    })
    busboy.on('partsLimit', () => {
      malformed = true
    })
    busboy.on('filesLimit', () => {
      malformed = true
    })
    busboy.on('file', (name: string, stream: Readable, info: BusboyFileInfo) => {
      if (fileSeen || name !== 'file') {
        malformed = true
        stream.resume()
        return
      }
      fileSeen = true
      mimeType = typeof info.mimeType === 'string' ? info.mimeType : ''
      if (!Object.prototype.hasOwnProperty.call(UPLOAD_MIME_EXTENSIONS, mimeType)) {
        malformed = true
        stream.resume()
        return
      }
      stream.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length
        if (totalBytes > MAX_UPLOAD_TOTAL_BYTES) {
          fileTooLarge = true
          stream.unpipe()
          stream.resume()
        }
      })
      stream.on('limit', () => {
        fileTooLarge = true
      })
      writeStream = createWriteStream(filePath, { mode: 0o600 })
      writePipeline = pipeline(stream, writeStream)
      writePipeline.catch(() => undefined)
    })
    busboy.on('error', () => {
      malformed = true
      fail(new BffError(400, 'invalid_request', '上传内容无效'))
    })
    busboy.on('close', () => {
      const complete = async (): Promise<void> => {
        if (settled) return
        try {
          await writePipeline
        } catch {
          fail(new BffError(400, 'invalid_request', '上传内容无效'))
          return
        }
        if (settled) return
        if (!fileSeen || malformed) {
          fail(new BffError(400, 'invalid_request', '文件上传失败'))
          return
        }
        if (fileTooLarge) {
          fail(new BffError(413, 'too_large', '文件大小超出限制'))
          return
        }
        const info = await stat(filePath).catch(() => null)
        if (!info?.isFile() || info.size <= 0 || info.size > MAX_UPLOAD_BYTES) {
          fail(new BffError(info && info.size > MAX_UPLOAD_BYTES ? 413 : 400, 'invalid_request', '文件上传失败'))
          return
        }
        settled = true
        detach()
        resolve({ mimeType, size: info.size, fields })
      }
      void complete()
    })
    request.on('aborted', onAborted)
    request.pipe(busboy)
  })
}

/** Same magic-byte rules the frozen backend applies after multer. */
export async function assertImageMagic(upload: GuestUpload): Promise<void> {
  const handle = await open(upload.filePath, 'r')
  try {
    const buffer = Buffer.alloc(MAGIC_PROBE_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, MAGIC_PROBE_BYTES, 0)
    const head = buffer.subarray(0, bytesRead)
    const mime = upload.mimeType
    const valid =
      head.length >= 4 &&
      (mime === 'image/jpeg'
        ? head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff
        : mime === 'image/png'
          ? head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
          : mime === 'image/gif'
            ? ['GIF87a', 'GIF89a'].includes(head.subarray(0, 6).toString('ascii'))
            : mime === 'image/webp'
              ? head.subarray(0, 4).toString('ascii') === 'RIFF' &&
                head.subarray(8, 12).toString('ascii') === 'WEBP'
              : mime === 'image/svg+xml'
                ? head.toString('utf8').toLowerCase().includes('<svg')
                : false)
    if (!valid) throw new BffError(400, 'invalid_image', '不支持的文件内容')
  } finally {
    await handle.close()
  }
}
