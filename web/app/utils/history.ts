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

/** Independent 44px links, 4px gaps, 12px padding and two 1px borders. */
export function monthRailHeight(count: number): number {
  if (count <= 0) return 0
  return count * 44 + (count - 1) * 4 + 14
}

/** Stable anchor id for an entry, usable before hydration. */
export function historyAnchor(index: number): string {
  return `history-${index}`
}

/** 4-digit year string (`YYYY`) extracted from a history date, or `''`. */
export function yearKey(dateText: string | null | undefined): string {
  if (!dateText || typeof dateText !== 'string') return ''
  const matched = dateText.match(/(\d{4})/)
  return matched?.[1] ?? ''
}

export interface YearMonthItem {
  readonly month: string
  readonly label: string
  readonly index: number
}

export interface YearChapterItem {
  readonly year: string
  readonly index: number
  readonly count: number
  readonly months: readonly YearMonthItem[]
}

/** Distinct year chapters with their first entry index, entry count, and months. */
export function yearItems(entries: readonly { readonly date: string }[]): YearChapterItem[] {
  const chapters = new Map<string, { index: number, count: number, months: Map<string, YearMonthItem> }>()
  entries.forEach((entry, index) => {
    const year = yearKey(entry.date)
    if (!year) return
    let chapter = chapters.get(year)
    if (!chapter) {
      chapter = { index, count: 0, months: new Map() }
      chapters.set(year, chapter)
    }
    chapter.count += 1
    const mKey = monthKey(entry.date)
    if (mKey && mKey.startsWith(`${year}-`) && !chapter.months.has(mKey)) {
      const monthPart = mKey.slice(5)
      chapter.months.set(mKey, {
        month: mKey,
        label: `${monthPart}月`,
        index,
      })
    }
  })
  return [...chapters.entries()].map(([year, meta]) => ({
    year,
    index: meta.index,
    count: meta.count,
    months: [...meta.months.values()],
  }))
}

export function formatHistoryOrdinal(index: number): string {
  return String(Math.max(1, index + 1)).padStart(2, '0')
}
