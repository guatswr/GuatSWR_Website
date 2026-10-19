/**
 * Port of the archived club date rules (`frontend/src/utils/community.js`).
 *
 * `datetime-local` values are authored in Beijing time, regardless of the
 * visitor's browser timezone. Explicit offsets from older content stay intact,
 * and free-form legacy text is never parsed with a browser-specific locale.
 */

export interface ClubDateFormatOptions {
  year?: boolean
  weekday?: boolean
  fallback?: string
}

const UNKNOWN_DATE = '时间待确认'

export function parseClubTime(value: unknown): number {
  if (value instanceof Date) return value.getTime()
  if (typeof value !== 'string' || !value.trim()) return NaN
  const text = value.trim()
  const localIso =
    /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?))?$/.exec(
      text
    )
  if (localIso) return Date.parse(`${localIso[1]}T${localIso[2] || '00:00'}+08:00`)
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? Date.parse(text) : NaN
}

export function formatClubDate(
  value: unknown,
  options: ClubDateFormatOptions = {}
): string {
  if (!value) return options.fallback ?? UNKNOWN_DATE
  const date = new Date(parseClubTime(value))
  if (Number.isNaN(date.getTime())) return options.fallback ?? UNKNOWN_DATE
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    ...(options.year ? { year: 'numeric' } : {}),
    month: 'long',
    day: 'numeric'
  })
  const text = formatter.format(date)
  if (!options.weekday) return text
  return `${text} · ${new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    weekday: 'short'
  }).format(date)}`
}

/** Homepage archive cards show the year and fall back to the stored value. */
export const formatArchiveDate = (value: string): string =>
  formatClubDate(value, { year: true, fallback: value })
