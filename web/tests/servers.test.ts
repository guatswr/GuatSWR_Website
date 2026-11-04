import { describe, expect, it } from 'vitest'
import {
  classifyServerOs,
  computeRemainingValue,
  formatCurrencyAmount,
  formatNodeBillingLabel,
  formatRemainingDays,
  formatServerBytes,
  formatServerSpeed,
  parseServerRegion,
  redactServerText,
  splitServerBytes,
} from '../shared/servers'
import { projectServerSnapshot } from '../server/utils/komari'

describe('server monitor projection & IP redaction', () => {
  it('redacts IPv4 and IPv6 literals from untrusted text', () => {
    expect(redactServerText('Tencent Cloud 106.52.188.91 node')).toBe('Tencent Cloud [已隐藏IP] node')
    expect(redactServerText('Host 240e:390:1234:5678::1 online')).toBe('Host [已隐藏IP] online')
    expect(redactServerText('Ubuntu 24.04.3 LTS')).toBe('Ubuntu 24.04.3 LTS')
  })

  it('calculates Glass-compatible asset billing and remaining value metrics', () => {
    const nowMs = Date.parse('2026-11-04T17:38:00Z')

    expect(formatNodeBillingLabel(300, 365, '￥')).toBe('¥300 / 年')
    expect(formatRemainingDays(300, '2027-10-24T00:00:00Z', nowMs)).toBe('354 天')
    expect(formatCurrencyAmount(computeRemainingValue(300, 365, '2027-10-24T00:00:00Z', nowMs), '￥')).toBe('¥290.96')

    expect(formatNodeBillingLabel(290, 92, '$')).toBe('$290 / 季')
    expect(formatRemainingDays(290, '2027-01-25T00:00:00Z', nowMs)).toBe('82 天')
    expect(formatCurrencyAmount(computeRemainingValue(290, 92, '2027-01-25T00:00:00Z', nowMs), '$')).toBe('$258.48')

    expect(formatNodeBillingLabel(80, 365, '￥')).toBe('¥80 / 年')
    expect(formatRemainingDays(80, '2027-10-29T00:00:00Z', nowMs)).toBe('359 天')
    expect(formatCurrencyAmount(computeRemainingValue(80, 365, '2027-10-29T00:00:00Z', nowMs), '￥')).toBe('¥78.68')
  })

  it('formats byte sizes, transfer speeds, OS icons, and region codes accurately', () => {
    expect(splitServerBytes(31_696_825_000)).toEqual({ value: '29.52', unit: 'GB' })
    expect(formatServerBytes(31_696_825_000)).toBe('29.52 GB')
    expect(formatServerSpeed(46_735)).toBe('45.64 KB/s')
    expect(classifyServerOs('Ubuntu 24.04.3 LTS')).toEqual({ key: 'ubuntu', label: 'Ubuntu' })
    expect(parseServerRegion('🇨🇳')).toEqual({ emoji: '🇨🇳', code: 'CN', name: '中国' })
    expect(parseServerRegion('🇺🇸')).toEqual({ emoji: '🇺🇸', code: 'US', name: '美国' })
  })

  it('projects Komari RPC2 snapshot and never leaks any IPv4/IPv6 fields', () => {
    const nowMs = Date.parse('2026-11-04T17:38:00Z')
    const rawNodes = [
      {
        uuid: 'node-1-106.52.188.91',
        name: 'Tencent Cloud (106.52.188.91)',
        cpu_name: 'Intel Xeon 10.0.0.1',
        cpu_cores: 2,
        os: 'Ubuntu 24.04.3 LTS',
        region: '🇨🇳',
        mem_total: 8_063_819_776,
        swap_total: 0,
        disk_total: 190_106_849_280,
        weight: 0,
        price: 300,
        billing_cycle: 365,
        auto_renewal: false,
        currency: '￥',
        expired_at: '2027-10-24T00:00:00Z',
        traffic_limit: 0,
        traffic_limit_type: 'max',
        ipv4: '106.52.188.91',
        ipv6: '2402:4e00:1020:3040::1',
        ip: '106.52.188.91',
        host: '106.52.188.91',
        public_remark: 'Main node at 106.52.188.91 / 2402:4e00:1020:3040::1',
      },
      {
        uuid: 'node-2',
        name: 'GoogleCloud-oregon',
        cpu_name: 'Intel Xeon',
        cpu_cores: 2,
        os: 'Ubuntu 24.04.4 LTS',
        region: '🇺🇸',
        mem_total: 16_761_139_200,
        swap_total: 0,
        disk_total: 72_713_895_936,
        weight: 1,
        price: 290,
        billing_cycle: 92,
        auto_renewal: false,
        currency: '$',
        expired_at: '2027-01-25T00:00:00Z',
        traffic_limit: 0,
        traffic_limit_type: 'max',
        ipv4: '34.82.111.222',
      },
      {
        uuid: 'node-3',
        name: 'AliYun',
        cpu_name: 'Intel Xeon',
        cpu_cores: 2,
        os: 'Ubuntu 24.04.2 LTS',
        region: '🇨🇳',
        mem_total: 1_696_518_144,
        swap_total: 0,
        disk_total: 42_090_679_296,
        weight: 2,
        price: 80,
        billing_cycle: 365,
        auto_renewal: false,
        currency: '￥',
        expired_at: '2027-10-29T00:00:00Z',
        traffic_limit: 0,
        traffic_limit_type: 'max',
        ipv4: '47.108.99.88',
      },
    ]

    const rawStatuses = {
      'node-1-106.52.188.91': {
        online: true,
        cpu: 4.8,
        ram: 2_920_577_761,
        ram_total: 8_063_819_776,
        disk: 46_042_087_424,
        disk_total: 190_106_849_280,
        net_in: 14_991,
        net_out: 30_249,
        net_total_down: 13_378_822_144,
        net_total_up: 3_801_046_016,
        load: 0.03,
        load5: 0.13,
        load15: 0.23,
        uptime: 950_400,
        process: 120,
        connections: 45,
        connections_udp: 12,
        time: '2026-11-04T17:38:00Z',
        ip: '106.52.188.91',
      },
      'node-2': {
        online: true,
        cpu: 0.3,
        ram: 444_984_525,
        ram_total: 16_761_139_200,
        disk: 4_627_836_928,
        disk_total: 72_713_895_936,
        net_in: 1_000,
        net_out: 323,
        net_total_down: 7_677_256_499,
        net_total_up: 4_670_776_934,
        load: 0,
        load5: 0,
        load15: 0.03,
        uptime: 1_296_000,
        process: 98,
        connections: 18,
        connections_udp: 4,
        time: '2026-11-04T17:38:00Z',
      },
      'node-3': {
        online: true,
        cpu: 0.7,
        ram: 379_174_912,
        ram_total: 1_696_518_144,
        disk: 4_337_916_969,
        disk_total: 42_090_679_296,
        net_in: 36,
        net_out: 132,
        net_total_down: 1_460_288_880,
        net_total_up: 709_573_017,
        load: 0,
        load5: 0.02,
        load15: 0,
        uptime: 518_400,
        process: 86,
        connections: 11,
        connections_udp: 2,
        time: '2026-11-04T17:38:00Z',
      },
    }

    const snapshot = projectServerSnapshot({
      rawNodes,
      rawStatuses,
      siteName: 'Komari Monitor',
      assetCurrency: 'CNY',
      source: 'komari',
      nowMs,
    })

    expect(snapshot.overview.online).toBe(3)
    expect(snapshot.overview.total).toBe(3)
    expect(snapshot.overview.paidCount).toBe(3)
    expect(snapshot.overview.totalValueText).toBe('¥2318.36')
    expect(snapshot.overview.remainingValueText).toBe('¥2097.31')
    expect(snapshot.overview.trafficTotalValue).toBe('29.52')
    expect(snapshot.overview.trafficTotalUnit).toBe('GB')
    expect(snapshot.overview.speedTotalText).toBe('45.64 KB/s')

    const serialized = JSON.stringify(snapshot)
    expect(serialized).not.toContain('106.52.188.91')
    expect(serialized).not.toContain('2402:4e00:1020:3040::1')
    expect(serialized).not.toContain('34.82.111.222')
    expect(serialized).not.toContain('47.108.99.88')
    expect(serialized).not.toContain('10.0.0.1')
  })
})
