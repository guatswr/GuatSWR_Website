/**
 * History timeline helpers, ported from the archived `History.vue`.
 *
 * The archived page derived a month key from the free-form `date` string, drew
 * a fixed month rail, and used both an `IntersectionObserver` and a scroll
 * handler to highlight the month currently in view. The pure parts live here;
 * the observer/scroll lifecycle lives in the page.
 */

/** `YYYY-MM` from the archived `getMonthKey`, or `''` when unparseable. */
export function monthKey(dateText: string | null | undefined): string {
  if (!dateText || typeof dateText !== 'string') return ''
  const matched = dateText.match(/(\d{4})[-/年.](\d{1,2})/)
  if (matched) {
    const year = matched[1] ?? ''
    const month = matched[2] ?? ''
    return `${year}-${month.padStart(2, '0')}`
  }
  const parts = dateText.split(/\s|\//)
  return parts[0] ?? ''
}

export interface MonthRailItem {
  readonly month: string
  readonly index: number
}

/** One rail dot per distinct month, pointing at the first entry of that month. */
export function monthItems(entries: readonly { readonly date: string }[]): MonthRailItem[] {
  const seen = new Map<string, number>()
  entries.forEach((entry, index) => {
    const key = monthKey(entry.date)
    if (!key || seen.has(key)) return
    seen.set(key, index)
  })
  return [...seen.entries()].map(([month, index]) => ({ month, index }))
}

/** Archived rail height: 14px dots, 8px gaps, 24px padding, at least 96px. */
export function monthRailHeight(count: number): number {
  if (count <= 0) return 0
  const dotSize = 14
  const gap = 8
  const padding = 24
  return Math.max(count * dotSize + (count - 1) * gap + padding, 96)
}

/** Stable anchor id for an entry, usable before hydration. */
export function historyAnchor(index: number): string {
  return `history-${index}`
}
