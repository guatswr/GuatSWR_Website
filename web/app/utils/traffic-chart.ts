import type { LogChartUnit } from './logs'

export const TRAFFIC_PLOT = Object.freeze({ width: 1000, height: 280, padding: 12 })

export function trafficScale(maximum: number) {
  const value = Number.isFinite(maximum) ? Math.max(1, maximum) : 1
  const rough = value / 4
  const power = 10 ** Math.floor(Math.log10(rough))
  const step = Math.max(1, ([1, 2, 5, 10].find(factor => factor * power >= rough) ?? 10) * power)
  const max = Math.ceil(value / step) * step
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, index) => max - index * step)
  return { max, ticks }
}

export function trafficIndex(position: number, count: number): number {
  const usable = (position * TRAFFIC_PLOT.width - TRAFFIC_PLOT.padding) / (TRAFFIC_PLOT.width - 2 * TRAFFIC_PLOT.padding)
  return Math.max(0, Math.min(count - 1, Math.round(usable * (count - 1))))
}

export function trafficTicks(count: number, labels = 5): number[] {
  if (count <= 0) return []
  return [...new Set(Array.from({ length: Math.min(count, labels) }, (_, index) => Math.round(index * (count - 1) / Math.max(1, Math.min(count, labels) - 1))))]
}

/** Bucket labels are already in the timezone requested from Umami. */
export function trafficDate(value: string | number, unit: LogChartUnit, full = false): string {
  const text = String(value)
  if (unit === 'year' && /^\d{4}$/.test(text)) return `${text}年`
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?(?:T(\d{2}))?/.exec(text)
  if (!match) return text
  const [, year, month, day, hour] = match
  if (unit === 'year') return `${year}年`
  if (unit === 'month') return `${year}年${Number(month)}月`
  const date = `${Number(month)}/${Number(day)}`
  return unit === 'hour'
    ? `${full ? year + '/' : ''}${date} ${hour ?? '00'}:00${full ? '–' + (String(Number(hour ?? 0) + 1).padStart(2, '0')) + ':00' : ''}`
    : `${full ? year + '/' : ''}${date}`
}
