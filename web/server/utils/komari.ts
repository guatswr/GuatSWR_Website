import {
  DEFAULT_EXCHANGE_RATES,
  barStatusForPercent,
  classifyServerOs,
  clampPercentage,
  computeRatioPercent,
  computeRemainingValue,
  computeTrafficUsed,
  convertCurrency,
  createEmptyPingBars,
  formatCurrencyAmount,
  formatCurrencySymbol,
  formatNodeBillingLabel,
  formatRemainingDays,
  formatServerBytes,
  formatServerSpeed,
  latencySignalLevel,
  lossSignalLevel,
  parseServerRegion,
  redactServerText,
  resolveCurrencyCode,
  splitServerBytes,
} from '../../shared/servers'
import type {
  CurrencyCode,
  PublicServerNode,
  PublicServerPingBar,
  PublicServerPingSummary,
  PublicServersOverview,
  PublicServersResponse,
  ServerBarStatus,
} from '../../shared/servers'

export interface KomariRuntimeConfig {
  readonly baseUrl?: string
  readonly timeoutMs?: number
}

interface JsonRpcResponseItem<T = unknown> {
  readonly jsonrpc?: string
  readonly id?: number | string
  readonly result?: T
  readonly error?: { readonly code?: number; readonly message?: string }
}

export interface KomariRawNodeInfo {
  readonly uuid?: string
  readonly name?: string
  readonly cpu_name?: string
  readonly virtualization?: string
  readonly arch?: string
  readonly cpu_cores?: number
  readonly os?: string
  readonly region?: string
  readonly mem_total?: number
  readonly swap_total?: number
  readonly disk_total?: number
  readonly weight?: number
  readonly price?: number
  readonly billing_cycle?: number
  readonly currency?: string
  readonly expired_at?: string | null
  readonly hidden?: boolean
  readonly traffic_limit?: number
  readonly traffic_limit_type?: string
  readonly updated_at?: string
  // Untrusted fields that may exist on admin/future payloads and MUST be ignored:
  readonly [key: string]: unknown
}

export interface KomariRawNodeStatus {
  readonly client?: string
  readonly time?: string
  readonly cpu?: number
  readonly ram?: number
  readonly ram_total?: number
  readonly swap?: number
  readonly swap_total?: number
  readonly load?: number
  readonly load5?: number
  readonly load15?: number
  readonly disk?: number
  readonly disk_total?: number
  readonly net_in?: number
  readonly net_out?: number
  readonly net_total_up?: number
  readonly net_total_down?: number
  readonly process?: number
  readonly connections?: number
  readonly connections_udp?: number
  readonly online?: boolean
  readonly uptime?: number
}

export interface KomariRawPingRecord {
  readonly task_id?: number
  readonly time?: string
  readonly value?: number
}

export interface KomariRawPublicSettings {
  readonly sitename?: string
  readonly theme_settings?: {
    readonly assetCurrency?: string
  } | null
}

const MOCK_NODES_RAW: readonly KomariRawNodeInfo[] = Object.freeze([
  {
    uuid: '8cf479cd-997a-4b5a-afd1-597fb37b7cb0',
    name: 'Tencent Cloud',
    cpu_name: 'Intel(R) Xeon(R) Gold 6148 CPU @ 2.40GHz',
    virtualization: 'kvm',
    arch: 'amd64',
    cpu_cores: 4,
    os: 'Ubuntu 24.04.5 LTS',
    region: '🇨🇳',
    mem_total: 8_058_507_264,
    swap_total: 2_084_564_992,
    disk_total: 190_109_507_584,
    weight: 0,
    price: 300,
    billing_cycle: 365,
    currency: '¥',
    expired_at: '2027-10-24T00:00:00Z',
    hidden: false,
    traffic_limit: 0,
    traffic_limit_type: 'max',
    updated_at: '2026-11-04T17:50:42Z',
  },
  {
    uuid: 'c891ac0f-8e1b-46fa-8ba5-9da611eb62aa',
    name: 'GoogleCloud-oregon',
    cpu_name: 'Intel(R) Xeon(R) CPU @ 2.20GHz',
    virtualization: 'google',
    arch: 'amd64',
    cpu_cores: 4,
    os: 'Ubuntu 24.04.5 LTS',
    region: '🇺🇸',
    mem_total: 16_762_126_336,
    swap_total: 0,
    disk_total: 72_719_097_344,
    weight: 1,
    price: 290,
    billing_cycle: 92,
    currency: '$',
    expired_at: '2027-01-25T00:00:00Z',
    hidden: false,
    traffic_limit: 0,
    traffic_limit_type: 'max',
    updated_at: '2026-11-04T17:50:42Z',
  },
  {
    uuid: '5443b6e9-1dc3-4813-9e98-47e27d072f0e',
    name: 'AliYun',
    cpu_name: 'Intel(R) Xeon(R) Platinum',
    virtualization: 'kvm',
    arch: 'amd64',
    cpu_cores: 2,
    os: 'Ubuntu 24.04.5 LTS',
    region: '🇨🇳',
    mem_total: 1_691_435_008,
    swap_total: 0,
    disk_total: 42_089_396_736,
    weight: 2,
    price: 80,
    billing_cycle: 365,
    currency: '¥',
    expired_at: '2027-10-29T00:00:00Z',
    hidden: false,
    traffic_limit: 0,
    traffic_limit_type: 'max',
    updated_at: '2026-11-04T17:50:42Z',
  },
])

const MOCK_STATUS_MAP: Readonly<Record<string, KomariRawNodeStatus>> = Object.freeze({
  '8cf479cd-997a-4b5a-afd1-597fb37b7cb0': {
    client: '8cf479cd-997a-4b5a-afd1-597fb37b7cb0',
    time: '2026-11-04T17:50:42Z',
    cpu: 4.8,
    ram: 2_920_577_761,
    ram_total: 8_058_507_264,
    load: 0.03,
    load5: 0.13,
    load15: 0.23,
    disk: 46_042_015_334,
    disk_total: 190_109_507_584,
    net_out: 30_248,
    net_in: 14_991,
    net_total_up: 3_801_046_056,
    net_total_down: 13_378_824_192,
    uptime: 1_012_616,
    online: true,
  },
  'c891ac0f-8e1b-46fa-8ba5-9da611eb62aa': {
    client: 'c891ac0f-8e1b-46fa-8ba5-9da611eb62aa',
    time: '2026-11-04T17:50:42Z',
    cpu: 0.3,
    ram: 444_984_688,
    ram_total: 16_762_126_336,
    load: 0.0,
    load5: 0.0,
    load15: 0.03,
    disk: 4_627_830_210,
    disk_total: 72_719_097_344,
    net_out: 323,
    net_in: 1000,
    net_total_up: 4_670_776_934,
    net_total_down: 7_677_253_222,
    uptime: 1_379_241,
    online: true,
  },
  '5443b6e9-1dc3-4813-9e98-47e27d072f0e': {
    client: '5443b6e9-1dc3-4813-9e98-47e27d072f0e',
    time: '2026-11-04T17:50:42Z',
    cpu: 0.7,
    ram: 379_175_731,
    ram_total: 1_691_435_008,
    load: 0.0,
    load5: 0.02,
    load15: 0.0,
    disk: 4_337_913_856,
    disk_total: 42_089_396_736,
    net_out: 132,
    net_in: 36,
    net_total_up: 709_571_379,
    net_total_down: 1_460_288_880,
    uptime: 547_331,
    online: true,
  },
})

function safeNum(value: unknown, fallback = 0): number {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function safeNonNegative(value: unknown): number {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : 0
}

export function buildPingSummaryFromRecords(
  records: readonly KomariRawPingRecord[] | null | undefined,
  barCount = 20,
): PublicServerPingSummary {
  if (!Array.isArray(records) || records.length === 0) {
    return {
      latencyDisplay: '-',
      lossDisplay: '-',
      latencyBars: createEmptyPingBars(barCount, '无采样数据'),
      lossBars: createEmptyPingBars(barCount, '无采样数据'),
    }
  }

  const parsed = records
    .map(item => ({
      timeMs: Date.parse(String(item.time || '')),
      value: safeNum(item.value, -1),
    }))
    .filter(item => Number.isFinite(item.timeMs))
    .sort((a, b) => a.timeMs - b.timeMs)

  if (parsed.length === 0) {
    return {
      latencyDisplay: '-',
      lossDisplay: '-',
      latencyBars: createEmptyPingBars(barCount, '无采样数据'),
      lossBars: createEmptyPingBars(barCount, '无采样数据'),
    }
  }

  const validValues = parsed.filter(r => r.value >= 0).map(r => r.value)
  const avgLatency = validValues.length > 0
    ? validValues.reduce((sum, v) => sum + v, 0) / validValues.length
    : null
  const avgLoss = ((parsed.length - validValues.length) / parsed.length) * 100

  const firstMs = parsed[0]!.timeMs
  const lastMs = parsed.at(-1)?.timeMs ?? firstMs
  const bucketCount = Math.min(barCount, parsed.length)
  const stepMs = Math.max(1, (lastMs - firstMs) / bucketCount)

  const latencyBars: PublicServerPingBar[] = []
  const lossBars: PublicServerPingBar[] = []
  let cursor = 0

  for (let i = 0; i < bucketCount; i += 1) {
    const startMs = firstMs + stepMs * i
    const endMs = i === bucketCount - 1 ? lastMs + 1 : startMs + stepMs
    const bucket: typeof parsed = []
    while (cursor < parsed.length) {
      const current = parsed[cursor]!
      if (current.timeMs >= endMs) break
      if (current.timeMs >= startMs) bucket.push(current)
      cursor += 1
    }
    const valid = bucket.filter(item => item.value >= 0)
    const latency = valid.length > 0
      ? valid.reduce((sum, item) => sum + item.value, 0) / valid.length
      : null
    const loss = bucket.length > 0
      ? ((bucket.length - valid.length) / bucket.length) * 100
      : null

    latencyBars.push({
      key: `lat-${i}`,
      level: latencySignalLevel(latency),
      tooltip: latency === null ? '无采样数据' : `${Math.round(latency)} ms`,
    })
    lossBars.push({
      key: `loss-${i}`,
      level: lossSignalLevel(loss),
      tooltip: loss === null ? '无采样数据' : `${loss.toFixed(1)}%`,
    })
  }

  return {
    latencyDisplay: avgLatency === null ? '-' : `${Math.round(avgLatency)} ms`,
    lossDisplay: validValues.length === 0 ? '-' : `${avgLoss.toFixed(1)}%`,
    latencyBars,
    lossBars,
  }
}

export function projectServerSnapshot(input: {
  readonly rawNodes: readonly KomariRawNodeInfo[]
  readonly rawStatuses: Readonly<Record<string, KomariRawNodeStatus>>
  readonly rawPingByUuid?: Readonly<Record<string, readonly KomariRawPingRecord[]>>
  readonly siteName?: string
  readonly assetCurrency?: string
  readonly source: 'komari' | 'mock'
  readonly nowMs?: number
}): PublicServersResponse {
  const nowMs = input.nowMs ?? Date.now()
  const visibleNodes = input.rawNodes
    .filter(node => node && !node.hidden && typeof node.uuid === 'string' && node.uuid.trim().length > 0)
    .slice()
    .sort((a, b) => safeNum(a.weight, 0) - safeNum(b.weight, 0))

  const nodes: PublicServerNode[] = visibleNodes.map((raw, index) => {
    const uuid = String(raw.uuid || `node-${index}`).trim()
    const status = Object.hasOwn(input.rawStatuses, uuid) ? input.rawStatuses[uuid] : undefined
    const online = Boolean(status?.online)

    const regionInfo = parseServerRegion(raw.region)
    const osText = redactServerText(raw.os || 'Linux')
    const osClassified = classifyServerOs(osText)

    const cpuUsage = clampPercentage(safeNonNegative(status?.cpu))
    const load1 = safeNonNegative(status?.load)
    const load5 = safeNonNegative(status?.load5)
    const load15 = safeNonNegative(status?.load15)

    const ramUsed = safeNonNegative(status?.ram)
    const ramTotal = safeNonNegative(raw.mem_total || status?.ram_total)
    const ramPercent = computeRatioPercent(ramUsed, ramTotal)

    const diskUsed = safeNonNegative(status?.disk)
    const diskTotal = safeNonNegative(raw.disk_total || status?.disk_total)
    const diskPercent = computeRatioPercent(diskUsed, diskTotal)

    const netTotalUp = safeNonNegative(status?.net_total_up)
    const netTotalDown = safeNonNegative(status?.net_total_down)
    const trafficLimit = safeNonNegative(raw.traffic_limit)
    const trafficLimitType = String(raw.traffic_limit_type || 'max')
    const trafficUsed = computeTrafficUsed(netTotalUp, netTotalDown, trafficLimitType)
    const trafficHasLimit = trafficLimit > 0
    const trafficPercent = trafficHasLimit ? computeRatioPercent(trafficUsed, trafficLimit) : 0
    const trafficStatus: ServerBarStatus = !trafficHasLimit
      ? 'success'
      : trafficPercent >= 95
        ? 'error'
        : trafficPercent >= 80
          ? 'warning'
          : trafficPercent >= 60
            ? 'info'
            : 'success'

    const speedUp = online ? safeNonNegative(status?.net_out) : 0
    const speedDown = online ? safeNonNegative(status?.net_in) : 0
    const uptime = safeNonNegative(status?.uptime)
    const uptimeDays = uptime > 0 ? Math.floor(uptime / 86_400) : 0

    const price = safeNum(raw.price, 0)
    const billingCycle = safeNum(raw.billing_cycle, 0)
    const currency = String(raw.currency || '¥').trim() || '¥'
    const expiredAt = typeof raw.expired_at === 'string' ? raw.expired_at : null
    const remainingValue = computeRemainingValue(price, billingCycle, expiredAt, nowMs)

    const pingRecords = input.rawPingByUuid && Object.hasOwn(input.rawPingByUuid, uuid)
      ? input.rawPingByUuid[uuid]
      : undefined

    return {
      id: redactServerText(uuid),
      name: redactServerText(raw.name || `节点 ${index + 1}`) || `节点 ${index + 1}`,
      online,
      region: regionInfo.emoji,
      countryCode: regionInfo.code,
      countryName: regionInfo.name,
      os: osText,
      osKey: osClassified.key,
      osLabel: osClassified.label,
      cpuName: redactServerText(raw.cpu_name || ''),
      cpuCores: Math.max(0, Math.trunc(safeNum(raw.cpu_cores, 0))),
      arch: redactServerText(raw.arch || ''),
      virtualization: redactServerText(raw.virtualization || ''),
      weight: safeNum(raw.weight, 0),
      uptime,
      uptimeDays,
      cpuUsage,
      cpuPercentText: `${cpuUsage.toFixed(1)}%`,
      cpuStatus: barStatusForPercent(cpuUsage),
      loadText: `${load1.toFixed(2)}, ${load5.toFixed(2)}, ${load15.toFixed(2)}`,
      ramUsed,
      ramTotal,
      ramPercent,
      ramPercentText: `${ramPercent.toFixed(1)}%`,
      ramStatus: barStatusForPercent(ramPercent),
      ramSubText: `${formatServerBytes(ramUsed)} / ${formatServerBytes(ramTotal)}`,
      diskUsed,
      diskTotal,
      diskPercent,
      diskPercentText: `${diskPercent.toFixed(1)}%`,
      diskStatus: barStatusForPercent(diskPercent),
      diskSubText: `${formatServerBytes(diskUsed)} / ${formatServerBytes(diskTotal)}`,
      trafficUsed,
      trafficLimit,
      trafficLimitType,
      trafficHasLimit,
      trafficPercent,
      trafficValueText: trafficHasLimit ? `${trafficPercent.toFixed(1)}%` : '∞',
      trafficStatus,
      trafficSubText: `${formatServerBytes(trafficUsed)} / ${trafficHasLimit ? formatServerBytes(trafficLimit) : '∞'}`,
      speedUp,
      speedDown,
      speedUpText: formatServerSpeed(speedUp),
      speedDownText: formatServerSpeed(speedDown),
      netTotalUp,
      netTotalDown,
      netTotalUpText: formatServerBytes(netTotalUp),
      netTotalDownText: formatServerBytes(netTotalDown),
      price,
      billingCycle,
      currency,
      billingLabel: formatNodeBillingLabel(price, billingCycle, currency),
      remainingDaysLabel: formatRemainingDays(price, expiredAt, nowMs),
      remainingValueLabel: price === -1 ? '免费' : price > 0 ? formatCurrencyAmount(remainingValue, currency) : '-',
      updatedAt: redactServerText(String(status?.time || raw.updated_at || new Date(nowMs).toISOString())),
      ping: buildPingSummaryFromRecords(pingRecords),
    }
  })

  const targetCurrencyRaw = resolveCurrencyCode(input.assetCurrency || 'CNY')
  const targetCurrency: CurrencyCode = targetCurrencyRaw === 'OTHER' ? 'CNY' : targetCurrencyRaw

  let onlineCount = 0
  let trafficUp = 0
  let trafficDown = 0
  let speedUp = 0
  let speedDown = 0
  let totalValue = 0
  let remainingValue = 0
  let paidCount = 0

  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]!
    const raw = visibleNodes[i]!
    trafficUp += node.netTotalUp
    trafficDown += node.netTotalDown
    if (node.online) {
      onlineCount += 1
      speedUp += node.speedUp
      speedDown += node.speedDown
    }
    if (node.price > 0) {
      const convertedTotal = convertCurrency(node.price, node.currency, targetCurrency, DEFAULT_EXCHANGE_RATES)
      if (convertedTotal > 0) {
        const nodeRemaining = computeRemainingValue(
          node.price,
          node.billingCycle,
          typeof raw.expired_at === 'string' ? raw.expired_at : null,
          nowMs,
        )
        totalValue += convertedTotal
        remainingValue += convertCurrency(nodeRemaining, node.currency, targetCurrency, DEFAULT_EXCHANGE_RATES)
        paidCount += 1
      }
    }
  }

  const totalCount = nodes.length
  const offlineCount = Math.max(0, totalCount - onlineCount)
  const trafficTotal = trafficUp + trafficDown
  const trafficSplit = splitServerBytes(trafficTotal)
  const speedTotal = speedUp + speedDown
  const currencySymbol = formatCurrencySymbol(targetCurrency)

  const overview: PublicServersOverview = {
    online: onlineCount,
    total: totalCount,
    offline: offlineCount,
    statusText: totalCount === 0 ? '暂无节点' : offlineCount > 0 ? `${offlineCount} 台离线` : '全部运行正常',
    totalValue,
    totalValueText: formatCurrencyAmount(totalValue, targetCurrency),
    remainingValue,
    remainingValueText: formatCurrencyAmount(remainingValue, targetCurrency),
    currencySymbol,
    paidCount,
    trafficUp,
    trafficDown,
    trafficTotal,
    trafficTotalValue: trafficSplit.value,
    trafficTotalUnit: trafficSplit.unit,
    trafficUpText: formatServerBytes(trafficUp),
    trafficDownText: formatServerBytes(trafficDown),
    speedUp,
    speedDown,
    speedTotal,
    speedTotalText: formatServerSpeed(speedTotal),
    speedUpText: formatServerSpeed(speedUp),
    speedDownText: formatServerSpeed(speedDown),
  }

  return {
    siteName: redactServerText(input.siteName || '桂航绯想天 · 节点监控') || '桂航绯想天 · 节点监控',
    updatedAt: new Date(nowMs).toISOString(),
    source: input.source,
    overview,
    nodes,
  }
}

interface CachedSnapshot {
  readonly origin: string
  readonly fetchedAt: number
  readonly data: PublicServersResponse
  inFlight?: Promise<PublicServersResponse>
}

const CACHE_FRESH_MS = 2_000
const CACHE_STALE_MS = 60_000
let cachedSnapshot: CachedSnapshot | null = null

export function resetKomariCacheForTests(): void {
  cachedSnapshot = null
}

async function fetchKomariSnapshotFromUpstream(
  baseUrl: string,
  timeoutMs: number,
): Promise<PublicServersResponse> {
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/api/rpc2`
  const batchPayload = [
    { jsonrpc: '2.0', id: 1, method: 'public:getNodesInformation', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'common:getNodesLatestStatus', params: {} },
    { jsonrpc: '2.0', id: 3, method: 'public:getPublicSettings', params: {} },
  ]

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(batchPayload),
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'error',
  })

  if (!response.ok) {
    throw new Error(`Komari upstream returned HTTP ${response.status}`)
  }

  const parsed = (await response.json()) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error('Komari RPC2 batch response is not an array')
  }

  const byId = new Map<number, JsonRpcResponseItem>()
  for (const item of parsed) {
    if (item && typeof item === 'object' && typeof (item as JsonRpcResponseItem).id === 'number') {
      byId.set((item as JsonRpcResponseItem).id as number, item as JsonRpcResponseItem)
    }
  }

  const nodesRes = byId.get(1)?.result
  const statusRes = byId.get(2)?.result
  const settingsRes = byId.get(3)?.result as KomariRawPublicSettings | undefined

  const rawNodes = Array.isArray(nodesRes) ? (nodesRes as KomariRawNodeInfo[]) : []
  const rawStatuses = (statusRes && typeof statusRes === 'object' && !Array.isArray(statusRes))
    ? (statusRes as Record<string, KomariRawNodeStatus>)
    : {}

  return projectServerSnapshot({
    rawNodes,
    rawStatuses,
    siteName: settingsRes?.sitename,
    assetCurrency: settingsRes?.theme_settings?.assetCurrency || 'CNY',
    source: 'komari',
  })
}

export async function readPublicServersSnapshot(
  config: KomariRuntimeConfig,
): Promise<PublicServersResponse> {
  const baseUrl = (config.baseUrl || '').trim().replace(/\/+$/, '')
  const timeoutMs = config.timeoutMs && config.timeoutMs > 0 ? config.timeoutMs : 5_000

  if (!baseUrl) {
    return projectServerSnapshot({
      rawNodes: MOCK_NODES_RAW,
      rawStatuses: MOCK_STATUS_MAP,
      siteName: '桂航绯想天 · 节点监控',
      assetCurrency: 'CNY',
      source: 'mock',
      nowMs: Date.parse('2026-11-04T17:50:42Z'),
    })
  }

  const now = Date.now()
  if (cachedSnapshot && cachedSnapshot.origin === baseUrl) {
    if (now - cachedSnapshot.fetchedAt < CACHE_FRESH_MS) {
      return cachedSnapshot.data
    }
    if (cachedSnapshot.inFlight) {
      return cachedSnapshot.inFlight
    }
  }

  const loadPromise = fetchKomariSnapshotFromUpstream(baseUrl, timeoutMs)
    .then((data) => {
      cachedSnapshot = {
        origin: baseUrl,
        fetchedAt: Date.now(),
        data,
      }
      return data
    })
    .catch((err) => {
      if (cachedSnapshot && cachedSnapshot.origin === baseUrl && Date.now() - cachedSnapshot.fetchedAt < CACHE_STALE_MS) {
        cachedSnapshot = {
          origin: cachedSnapshot.origin,
          fetchedAt: cachedSnapshot.fetchedAt,
          data: cachedSnapshot.data,
        }
        return cachedSnapshot.data
      }
      throw err
    })

  if (cachedSnapshot && cachedSnapshot.origin === baseUrl) {
    cachedSnapshot.inFlight = loadPromise
  }

  return loadPromise
}
