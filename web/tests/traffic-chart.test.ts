import { describe, expect, it } from 'vitest'
import { buildLogChart, buildPoints, buildSmoothPath, logRangeWindow } from '../app/utils/logs'
import { trafficDate, trafficIndex, trafficScale, trafficTicks } from '../app/utils/traffic-chart'

describe('traffic timeline', () => {
  it('requests real hourly data for short ranges and daily data for a year', () => {
    expect(logRangeWindow('24h', 1).unit).toBe('hour')
    expect(logRangeWindow('7d', 1).unit).toBe('hour')
    expect(logRangeWindow('1y', 1).unit).toBe('day')
  })
  it('joins out-of-order series by hour and keeps zero-traffic buckets', () => {
    const rows = buildLogChart({ rangeKey: '24h', startAt: Date.parse('2026-11-04T01:30Z'), endAt: Date.parse('2026-11-04T04:30Z'), unit: 'hour',
      pageviews: [{ x: '2026-11-04T04:00:00Z', y: 4 }, { x: '2026-11-04T01:00:00Z', y: 9 }],
      visitors: [{ x: '2026-11-04T02:00:00Z', y: 2 }] })
    expect(rows.map(row => [row.pageviews, row.visitors])).toEqual([[9, 0], [0, 2], [0, 0], [4, 0]])
  })
  it('does not shift Umami Beijing wall-clock labels twice', () => {
    const rows = buildLogChart({ rangeKey: '24h', startAt: Date.parse('2026-11-04T16:00Z'), endAt: Date.parse('2026-11-04T17:00Z'), unit: 'hour', timezone: 'Asia/Shanghai',
      pageviews: [{ x: '2026-11-05T00:00:00Z', y: 7 }], visitors: [] })
    expect(rows).toEqual([{ date: '2026-11-05T00', pageviews: 7, visitors: 0 }, { date: '2026-11-05T01', pageviews: 0, visitors: 0 }])
    expect(trafficDate(rows[0]!.date, 'hour', true)).toBe('2026/11/5 00:00–01:00')
  })
  it('bounds malformed time windows and invalid counts', () => {
    const rows = buildLogChart({ rangeKey: 'all', startAt: 1, endAt: Date.now(), unit: 'hour', pageviews: [{ x: 'invalid', y: 42 }], visitors: [] })
    expect(rows.length).toBeLessThanOrEqual(1024)
    expect(rows.every(row => row.pageviews === 0)).toBe(true)
  })
  it('uses integer axis labels and clamps hit targets to the chart', () => {
    expect(trafficScale(3)).toEqual({ max: 3, ticks: [3, 2, 1, 0] })
    expect(trafficScale(0).max).toBe(1)
    expect(trafficIndex(-1, 169)).toBe(0)
    expect(trafficIndex(2, 169)).toBe(168)
    expect(trafficTicks(169)).toEqual([0, 42, 84, 126, 168])
  })
  it('keeps curve control points between their measured neighbours', () => {
    const points = buildPoints([0, 40, 0, 1, 0, 90, 0], 100)
    const paths = [...buildSmoothPath(points).matchAll(/C ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+)/g)]
    expect(paths).toHaveLength(points.length - 1)
    paths.forEach((segment, index) => {
      const low = Math.min(points[index]!.y, points[index + 1]!.y) - .01
      const high = Math.max(points[index]!.y, points[index + 1]!.y) + .01
      expect(Number(segment[2])).toBeGreaterThanOrEqual(low)
      expect(Number(segment[2])).toBeLessThanOrEqual(high)
      expect(Number(segment[4])).toBeGreaterThanOrEqual(low)
      expect(Number(segment[4])).toBeLessThanOrEqual(high)
    })
  })
})
