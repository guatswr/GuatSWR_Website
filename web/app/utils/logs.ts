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
  readonly unit: 'hour' | 'day' | 'month'
}

export const LOG_RANGE_OPTIONS: readonly LogRangeOption[] = Object.freeze([
  { key: '24h', label: '近24小时', days: 1, unit: 'hour' },
  { key: '7d', label: '近7天', days: 7, unit: 'hour' },
  { key: '30d', label: '近30天', days: 30, unit: 'day' },
  { key: '1y', label: '近1年', days: 365, unit: 'day' },
  { key: 'all', label: '全部', days: null, unit: 'day' },
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
  readonly unit: 'hour' | 'day' | 'month'
  readonly label: string
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Archived `getRangeConfig`, with the clock supplied by the caller. */
export function logRangeWindow(rangeKey: string, now: number): UmamiWindow {
  const option = LOG_RANGE_OPTIONS.find(entry => entry.key === rangeKey) ?? LOG_RANGE_OPTIONS.find(entry => entry.key === '7d')
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

export type LogChartUnit = 'hour' | 'day' | 'month' | 'year'

// Umami's timezone parameter returns wall-clock bucket labels with a Z suffix.
// Their UTC fields already represent the requested timezone: do not shift twice.
const bucketDate = (value: string | number | undefined): Date | null => {
  if (value === undefined || value === '') return null
  let normalized = value
  if (typeof value === 'string') {
    normalized = value.replace(' ', 'T')
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) normalized += 'T00:00:00Z'
    else if (/T\d{2}$/.test(normalized)) normalized += ':00:00Z'
    else if (normalized.includes('T') && !/(?:Z|[+-]\d{2}:\d{2})$/.test(normalized)) normalized += 'Z'
  }
  const date = new Date(normalized)
  return Number.isFinite(date.getTime()) ? date : null
}
const bucketKey = (date: Date, unit: LogChartUnit): string => {
  const iso = date.toISOString()
  return iso.slice(0, unit === 'hour' ? 13 : unit === 'day' ? 10 : unit === 'month' ? 7 : 4)
}
const floorBucket = (date: Date, unit: LogChartUnit): Date => {
  const value = new Date(date)
  value.setUTCMinutes(0, 0, 0)
  if (unit !== 'hour') value.setUTCHours(0)
  if (unit === 'month' || unit === 'year') value.setUTCDate(1)
  if (unit === 'year') value.setUTCMonth(0)
  return value
}
const previousBucket = (date: Date, unit: LogChartUnit): void => {
  if (unit === 'hour') date.setUTCHours(date.getUTCHours() - 1)
  else if (unit === 'day') date.setUTCDate(date.getUTCDate() - 1)
  else if (unit === 'month') date.setUTCMonth(date.getUTCMonth() - 1)
  else date.setUTCFullYear(date.getUTCFullYear() - 1)
}

/** Join series by timestamp and fill Umami's omitted zero-traffic buckets. */
export function buildLogChart(input: {
  readonly rangeKey: string
  readonly startAt?: number
  readonly endAt: number
  readonly unit?: LogChartUnit
  readonly timezone?: 'UTC' | 'Asia/Shanghai'
  readonly pageviews: readonly UmamiSeriesPoint[]
  readonly visitors: readonly UmamiSeriesPoint[]
}): LogChartDatum[] {
  if (!Number.isFinite(input.endAt) || input.endAt <= 0) return []
  const window = logRangeWindow(input.rangeKey, input.endAt)
  const unit = input.unit ?? window.unit
  const offset = input.timezone === 'Asia/Shanghai' ? 8 * 3600000 : 0
  const seriesMap = (series: readonly UmamiSeriesPoint[]) => {
    const result = new Map<string, number>()
    for (const item of series) {
      const date = bucketDate(item.x), count = Number(item.y ?? 0)
      if (date && Number.isFinite(count) && count >= 0) result.set(bucketKey(date, unit), count)
    }
    return result
  }
  const pv = seriesMap(input.pageviews), uv = seriesMap(input.visitors)
  const end = floorBucket(new Date(input.endAt + offset), unit)
  let startAt = input.startAt ?? window.startAt
  if (!startAt) {
    const dates = [...input.pageviews, ...input.visitors].map(item => bucketDate(item.x)?.getTime()).filter((value): value is number => value !== undefined)
    startAt = dates.length ? Math.min(...dates) - offset : input.endAt
  }
  const start = floorBucket(new Date(startAt + offset), unit)
  if (!Number.isFinite(start.getTime()) || start > end) return []
  const rows: LogChartDatum[] = []
  // The backend bounds hourly/daily ranges; this also bounds malformed payloads.
  for (const cursor = new Date(end); cursor >= start && rows.length < 1024; previousBucket(cursor, unit)) {
    const key = bucketKey(cursor, unit)
    rows.push({ date: key, pageviews: pv.get(key) ?? 0, visitors: uv.get(key) ?? 0 })
  }
  return rows.reverse()
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
    const x = values.length === 1 ? config.width / 2 : config.padding + xStep * index
    const ratio = value / (maximum || 1)
    const y = config.height - config.padding - ratio * (config.height - config.padding * 2)
    return { x, y, value }
  })
}

/** Monotone Hermite interpolation: curves never invent a peak or dip below zero. */
export function buildSmoothPath(points: readonly ChartPoint[]): string {
  const first = points[0]
  if (!first) return ''
  if (points.length === 1) return `M ${first.x} ${first.y}`
  const slopes = points.slice(1).map((point, index) => {
    const previous = points[index]!
    return (point.y - previous.y) / (point.x - previous.x || 1)
  })
  const tangents = points.map((_, index) => {
    if (index === 0) return slopes[0] ?? 0
    if (index === points.length - 1) return slopes[index - 1] ?? 0
    const before = slopes[index - 1] ?? 0, after = slopes[index] ?? 0
    return before * after <= 0 ? 0 : (before + after) / 2
  })
  for (let index = 0; index < slopes.length; index++) {
    const slope = slopes[index]!
    if (!slope) { tangents[index] = 0; tangents[index + 1] = 0; continue }
    const a = tangents[index]! / slope, b = tangents[index + 1]! / slope
    const length = Math.hypot(a, b)
    if (length > 3) { tangents[index] = 3 * a / length * slope; tangents[index + 1] = 3 * b / length * slope }
  }
  let path = `M ${first.x} ${first.y}`
  for (let index = 0; index < points.length - 1; index++) {
    const from = points[index]!, to = points[index + 1]!, dx = (to.x - from.x) / 3
    path += ` C ${(from.x + dx).toFixed(2)} ${(from.y + dx * tangents[index]!).toFixed(2)}, ${(to.x - dx).toFixed(2)} ${(to.y - dx * tangents[index + 1]!).toFixed(2)}, ${to.x.toFixed(2)} ${to.y.toFixed(2)}`
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
  ['/resources', '幻想乡书库'],
  ['/join', '加入我们'],
  ['/logs', '站点日志'],
  ['/servers', '服务器监控'],
  ['/login', '登录'],
  ['/events', '异变进行时'],
  ['/events/bounty', '博丽神社赏金令'],
  ['/events/betting', '博丽大竞技场 · 胜负盘'],
  ['/events/stg', '幻想乡弹幕格斗祭'],
  ['/events/zetime', '择日会 · 幻想聚首'],
])

export interface EnvironmentTabOption {
  readonly key: string
  readonly label: string
  readonly dimensionName: string
}

export const ENVIRONMENT_TABS: readonly EnvironmentTabOption[] = Object.freeze([
  { key: 'browser', label: '浏览器', dimensionName: 'Browser' },
  { key: 'os', label: '操作系统', dimensionName: 'OS' },
  { key: 'device', label: '设备形态', dimensionName: 'Device' },
  { key: 'referrer', label: '来源渠道', dimensionName: 'Referrer' },
  { key: 'country', label: '国家/地区', dimensionName: 'Country' },
  { key: 'region', label: '省份分布', dimensionName: 'Region' },
  { key: 'city', label: '城市分布', dimensionName: 'City' },
])

export interface CountryInfo {
  readonly name: string
  readonly flag: string
}

const COUNTRY_MAP: Readonly<Record<string, CountryInfo>> = Object.freeze({
  CN: { name: '中国大陆', flag: '🇨🇳' },
  HK: { name: '中国香港', flag: '🇭🇰' },
  MO: { name: '中国澳门', flag: '🇲🇴' },
  TW: { name: '中国台湾', flag: '🇹🇼' },
  US: { name: '美国', flag: '🇺🇸' },
  JP: { name: '日本', flag: '🇯🇵' },
  SG: { name: '新加坡', flag: '🇸🇬' },
  DE: { name: '德国', flag: '🇩🇪' },
  GB: { name: '英国', flag: '🇬🇧' },
  FR: { name: '法国', flag: '🇫🇷' },
  KR: { name: '韩国', flag: '🇰🇷' },
  RU: { name: '俄罗斯', flag: '🇷🇺' },
  CA: { name: '加拿大', flag: '🇨🇦' },
  AU: { name: '澳大利亚', flag: '🇦🇺' },
  MY: { name: '马来西亚', flag: '🇲🇾' },
  NL: { name: '荷兰', flag: '🇳🇱' },
  TH: { name: '泰国', flag: '🇹🇭' },
  VN: { name: '越南', flag: '🇻🇳' },
  PH: { name: '菲律宾', flag: '🇵🇭' },
  IN: { name: '印度', flag: '🇮🇳' },
  BR: { name: '巴西', flag: '🇧🇷' },
})

export function formatCountry(code: string | null | undefined): CountryInfo {
  const clean = String(code || '').trim().toUpperCase()
  if (!clean || clean === 'UNKNOWN') return { name: '未知地区', flag: '🌐' }
  const mapped = Object.hasOwn(COUNTRY_MAP, clean) ? COUNTRY_MAP[clean] : undefined
  if (mapped) return mapped
  if (/^[A-Z]{2}$/.test(clean)) {
    const flag = String.fromCodePoint(...clean.split('').map(c => 127397 + c.charCodeAt(0)))
    return { name: clean, flag }
  }
  return { name: clean, flag: '🌐' }
}

const CHINA_REGIONS = [
  ['11', 'BJ', '北京市'], ['12', 'TJ', '天津市'], ['13', 'HE', '河北省'],
  ['14', 'SX', '山西省'], ['15', 'NM', '内蒙古自治区'], ['21', 'LN', '辽宁省'],
  ['22', 'JL', '吉林省'], ['23', 'HL', '黑龙江省'], ['31', 'SH', '上海市'],
  ['32', 'JS', '江苏省'], ['33', 'ZJ', '浙江省'], ['34', 'AH', '安徽省'],
  ['35', 'FJ', '福建省'], ['36', 'JX', '江西省'], ['37', 'SD', '山东省'],
  ['41', 'HA', '河南省'], ['42', 'HB', '湖北省'], ['43', 'HN', '湖南省'],
  ['44', 'GD', '广东省'], ['45', 'GX', '广西壮族自治区'], ['46', 'HI', '海南省'],
  ['50', 'CQ', '重庆市'], ['51', 'SC', '四川省'], ['52', 'GZ', '贵州省'],
  ['53', 'YN', '云南省'], ['54', 'XZ', '西藏自治区'], ['61', 'SN', '陕西省'],
  ['62', 'GS', '甘肃省'], ['63', 'QH', '青海省'], ['64', 'NX', '宁夏回族自治区'],
  ['65', 'XJ', '新疆维吾尔自治区'], ['71', 'TW', '台湾'],
  ['81', 'HK', '香港'], ['82', 'MO', '澳门'],
] as const
const REGION_NAMES = new Map<string, string>(CHINA_REGIONS.flatMap(([code, alias, name]) => [[`CN-${code}`, name], [`CN-${alias}`, name]]))

export function formatRegion(value: string | null | undefined): string {
  const code = String(value || '').trim().toUpperCase()
  if (!code || !/^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(code)) return '省级地区未知'
  const name = REGION_NAMES.get(code)
  if (name) return name
  const country = code.slice(0, 2)
  if (country === 'CN') return '省级地区未知'
  return `${formatCountry(country).name} · ${code.slice(3)}`
}

const CITY_MAP: Readonly<Record<string, string>> = Object.freeze({
  Nanning: '南宁',
  Guilin: '桂林',
  Jincheng: '晋城',
  Beijing: '北京',
  Shanghai: '上海',
  Guangzhou: '广州',
  Shenzhen: '深圳',
  Chengdu: '成都',
  Hangzhou: '杭州',
  Wuhan: '武汉',
  "Xi'an": '西安',
  Xian: '西安',
  Chongqing: '重庆',
  Nanjing: '南京',
  Changsha: '长沙',
  Tianjin: '天津',
  Suzhou: '苏州',
  Fuzhou: '福州',
  Xiamen: '厦门',
  Hefei: '合肥',
  Kunming: '昆明',
  Tokyo: '东京',
  Osaka: '大阪',
  Kyoto: '京都',
  'Los Angeles': '洛杉矶',
  'San Jose': '圣何塞',
  'New York': '纽约',
  'San Francisco': '旧金山',
  London: '伦敦',
  Singapore: '新加坡',
  'Hong Kong': '香港',
  Taipei: '台北',
})

export function formatCity(city: string | null | undefined): string {
  const clean = String(city || '').trim()
  if (!clean || clean.toLowerCase() === 'unknown') return '未知城市'
  const mapped = Object.hasOwn(CITY_MAP, clean) ? CITY_MAP[clean] : undefined
  return mapped || clean
}

const REFERRER_MAP: Readonly<Record<string, { label: string; icon: string }>> = Object.freeze({
  '': { label: '直接访问 / 书签收藏', icon: 'direct' },
  direct: { label: '直接访问 / 书签收藏', icon: 'direct' },
  'google.com': { label: 'Google 搜索', icon: 'search' },
  'cn.bing.com': { label: '微软必应 (Bing)', icon: 'search' },
  'bing.com': { label: '微软必应 (Bing)', icon: 'search' },
  'baidu.com': { label: '百度搜索 (Baidu)', icon: 'search' },
  'tieba.baidu.com': { label: '百度贴吧', icon: 'social' },
  'icp.gov.moe': { label: '萌国ICP备案', icon: 'badge' },
  'github.com': { label: 'GitHub 仓库', icon: 'social' },
  'bilibili.com': { label: '哔哩哔哩 (Bilibili)', icon: 'video' },
  't.co': { label: 'X (Twitter)', icon: 'social' },
  'x.com': { label: 'X (Twitter)', icon: 'social' },
})

export function formatReferrer(referrer: string | null | undefined): { label: string; icon: string } {
  const clean = String(referrer || '').trim().toLowerCase()
  if (!clean || clean === 'direct' || clean === 'none') {
    return { label: '直接访问 / 书签收藏', icon: 'direct' }
  }
  for (const [key, val] of Object.entries(REFERRER_MAP)) {
    if (key && (clean === key || clean.endsWith('.' + key))) return val
  }
  return { label: clean, icon: 'link' }
}

const DEVICE_MAP: Readonly<Record<string, string>> = Object.freeze({
  mobile: '移动端 (Mobile)',
  laptop: '笔记本 (Laptop)',
  desktop: '台式机 (Desktop)',
  tablet: '平板电脑 (Tablet)',
})

const BROWSER_MAP: Readonly<Record<string, string>> = Object.freeze({
  chrome: 'Google Chrome',
  'chromium-webview': 'Android WebView / 微信内置',
  'edge-chromium': 'Microsoft Edge',
  edge: 'Microsoft Edge',
  ios: 'Mobile Safari / iOS WebKit',
  firefox: 'Mozilla Firefox',
  safari: 'Apple Safari',
  opera: 'Opera',
  brave: 'Brave',
})

const OS_MAP: Readonly<Record<string, string>> = Object.freeze({
  'android os': 'Android',
  android: 'Android',
  'windows 10': 'Windows 10 / 11',
  'windows 11': 'Windows 11',
  windows: 'Windows',
  ios: 'iOS',
  linux: 'Linux',
  'mac os': 'macOS',
  macos: 'macOS',
  'chrome os': 'ChromeOS',
})

export function formatDimensionName(value: string | null | undefined, dimension: string): string {
  const raw = String(value || '').trim()
  if (dimension === 'region') return formatRegion(raw)
  if (!raw) return dimension === 'referrer' ? '直接访问 / 书签收藏' : '未知'
  const key = raw.toLowerCase()
  if (dimension === 'device') {
    const device = Object.hasOwn(DEVICE_MAP, key) ? DEVICE_MAP[key] : undefined
    return device || raw
  }
  if (dimension === 'browser') {
    const browser = Object.hasOwn(BROWSER_MAP, key) ? BROWSER_MAP[key] : undefined
    return browser || raw
  }
  if (dimension === 'os') {
    const os = Object.hasOwn(OS_MAP, key) ? OS_MAP[key] : undefined
    return os || raw
  }
  if (dimension === 'country') {
    return formatCountry(raw).name
  }
  if (dimension === 'city') {
    return formatCity(raw)
  }
  if (dimension === 'referrer') {
    return formatReferrer(raw).label
  }
  return raw
}

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
