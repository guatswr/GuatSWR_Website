/**
 * Shared contracts, currency/traffic/billing calculators, and IP-redaction
 * sanitizers for `/servers` (桂航绯想天 · 服务器监控 / 河童重工节点观测).
 *
 * All calculations match the Komari Glass theme formulas while strictly
 * stripping any IPv4/IPv6 addresses or private credentials before data leaves
 * the server adapter.
 */

export type ServerOsKey =
  | 'ubuntu'
  | 'debian'
  | 'centos'
  | 'alpine'
  | 'arch'
  | 'windows'
  | 'macos'
  | 'linux'

export type ServerBarStatus = 'success' | 'info' | 'warning' | 'error'

export type ServerSignalLevel = 'empty' | '1' | '2' | '3' | '4' | '5'

export interface PublicServerPingBar {
  readonly key: string
  readonly level: ServerSignalLevel
  readonly tooltip: string
}

export interface PublicServerPingSummary {
  readonly latencyDisplay: string
  readonly lossDisplay: string
  readonly latencyBars: readonly PublicServerPingBar[]
  readonly lossBars: readonly PublicServerPingBar[]
}

export interface PublicServerNode {
  readonly id: string
  readonly name: string
  readonly online: boolean
  readonly region: string
  readonly countryCode: string
  readonly countryName: string
  readonly os: string
  readonly osKey: ServerOsKey
  readonly osLabel: string
  readonly cpuName: string
  readonly cpuCores: number
  readonly arch: string
  readonly virtualization: string
  readonly weight: number
  readonly uptime: number
  readonly uptimeDays: number
  readonly cpuUsage: number
  readonly cpuPercentText: string
  readonly cpuStatus: ServerBarStatus
  readonly loadText: string
  readonly ramUsed: number
  readonly ramTotal: number
  readonly ramPercent: number
  readonly ramPercentText: string
  readonly ramStatus: ServerBarStatus
  readonly ramSubText: string
  readonly diskUsed: number
  readonly diskTotal: number
  readonly diskPercent: number
  readonly diskPercentText: string
  readonly diskStatus: ServerBarStatus
  readonly diskSubText: string
  readonly trafficUsed: number
  readonly trafficLimit: number
  readonly trafficLimitType: string
  readonly trafficHasLimit: boolean
  readonly trafficPercent: number
  readonly trafficValueText: string
  readonly trafficStatus: ServerBarStatus
  readonly trafficSubText: string
  readonly speedUp: number
  readonly speedDown: number
  readonly speedUpText: string
  readonly speedDownText: string
  readonly netTotalUp: number
  readonly netTotalDown: number
  readonly netTotalUpText: string
  readonly netTotalDownText: string
  readonly price: number
  readonly billingCycle: number
  readonly currency: string
  readonly billingLabel: string
  readonly remainingDaysLabel: string
  readonly remainingValueLabel: string
  readonly updatedAt: string
  readonly ping: PublicServerPingSummary
}

export interface PublicServersOverview {
  readonly online: number
  readonly total: number
  readonly offline: number
  readonly statusText: string
  readonly totalValue: number
  readonly totalValueText: string
  readonly remainingValue: number
  readonly remainingValueText: string
  readonly currencySymbol: string
  readonly paidCount: number
  readonly trafficUp: number
  readonly trafficDown: number
  readonly trafficTotal: number
  readonly trafficTotalValue: string
  readonly trafficTotalUnit: string
  readonly trafficUpText: string
  readonly trafficDownText: string
  readonly speedUp: number
  readonly speedDown: number
  readonly speedTotal: number
  readonly speedTotalText: string
  readonly speedUpText: string
  readonly speedDownText: string
}

export interface PublicServersResponse {
  readonly siteName: string
  readonly updatedAt: string
  readonly source: 'komari' | 'mock'
  readonly overview: PublicServersOverview
  readonly nodes: readonly PublicServerNode[]
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const

export function formatServerBytes(bytes: number, decimals = 2): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1)
  return `${(bytes / 1024 ** idx).toFixed(decimals)} ${BYTE_UNITS[idx]}`
}

export function splitServerBytes(bytes: number, decimals = 2): { value: string; unit: string } {
  if (!Number.isFinite(bytes) || bytes <= 0) return { value: '0', unit: 'B' }
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1)
  return {
    value: (bytes / 1024 ** idx).toFixed(decimals),
    unit: BYTE_UNITS[idx] ?? 'B',
  }
}

export function formatServerSpeed(bytesPerSecond: number, decimals = 2): string {
  return `${formatServerBytes(bytesPerSecond, decimals)}/s`
}

export function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

export function computeRatioPercent(used: number, total: number): number {
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0 || used <= 0) return 0
  return clampPercentage((used / total) * 100)
}

export function barStatusForPercent(percent: number): ServerBarStatus {
  if (percent >= 80) return 'error'
  if (percent >= 60) return 'warning'
  return 'success'
}

export function computeTrafficUsed(up: number, down: number, type = 'max'): number {
  const safeUp = Number.isFinite(up) && up > 0 ? up : 0
  const safeDown = Number.isFinite(down) && down > 0 ? down : 0
  switch (type) {
    case 'sum':
      return safeUp + safeDown
    case 'min':
      return Math.min(safeUp, safeDown)
    case 'up':
      return safeUp
    case 'down':
      return safeDown
    default:
      return Math.max(safeUp, safeDown)
  }
}

export type CurrencyCode =
  | 'CNY'
  | 'USD'
  | 'HKD'
  | 'EUR'
  | 'GBP'
  | 'JPY'
  | 'RUB'
  | 'CHF'
  | 'INR'
  | 'VND'
  | 'THB'
  | 'CAD'

export const DEFAULT_EXCHANGE_RATES: Readonly<Record<CurrencyCode, number>> = Object.freeze({
  CNY: 1,
  USD: 0.149611,
  HKD: 1.156363,
  EUR: 0.129687,
  GBP: 0.110762,
  JPY: 24.162212,
  RUB: 11.560694,
  CHF: 0.120661,
  INR: 14.248668,
  VND: 3875.968992,
  THB: 4.97107,
  CAD: 0.207712,
})

const CURRENCY_SYMBOLS: Readonly<Record<CurrencyCode, string>> = Object.freeze({
  CNY: '¥',
  USD: '$',
  HKD: 'HK$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  RUB: '₽',
  CHF: '₣',
  INR: '₹',
  VND: '₫',
  THB: '฿',
  CAD: 'CA$',
})

const CURRENCY_ALIASES: Readonly<Record<string, CurrencyCode>> = Object.freeze({
  CNY: 'CNY',
  RMB: 'CNY',
  '¥': 'CNY',
  '￥': 'CNY',
  USD: 'USD',
  $: 'USD',
  HKD: 'HKD',
  HK$: 'HKD',
  EUR: 'EUR',
  '€': 'EUR',
  GBP: 'GBP',
  '£': 'GBP',
  JPY: 'JPY',
  RUB: 'RUB',
  '₽': 'RUB',
  CHF: 'CHF',
  '₣': 'CHF',
  INR: 'INR',
  '₹': 'INR',
  VND: 'VND',
  '₫': 'VND',
  THB: 'THB',
  '฿': 'THB',
  CAD: 'CAD',
  CA$: 'CAD',
  C$: 'CAD',
  CAD$: 'CAD',
})

export function resolveCurrencyCode(raw: string | null | undefined): CurrencyCode | 'OTHER' {
  const key = String(raw || 'CNY').trim().toUpperCase()
  return Object.hasOwn(CURRENCY_ALIASES, key) ? CURRENCY_ALIASES[key]! : 'OTHER'
}

export function formatCurrencySymbol(raw: string | null | undefined = '¥'): string {
  const trimmed = String(raw || '¥').trim()
  const code = resolveCurrencyCode(trimmed)
  return code === 'OTHER' ? (trimmed || '¥') : CURRENCY_SYMBOLS[code]
}

export function formatCurrencyAmount(amount: number, currency: string | null | undefined = '¥'): string {
  const safe = Number.isFinite(amount) ? amount : 0
  const formatted = (Math.round(safe * 100) / 100).toFixed(2).replace(/\.?0+$/, '')
  return `${formatCurrencySymbol(currency)}${formatted || '0'}`
}

export function convertCurrency(
  amount: number,
  fromCurrency: string | null | undefined,
  toCurrency: CurrencyCode = 'CNY',
  rates: Readonly<Record<CurrencyCode, number>> = DEFAULT_EXCHANGE_RATES,
): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  const code = resolveCurrencyCode(fromCurrency)
  if (code === 'OTHER') return 0
  const fromRate = rates[code]
  const toRate = rates[toCurrency]
  if (!fromRate || !toRate) return 0
  return (amount / fromRate) * toRate
}

const BILLING_CYCLE_RANGES = [
  { label: '月', min: 27, max: 32 },
  { label: '季', min: 87, max: 95 },
  { label: '半年', min: 175, max: 185 },
  { label: '年', min: 360, max: 370 },
  { label: '两年', min: 720, max: 750 },
  { label: '三年', min: 1080, max: 1150 },
  { label: '五年', min: 1800, max: 1850 },
] as const

export function formatBillingCycleLabel(cycleDays: number): string {
  if (cycleDays === -1) return '一次'
  for (const range of BILLING_CYCLE_RANGES) {
    if (cycleDays >= range.min && cycleDays <= range.max) return range.label
  }
  return '周期'
}

export function formatNodeBillingLabel(
  price: number,
  billingCycle: number,
  currency: string | null | undefined = '¥',
): string {
  if (price === -1) return '免费'
  if (!Number.isFinite(price) || price <= 0) return ''
  return `${formatCurrencySymbol(currency)}${price} / ${formatBillingCycleLabel(billingCycle)}`
}

export type ExpiryState = 'unknown' | 'expired' | 'long_term' | 'normal'

export function evaluateExpiry(
  expiredAt: string | number | null | undefined,
  nowMs: number,
): { state: ExpiryState; daysLeft: number } {
  if (expiredAt === null || expiredAt === undefined || expiredAt === '') {
    return { state: 'unknown', daysLeft: 0 }
  }
  const targetMs = typeof expiredAt === 'number' ? expiredAt : Date.parse(String(expiredAt))
  if (!Number.isFinite(targetMs)) {
    return { state: 'unknown', daysLeft: 0 }
  }
  const diffMs = targetMs - nowMs
  const daysLeft = diffMs <= 0 ? Math.floor(diffMs / 86_400_000) : Math.ceil(diffMs / 86_400_000)
  if (diffMs <= 0) return { state: 'expired', daysLeft }
  if (daysLeft > 36_500) return { state: 'long_term', daysLeft }
  return { state: 'normal', daysLeft }
}

export function computeRemainingValue(
  price: number,
  billingCycle: number,
  expiredAt: string | number | null | undefined,
  nowMs: number,
): number {
  if (!Number.isFinite(price) || price <= 0) return 0
  const { state, daysLeft } = evaluateExpiry(expiredAt, nowMs)
  if (state === 'unknown' || state === 'expired') return 0
  if (state === 'long_term' || billingCycle <= 0) return price
  return price * Math.min(daysLeft / billingCycle, 1)
}

export function formatRemainingDays(
  price: number,
  expiredAt: string | number | null | undefined,
  nowMs: number,
): string {
  if (price === -1) return '长期'
  if (!Number.isFinite(price) || price <= 0) return ''
  const { state, daysLeft } = evaluateExpiry(expiredAt, nowMs)
  if (state === 'expired') return '已过期'
  if (state === 'long_term') return '长期'
  if (state === 'unknown') return '未设置'
  return `${daysLeft} 天`
}

const REGION_COUNTRIES: Readonly<Record<string, { code: string; name: string }>> = Object.freeze({
  '🇨🇳': { code: 'CN', name: '中国' },
  '🇭🇰': { code: 'HK', name: '中国香港' },
  '🇲🇴': { code: 'MO', name: '中国澳门' },
  '🇹🇼': { code: 'TW', name: '中国台湾' },
  '🇺🇸': { code: 'US', name: '美国' },
  '🇯🇵': { code: 'JP', name: '日本' },
  '🇸🇬': { code: 'SG', name: '新加坡' },
  '🇰🇷': { code: 'KR', name: '韩国' },
  '🇩🇪': { code: 'DE', name: '德国' },
  '🇬🇧': { code: 'GB', name: '英国' },
  '🇫🇷': { code: 'FR', name: '法国' },
  '🇳🇱': { code: 'NL', name: '荷兰' },
  '🇨🇦': { code: 'CA', name: '加拿大' },
  '🇦🇺': { code: 'AU', name: '澳大利亚' },
  '🇷🇺': { code: 'RU', name: '俄罗斯' },
})

export function parseServerRegion(region: string | null | undefined): {
  emoji: string
  code: string
  name: string
} {
  const trimmed = String(region || '').trim()
  if (!trimmed) return { emoji: '🌐', code: 'UN', name: '未知地区' }
  if (Object.hasOwn(REGION_COUNTRIES, trimmed)) {
    const info = REGION_COUNTRIES[trimmed]!
    return { emoji: trimmed, code: info.code, name: info.name }
  }
  const codePoints = Array.from(trimmed)
  if (codePoints.length >= 2) {
    const first = codePoints[0]?.codePointAt(0) ?? 0
    const second = codePoints[1]?.codePointAt(0) ?? 0
    if (first >= 0x1f1e6 && first <= 0x1f1ff && second >= 0x1f1e6 && second <= 0x1f1ff) {
      const emoji = `${codePoints[0]}${codePoints[1]}`
      if (Object.hasOwn(REGION_COUNTRIES, emoji)) {
        const info = REGION_COUNTRIES[emoji]!
        return { emoji, code: info.code, name: info.name }
      }
      const code = String.fromCharCode(first - 0x1f1e6 + 65, second - 0x1f1e6 + 65)
      return { emoji, code, name: code }
    }
  }
  const upper = trimmed.toUpperCase()
  if (/^[A-Z]{2}$/.test(upper)) {
    for (const [emoji, info] of Object.entries(REGION_COUNTRIES)) {
      if (info.code === upper) return { emoji, code: info.code, name: info.name }
    }
    return { emoji: '🌐', code: upper, name: upper }
  }
  return { emoji: '🌐', code: 'UN', name: redactServerText(trimmed) || '未知地区' }
}

export function classifyServerOs(os: string | null | undefined): {
  key: ServerOsKey
  label: string
} {
  const lower = String(os || '').toLowerCase()
  if (lower.includes('ubuntu') || lower.includes('elementary')) return { key: 'ubuntu', label: 'Ubuntu' }
  if (lower.includes('debian') || lower.includes('armbian') || lower.includes('kali')) return { key: 'debian', label: 'Debian' }
  if (lower.includes('centos') || lower.includes('rocky') || lower.includes('alma') || lower.includes('red hat') || lower.includes('rhel')) return { key: 'centos', label: 'Enterprise Linux' }
  if (lower.includes('alpine')) return { key: 'alpine', label: 'Alpine Linux' }
  if (lower.includes('arch') || lower.includes('manjaro')) return { key: 'arch', label: 'Arch Linux' }
  if (lower.includes('windows') || lower.includes('microsoft')) return { key: 'windows', label: 'Windows' }
  if (lower.includes('macos') || lower.includes('darwin')) return { key: 'macos', label: 'macOS' }
  return { key: 'linux', label: 'Linux' }
}

export function createEmptyPingBars(count = 20, tooltip = '无采样数据'): readonly PublicServerPingBar[] {
  return Array.from({ length: count }, (_, idx) => ({
    key: `empty-${idx}`,
    level: 'empty' as const,
    tooltip,
  }))
}

export function latencySignalLevel(ms: number | null | undefined): ServerSignalLevel {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return 'empty'
  if (ms <= 60) return '1'
  if (ms <= 100) return '2'
  if (ms <= 160) return '3'
  if (ms <= 200) return '4'
  return '5'
}

export function lossSignalLevel(lossPercent: number | null | undefined): ServerSignalLevel {
  if (lossPercent === null || lossPercent === undefined || !Number.isFinite(lossPercent) || lossPercent < 0) return 'empty'
  if (lossPercent <= 1) return '1'
  if (lossPercent <= 3) return '2'
  if (lossPercent <= 6) return '3'
  if (lossPercent <= 9) return '4'
  return '5'
}

const IPV4_PATTERN = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\/\d{1,2})?\b/g
const IPV6_PATTERN = /(?:^|(?<=[\s([,;]))(?:(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}|:(?::[0-9a-fA-F]{1,4}){1,7})(?:\/\d{1,3})?(?=$|[\s)\],;])/g

/**
 * Redact any IPv4 or IPv6 literals from untrusted upstream strings so server IP
 * addresses can never leak to the browser even if placed in a node name or note.
 */
export function redactServerText(value: string | null | undefined): string {
  if (!value) return ''
  return String(value)
    .replace(IPV4_PATTERN, '[已隐藏IP]')
    .replace(IPV6_PATTERN, '[已隐藏IP]')
    .trim()
}
