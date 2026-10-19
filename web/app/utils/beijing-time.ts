/**
 * China Standard Time formatting without locale data.
 *
 * The deployment and the archived site both treat Beijing time as UTC+8 (the
 * zone has had no DST since 1991). Doing the arithmetic explicitly keeps the
 * server render and the browser hydration byte-identical, which `Intl` output
 * across two ICU builds does not guarantee.
 */
export const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000

export interface BeijingParts {
  readonly year: number
  readonly month: number
  readonly day: number
  readonly hour: number
  readonly minute: number
}

export function beijingParts(date: Date): BeijingParts {
  const shifted = new Date(date.getTime() + BEIJING_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  }
}

/** `YYYY-MM-DD` for the given instant in Beijing time. */
export function beijingDateString(value: Date | number): string {
  const date = typeof value === 'number' ? new Date(value) : value
  const parts = beijingParts(date)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

/** `2026年9月20日 12:05`, matching the archived `zh-CN` short format. */
export function formatBeijingDateTime(date: Date): string {
  const parts = beijingParts(date)
  const hour = String(parts.hour).padStart(2, '0')
  const minute = String(parts.minute).padStart(2, '0')
  return `${parts.year}年${parts.month}月${parts.day}日 ${hour}:${minute}`
}
