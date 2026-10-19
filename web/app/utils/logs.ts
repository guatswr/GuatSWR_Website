/**
 * `/logs` helpers, ported from the archived `Logs.vue`.
 *
 * Date handling is deliberately explicit: activity log timestamps are shown in
 * China Standard Time (UTC+8, no DST since 1991) and chart buckets are derived
 * in UTC. Both are pure arithmetic rather than `toLocaleString`/local-time
 * `Date` getters so the server and the browser always produce byte-identical
 * markup during hydration.
 */
import { beijingParts, formatBeijingDateTime } from './beijing-time'
import { displayImageSource } from './public-image'

/** Archived range selector. */
export interface LogRangeOption {
  readonly key: string
  readonly label: string
  readonly days: number | null
  readonly unit: 'day' | 'month'
}

export const LOG_RANGE_OPTIONS: readonly LogRangeOption[] = Object.freeze([
  { key: '7d', label: '近7天', days: 7, unit: 'day' },
  { key: '30d', label: '近30天', days: 30, unit: 'day' },
  { key: '1y', label: '近1年', days: 365, unit: 'month' },
  { key: 'all', label: '全部', days: null, unit: 'month' },
])

export const LOG_ACTIONS: readonly string[] = Object.freeze([
  'LOGIN', 'UPLOAD', 'CREATE_ACTIVITY', 'UPDATE_ACTIVITY', 'DELETE_ACTIVITY',
  'CREATE_MEMBER', 'UPDATE_MEMBER', 'DELETE_MEMBER',
  'CREATE_HISTORY', 'UPDATE_HISTORY', 'DELETE_HISTORY',
  'UPDATE_CONFIG', 'CREATE_USER', 'DELETE_USER', 'RESET_PWD',
  'UPDATE_PROFILE',
])

export interface UmamiWindow {
  readonly startAt: number
  readonly endAt: number
  readonly unit: 'day' | 'month'
  readonly label: string
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Archived `getRangeConfig`, with the clock supplied by the caller. */
export function logRangeWindow(rangeKey: string, now: number): UmamiWindow {
  const option = LOG_RANGE_OPTIONS.find(entry => entry.key === rangeKey) ?? LOG_RANGE_OPTIONS[0]
  if (!option) return { startAt: 0, endAt: now, unit: 'day', label: '近7天' }
  return {
    startAt: option.days ? now - option.days * DAY_MS : 0,
    endAt: now,
    unit: option.unit,
    label: option.label,
  }
}

/** SQLite `CURRENT_TIMESTAMP` / legacy admin values: wall clock, no offset. */
const SQLITE_WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/

/**
 * Archived `formatTime`: `toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })`.
 *
 * Timestamps arrive in two shapes:
 * - SQLite `CURRENT_TIMESTAMP` values (`YYYY-MM-DD HH:MM:SS`, no offset). The
 *   archived browser parsed these as local time and printed the digits
 *   unchanged, so they are printed unchanged here too - this keeps the server
 *   and every browser in agreement instead of shifting by the host's zone.
 * - Offset-qualified ISO strings (`...+08:00`, `...Z`), which are real instants
 *   and are rendered in China Standard Time.
 */
export function formatLogTime(isoString: string | null | undefined): string {
  if (!isoString) return '-'
  const wallClock = SQLITE_WALL_CLOCK.exec(isoString.trim())
  if (wallClock) {
    const [, year, month, day, hour, minute] = wallClock
    return `${year}年${Number(month)}月${Number(day)}日 ${hour}:${minute}`
  }
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return '-'
  return formatBeijingDateTime(date)
}

/** Archived `formatChartDate`, with a deterministic Beijing fallback. */
export function formatChartDate(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split('-')
    return `${year}年${Number(month)}月`
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-')
    return `${year}年${Number(month)}月${Number(day)}日`
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const parts = beijingParts(date)
  return `${parts.month}月${parts.day}日`
}

export function actionStyleClass(action: string): string {
  if (action.includes('DELETE') || action.includes('RESET')) {
    return 'bg-red-50 text-red-600 border-red-100'
  }
  if (action.includes('CREATE') || action.includes('UPLOAD')) {
    return 'bg-emerald-50 text-emerald-600 border-emerald-100'
  }
  if (action.includes('UPDATE')) return 'bg-blue-50 text-blue-600 border-blue-100'
  if (action.includes('LOGIN')) return 'bg-purple-50 text-purple-600 border-purple-100'
  return 'bg-gray-50 text-gray-600 border-gray-200'
}

export function formatAction(action: string): string {
  return action.replace(/_/g, ' ')
}

export function formatNumber(value: number | string | null | undefined): string {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric)) return '0'
  if (numeric >= 1_000_000) return `${(numeric / 1_000_000).toFixed(1)}M`
  if (numeric >= 1_000) return `${(numeric / 1_000).toFixed(1)}K`
  return String(numeric)
}

export function formatDuration(seconds: number | string | null | undefined): string {
  const total = Math.max(0, Math.round(Number(seconds || 0)))
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return minutes <= 0 ? `${rest}s` : `${minutes}m ${rest}s`
}

export interface UmamiSummary {
  readonly pageviews?: number
  readonly visitors?: number
  readonly visits?: number
  readonly bounces?: number
  readonly totaltime?: number
}

export function bounceRate(summary: UmamiSummary | null | undefined): string {
  const visitors = Number(summary?.visitors || 0)
  if (!visitors) return '0%'
  return `${Math.round((Number(summary?.bounces || 0) / visitors) * 100)}%`
}

export function averageDuration(summary: UmamiSummary | null | undefined): string {
  const visitors = Number(summary?.visitors || 0)
  if (!visitors) return '0s'
  return formatDuration(Number(summary?.totaltime || 0) / visitors)
}

export interface UmamiSeriesPoint {
  readonly x?: string | number
  readonly y?: number
}

export interface LogChartDatum {
  readonly date: string | number
  readonly pageviews: number
  readonly visitors: number
}

const parseDateSafe = (value: string | number | null | undefined): Date | null => {
  if (value === null || value === undefined || value === '') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const toDayKey = (date: Date): string => date.toISOString().slice(0, 10)

/** UTC month key (the archived code used the process time zone). */
const toMonthKey = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`

const buildSeriesMap = (
  series: readonly UmamiSeriesPoint[],
  unit: 'day' | 'month',
): Map<string, number> => {
  const map = new Map<string, number>()
  for (const item of series) {
    const date = parseDateSafe(item.x)
    if (!date) continue
    map.set(unit === 'month' ? toMonthKey(date) : toDayKey(date), Number(item.y ?? 0))
  }
  return map
}

const getSeriesMinDate = (series: readonly UmamiSeriesPoint[]): Date | null => {
  let min: Date | null = null
  for (const item of series) {
    const date = parseDateSafe(item.x)
    if (!date) continue
    if (!min || date < min) min = date
  }
  return min
}

const buildDateKeys = (startDate: Date, endDate: Date, unit: 'day' | 'month'): string[] => {
  const keys: string[] = []
  const cursor = new Date(startDate)
  if (unit === 'month') {
    cursor.setUTCDate(1)
    const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1))
    while (cursor <= end) {
      keys.push(toMonthKey(cursor))
      cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    }
    return keys
  }
  const end = new Date(endDate)
  while (cursor <= end) {
    keys.push(toDayKey(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return keys
}

const buildChartDataByRange = (
  unit: 'day' | 'month',
  startDate: Date,
  endDate: Date,
  pageviews: readonly UmamiSeriesPoint[],
  visitors: readonly UmamiSeriesPoint[],
): LogChartDatum[] => {
  const pageviewMap = buildSeriesMap(pageviews, unit)
  const visitorMap = buildSeriesMap(visitors, unit)
  return buildDateKeys(startDate, endDate, unit).map(key => ({
    date: key,
    pageviews: pageviewMap.get(key) ?? 0,
    visitors: visitorMap.get(key) ?? 0,
  }))
}

/**
 * Archived `chartData`: 30-day and 1-year ranges are re-bucketed into a dense
 * calendar axis; all other ranges use the raw series length.
 */
export function buildLogChart(input: {
  readonly rangeKey: string
  readonly endAt: number
  readonly pageviews: readonly UmamiSeriesPoint[]
  readonly visitors: readonly UmamiSeriesPoint[]
}): LogChartDatum[] {
  const { pageviews, visitors, rangeKey } = input
  const endAt = new Date(input.endAt)
  const minDate = getSeriesMinDate([...pageviews, ...visitors])

  if (rangeKey === '30d') {
    const desiredStart = new Date(endAt)
    desiredStart.setUTCDate(desiredStart.getUTCDate() - 29)
    const actualStart = minDate && minDate > desiredStart ? minDate : desiredStart
    return buildChartDataByRange('day', actualStart, endAt, pageviews, visitors)
  }

  if (rangeKey === '1y') {
    const desiredStart = new Date(Date.UTC(endAt.getUTCFullYear(), endAt.getUTCMonth() - 11, 1))
    const minMonth = minDate
      ? new Date(Date.UTC(minDate.getUTCFullYear(), minDate.getUTCMonth(), 1))
      : null
    const actualStart = minMonth && minMonth > desiredStart ? minMonth : desiredStart
    const endMonth = new Date(Date.UTC(endAt.getUTCFullYear(), endAt.getUTCMonth(), 1))
    return buildChartDataByRange('month', actualStart, endMonth, pageviews, visitors)
  }

  const length = Math.max(pageviews.length, visitors.length)
  return Array.from({ length }, (_, index) => {
    const pageview = pageviews[index]
    const visitor = visitors[index]
    return {
      date: pageview?.x || visitor?.x || '',
      pageviews: Number(pageview?.y ?? 0),
      visitors: Number(visitor?.y ?? 0),
    }
  })
}

export const LOG_CHART = Object.freeze({ width: 600, height: 160, padding: 22 })

export interface ChartPoint {
  readonly x: number
  readonly y: number
  readonly value: number
}

export function chartMaximum(data: readonly LogChartDatum[]): number {
  if (data.length === 0) return 1
  const values = data.flatMap(item => [item.pageviews, item.visitors])
  return Math.max(...values, 1)
}

export function buildPoints(
  values: readonly number[],
  maximum: number,
  config: { width: number, height: number, padding: number } = LOG_CHART,
): ChartPoint[] {
  if (values.length === 0) return []
  const xStep = values.length > 1 ? (config.width - config.padding * 2) / (values.length - 1) : 0
  return values.map((value, index) => {
    const x = config.padding + xStep * index
    const ratio = value / (maximum || 1)
    const y = config.height - config.padding - ratio * (config.height - config.padding * 2)
    return { x, y, value }
  })
}

/** Archived Catmull-Rom smoothing, unchanged. */
export function buildSmoothPath(points: readonly ChartPoint[]): string {
  const first = points[0]
  if (!first) return ''
  if (points.length === 1) return `M ${first.x} ${first.y}`
  let path = `M ${first.x} ${first.y}`
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index]
    const p1 = points[index]
    const p2 = points[index + 1]
    const p3 = points[index + 2] ?? p2
    if (!p0 || !p1 || !p2 || !p3) continue
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  }
  return path
}

export interface UmamiTopEntry extends UmamiSeriesPoint {
  readonly url?: string
  readonly pathname?: string
}

export const topEntryPath = (entry: UmamiTopEntry | null | undefined): string =>
  String(entry?.x || entry?.url || entry?.pathname || '')

/**
 * A `Map`, not an object: Umami page paths are untrusted input, and
 * `ROUTE_TITLES['constructor']` on an object literal would return an inherited
 * function instead of falling through to the path itself.
 */
const ROUTE_TITLES: ReadonlyMap<string, string> = new Map([
  ['/', '首页'],
  ['/activities', '记忆碎片'],
  ['/members', '绯想天住民'],
  ['/history', '绯想天群史'],
  ['/social', '博丽大结界'],
  ['/join', '加入我们'],
  ['/logs', '站点日志'],
  ['/login', '登录'],
  ['/events', '异变进行时'],
])

/** Archived `getPageTitle`. */
export function pageTitle(path: string | null | undefined): string {
  if (!path) return '未知页面'
  const known = ROUTE_TITLES.get(path)
  if (known) return known
  if (path.startsWith('/activity/')) return '活动详情'
  if (path.startsWith('/events/')) return '异变进行时'
  if (path.startsWith('/admin')) return '后台页面'
  return path
}

interface EnvironmentIcon {
  readonly keywords: readonly string[]
  /** File in `public/icons/env` (see `SOURCES.md` for source and licence). */
  readonly file: string
}

/**
 * Archived keyword-to-icon tables, re-pointed at the pinned local copies.
 *
 * The archived page loaded these marks from `cdn.simpleicons.org`; the
 * deployment CSP is `img-src 'self' data:`, so they are self-hosted instead.
 * Nine of the archived URLs (Microsoft Edge/Windows/Internet Explorer,
 * Chromium, Yandex, UC, 360, ChromeOS, `devices`) now answer 404 upstream;
 * those rows use a locally authored generic mark or the closest available
 * brand, exactly as documented in `public/icons/env/SOURCES.md`. No runtime
 * proxy and no external origin is involved.
 */
const ENVIRONMENT_ICONS: Readonly<Record<string, readonly EnvironmentIcon[]>> = Object.freeze({
  browser: [
    { keywords: ['chrome', 'google chrome'], file: 'googlechrome-4285f4.svg' },
    { keywords: ['edge', 'edge (chromium)', 'edg'], file: 'generic-browser-64748b.svg' },
    { keywords: ['firefox', 'mozilla'], file: 'firefox-ff7139.svg' },
    { keywords: ['safari'], file: 'safari-2563eb.svg' },
    { keywords: ['opera'], file: 'opera-ff1b2d.svg' },
    { keywords: ['brave'], file: 'brave-f97316.svg' },
    { keywords: ['chromium'], file: 'googlechrome-4285f4.svg' },
    { keywords: ['yandex'], file: 'generic-browser-64748b.svg' },
    { keywords: ['uc'], file: 'generic-browser-64748b.svg' },
    { keywords: ['qq'], file: 'qq-12b7f5.svg' },
    { keywords: ['360', 'qihoo', '360 secure'], file: 'generic-browser-64748b.svg' },
  ],
  os: [
    { keywords: ['windows 11', 'windows 10', 'windows', 'win', 'winodws 10/11'], file: 'generic-desktop-64748b.svg' },
    { keywords: ['mac', 'macos', 'os x'], file: 'apple-111827.svg' },
    { keywords: ['ios', 'iphone', 'ipad'], file: 'apple-6b7280.svg' },
    { keywords: ['android'], file: 'android-22c55e.svg' },
    { keywords: ['linux', 'ubuntu', 'debian', 'centos', 'arch'], file: 'linux-7c3aed.svg' },
    { keywords: ['chrome os', 'chromeos'], file: 'googlechrome-4285f4.svg' },
  ],
  device: [
    { keywords: ['desktop', 'pc', 'laptop', 'computer'], file: 'generic-desktop-64748b.svg' },
    { keywords: ['mobile', 'phone', 'smartphone'], file: 'android-22c55e.svg' },
    { keywords: ['tablet', 'ipad'], file: 'apple-6b7280.svg' },
    { keywords: ['bot', 'spider', 'crawler'], file: 'robotframework-0ea5e9.svg' },
  ],
})

const ENVIRONMENT_FALLBACKS: Readonly<Record<string, string>> = Object.freeze({
  browser: 'generic-browser-64748b.svg',
  os: 'gnome-64748b.svg',
  device: 'generic-device-64748b.svg',
})

const ENVIRONMENT_ICON_ROOT = '/icons/env'

/** Local icon for the environment row, or `null` when none is available. */
export function environmentIconUrl(value: string | null | undefined, type: string): string | null {
  const key = String(value || '').toLowerCase()
  // Own-property lookups only: `type` must never resolve an inherited member.
  const list = Object.hasOwn(ENVIRONMENT_ICONS, type) ? ENVIRONMENT_ICONS[type] ?? [] : []
  const matched = key
    ? list.find(item => item.keywords.some(keyword => key.includes(keyword)))
    : undefined
  const fallback = Object.hasOwn(ENVIRONMENT_FALLBACKS, type)
    ? ENVIRONMENT_FALLBACKS[type]
    : ENVIRONMENT_FALLBACKS.device
  const file = matched?.file ?? fallback
  return displayImageSource(file ? `${ENVIRONMENT_ICON_ROOT}/${file}` : '')
}
