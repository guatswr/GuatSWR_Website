import type { ResourceItem } from '#shared/resources'

export type ResourceSort = 'name' | 'size' | 'modified'

/** Keep folders first in either direction; use a stable name tie-breaker. */
export function sortResources(items: readonly ResourceItem[], field: ResourceSort, order: 'asc' | 'desc'): ResourceItem[] {
  const direction = order === 'asc' ? 1 : -1
  return [...items].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
    const primary = field === 'size' ? a.size - b.size
      : field === 'modified' ? a.modified.localeCompare(b.modified)
        : a.name.localeCompare(b.name, 'zh-CN', { numeric: true })
    return (primary || a.name.localeCompare(b.name, 'zh-CN', { numeric: true })) * direction
  })
}

export function resourceMatches(item: ResourceItem, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase()
  return [item.name, item.summary, item.badge, item.version].some(value => value?.toLocaleLowerCase().includes(needle))
}

/** Download links support web URLs and site-relative paths only. */
export function resourceWebUrl(value: string | undefined): string {
  const url = value?.trim() || ''
  if (/^https?:\/\/[^\s]+$/i.test(url)) return url
  if (/^\/(?![/\\])[^\s]*$/.test(url) && !url.includes('\\')) return url
  return ''
}

export function mergeResourcePages(items: readonly ResourceItem[], next: readonly ResourceItem[]): ResourceItem[] {
  return [...new Map([...items, ...next].map(item => [item.path, item])).values()]
}
