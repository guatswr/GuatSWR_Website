import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  RESOURCE_PARTITIONS,
  formatResourceSize,
  inferResourceKind,
  joinResourcePath,
  normalizeResourcePath,
  parentResourcePath,
  resourceBreadcrumbs,
} from '../shared/resources'
import {
  getOpenListResourceDetail,
  listOpenListDirectory,
  searchOpenListResources,
} from '../server/utils/openlist'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('resources path and kind utilities', () => {
  it('normalizes paths and rejects path traversal attempts', () => {
    expect(normalizeResourcePath('')).toBe('/')
    expect(normalizeResourcePath(undefined)).toBe('/')
    expect(normalizeResourcePath('/非想天则联机专区/')).toBe('/非想天则联机专区')
    expect(normalizeResourcePath('\\非想天则联机专区\\回滚与联机插件')).toBe('/非想天则联机专区/回滚与联机插件')
    expect(normalizeResourcePath('/非想天则联机专区/../etc/passwd')).toBe('/')
    expect(normalizeResourcePath('/%2e%2e/secret')).toBe('/')
    expect(joinResourcePath('/非想天则联机专区', 'GIuRoll.zip')).toBe('/非想天则联机专区/GIuRoll.zip')
    expect(parentResourcePath('/非想天则联机专区/回滚与联机插件')).toBe('/非想天则联机专区')
    expect(parentResourcePath('/非想天则联机专区')).toBe('/')
    expect(parentResourcePath('/')).toBe('/')
  })

  it('builds breadcrumbs from root to nested folders', () => {
    expect(resourceBreadcrumbs('/')).toEqual([{ name: '幻想乡书库', path: '/' }])
    expect(resourceBreadcrumbs('/非想天则联机专区/回滚与联机插件')).toEqual([
      { name: '幻想乡书库', path: '/' },
      { name: '非想天则联机专区', path: '/非想天则联机专区' },
      { name: '回滚与联机插件', path: '/非想天则联机专区/回滚与联机插件' },
    ])
  })

  it('infers file kinds and formats byte sizes deterministically', () => {
    expect(inferResourceKind('folder', true)).toBe('folder')
    expect(inferResourceKind('th123_pack.7z', false)).toBe('archive')
    expect(inferResourceKind('thprac.exe', false)).toBe('game')
    expect(inferResourceKind('suigetsu.flac', false)).toBe('audio')
    expect(inferResourceKind('guide.pdf', false)).toBe('document')
    expect(inferResourceKind('badge.svg', false)).toBe('image')
    expect(inferResourceKind('config.ini', false)).toBe('code')

    expect(formatResourceSize(0, true)).toBe('目录')
    expect(formatResourceSize(0)).toBe('0 B')
    expect(formatResourceSize(2048)).toBe('2.00 KB')
    expect(formatResourceSize(1_142_947_840)).toBe('1.06 GB')
  })
})

describe('OpenList server adapter (mock fallback & upstream v3)', () => {
  it('maps search results back to public paths and forwards the requested page', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      code: 200, data: { total: 70, content: [
        { parent: '/club/tools', name: 'patch.zip', is_dir: false, size: 42 },
        { parent: '/outside', name: 'hidden.zip', is_dir: false, size: 42 },
      ] },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const result = await searchOpenListResources({ baseUrl: 'https://pan.example', rootPath: '/club' }, 'patch', '/', 2)
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toMatchObject({ parent: '/club', page: 2, per_page: 50 })
    expect(result.total).toBe(70)
    expect(result.items.map(x => x.path)).toEqual(['/tools/patch.zip'])
  })

  it('serves the built-in Touhou club resource tree when baseUrl is unset', async () => {
    const root = await listOpenListDirectory({}, '/')
    expect(root.source).toBe('mock')
    expect(root.items.length).toBeGreaterThanOrEqual(RESOURCE_PARTITIONS.length)
    expect(root.items.some(item => item.path === '/非想天则联机专区' && item.is_dir)).toBe(true)

    const soku = await listOpenListDirectory({}, '/非想天则联机专区')
    expect(soku.source).toBe('mock')
    expect(soku.items.some(item => item.name.includes('1.10a'))).toBe(true)

    const detail = await getOpenListResourceDetail({}, '/幻想乡书库借阅指南.md')
    expect(detail.source).toBe('mock')
    expect(detail.textPreview).toContain('幻想乡书库借阅指南')

    const search = await searchOpenListResources({}, 'GIuRoll', '/')
    expect(search.total).toBeGreaterThan(0)
    expect(search.items.some(item => item.name.includes('GIuRoll'))).toBe(true)
  })

  it('maps OpenList v3 /api/fs/list and /api/fs/get responses when baseUrl is configured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/api/fs/list')) {
        return new Response(
          JSON.stringify({
            code: 200,
            message: 'success',
            data: {
              content: [
                {
                  name: 'th123_soku.7z',
                  size: 1048576,
                  is_dir: false,
                  modified: '2026-10-30T12:00:00Z',
                  sign: 'sig123',
                  type: 0,
                },
              ],
              total: 1,
              readme: '# OpenList Live Node',
              header: 'Live header',
              write: false,
              provider: 'AliyunDrive',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response(
        JSON.stringify({
          code: 200,
          message: 'success',
          data: {
            name: 'th123_soku.7z',
            size: 1048576,
            is_dir: false,
            modified: '2026-10-30T12:00:00Z',
            sign: 'sig123',
            raw_url: 'https://pan.guatswr.top/d/th123_soku.7z?sign=sig123',
            readme: '',
            provider: 'AliyunDrive',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })

    const cfg = {
      baseUrl: 'https://pan.guatswr.top',
      publicUrl: 'https://pan.guatswr.top',
      token: 'openlist-token-xyz',
      rootPath: '/club',
    }

    const listed = await listOpenListDirectory(cfg, '/')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(listed.source).toBe('openlist')
    expect(listed.provider).toBe('AliyunDrive')
    expect(listed.items[0]?.name).toBe('th123_soku.7z')
    expect(listed.items[0]?.raw_url).toBe('https://pan.guatswr.top/d/club/th123_soku.7z?sign=sig123')

    const detail = await getOpenListResourceDetail(cfg, '/th123_soku.7z')
    expect(detail.source).toBe('openlist')
    expect(detail.raw_url).toBe('https://pan.guatswr.top/d/th123_soku.7z?sign=sig123')
  })
})
