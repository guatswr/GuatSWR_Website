import type { ResourceItem } from '#shared/resources'

export type ResourceSort = 'name' | 'size' | 'modified'

export const RESOURCE_VIEW_PAGE_SIZE = 100

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

export interface PaginatedResourcesResult {
  items: ResourceItem[]
  totalItems: number
  totalPages: number
  currentPage: number
}

/**
 * Client-side accessible pagination to bound browser DOM node count.
 * Prevents DOM explosion when directories scale to hundreds or thousands of files.
 */
export function paginateResources(
  items: readonly ResourceItem[],
  page: number,
  pageSize = RESOURCE_VIEW_PAGE_SIZE,
): PaginatedResourcesResult {
  const safePageSize = Math.max(1, pageSize)
  const totalItems = items.length
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize))
  const currentPage = Math.min(Math.max(1, page), totalPages)
  const start = (currentPage - 1) * safePageSize
  const pagedItems = items.slice(start, start + safePageSize)
  return {
    items: pagedItems,
    totalItems,
    totalPages,
    currentPage,
  }
}
