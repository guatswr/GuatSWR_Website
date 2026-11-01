import { afterEach, describe, expect, it, vi } from 'vitest'
import { listManagedResources, mutateManagedResources, uploadManagedResource } from '../server/utils/resource-management'
import { resourceAdminPathSchema, resourceMutationSchema, RESOURCE_UPLOAD_LIMIT } from '../shared/resource-admin'

const config = { baseUrl: 'https://openlist.example', token: 'server-only-test-token', rootPath: '/club' }
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
function fixture(options: { write?: boolean; code?: number; error?: string } = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, _init) => {
    if (String(input).endsWith('/api/fs/list')) return json({ code: 200, data: { content: [], total: 0, readme: '', header: '', provider: 'Local', write: options.write ?? true } })
    return json({ code: options.code ?? 200, data: null, message: options.error || 'success' })
  })
}
afterEach(() => vi.restoreAllMocks())

describe('resource management boundary', () => {
  it('rejects traversal, normalization ambiguities and deletion without confirmation', () => {
    for (const path of ['/../private', '/foo/../private', '/a//b', '/a\\b', '/%2e%2e', '/a/%2fsecret', 'relative', '/a\u0000']) {
      expect(resourceAdminPathSchema.safeParse(path).success).toBe(false)
    }
    expect(resourceAdminPathSchema.safeParse('/中文目录/回滚插件').success).toBe(true)
    expect(resourceMutationSchema.safeParse({ action: 'remove', path: '/', names: ['test.txt'] }).success).toBe(false)
    expect(resourceMutationSchema.safeParse({ action: 'remove', path: '/', names: ['../secret'], confirmed: true }).success).toBe(false)
  })

  it('keeps the demonstration read-only and never writes without a server credential', async () => {
    const fetch = fixture()
    expect((await listManagedResources({}, '/')).connection).toMatchObject({ mode: 'demo', writable: false, reason: 'demo' })
    await expect(mutateManagedResources({}, { action: 'mkdir', path: '/', name: 'new' })).rejects.toMatchObject({ code: 'resource_demo' })
    await expect(mutateManagedResources({ baseUrl: config.baseUrl }, { action: 'mkdir', path: '/', name: 'new' })).rejects.toMatchObject({ code: 'resource_credentials' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reports upstream permissions without serializing the token', async () => {
    fixture({ write: false })
    const response = await listManagedResources(config, '/')
    expect(response.connection).toMatchObject({ mode: 'openlist', writable: false, tokenConfigured: true, reason: 'readonly' })
    expect(JSON.stringify(response)).not.toContain(config.token)
    await expect(mutateManagedResources(config, { action: 'mkdir', path: '/', name: 'new' })).rejects.toMatchObject({ code: 'resource_readonly' })
  })

  it('scopes every write to the configured root and uses fixed OpenList endpoints', async () => {
    const fetch = fixture()
    await mutateManagedResources(config, { action: 'mkdir', path: '/tools', name: 'new' })
    await mutateManagedResources(config, { action: 'rename', path: '/tools', name: 'old.zip', newName: 'new.zip' })
    await mutateManagedResources(config, { action: 'move', path: '/tools', names: ['new.zip'], destination: '/archive' })
    await mutateManagedResources(config, { action: 'remove', path: '/tools', names: ['new.zip'], confirmed: true })
    const writes = fetch.mock.calls.filter(([url]) => !String(url).endsWith('/api/fs/list'))
    expect(writes.map(([url, init]) => [String(url).replace(config.baseUrl, ''), JSON.parse(String(init?.body))])).toEqual([
      ['/api/fs/mkdir', { path: '/club/tools/new' }],
      ['/api/fs/rename', { path: '/club/tools/old.zip', name: 'new.zip' }],
      ['/api/fs/move', { src_dir: '/club/tools', dst_dir: '/club/archive', names: ['new.zip'], overwrite: false }],
      ['/api/fs/remove', { dir: '/club/tools', names: ['new.zip'] }],
    ])
    for (const [, init] of writes) {
      expect(new Headers(init?.headers).get('Authorization')).toBe(config.token)
      expect(init?.redirect).toBe('error')
    }
  })

  it('rejects self moves and invalid root configuration before any network request', async () => {
    const fetch = fixture()
    await expect(mutateManagedResources(config, { action: 'move', path: '/', names: ['tools'], destination: '/tools/sub' })).rejects.toMatchObject({ statusCode: 400 })
    await expect(mutateManagedResources({ ...config, rootPath: '/../../private' }, { action: 'mkdir', path: '/', name: 'new' })).rejects.toMatchObject({ code: 'resource_configuration' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('preserves binary uploads, URL-encodes the scoped path and prevents overwrite', async () => {
    const fetch = fixture()
    const file = new Blob([new Uint8Array([0, 255, 65, 13, 10])])
    await uploadManagedResource(config, '/tools', '中文 插件.zip', file)
    const [, init] = fetch.mock.calls.find(([url]) => String(url).endsWith('/api/fs/put'))!
    expect(init?.method).toBe('PUT')
    expect(init?.body).toBe(file)
    const headers = new Headers(init?.headers)
    expect(headers.get('File-Path')).toBe(encodeURIComponent('/club/tools/中文 插件.zip'))
    expect(headers.get('Overwrite')).toBe('false')
    expect(headers.get('As-Task')).toBe('false')
  })

  it('bounds uploads and does not replay failed writes or expose upstream diagnostics', async () => {
    const fetch = fixture({ code: 500, error: 'private token: ' + config.token })
    const operation = mutateManagedResources(config, { action: 'mkdir', path: '/', name: 'new' })
    await expect(operation).rejects.toMatchObject({ code: 'resource_operation', message: '操作未完成，请刷新目录确认结果后再试' })
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/api/fs/mkdir'))).toHaveLength(1)
    await expect(uploadManagedResource(config, '/', 'big.zip', { size: RESOURCE_UPLOAD_LIMIT + 1 } as Blob)).rejects.toMatchObject({ statusCode: 413 })
  })
})
