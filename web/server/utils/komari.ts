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
  formatUptimeDetailed,
  latencySignalLevel,
  lossSignalLevel,
  parseServerRegion,
  redactServerText,
  resolveCurrencyCode,
  splitServerBytes,
} from '../../shared/servers'
import type {
  CurrencyCode,
  PublicServerDetailResponse,
  PublicServerLoadPoint,
  PublicServerNode,
  PublicServerPingBar,
  PublicServerPingPoint,
  PublicServerPingSummary,
  PublicServerPingTaskSeries,
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
  readonly kernel_version?: string
  readonly gpu_name?: string
  readonly public_remark?: string
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
    kernel_version: '6.8.0-147-generic',
    gpu_name: 'None',
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
    kernel_version: '6.8.0-1021-gcp',
    gpu_name: 'None',
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
    kernel_version: '6.8.0-49-generic',
    gpu_name: 'None',
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
    process: 196,
    connections: 145,
    connections_udp: 5,
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
    process: 112,
    connections: 24,
    connections_udp: 3,
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
    process: 94,
    connections: 18,
    connections_udp: 2,
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
    const processCount = Math.max(0, Math.trunc(safeNonNegative(status?.process)))
    const tcpConnections = Math.max(0, Math.trunc(safeNonNegative(status?.connections)))
    const udpConnections = Math.max(0, Math.trunc(safeNonNegative(status?.connections_udp)))
    const rawGpu = redactServerText(raw.gpu_name || '')
    const gpuName = rawGpu && rawGpu.toLowerCase() !== 'none' ? rawGpu : '未检测到'
    const kernelVersion = redactServerText(raw.kernel_version || '') || '--'
    const publicRemark = redactServerText(raw.public_remark || '')

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
      gpuName,
      kernelVersion,
      weight: safeNum(raw.weight, 0),
      uptime,
      uptimeDays,
      uptimeDetailText: formatUptimeDetailed(uptime, online),
      process: processCount,
      connections: tcpConnections,
      connectionsUdp: udpConnections,
      processConnectionsText: online ? `${processCount} / ${tcpConnections + udpConnections}` : '--',
      publicRemark,
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

const PING_SERIES_COLORS = [
  '#2563b9',
  '#10b981',
  '#f59e0b',
  '#3b82f6',
  '#f43f5e',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
] as const

export function formatServerChartTimeLabel(timeMs: number, hours: number): string {
  if (!Number.isFinite(timeMs)) return ''
  // Format in China Standard Time (UTC+8) deterministically across SSR & client
  const beijing = new Date(timeMs + 8 * 3_600_000)
  const month = String(beijing.getUTCMonth() + 1).padStart(2, '0')
  const day = String(beijing.getUTCDate()).padStart(2, '0')
  const hour24 = beijing.getUTCHours()
  const minute = String(beijing.getUTCMinutes()).padStart(2, '0')
  const second = String(beijing.getUTCSeconds()).padStart(2, '0')

  if (hours <= 1) {
    const suffix = hour24 >= 12 ? 'PM' : 'AM'
    const hour12 = String(hour24 % 12 || 12).padStart(2, '0')
    return `${hour12}:${minute}:${second} ${suffix}`
  }
  if (hours <= 4) {
    return `${String(hour24).padStart(2, '0')}:${minute}`
  }
  return `${month}/${day} ${String(hour24).padStart(2, '0')}:${minute}`
}

export function normalizeKomariLoadRecords(
  rawList: readonly Record<string, unknown>[],
  hours: number,
): PublicServerLoadPoint[] {
  const points: PublicServerLoadPoint[] = []
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue
    const rawTime = typeof item.time === 'string'
      ? item.time
      : typeof item.updated_at === 'string'
        ? item.updated_at
        : ''
    const timeMs = Date.parse(rawTime)
    if (!Number.isFinite(timeMs)) continue

    const cpuObj = item.cpu && typeof item.cpu === 'object' ? (item.cpu as Record<string, unknown>) : null
    const ramObj = item.ram && typeof item.ram === 'object' ? (item.ram as Record<string, unknown>) : null
    const diskObj = item.disk && typeof item.disk === 'object' ? (item.disk as Record<string, unknown>) : null
    const netObj = item.network && typeof item.network === 'object' ? (item.network as Record<string, unknown>) : null

    const cpu = clampPercentage(safeNonNegative(cpuObj ? cpuObj.usage : item.cpu))
    const ram = safeNonNegative(ramObj ? ramObj.used : item.ram)
    const disk = safeNonNegative(diskObj ? diskObj.used : item.disk)
    const netIn = safeNonNegative(netObj ? netObj.down : item.net_in)
    const netOut = safeNonNegative(netObj ? netObj.up : item.net_out)

    points.push({
      time: timeMs,
      timeLabel: formatServerChartTimeLabel(timeMs, hours),
      cpu,
      ram,
      disk,
      netIn,
      netOut,
    })
  }
  return points.sort((a, b) => a.time - b.time)
}

export function normalizeKomariPingSeries(
  rawTasks: readonly Record<string, unknown>[],
  rawRecords: readonly Record<string, unknown>[],
  hours: number,
): PublicServerPingTaskSeries[] {
  if (!Array.isArray(rawTasks) || rawTasks.length === 0 || !Array.isArray(rawRecords) || rawRecords.length === 0) {
    return []
  }

  const byTaskId = new Map<number, PublicServerPingPoint[]>()
  for (const rec of rawRecords) {
    if (!rec || typeof rec !== 'object') continue
    const taskId = Math.trunc(safeNum(rec.task_id, -1))
    if (taskId < 0) continue
    const timeMs = Date.parse(String(rec.time || ''))
    if (!Number.isFinite(timeMs)) continue
    const rawVal = safeNum(rec.value, -1)
    const list = byTaskId.get(taskId) ?? []
    list.push({
      time: timeMs,
      timeLabel: formatServerChartTimeLabel(timeMs, hours),
      value: rawVal >= 0 ? rawVal : null,
    })
    byTaskId.set(taskId, list)
  }

  const result: PublicServerPingTaskSeries[] = []
  rawTasks.forEach((task, index) => {
    if (!task || typeof task !== 'object') return
    const id = Math.trunc(safeNum(task.id, -1))
    const points = (byTaskId.get(id) ?? []).sort((a, b) => a.time - b.time)
    if (points.length === 0) return

    const validPoints = points.filter(p => p.value !== null && Number.isFinite(p.value))
    const latestLatency = validPoints.at(-1)?.value ?? 0
    const lossPercent = Number.isFinite(Number(task.loss))
      ? clampPercentage(Number(task.loss))
      : points.length > 0
        ? clampPercentage(((points.length - validPoints.length) / points.length) * 100)
        : 0

    result.push({
      id,
      name: redactServerText(String(task.name || `探测任务 #${id}`)) || `探测任务 #${id}`,
      color: PING_SERIES_COLORS[index % PING_SERIES_COLORS.length]!,
      latestLatency,
      lossPercent,
      points,
    })
  })

  return result
}

function buildMockDetailSnapshot(nodeId: string, hours: number): PublicServerDetailResponse {
  const safeHours = [0, 1, 4, 24].includes(hours) ? hours : 0
  const baseNode = MOCK_NODES_RAW.find(n => n.uuid === nodeId) ?? MOCK_NODES_RAW[0]!
  const baseStatus = MOCK_STATUS_MAP[baseNode.uuid || ''] ?? Object.values(MOCK_STATUS_MAP)[0]!
  const nowMs = Date.parse('2026-11-04T17:50:42Z')
  const count = safeHours === 0 ? 24 : 36
  const stepMs = safeHours === 0 ? 3_000 : Math.floor((safeHours * 3_600_000) / count)

  const loadRecords: PublicServerLoadPoint[] = Array.from({ length: count }, (_, idx) => {
    const time = nowMs - (count - 1 - idx) * stepMs
    const wave = Math.sin(idx * 0.45) * 0.8 + Math.cos(idx * 0.25) * 0.5
    const cpu = clampPercentage(Math.max(0.2, (baseStatus.cpu ?? 2.4) + wave))
    const ram = Math.max(0, Math.round((baseStatus.ram ?? 2_880_000_000) + wave * 4_200_000))
    const disk = Math.max(0, Math.round((baseStatus.disk ?? 46_042_015_334) + idx * 12_000))
    const spike = idx >= count - 2 ? 3.2 : 1
    const netOut = Math.max(80, Math.round(((baseStatus.net_out ?? 3_200) * (0.4 + Math.abs(Math.sin(idx * 0.5)))) * spike))
    const netIn = Math.max(60, Math.round(((baseStatus.net_in ?? 1_800) * (0.4 + Math.abs(Math.cos(idx * 0.4)))) * spike))
    return {
      time,
      timeLabel: formatServerChartTimeLabel(time, safeHours || 1),
      cpu,
      ram,
      disk,
      netIn,
      netOut,
    }
  })

  return {
    nodeId: redactServerText(nodeId),
    hours: safeHours,
    updatedAt: new Date(nowMs).toISOString(),
    source: 'mock',
    loadRecords,
    pingTasks: [],
  }
}

interface CachedDetailEntry {
  readonly fetchedAt: number
  readonly data: PublicServerDetailResponse
}

const detailCache = new Map<string, CachedDetailEntry>()

export async function readPublicServerDetailSnapshot(
  config: KomariRuntimeConfig,
  params: { readonly nodeId: string; readonly hours: number },
): Promise<PublicServerDetailResponse> {
  const cleanNodeId = String(params.nodeId || '').trim()
  const safeHours = [0, 1, 4, 24, 168, 720].includes(params.hours) ? params.hours : 0
  const baseUrl = (config.baseUrl || '').trim().replace(/\/+$/, '')
  const timeoutMs = config.timeoutMs && config.timeoutMs > 0 ? config.timeoutMs : 5_000

  if (!baseUrl || !cleanNodeId) {
    return buildMockDetailSnapshot(cleanNodeId || 'mock-node', safeHours)
  }

  const cacheKey = `${baseUrl}::${cleanNodeId}::${safeHours}`
  const now = Date.now()
  const existing = detailCache.get(cacheKey)
  if (existing && now - existing.fetchedAt < CACHE_FRESH_MS) {
    return existing.data
  }

  const endpoint = `${baseUrl}/api/rpc2`
  const loadMethod = safeHours === 0 ? 'public:getClientRecentRecords' : 'public:getRecordsByUUID'
  const loadParams = safeHours === 0
    ? { uuid: cleanNodeId }
    : { uuid: cleanNodeId, hours: String(safeHours) }
  const pingHours = safeHours === 0 ? '1' : String(safeHours)

  const batchPayload = [
    { jsonrpc: '2.0', id: 1, method: loadMethod, params: loadParams },
    { jsonrpc: '2.0', id: 2, method: 'public:getPingRecords', params: { uuid: cleanNodeId, hours: pingHours } },
  ]

  try {
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
      throw new Error(`Komari detail upstream returned HTTP ${response.status}`)
    }

    const parsed = (await response.json()) as unknown
    if (!Array.isArray(parsed)) {
      throw new Error('Komari detail RPC2 batch response is not an array')
    }

    const byId = new Map<number, JsonRpcResponseItem>()
    for (const item of parsed) {
      if (item && typeof item === 'object' && typeof (item as JsonRpcResponseItem).id === 'number') {
        byId.set((item as JsonRpcResponseItem).id as number, item as JsonRpcResponseItem)
      }
    }

    const loadRes = byId.get(1)?.result
    const rawLoadList: Record<string, unknown>[] = Array.isArray(loadRes)
      ? (loadRes as Record<string, unknown>[])
      : loadRes && typeof loadRes === 'object' && Array.isArray((loadRes as { records?: unknown }).records)
        ? ((loadRes as { records: Record<string, unknown>[] }).records)
        : []

    const pingRes = byId.get(2)?.result as { tasks?: Record<string, unknown>[]; records?: Record<string, unknown>[] } | undefined
    const rawPingTasks = Array.isArray(pingRes?.tasks) ? pingRes.tasks : []
    const rawPingRecords = Array.isArray(pingRes?.records) ? pingRes.records : []

    const detail: PublicServerDetailResponse = {
      nodeId: redactServerText(cleanNodeId),
      hours: safeHours,
      updatedAt: new Date().toISOString(),
      source: 'komari',
      loadRecords: normalizeKomariLoadRecords(rawLoadList, safeHours || 1),
      pingTasks: normalizeKomariPingSeries(rawPingTasks, rawPingRecords, safeHours || 1),
    }

    if (detailCache.size > 64) {
      detailCache.clear()
    }
    detailCache.set(cacheKey, { fetchedAt: Date.now(), data: detail })
    return detail
  }
  catch (err) {
    if (existing && Date.now() - existing.fetchedAt < CACHE_STALE_MS) {
      return existing.data
    }
    throw err
  }
}
