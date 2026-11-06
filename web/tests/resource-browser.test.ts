import { describe, expect, it } from 'vitest'
import type { ResourceItem } from '../shared/resources'
import {
  RESOURCE_VIEW_PAGE_SIZE,
  mergeResourcePages,
  paginateResources,
  resourceMatches,
  resourceWebUrl,
  sortResources,
} from '../app/utils/resource-browser'

const item = (name: string, overrides: Partial<ResourceItem> = {}): ResourceItem => ({
  name, path: '/' + name, is_dir: false, size: 1, kind: 'document', modified: '', ...overrides,
})

describe('resource browser interactions', () => {
  it('keeps folders first in both directions and sorts numbered names naturally without mutating input', () => {
    const items = [item('file10'), item('file2'), item('folder', { is_dir: true, kind: 'folder' })]
    expect(sortResources(items, 'name', 'asc').map(x => x.name)).toEqual(['folder', 'file2', 'file10'])
    expect(sortResources(items, 'name', 'desc').map(x => x.name)).toEqual(['folder', 'file10', 'file2'])
    expect(items[0]?.name).toBe('file10')
  })

  it('sorts sizes and dates with a predictable name tie-breaker', () => {
    const items = [item('b', { size: 3, modified: '2026-11-01' }), item('a', { size: 3, modified: '2026-10-01' }), item('c', { size: 2 })]
    expect(sortResources(items, 'size', 'asc').map(x => x.name)).toEqual(['c', 'a', 'b'])
    expect(sortResources(items, 'modified', 'desc')[0]?.name).toBe('b')
  })

  it('matches names, versions and descriptions regardless of case and whitespace', () => {
    const file = item('GIuRoll.zip', { version: 'V2.4', summary: '回滚补丁' })
    expect(resourceMatches(file, '  giuroll  ')).toBe(true)
    expect(resourceMatches(file, 'v2.4')).toBe(true)
    expect(resourceMatches(file, '回滚')).toBe(true)
    expect(resourceMatches(file, 'unknown')).toBe(false)
  })

  it('merges overlapping pages by full path without collapsing identical names from different folders', () => {
    const first = item('guide.md', { path: '/a/guide.md' })
    const updated = { ...first, size: 4 }
    expect(mergeResourcePages([first], [updated, item('guide.md', { path: '/b/guide.md' })]))
      .toEqual([updated, item('guide.md', { path: '/b/guide.md' })])
  })

  it('accepts download URLs while rejecting executable and ambiguous relative URLs', () => {
    for (const url of ['https://pan.example/d/a?sign=123', '/api/resources/detail?path=%2Fa']) expect(resourceWebUrl(url)).toBe(url)
    for (const url of ['javascript:alert(1)', 'data:text/html,hello', '//evil.example', '/\\evil.example', 'file:///etc/passwd', 'https://a.example/ bad']) expect(resourceWebUrl(url)).toBe('')
  })
})

describe('accessible client pagination at scale (WEB-02)', () => {
  it.each([100, 1_000, 10_000])(
    'bounds DOM item count to at most 100 entries with %i items',
    scale => {
      const synthetic = Array.from({ length: scale }, (_, i) =>
        item(`file_${String(i).padStart(5, '0')}.zip`, { size: i + 10 }),
      )

      // Page 1
      const page1 = paginateResources(synthetic, 1)
      expect(page1.items.length).toBe(Math.min(scale, RESOURCE_VIEW_PAGE_SIZE))
      expect(page1.items[0]?.name).toBe('file_00000.zip')
      expect(page1.totalItems).toBe(scale)
      expect(page1.totalPages).toBe(Math.ceil(scale / RESOURCE_VIEW_PAGE_SIZE))
      expect(page1.currentPage).toBe(1)

      // Page 2 (if scale > 100)
      if (scale > 100) {
        const page2 = paginateResources(synthetic, 2)
        expect(page2.items.length).toBe(RESOURCE_VIEW_PAGE_SIZE)
        expect(page2.items[0]?.name).toBe('file_00100.zip')
        expect(page2.currentPage).toBe(2)
      }

      // Last page
      const lastPageNum = Math.ceil(scale / RESOURCE_VIEW_PAGE_SIZE)
      const lastPage = paginateResources(synthetic, lastPageNum)
      expect(lastPage.items.length).toBe(
        scale % RESOURCE_VIEW_PAGE_SIZE === 0 ? RESOURCE_VIEW_PAGE_SIZE : scale % RESOURCE_VIEW_PAGE_SIZE,
      )
      expect(lastPage.currentPage).toBe(lastPageNum)
    },
  )

  it('clamps invalid and out-of-range pages gracefully', () => {
    const items = [item('a'), item('b'), item('c')]
    expect(paginateResources(items, 0).currentPage).toBe(1)
    expect(paginateResources(items, -99).currentPage).toBe(1)
    expect(paginateResources(items, 999).currentPage).toBe(1)
    expect(paginateResources([], 1)).toEqual({
      items: [],
      totalItems: 0,
      totalPages: 1,
      currentPage: 1,
    })
  })

  it('preserves sorting and filtering across pages', () => {
    const items = [
      item('c_doc.pdf', { kind: 'document' }),
      item('a_doc.pdf', { kind: 'document' }),
      item('b_doc.pdf', { kind: 'document' }),
      item('image.png', { kind: 'image' }),
    ]
    const filtered = items.filter(x => x.kind === 'document')
    const sorted = sortResources(filtered, 'name', 'asc')
    expect(sorted.map(x => x.name)).toEqual(['a_doc.pdf', 'b_doc.pdf', 'c_doc.pdf'])

    const paginated = paginateResources(sorted, 1, 2)
    expect(paginated.items.map(x => x.name)).toEqual(['a_doc.pdf', 'b_doc.pdf'])
    expect(paginated.totalPages).toBe(2)

    const paginatedP2 = paginateResources(sorted, 2, 2)
    expect(paginatedP2.items.map(x => x.name)).toEqual(['c_doc.pdf'])
  })
})
