import type { OpenListRuntimeConfig } from './openlist'
import { listOpenListDirectory } from './openlist'
import { BffError } from './bff-errors'
import { resourceAdminPathSchema, resourceAdminResponseSchema, resourceMutationSchema, resourceUploadQuerySchema, RESOURCE_UPLOAD_LIMIT } from '../../shared/resource-admin'
import type { ResourceAdminResponse, ResourceMutation } from '../../shared/resource-admin'

function rootPath(config: OpenListRuntimeConfig): string {
  const raw = (config.rootPath || '/').trim().replace(/\/+$/, '') || '/'
  if (!resourceAdminPathSchema.safeParse(raw).success) throw new BffError(503, 'resource_configuration', '资源根目录配置无效')
  return raw
}
function upstreamPath(config: OpenListRuntimeConfig, clientPath: string): string {
  const root = rootPath(config)
  const path = resourceAdminPathSchema.parse(clientPath)
  return root === '/' ? path : root + (path === '/' ? '' : path)
}
const childPath = (directory: string, name: string) => (directory === '/' ? '' : directory) + '/' + name

export async function listManagedResources(config: OpenListRuntimeConfig, path: string, page = 1): Promise<ResourceAdminResponse> {
  resourceAdminPathSchema.parse(path)
  const root = rootPath(config)
  let directory
  try { directory = await listOpenListDirectory(config, path, page, 100, true) }
  catch { throw new BffError(502, 'resource_directory', '无法读取资源目录，请检查 OpenList 连接及权限') }
  const configured = Boolean(config.baseUrl?.trim())
  const tokenConfigured = Boolean(config.token?.trim())
  const writable = configured && tokenConfigured && directory.write
  return resourceAdminResponseSchema.parse({
    directory,
    connection: {
      mode: configured ? 'openlist' : 'demo', tokenConfigured, writable, rootPath: root,
      uploadLimitBytes: RESOURCE_UPLOAD_LIMIT,
      reason: !configured ? 'demo' : !tokenConfigured ? 'missing_token' : !directory.write ? 'readonly' : 'ready',
    },
  })
}
export async function assertResourceWritable(config: OpenListRuntimeConfig, path: string): Promise<void> {
  if (!config.baseUrl?.trim()) throw new BffError(409, 'resource_demo', '演示目录只读，请先配置 OpenList')
  if (!config.token?.trim()) throw new BffError(409, 'resource_credentials', '请先配置 OpenList 管理凭据')
  const result = await listManagedResources(config, path)
  if (!result.connection.writable) throw new BffError(409, 'resource_readonly', '当前目录没有写入权限')
}

/** Fixed API endpoints only; redirect responses never receive the server token. */
async function openListWrite(config: OpenListRuntimeConfig, endpoint: '/api/fs/mkdir' | '/api/fs/rename' | '/api/fs/move' | '/api/fs/remove' | '/api/fs/put', body: Record<string, unknown> | Blob, uploadPath?: string): Promise<void> {
  const base = config.baseUrl!.trim().replace(/\/+$/, '')
  const headers: Record<string, string> = { Authorization: config.token!.trim(), Accept: 'application/json' }
  const upload = endpoint === '/api/fs/put'
  headers['Content-Type'] = upload ? 'application/octet-stream' : 'application/json'
  if (upload && uploadPath) {
    headers['File-Path'] = encodeURIComponent(uploadPath)
    headers['As-Task'] = 'false'
    headers.Overwrite = 'false'
  }
  try {
    const response = await fetch(base + endpoint, {
      method: upload ? 'PUT' : 'POST', headers, redirect: 'error',
      body: upload ? body as Blob : JSON.stringify(body),
      signal: AbortSignal.timeout(upload ? 120_000 : config.timeoutMs ?? 8_000),
    })
    if (!response.ok) throw new Error('upstream HTTP failure')
    const reader = response.body?.getReader()
    if (!reader) throw new Error('empty upstream response')
    let size = 0
    const chunks: Uint8Array[] = []
    try {
      for (;;) {
        const next = await reader.read()
        if (next.done) break
        size += next.value.byteLength
        if (size > 64 * 1024) throw new Error('oversized upstream response')
        chunks.push(next.value)
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
    const payload: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!payload || typeof payload !== 'object' || !('code' in payload)) throw new Error('invalid response')
    if (payload.code === 409) throw new BffError(409, 'resource_conflict', '目标目录已存在同名项目')
    if (payload.code !== 200) throw new Error('upstream operation failed')
  } catch (error) {
    if (error instanceof BffError) throw error
    // Never echo upstream error text: it can contain paths, tokens or driver details.
    throw new BffError(502, 'resource_operation', '操作未完成，请刷新目录确认结果后再试')
  }
}

export async function mutateManagedResources(config: OpenListRuntimeConfig, rawInput: ResourceMutation) {
  const input = resourceMutationSchema.parse(rawInput)
  if (input.action === 'move') {
    if (input.destination === input.path || input.names.some(name => {
      const source = childPath(input.path, name)
      return input.destination === source || input.destination.startsWith(source + '/')
    })) throw new BffError(400, 'invalid_request', '不能移动到原目录或项目自身的子目录')
  }
  if (input.action === 'rename' && input.name === input.newName) throw new BffError(400, 'invalid_request', '新旧名称相同')
  await assertResourceWritable(config, input.path)
  if (input.action === 'move') await assertResourceWritable(config, input.destination)
  switch (input.action) {
    case 'mkdir': await openListWrite(config, '/api/fs/mkdir', { path: upstreamPath(config, childPath(input.path, input.name)) }); break
    case 'rename': await openListWrite(config, '/api/fs/rename', { path: upstreamPath(config, childPath(input.path, input.name)), name: input.newName }); break
    case 'move': await openListWrite(config, '/api/fs/move', { src_dir: upstreamPath(config, input.path), dst_dir: upstreamPath(config, input.destination), names: input.names, overwrite: false }); break
    case 'remove': await openListWrite(config, '/api/fs/remove', { dir: upstreamPath(config, input.path), names: input.names }); break
  }
  return { action: input.action, submitted: input.action === 'move' }
}

export async function uploadManagedResource(config: OpenListRuntimeConfig, path: string, name: string, file: Blob) {
  resourceUploadQuerySchema.parse({ path, name })
  if (file.size > RESOURCE_UPLOAD_LIMIT) throw new BffError(413, 'resource_upload_size', '单个文件不能超过 50 MiB')
  await assertResourceWritable(config, path)
  await openListWrite(config, '/api/fs/put', file, upstreamPath(config, childPath(path, name)))
  return { action: 'upload' as const, submitted: false }
}

