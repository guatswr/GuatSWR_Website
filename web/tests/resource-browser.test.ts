import { describe, expect, it } from 'vitest'
import type { ResourceItem } from '../shared/resources'
import { mergeResourcePages, resourceMatches, resourceWebUrl, sortResources } from '../app/utils/resource-browser'

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
