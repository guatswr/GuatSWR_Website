import { describe, expect, it } from 'vitest'
import { ENVIRONMENT_TABS, formatDimensionName, formatRegion } from '../app/utils/logs'
import { parseUmamiQuery } from '../server/lib/public-read/query'

describe('province analytics', () => {
  it('accepts the region dimension end to end from the public query', () => {
    expect(parseUmamiQuery({ envType: 'region' }).envType).toBe('region')
    expect(ENVIRONMENT_TABS.some(tab => tab.key === 'region')).toBe(true)
  })
  it.each([
    ['CN-GX', '广西壮族自治区'], ['cn-45', '广西壮族自治区'],
    ['CN-BJ', '北京市'], ['CN-11', '北京市'], ['CN-SN', '陕西省'],
    ['CN-SX', '山西省'], ['US-CA', '美国 · CA'],
    ['', '省级地区未知'], ['CN-XX', '省级地区未知'], ['Guilin', '省级地区未知'],
    ['__proto__', '省级地区未知'],
  ])('formats %s without guessing a province from a city', (code, name) => {
    expect(formatRegion(code)).toBe(name)
    expect(formatDimensionName(code, 'region')).toBe(name)
  })
})
