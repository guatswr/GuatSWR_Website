import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { RESOURCE_UPLOAD_LIMIT } from '../../shared/resource-admin'
import { BffError } from './bff-errors'

let active = 0

/** Files stream to private temporary storage, never to the Nuxt public directory. */
export async function receiveResourceUpload(request: Readable & { headers: Record<string, string | string[] | undefined> }, temporaryRoot = tmpdir()) {
  if (active >= 2) throw new BffError(503, 'resource_upload_busy', '上传繁忙，请稍后重试')
  const length = request.headers['content-length']
  if (length !== undefined && (typeof length !== 'string' || !/^\d+$/.test(length) || Number(length) > RESOURCE_UPLOAD_LIMIT)) {
    throw new BffError(413, 'resource_upload_size', '单个文件不能超过 50 MiB')
  }
  if (request.headers['content-type'] !== 'application/octet-stream') throw new BffError(415, 'invalid_request', '上传内容类型无效')
  active++
  let directory: string | undefined
  let disposed = false
  const dispose = async () => {
    if (disposed) return
    disposed = true
    try { if (directory) await rm(directory, { recursive: true, force: true }) }
    finally { active-- }
  }
  try {
    await mkdir(temporaryRoot, { recursive: true })
    directory = await mkdtemp(join(temporaryRoot, 'guatswr-resource-'))
    const filename = join(directory, 'upload')
    let bytes = 0
    const meter = new Transform({ transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length
      callback(bytes > RESOURCE_UPLOAD_LIMIT ? new BffError(413, 'resource_upload_size', '单个文件不能超过 50 MiB') : null, chunk)
    } })
    // Keep the HTTP request alive long enough to return a bounded error response.
    const input = Readable.from(request.iterator({ destroyOnReturn: false }))
    try {
      await pipeline(input, meter, createWriteStream(filename, { mode: 0o600 }), { signal: AbortSignal.timeout(60_000) })
    } finally { request.resume() }
    const stored = await stat(filename)
    if (length !== undefined && stored.size !== Number(length)) throw new BffError(400, 'invalid_request', '文件上传不完整')
    return { filename, size: stored.size, dispose }
  } catch (error) {
    await dispose()
    if (error instanceof BffError) throw error
    if (error && typeof error === 'object' && 'code' in error && ['EPERM', 'EACCES', 'ENOSPC', 'EROFS'].includes(String(error.code))) {
      throw new BffError(503, 'resource_upload_storage', '上传暂存目录不可用，请检查服务器配置')
    }
    throw new BffError(408, 'resource_upload_interrupted', '文件上传中断或超时，请重新选择文件')
  }
}
