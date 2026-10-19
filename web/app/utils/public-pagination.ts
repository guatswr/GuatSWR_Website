/**
 * Ordinary-link pagination, ported from the archived `/activities` page.
 *
 * The archived component rendered `<button>` elements and re-fetched on click.
 * Here every enabled control is a real `<a>` (NuxtLink), so `?page=2` works on
 * a direct request with JavaScript disabled; unavailable controls render as
 * non-focusable spans with `aria-disabled`. The visible page-number sequence
 * is the archived one, including its ellipsis placement.
 */

export type PageItem = number | 'ellipsis'

/** Archived `totalPages`: at least one page, even for an empty result. */
export function totalPageCount(total: number, limit: number): number {
  if (!Number.isFinite(total) || !Number.isFinite(limit) || limit <= 0) return 1
  return Math.max(1, Math.ceil(total / limit))
}

/** Archived `pageItems` algorithm, unchanged apart from the sentinel name. */
export function pageItems(totalPages: number, currentPage: number): PageItem[] {
  if (totalPages <= 1) return [1]

  const items: PageItem[] = [1]
  let start = Math.max(2, currentPage - 1)
  let end = Math.min(totalPages - 1, currentPage + 1)

  if (currentPage <= 3) {
    start = 2
    end = Math.min(totalPages - 1, 4)
  }
  else if (currentPage >= totalPages - 2) {
    start = Math.max(2, totalPages - 3)
    end = totalPages - 1
  }

  if (start > 2) items.push('ellipsis')
  for (let page = start; page <= end; page += 1) items.push(page)
  if (end < totalPages - 1) items.push('ellipsis')
  items.push(totalPages)
  return items
}

/** Clamp a requested page to the real range; `null` when the result is empty. */
export function clampPage(requested: number, totalPages: number): number {
  if (!Number.isFinite(requested) || requested < 1) return 1
  return Math.min(requested, Math.max(1, totalPages))
}
