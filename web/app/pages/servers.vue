<script setup lang="ts">
import type {
  PublicServerDetailResponse,
  PublicServerLoadPoint,
  PublicServerNode,
  PublicServersResponse,
  ServerBarStatus,
  ServerSignalLevel,
} from '#shared/servers'
import { formatServerBytes, formatServerSpeed } from '#shared/servers'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { START_LOCATION } from 'vue-router'
import ClubIcon from '~/components/ClubIcon.vue'
import { formatBeijingDateTime } from '~/utils/beijing-time'

definePageMeta({
  key: route => route.path,
  scrollToTop(to, from) {
    if (from === START_LOCATION) return Boolean(to.hash) || typeof window === 'undefined' || window.scrollY === 0
    return to.path !== from.path
  },
})

const DEFAULT_SNAPSHOT: PublicServersResponse = {
  siteName: '桂航绯想天 · 节点监控',
  updatedAt: '',
  source: 'mock',
  overview: {
    online: 0,
    total: 0,
    offline: 0,
    statusText: '正在同步节点状态…',
    totalValue: 0,
    totalValueText: '¥0',
    remainingValue: 0,
    remainingValueText: '¥0',
    currencySymbol: '¥',
    paidCount: 0,
    trafficUp: 0,
    trafficDown: 0,
    trafficTotal: 0,
    trafficTotalValue: '0',
    trafficTotalUnit: 'B',
    trafficUpText: '0 B',
    trafficDownText: '0 B',
    speedUp: 0,
    speedDown: 0,
    speedTotal: 0,
    speedTotalText: '0 B/s',
    speedUpText: '0 B/s',
    speedDownText: '0 B/s',
  },
  nodes: [],
}

const route = useRoute()
const router = useRouter()

const { data: initialData, error: fetchError, status: fetchStatus, refresh } = await useFetch<PublicServersResponse>('/api/servers', {
  key: 'public-servers-snapshot',
  default: () => DEFAULT_SNAPSHOT,
})

const liveSnapshot = shallowRef<PublicServersResponse | null>(null)
watch(initialData, (val) => {
  if (val && (val.nodes.length > 0 || val.updatedAt)) {
    liveSnapshot.value = val
  }
}, { immediate: true, flush: 'sync' })

const snapshot = computed<PublicServersResponse>(() => liveSnapshot.value ?? initialData.value ?? DEFAULT_SNAPSHOT)
const overview = computed(() => snapshot.value.overview)
const nodes = computed<readonly PublicServerNode[]>(() => snapshot.value.nodes)
const isInitialLoading = computed(() => fetchStatus.value === 'pending' && !liveSnapshot.value)
const hasFatalError = computed(() => Boolean(fetchError.value) && !liveSnapshot.value)

// Selected node for Detail Panel
const selectedNodeId = ref<string>(typeof route.query.node === 'string' ? route.query.node : '')
watch(() => route.query.node, (qNode) => {
  selectedNodeId.value = typeof qNode === 'string' ? qNode : ''
})

const selectedNode = computed<PublicServerNode | null>(() => {
  if (!selectedNodeId.value) return null
  return nodes.value.find(n => n.id === selectedNodeId.value) ?? null
})

function selectNode(nodeId: string): void {
  selectedNodeId.value = nodeId
  detailTab.value = 'load'
  hoverIndex.value = null
  if (import.meta.client) {
    void router.replace({ query: { ...route.query, node: nodeId } })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

function clearSelectedNode(): void {
  selectedNodeId.value = ''
  hoverIndex.value = null
  if (import.meta.client) {
    const nextQuery = { ...route.query }
    delete nextQuery.node
    void router.replace({ query: nextQuery })
  }
}

// Detail Panel state: 'load' | 'ping' & hours
const detailTab = ref<'load' | 'ping'>('load')
const loadHours = ref<number>(0)
const pingHours = ref<number>(1)
const activeHours = computed(() => (detailTab.value === 'load' ? loadHours.value : pingHours.value))

const LOAD_TIME_RANGES = [
  { label: '实时', hours: 0 },
  { label: '1 小时', hours: 1 },
  { label: '4 小时', hours: 4 },
  { label: '1 天', hours: 24 },
] as const

const PING_TIME_RANGES = [
  { label: '1 小时', hours: 1 },
  { label: '4 小时', hours: 4 },
  { label: '1 天', hours: 24 },
] as const

const detailData = shallowRef<PublicServerDetailResponse | null>(null)
const detailLoading = ref(false)
const detailError = ref<string | null>(null)
const hiddenPingTaskIds = ref<Set<number>>(new Set())
const hoverIndex = ref<number | null>(null)
let detailReqSeq = 0

async function fetchNodeDetail(silent = false): Promise<void> {
  const node = selectedNode.value
  if (!node) {
    detailData.value = null
    return
  }
  const reqId = ++detailReqSeq
  if (!silent) {
    detailLoading.value = true
    detailError.value = null
  }
  try {
    const res = await $fetch<PublicServerDetailResponse>('/api/servers/detail', {
      query: {
        id: node.id,
        hours: activeHours.value,
      },
    })
    if (reqId !== detailReqSeq) return
    detailData.value = res
    detailError.value = null
  }
  catch {
    if (reqId !== detailReqSeq) return
    if (!silent) {
      detailError.value = '加载节点历史监控曲线失败，请稍后重试'
    }
  }
  finally {
    if (reqId === detailReqSeq && !silent) {
      detailLoading.value = false
    }
  }
}

watch([selectedNodeId, detailTab, loadHours, pingHours], ([newNodeId], [oldNodeId]) => {
  hoverIndex.value = null
  if (newNodeId !== oldNodeId) {
    hiddenPingTaskIds.value = new Set()
  }
  if (!import.meta.client) return
  if (newNodeId) {
    void fetchNodeDetail(false)
  }
  else {
    detailData.value = null
  }
})

function togglePingTask(taskId: number): void {
  const next = new Set(hiddenPingTaskIds.value)
  if (next.has(taskId)) next.delete(taskId)
  else next.add(taskId)
  hiddenPingTaskIds.value = next
}

const autoRefresh = ref(true)
const polling = ref(false)
const pollError = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null

async function pollLatest(): Promise<void> {
  if (polling.value) return
  polling.value = true
  try {
    const next = await $fetch<PublicServersResponse>('/api/servers')
    liveSnapshot.value = next
    pollError.value = false
    if (selectedNodeId.value && (detailTab.value === 'load' && loadHours.value === 0)) {
      await fetchNodeDetail(true)
    }
  }
  catch {
    pollError.value = true
  }
  finally {
    polling.value = false
  }
}

async function handleManualRefresh(): Promise<void> {
  if (hasFatalError.value) {
    await refresh()
    return
  }
  await pollLatest()
  if (selectedNodeId.value && !(detailTab.value === 'load' && loadHours.value === 0)) {
    await fetchNodeDetail(false)
  }
}

function startPolling(): void {
  stopPolling()
  pollTimer = setInterval(() => {
    if (!autoRefresh.value) return
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
    void pollLatest()
  }, 4_000)
}

function stopPolling(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

onMounted(() => {
  if (selectedNodeId.value) {
    void fetchNodeDetail(false)
  }
  startPolling()
})

onBeforeUnmount(() => {
  stopPolling()
})

const updatedTimeLabel = computed(() => {
  const raw = snapshot.value.updatedAt
  if (!raw) return '等待同步'
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return '已同步'
  return formatBeijingDateTime(parsed)
})

function progressFillClass(status: ServerBarStatus): string {
  switch (status) {
    case 'error':
      return 'server-bar-fill-error'
    case 'warning':
      return 'server-bar-fill-warning'
    case 'info':
      return 'server-bar-fill-info'
    default:
      return 'server-bar-fill-success'
  }
}

function signalBarClass(level: ServerSignalLevel): string {
  switch (level) {
    case '1':
      return 'server-signal-1'
    case '2':
      return 'server-signal-2'
    case '3':
      return 'server-signal-3'
    case '4':
      return 'server-signal-4'
    case '5':
      return 'server-signal-5'
    default:
      return 'server-signal-empty'
  }
}

// ==========================================
// SVG Smooth Area Chart Geometry Helpers
// ==========================================
const CHART_W = 640
const CHART_H = 216
const PAD_L = 58
const PAD_R = 16
const PAD_T = 14
const PAD_B = 28
const PLOT_W = CHART_W - PAD_L - PAD_R
const PLOT_H = CHART_H - PAD_T - PAD_B
const PLOT_BOTTOM = PAD_T + PLOT_H

interface SvgCoord {
  readonly x: number
  readonly y: number
}

function buildMonotonePath(pts: readonly SvgCoord[]): string {
  if (pts.length === 0) return ''
  const first = pts[0]!
  if (pts.length === 1) return `M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`

  const slopes: number[] = []
  for (let i = 0; i < pts.length - 1; i += 1) {
    const cur = pts[i]!
    const nxt = pts[i + 1]!
    const dx = nxt.x - cur.x
    slopes.push(dx > 0 ? (nxt.y - cur.y) / dx : 0)
  }

  const tangents: number[] = pts.map((_, idx) => {
    if (idx === 0) return slopes[0] ?? 0
    if (idx === pts.length - 1) return slopes[idx - 1] ?? 0
    const s0 = slopes[idx - 1] ?? 0
    const s1 = slopes[idx] ?? 0
    return s0 * s1 <= 0 ? 0 : (s0 + s1) / 2
  })

  for (let i = 0; i < slopes.length; i += 1) {
    const slope = slopes[i]!
    if (slope === 0) {
      tangents[i] = 0
      tangents[i + 1] = 0
      continue
    }
    const a = (tangents[i] ?? 0) / slope
    const b = (tangents[i + 1] ?? 0) / slope
    const h = Math.hypot(a, b)
    if (h > 3) {
      tangents[i] = (3 * a * slope) / h
      tangents[i + 1] = (3 * b * slope) / h
    }
  }

  let d = `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i]!
    const p1 = pts[i + 1]!
    const dx = (p1.x - p0.x) / 3
    const c1x = p0.x + dx
    const c1y = Math.min(PLOT_BOTTOM, Math.max(PAD_T, p0.y + dx * (tangents[i] ?? 0)))
    const c2x = p1.x - dx
    const c2y = Math.min(PLOT_BOTTOM, Math.max(PAD_T, p1.y - dx * (tangents[i + 1] ?? 0)))
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`
  }
  return d
}

function buildMonotoneAreaPath(pts: readonly SvgCoord[]): string {
  if (pts.length === 0) return ''
  const line = buildMonotonePath(pts)
  const first = pts[0]!
  const last = pts.at(-1)!
  return `${line} L ${last.x.toFixed(2)} ${PLOT_BOTTOM.toFixed(2)} L ${first.x.toFixed(2)} ${PLOT_BOTTOM.toFixed(2)} Z`
}

const loadPoints = computed<readonly PublicServerLoadPoint[]>(() => detailData.value?.loadRecords ?? [])

const activeLoadPoint = computed<PublicServerLoadPoint | null>(() => {
  const list = loadPoints.value
  if (list.length === 0) return null
  if (hoverIndex.value !== null && hoverIndex.value >= 0 && hoverIndex.value < list.length) {
    return list[hoverIndex.value]!
  }
  return list.at(-1)!
})

function handleChartPointerMove(event: MouseEvent): void {
  const count = loadPoints.value.length
  if (count === 0) return
  const svg = event.currentTarget as SVGSVGElement | null
  if (!svg) return
  const rect = svg.getBoundingClientRect()
  if (rect.width <= 0) return
  const relX = ((event.clientX - rect.left) / rect.width) * CHART_W
  const clampedX = Math.min(PAD_L + PLOT_W, Math.max(PAD_L, relX))
  const ratio = PLOT_W > 0 ? (clampedX - PAD_L) / PLOT_W : 0
  const idx = count === 1 ? 0 : Math.round(ratio * (count - 1))
  hoverIndex.value = Math.min(count - 1, Math.max(0, idx))
}

function handleChartPointerLeave(): void {
  hoverIndex.value = null
}

function xForIndex(idx: number, total: number): number {
  if (total <= 1) return PAD_L + PLOT_W / 2
  return PAD_L + (idx / (total - 1)) * PLOT_W
}

function yForValue(val: number, maxVal: number): number {
  const safeMax = maxVal > 0 ? maxVal : 1
  const ratio = Math.min(1, Math.max(0, val / safeMax))
  return PAD_T + PLOT_H - ratio * PLOT_H
}

const xTicks = computed(() => {
  const list = loadPoints.value
  if (list.length === 0) return []
  const tickCount = Math.min(5, list.length)
  if (tickCount === 1) {
    return [{ x: PAD_L + PLOT_W / 2, label: list[0]!.timeLabel }]
  }
  return Array.from({ length: tickCount }, (_, i) => {
    const idx = Math.round((i / (tickCount - 1)) * (list.length - 1))
    return {
      x: xForIndex(idx, list.length),
      label: list[idx]?.timeLabel ?? '',
    }
  })
})

const yGridRatios = [0, 0.25, 0.5, 0.75, 1] as const

// 1. CPU Chart Model
const cpuChart = computed(() => {
  const pts = loadPoints.value.map((p, idx, arr) => ({
    x: xForIndex(idx, arr.length),
    y: yForValue(p.cpu, 100),
  }))
  const yTicks = yGridRatios.map(r => ({
    y: PAD_T + PLOT_H - r * PLOT_H,
    label: String(Math.round(r * 100)),
  }))
  const activeIdx = hoverIndex.value
  const activeCoord = activeIdx !== null && pts[activeIdx] ? pts[activeIdx]! : null
  return {
    linePath: buildMonotonePath(pts),
    areaPath: buildMonotoneAreaPath(pts),
    yTicks,
    activeCoord,
  }
})

// 2. RAM Chart Model
const ramChart = computed(() => {
  const maxVal = Math.max(selectedNode.value?.ramTotal ?? 0, ...loadPoints.value.map(p => p.ram), 1)
  const pts = loadPoints.value.map((p, idx, arr) => ({
    x: xForIndex(idx, arr.length),
    y: yForValue(p.ram, maxVal),
  }))
  const yTicks = yGridRatios.map(r => ({
    y: PAD_T + PLOT_H - r * PLOT_H,
    label: r === 0 ? '0 B' : formatServerBytes(maxVal * r, 0),
  }))
  const activeIdx = hoverIndex.value
  const activeCoord = activeIdx !== null && pts[activeIdx] ? pts[activeIdx]! : null
  return {
    linePath: buildMonotonePath(pts),
    areaPath: buildMonotoneAreaPath(pts),
    yTicks,
    activeCoord,
  }
})

// 3. Disk Chart Model
const diskChart = computed(() => {
  const maxVal = Math.max(selectedNode.value?.diskTotal ?? 0, ...loadPoints.value.map(p => p.disk), 1)
  const pts = loadPoints.value.map((p, idx, arr) => ({
    x: xForIndex(idx, arr.length),
    y: yForValue(p.disk, maxVal),
  }))
  const yTicks = yGridRatios.map(r => ({
    y: PAD_T + PLOT_H - r * PLOT_H,
    label: r === 0 ? '0 B' : formatServerBytes(maxVal * r, 0),
  }))
  const activeIdx = hoverIndex.value
  const activeCoord = activeIdx !== null && pts[activeIdx] ? pts[activeIdx]! : null
  return {
    linePath: buildMonotonePath(pts),
    areaPath: buildMonotoneAreaPath(pts),
    yTicks,
    activeCoord,
  }
})

// 4. Network Chart Model
const netChart = computed(() => {
  const peak = Math.max(
    ...loadPoints.value.flatMap(p => [p.netOut, p.netIn]),
    1024,
  )
  const maxVal = peak * 1.08
  const upPts = loadPoints.value.map((p, idx, arr) => ({
    x: xForIndex(idx, arr.length),
    y: yForValue(p.netOut, maxVal),
  }))
  const downPts = loadPoints.value.map((p, idx, arr) => ({
    x: xForIndex(idx, arr.length),
    y: yForValue(p.netIn, maxVal),
  }))
  const yTicks = yGridRatios.map(r => ({
    y: PAD_T + PLOT_H - r * PLOT_H,
    label: r === 0 ? '0 B' : formatServerBytes(maxVal * r, 0),
  }))
  const activeIdx = hoverIndex.value
  const activeUpCoord = activeIdx !== null && upPts[activeIdx] ? upPts[activeIdx]! : null
  const activeDownCoord = activeIdx !== null && downPts[activeIdx] ? downPts[activeIdx]! : null
  return {
    upLinePath: buildMonotonePath(upPts),
    upAreaPath: buildMonotoneAreaPath(upPts),
    downLinePath: buildMonotonePath(downPts),
    downAreaPath: buildMonotoneAreaPath(downPts),
    yTicks,
    activeUpCoord,
    activeDownCoord,
  }
})

// Ping Chart Model
const visiblePingTasks = computed(() => {
  const tasks = detailData.value?.pingTasks ?? []
  return tasks.filter(t => !hiddenPingTaskIds.value.has(t.id))
})

const pingChart = computed(() => {
  const tasks = visiblePingTasks.value
  const allTimes = Array.from(
    new Set(tasks.flatMap(t => t.points.map(p => p.time))),
  ).sort((a, b) => a - b)
  if (allTimes.length === 0) {
    return { series: [], yTicks: [], xTicks: [] }
  }
  const minTime = allTimes[0]!
  const maxTime = allTimes.at(-1)!
  const timeSpan = Math.max(1, maxTime - minTime)
  const maxLat = Math.max(
    ...tasks.flatMap(t => t.points.map(p => p.value ?? 0)),
    100,
  ) * 1.1

  const series = tasks.map((task) => {
    const coords = task.points
      .filter(p => p.value !== null && Number.isFinite(p.value))
      .map(p => ({
        x: PAD_L + ((p.time - minTime) / timeSpan) * PLOT_W,
        y: yForValue(p.value ?? 0, maxLat),
      }))
    return {
      id: task.id,
      name: task.name,
      color: task.color,
      linePath: buildMonotonePath(coords),
    }
  })

  const yTicks = yGridRatios.map(r => ({
    y: PAD_T + PLOT_H - r * PLOT_H,
    label: `${Math.round(maxLat * r)} ms`,
  }))

  const firstTaskPts = tasks[0]?.points ?? []
  const tickCount = Math.min(5, firstTaskPts.length)
  const xTickList = tickCount > 1
    ? Array.from({ length: tickCount }, (_, i) => {
        const idx = Math.round((i / (tickCount - 1)) * (firstTaskPts.length - 1))
        const pt = firstTaskPts[idx]!
        return {
          x: PAD_L + ((pt.time - minTime) / timeSpan) * PLOT_W,
          label: pt.timeLabel,
        }
      })
    : []

  return { series, yTicks, xTicks: xTickList }
})

usePublicSeo({
  title: '服务器监控',
  path: '/servers',
  description: '桂航绯想天服务器节点实时运行状态、资源负载、流量统计与在线资产监控。',
})
</script>

<template>
  <div class="servers-stage club-paper min-h-screen pb-20 text-slate-900 dark:text-slate-100">
    <!-- Page Header -->
    <header class="servers-page-header">
      <div class="club-container servers-header-layout club-hero-step">
        <div class="min-w-0">
          <p class="club-eyebrow">河童重工 · 结界基础设施</p>
          <h1 class="club-page-title mt-3">服务器监控</h1>
          <p class="servers-header-description">
            实时观测桂航绯想天各服务器节点的在线状态、硬件负载、网络吞吐与资产周期。
          </p>
        </div>

        <div class="servers-toolbar" role="region" aria-label="监控刷新控制">
          <div class="servers-sync-pill" role="status" aria-live="polite">
            <span
              class="servers-sync-dot"
              :class="pollError ? 'is-warning' : overview.offline > 0 ? 'is-warning' : 'is-online'"
              aria-hidden="true"
            />
            <span class="font-mono text-xs">
              {{ polling ? '正在同步节点数据…' : `更新于 ${updatedTimeLabel}` }}
            </span>
          </div>

          <div class="flex items-center gap-2">
            <button
              type="button"
              class="servers-ctrl-btn"
              :aria-pressed="autoRefresh"
              @click="autoRefresh = !autoRefresh"
            >
              <span>{{ autoRefresh ? '自动刷新：开启' : '自动刷新：暂停' }}</span>
            </button>
            <button
              type="button"
              class="servers-ctrl-btn is-primary"
              :disabled="polling || isInitialLoading"
              @click="handleManualRefresh"
            >
              <svg
                class="h-3.5 w-3.5"
                :class="{ 'animate-spin': polling || isInitialLoading }"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
              <span>刷新</span>
            </button>
          </div>
        </div>
      </div>
    </header>

    <div class="club-container space-y-6 sm:space-y-8">
      <!-- Error State -->
      <div
        v-if="hasFatalError"
        class="servers-error-panel"
        role="alert"
      >
        <p class="text-sm font-semibold text-rose-700 dark:text-rose-300">
          监控面板数据暂时无法连接
        </p>
        <p class="mt-1 text-xs text-slate-600 dark:text-slate-400">
          内网监控节点响应超时或正在维护，请稍后重试。
        </p>
        <button
          type="button"
          class="servers-ctrl-btn is-primary mt-4"
          @click="handleManualRefresh"
        >
          重新加载
        </button>
      </div>

      <!-- ==================================================== -->
      <!-- NODE DETAIL PANEL VIEW (When a server card is clicked) -->
      <!-- ==================================================== -->
      <div
        v-else-if="selectedNode"
        :key="`detail-${selectedNode.id}`"
        class="space-y-3.5"
        role="region"
        :aria-label="`${selectedNode.name} 节点详情面板`"
      >
        <!-- 1. Top Node Identity Bar -->
        <section
          class="server-detail-panel server-detail-enter px-4 py-3.5 sm:px-5"
          style="--detail-delay: 0ms"
        >
          <div class="flex min-w-0 items-center gap-3">
            <button
              type="button"
              class="server-back-btn -ml-1 shrink-0"
              aria-label="返回节点列表"
              title="返回节点列表"
              @click="clearSelectedNode"
            >
              <svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="m12 19-7-7 7-7" />
                <path d="M19 12H5" />
              </svg>
            </button>

            <span class="server-detail-country font-mono" :title="selectedNode.countryName">
              {{ selectedNode.countryCode }}
            </span>

            <div class="min-w-0 flex-1">
              <div class="flex min-w-0 items-center gap-2">
                <h2 class="truncate text-lg font-bold text-slate-900 dark:text-slate-50 sm:text-xl">
                  {{ selectedNode.name }}
                </h2>
                <span
                  class="server-detail-status-pill shrink-0"
                  :class="selectedNode.online ? 'is-online' : 'is-offline'"
                >
                  {{ selectedNode.online ? '在线' : '离线' }}
                </span>
              </div>

              <div class="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span class="inline-flex shrink-0 items-center">
                  <svg
                    v-if="selectedNode.osKey === 'ubuntu'"
                    class="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" fill="#E95420" />
                    <circle cx="12" cy="12" r="4.3" fill="none" stroke="#ffffff" stroke-width="1.5" />
                    <circle cx="6.2" cy="12" r="1.45" fill="#ffffff" />
                    <circle cx="14.9" cy="7.0" r="1.45" fill="#ffffff" />
                    <circle cx="14.9" cy="17.0" r="1.45" fill="#ffffff" />
                  </svg>
                  <svg
                    v-else-if="selectedNode.osKey === 'debian'"
                    class="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" fill="#A80030" />
                    <path d="M12 6.5c3.2 0 5.5 2.3 5.5 5.2 0 2.6-2 4.6-4.5 4.6-1.8 0-3.2-1.2-3.2-2.8 0-1.3.9-2.3 2.2-2.3 1 0 1.7.7 1.7 1.5" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" />
                  </svg>
                  <svg
                    v-else-if="selectedNode.osKey === 'windows'"
                    class="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path fill="#00ADEF" d="M3 4.5 10.8 3.4v7.8H3V4.5Zm8.8-1.2L21 2v9.2h-9.2V3.3ZM3 12.8h7.8v7.8L3 19.5v-6.7Zm8.8 0H21V22l-9.2-1.3v-7.9Z" />
                  </svg>
                  <svg
                    v-else
                    class="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" fill="#0284c7" />
                    <path d="M9 9.5h.01M15 9.5h.01M8.5 14c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2" fill="none" stroke="#ffffff" stroke-width="1.7" stroke-linecap="round" />
                  </svg>
                </span>
                <span class="truncate">{{ selectedNode.countryName }}</span>
              </div>
            </div>
          </div>
        </section>

        <!-- 2. Hardware Info & System Info 2-Column Grid -->
        <div class="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
          <!-- Left: 硬件信息 -->
          <section
            class="server-detail-panel server-detail-enter p-4"
            style="--detail-delay: 55ms"
          >
            <h3 class="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <span class="text-emerald-600 dark:text-emerald-400" aria-hidden="true">
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                </svg>
              </span>
              <span>硬件信息</span>
            </h3>

            <div class="server-detail-info-grid">
              <!-- 处理器 -->
              <div class="server-detail-info-item">
                <span class="server-detail-info-icon" aria-hidden="true">
                  <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                    <rect x="9" y="9" width="6" height="6" />
                    <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
                  </svg>
                </span>
                <div class="min-w-0 flex-1">
                  <p class="server-detail-info-label">处理器</p>
                  <p class="server-detail-info-value">
                    {{ `${selectedNode.cpuName || '--'} (x${selectedNode.cpuCores || 0})` }}
                  </p>
                </div>
              </div>

              <!-- 架构 -->
              <div class="server-detail-info-item">
                <span class="server-detail-info-icon" aria-hidden="true">
                  <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                  </svg>
                </span>
                <div class="min-w-0 flex-1">
                  <p class="server-detail-info-label">架构</p>
                  <p class="server-detail-info-value">{{ selectedNode.arch || '--' }}</p>
                </div>
              </div>

              <!-- 图形设备 -->
              <div class="server-detail-info-item has-top-divider">
                <span class="server-detail-info-icon" aria-hidden="true">
                  <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2" y="6" width="20" height="12" rx="2" />
                    <circle cx="8" cy="12" r="2" />
                    <circle cx="16" cy="12" r="2" />
                  </svg>
                </span>
                <div class="min-w-0 flex-1">
                  <p class="server-detail-info-label">图形设备</p>
                  <p class="server-detail-info-value">{{ selectedNode.gpuName || '未检测到' }}</p>
                </div>
              </div>

              <!-- 虚拟化 -->
              <div class="server-detail-info-item has-top-divider">
                <span class="server-detail-info-icon" aria-hidden="true">
                  <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2" y="2" width="20" height="8" rx="2" />
                    <rect x="2" y="14" width="20" height="8" rx="2" />
                    <line x1="6" y1="6" x2="6.01" y2="6" />
                    <line x1="6" y1="18" x2="6.01" y2="18" />
                  </svg>
                </span>
                <div class="min-w-0 flex-1">
                  <p class="server-detail-info-label">虚拟化</p>
                  <p class="server-detail-info-value">{{ selectedNode.virtualization || '--' }}</p>
                </div>
              </div>
            </div>
          </section>

          <!-- Right: 系统信息 -->
          <section
            class="server-detail-panel server-detail-enter p-4"
            style="--detail-delay: 105ms"
          >
            <h3 class="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <span class="text-emerald-600 dark:text-emerald-400" aria-hidden="true">
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="2" width="20" height="8" rx="2" />
                  <rect x="2" y="14" width="20" height="8" rx="2" />
                  <line x1="6" y1="6" x2="6.01" y2="6" />
                  <line x1="6" y1="18" x2="6.01" y2="18" />
                </svg>
              </span>
              <span>系统信息</span>
            </h3>

            <div class="server-detail-info-grid">
              <!-- 操作系统 -->
              <div class="server-detail-info-item">
                <span class="server-detail-info-icon" aria-hidden="true">
                  <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </span>
                <div class="min-w-0 flex-1">
                  <p class="server-detail-info-label">操作系统</p>
                  <p class="server-detail-info-value">{{ selectedNode.os || '--' }}</p>
                </div>
              </div>

              <!-- 运行时间 -->
              <div class="server-detail-info-item">
                <span class="server-detail-info-icon" aria-hidden="true">
                  <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </span>
                <div class="min-w-0 flex-1">
                  <p class="server-detail-info-label">运行时间</p>
                  <p class="server-detail-info-value">{{ selectedNode.uptimeDetailText }}</p>
                </div>
              </div>

              <!-- 内核版本 -->
              <div class="server-detail-info-item has-top-divider">
                <span class="server-detail-info-icon" aria-hidden="true">
                  <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="4 17 10 11 4 5" />
                    <line x1="12" y1="19" x2="20" y2="19" />
                  </svg>
                </span>
                <div class="min-w-0 flex-1">
                  <p class="server-detail-info-label">内核版本</p>
                  <p class="server-detail-info-value">{{ selectedNode.kernelVersion || '--' }}</p>
                </div>
              </div>

              <!-- 进程 / 连接 -->
              <div class="server-detail-info-item has-top-divider">
                <span class="server-detail-info-icon" aria-hidden="true">
                  <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                </span>
                <div class="min-w-0 flex-1">
                  <p class="server-detail-info-label">进程 / 连接</p>
                  <p class="server-detail-info-value">{{ selectedNode.processConnectionsText }}</p>
                </div>
              </div>
            </div>
          </section>

          <!-- Optional Public Remark -->
          <section
            v-if="selectedNode.publicRemark"
            class="server-detail-panel p-4 lg:col-span-2"
          >
            <h3 class="mb-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
              公开备注
            </h3>
            <p class="whitespace-pre-wrap break-words text-sm leading-6 text-slate-600 dark:text-slate-400">
              {{ selectedNode.publicRemark }}
            </p>
          </section>
        </div>

        <!-- 3. Segmented Controls & Telemetry Charts -->
        <section
          class="server-detail-enter space-y-3"
          style="--detail-delay: 155ms"
          aria-label="节点遥测趋势图表"
        >
          <div class="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <!-- Left: Chart Type (负载 / 延迟) -->
            <div class="server-segmented-group" role="group" aria-label="图表类型">
              <button
                type="button"
                class="server-segment-btn"
                :class="{ 'is-active': detailTab === 'load' }"
                :aria-pressed="detailTab === 'load'"
                @click="detailTab = 'load'"
              >
                <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
                </svg>
                <span>负载</span>
              </button>
              <button
                type="button"
                class="server-segment-btn"
                :class="{ 'is-active': detailTab === 'ping' }"
                :aria-pressed="detailTab === 'ping'"
                @click="detailTab = 'ping'"
              >
                <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
                  <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
                  <circle cx="12" cy="12" r="2" />
                  <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
                  <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" />
                </svg>
                <span>延迟</span>
              </button>
            </div>

            <!-- Right: Time Range (实时 / 1 小时 / 4 小时 / 1 天) -->
            <div class="server-segmented-group overflow-x-auto" role="group" aria-label="时间范围">
              <template v-if="detailTab === 'load'">
                <button
                  v-for="range in LOAD_TIME_RANGES"
                  :key="range.hours"
                  type="button"
                  class="server-segment-btn"
                  :class="{ 'is-active': loadHours === range.hours }"
                  :aria-pressed="loadHours === range.hours"
                  @click="loadHours = range.hours"
                >
                  {{ range.label }}
                </button>
              </template>
              <template v-else>
                <button
                  v-for="range in PING_TIME_RANGES"
                  :key="range.hours"
                  type="button"
                  class="server-segment-btn"
                  :class="{ 'is-active': pingHours === range.hours }"
                  :aria-pressed="pingHours === range.hours"
                  @click="pingHours = range.hours"
                >
                  {{ range.label }}
                </button>
              </template>
            </div>
          </div>

          <!-- Loading / Error States for Detail Charts -->
          <div
            v-if="detailLoading && loadPoints.length === 0"
            class="server-detail-panel flex min-h-[16rem] flex-col items-center justify-center gap-3 p-8 text-center"
          >
            <div class="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500/20 border-t-emerald-500" />
            <p class="text-xs text-slate-500 dark:text-slate-400">正在同步节点历史曲线…</p>
          </div>

          <div
            v-else-if="detailError && loadPoints.length === 0"
            class="server-detail-panel p-8 text-center text-sm text-rose-600 dark:text-rose-400"
          >
            {{ detailError }}
          </div>

          <!-- LOAD TAB: 2x2 Charts (CPU, 内存, 硬盘, 网络) -->
          <div
            v-else-if="detailTab === 'load'"
            class="grid grid-cols-1 gap-3.5 md:grid-cols-2"
          >
            <!-- Chart 1: CPU -->
            <div class="server-detail-panel server-detail-enter p-4" style="--detail-delay: 190ms">
              <div class="mb-2 flex items-center justify-between gap-2">
                <h4 class="text-sm font-semibold text-slate-900 dark:text-slate-100">CPU</h4>
                <span class="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                  {{ activeLoadPoint ? `${activeLoadPoint.cpu.toFixed(2)}%` : `${selectedNode.cpuUsage.toFixed(2)}%` }}
                </span>
              </div>
              <div class="relative h-48 w-full sm:h-52">
                <svg
                  class="h-full w-full select-none overflow-visible"
                  :viewBox="`0 0 ${CHART_W} ${CHART_H}`"
                  preserveAspectRatio="none"
                  @mousemove="handleChartPointerMove"
                  @mouseleave="handleChartPointerLeave"
                >
                  <defs>
                    <linearGradient id="server-cpu-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.24" />
                      <stop offset="100%" stop-color="#f43f5e" stop-opacity="0.02" />
                    </linearGradient>
                  </defs>
                  <!-- Horizontal Gridlines & Y Labels -->
                  <g v-for="yt in cpuChart.yTicks" :key="`cpu-y-${yt.label}`">
                    <line
                      :x1="PAD_L"
                      :y1="yt.y"
                      :x2="PAD_L + PLOT_W"
                      :y2="yt.y"
                      class="server-chart-gridline"
                      stroke-dasharray="3 3"
                    />
                    <text
                      :x="PAD_L - 8"
                      :y="yt.y + 3.5"
                      text-anchor="end"
                      class="server-chart-axis-text"
                    >
                      {{ yt.label }}
                    </text>
                  </g>
                  <!-- Vertical Gridlines & X Labels -->
                  <g v-for="(xt, idx) in xTicks" :key="`cpu-x-${idx}`">
                    <line
                      :x1="xt.x"
                      :y1="PAD_T"
                      :x2="xt.x"
                      :y2="PLOT_BOTTOM"
                      class="server-chart-gridline"
                      stroke-dasharray="3 3"
                    />
                    <text
                      :x="xt.x"
                      :y="CHART_H - 6"
                      :text-anchor="idx === 0 ? 'start' : idx === xTicks.length - 1 ? 'end' : 'middle'"
                      class="server-chart-axis-text"
                    >
                      {{ xt.label }}
                    </text>
                  </g>
                  <!-- Axes Baseline -->
                  <line :x1="PAD_L" :y1="PAD_T" :x2="PAD_L" :y2="PLOT_BOTTOM" class="server-chart-axis-line" />
                  <line :x1="PAD_L" :y1="PLOT_BOTTOM" :x2="PAD_L + PLOT_W" :y2="PLOT_BOTTOM" class="server-chart-axis-line" />
                  <!-- Area & Line -->
                  <path v-if="cpuChart.areaPath" :d="cpuChart.areaPath" fill="url(#server-cpu-grad)" />
                  <path v-if="cpuChart.linePath" :d="cpuChart.linePath" fill="none" stroke="#f43f5e" stroke-width="2" stroke-linecap="round" />
                  <!-- Active Crosshair -->
                  <g v-if="cpuChart.activeCoord">
                    <line
                      :x1="cpuChart.activeCoord.x"
                      :y1="PAD_T"
                      :x2="cpuChart.activeCoord.x"
                      :y2="PLOT_BOTTOM"
                      class="server-chart-crosshair"
                      stroke-dasharray="3 3"
                    />
                    <circle
                      :cx="cpuChart.activeCoord.x"
                      :cy="cpuChart.activeCoord.y"
                      r="3.5"
                      fill="#f43f5e"
                      stroke="#0f172a"
                      stroke-width="1.5"
                    />
                  </g>
                </svg>
              </div>
            </div>

            <!-- Chart 2: 内存 -->
            <div class="server-detail-panel server-detail-enter p-4" style="--detail-delay: 240ms">
              <div class="mb-2 flex items-center justify-between gap-2">
                <h4 class="text-sm font-semibold text-slate-900 dark:text-slate-100">内存</h4>
                <span class="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                  {{ activeLoadPoint ? `${formatServerBytes(activeLoadPoint.ram)} / ${formatServerBytes(selectedNode.ramTotal)}` : selectedNode.ramSubText }}
                </span>
              </div>
              <div class="relative h-48 w-full sm:h-52">
                <svg
                  class="h-full w-full select-none overflow-visible"
                  :viewBox="`0 0 ${CHART_W} ${CHART_H}`"
                  preserveAspectRatio="none"
                  @mousemove="handleChartPointerMove"
                  @mouseleave="handleChartPointerLeave"
                >
                  <defs>
                    <linearGradient id="server-ram-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="#0ea5a5" stop-opacity="0.26" />
                      <stop offset="100%" stop-color="#0ea5a5" stop-opacity="0.04" />
                    </linearGradient>
                  </defs>
                  <g v-for="yt in ramChart.yTicks" :key="`ram-y-${yt.label}`">
                    <line
                      :x1="PAD_L"
                      :y1="yt.y"
                      :x2="PAD_L + PLOT_W"
                      :y2="yt.y"
                      class="server-chart-gridline"
                      stroke-dasharray="3 3"
                    />
                    <text
                      :x="PAD_L - 8"
                      :y="yt.y + 3.5"
                      text-anchor="end"
                      class="server-chart-axis-text"
                    >
                      {{ yt.label }}
                    </text>
                  </g>
                  <g v-for="(xt, idx) in xTicks" :key="`ram-x-${idx}`">
                    <line
                      :x1="xt.x"
                      :y1="PAD_T"
                      :x2="xt.x"
                      :y2="PLOT_BOTTOM"
                      class="server-chart-gridline"
                      stroke-dasharray="3 3"
                    />
                    <text
                      :x="xt.x"
                      :y="CHART_H - 6"
                      :text-anchor="idx === 0 ? 'start' : idx === xTicks.length - 1 ? 'end' : 'middle'"
                      class="server-chart-axis-text"
                    >
                      {{ xt.label }}
                    </text>
                  </g>
                  <line :x1="PAD_L" :y1="PAD_T" :x2="PAD_L" :y2="PLOT_BOTTOM" class="server-chart-axis-line" />
                  <line :x1="PAD_L" :y1="PLOT_BOTTOM" :x2="PAD_L + PLOT_W" :y2="PLOT_BOTTOM" class="server-chart-axis-line" />
                  <path v-if="ramChart.areaPath" :d="ramChart.areaPath" fill="url(#server-ram-grad)" />
                  <path v-if="ramChart.linePath" :d="ramChart.linePath" fill="none" stroke="#0ea5a5" stroke-width="2" stroke-linecap="round" />
                  <g v-if="ramChart.activeCoord">
                    <line
                      :x1="ramChart.activeCoord.x"
                      :y1="PAD_T"
                      :x2="ramChart.activeCoord.x"
                      :y2="PLOT_BOTTOM"
                      class="server-chart-crosshair"
                      stroke-dasharray="3 3"
                    />
                    <circle
                      :cx="ramChart.activeCoord.x"
                      :cy="ramChart.activeCoord.y"
                      r="3.5"
                      fill="#0ea5a5"
                      stroke="#0f172a"
                      stroke-width="1.5"
                    />
                  </g>
                </svg>
              </div>
            </div>

            <!-- Chart 3: 硬盘 -->
            <div class="server-detail-panel server-detail-enter p-4" style="--detail-delay: 290ms">
              <div class="mb-2 flex items-center justify-between gap-2">
                <h4 class="text-sm font-semibold text-slate-900 dark:text-slate-100">硬盘</h4>
                <span class="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                  {{ activeLoadPoint ? `${formatServerBytes(activeLoadPoint.disk)} / ${formatServerBytes(selectedNode.diskTotal)}` : selectedNode.diskSubText }}
                </span>
              </div>
              <div class="relative h-48 w-full sm:h-52">
                <svg
                  class="h-full w-full select-none overflow-visible"
                  :viewBox="`0 0 ${CHART_W} ${CHART_H}`"
                  preserveAspectRatio="none"
                  @mousemove="handleChartPointerMove"
                  @mouseleave="handleChartPointerLeave"
                >
                  <defs>
                    <linearGradient id="server-disk-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.26" />
                      <stop offset="100%" stop-color="#f59e0b" stop-opacity="0.04" />
                    </linearGradient>
                  </defs>
                  <g v-for="yt in diskChart.yTicks" :key="`disk-y-${yt.label}`">
                    <line
                      :x1="PAD_L"
                      :y1="yt.y"
                      :x2="PAD_L + PLOT_W"
                      :y2="yt.y"
                      class="server-chart-gridline"
                      stroke-dasharray="3 3"
                    />
                    <text
                      :x="PAD_L - 8"
                      :y="yt.y + 3.5"
                      text-anchor="end"
                      class="server-chart-axis-text"
                    >
                      {{ yt.label }}
                    </text>
                  </g>
                  <g v-for="(xt, idx) in xTicks" :key="`disk-x-${idx}`">
                    <line
                      :x1="xt.x"
                      :y1="PAD_T"
                      :x2="xt.x"
                      :y2="PLOT_BOTTOM"
                      class="server-chart-gridline"
                      stroke-dasharray="3 3"
                    />
                    <text
                      :x="xt.x"
                      :y="CHART_H - 6"
                      :text-anchor="idx === 0 ? 'start' : idx === xTicks.length - 1 ? 'end' : 'middle'"
                      class="server-chart-axis-text"
                    >
                      {{ xt.label }}
                    </text>
                  </g>
                  <line :x1="PAD_L" :y1="PAD_T" :x2="PAD_L" :y2="PLOT_BOTTOM" class="server-chart-axis-line" />
                  <line :x1="PAD_L" :y1="PLOT_BOTTOM" :x2="PAD_L + PLOT_W" :y2="PLOT_BOTTOM" class="server-chart-axis-line" />
                  <path v-if="diskChart.areaPath" :d="diskChart.areaPath" fill="url(#server-disk-grad)" />
                  <path v-if="diskChart.linePath" :d="diskChart.linePath" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" />
                  <g v-if="diskChart.activeCoord">
                    <line
                      :x1="diskChart.activeCoord.x"
                      :y1="PAD_T"
                      :x2="diskChart.activeCoord.x"
                      :y2="PLOT_BOTTOM"
                      class="server-chart-crosshair"
                      stroke-dasharray="3 3"
                    />
                    <circle
                      :cx="diskChart.activeCoord.x"
                      :cy="diskChart.activeCoord.y"
                      r="3.5"
                      fill="#f59e0b"
                      stroke="#0f172a"
                      stroke-width="1.5"
                    />
                  </g>
                </svg>
              </div>
            </div>

            <!-- Chart 4: 网络 -->
            <div class="server-detail-panel server-detail-enter p-4" style="--detail-delay: 340ms">
              <div class="mb-2 flex items-center justify-between gap-2">
                <h4 class="text-sm font-semibold text-slate-900 dark:text-slate-100">网络</h4>
                <span class="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                  {{ activeLoadPoint ? `↑ ${formatServerSpeed(activeLoadPoint.netOut)}  ↓ ${formatServerSpeed(activeLoadPoint.netIn)}` : `↑ ${selectedNode.speedUpText}  ↓ ${selectedNode.speedDownText}` }}
                </span>
              </div>
              <div class="relative h-48 w-full sm:h-52">
                <svg
                  class="h-full w-full select-none overflow-visible"
                  :viewBox="`0 0 ${CHART_W} ${CHART_H}`"
                  preserveAspectRatio="none"
                  @mousemove="handleChartPointerMove"
                  @mouseleave="handleChartPointerLeave"
                >
                  <defs>
                    <linearGradient id="server-net-up-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="#10b981" stop-opacity="0.24" />
                      <stop offset="100%" stop-color="#10b981" stop-opacity="0.02" />
                    </linearGradient>
                    <linearGradient id="server-net-down-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.22" />
                      <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.02" />
                    </linearGradient>
                  </defs>
                  <g v-for="yt in netChart.yTicks" :key="`net-y-${yt.label}`">
                    <line
                      :x1="PAD_L"
                      :y1="yt.y"
                      :x2="PAD_L + PLOT_W"
                      :y2="yt.y"
                      class="server-chart-gridline"
                      stroke-dasharray="3 3"
                    />
                    <text
                      :x="PAD_L - 8"
                      :y="yt.y + 3.5"
                      text-anchor="end"
                      class="server-chart-axis-text"
                    >
                      {{ yt.label }}
                    </text>
                  </g>
                  <g v-for="(xt, idx) in xTicks" :key="`net-x-${idx}`">
                    <line
                      :x1="xt.x"
                      :y1="PAD_T"
                      :x2="xt.x"
                      :y2="PLOT_BOTTOM"
                      class="server-chart-gridline"
                      stroke-dasharray="3 3"
                    />
                    <text
                      :x="xt.x"
                      :y="CHART_H - 6"
                      :text-anchor="idx === 0 ? 'start' : idx === xTicks.length - 1 ? 'end' : 'middle'"
                      class="server-chart-axis-text"
                    >
                      {{ xt.label }}
                    </text>
                  </g>
                  <line :x1="PAD_L" :y1="PAD_T" :x2="PAD_L" :y2="PLOT_BOTTOM" class="server-chart-axis-line" />
                  <line :x1="PAD_L" :y1="PLOT_BOTTOM" :x2="PAD_L + PLOT_W" :y2="PLOT_BOTTOM" class="server-chart-axis-line" />
                  <path v-if="netChart.upAreaPath" :d="netChart.upAreaPath" fill="url(#server-net-up-grad)" />
                  <path v-if="netChart.downAreaPath" :d="netChart.downAreaPath" fill="url(#server-net-down-grad)" />
                  <path v-if="netChart.upLinePath" :d="netChart.upLinePath" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" />
                  <path v-if="netChart.downLinePath" :d="netChart.downLinePath" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" />
                  <g v-if="netChart.activeUpCoord && netChart.activeDownCoord">
                    <line
                      :x1="netChart.activeUpCoord.x"
                      :y1="PAD_T"
                      :x2="netChart.activeUpCoord.x"
                      :y2="PLOT_BOTTOM"
                      class="server-chart-crosshair"
                      stroke-dasharray="3 3"
                    />
                    <circle
                      :cx="netChart.activeUpCoord.x"
                      :cy="netChart.activeUpCoord.y"
                      r="3.5"
                      fill="#10b981"
                      stroke="#0f172a"
                      stroke-width="1.5"
                    />
                    <circle
                      :cx="netChart.activeDownCoord.x"
                      :cy="netChart.activeDownCoord.y"
                      r="3.5"
                      fill="#3b82f6"
                      stroke="#0f172a"
                      stroke-width="1.5"
                    />
                  </g>
                </svg>
              </div>
            </div>
          </div>

          <!-- PING TAB: Multi-task Latency Chart -->
          <div v-else>
            <div
              v-if="detailData?.pingTasks && detailData.pingTasks.length > 0"
              class="server-detail-panel p-4"
            >
              <div class="mb-3 flex flex-col gap-2 border-b border-slate-200/70 pb-3 dark:border-slate-800">
                <h4 class="text-sm font-semibold text-slate-900 dark:text-slate-100">延迟监测</h4>
                <div class="flex flex-wrap gap-x-5 gap-y-1.5">
                  <button
                    v-for="task in detailData.pingTasks"
                    :key="task.id"
                    type="button"
                    class="flex items-center gap-2 rounded px-1.5 py-0.5 text-xs transition-opacity"
                    :class="hiddenPingTaskIds.has(task.id) ? 'opacity-40 hover:opacity-70' : 'opacity-100'"
                    :aria-pressed="!hiddenPingTaskIds.has(task.id)"
                    @click="togglePingTask(task.id)"
                  >
                    <span class="h-2 w-2 shrink-0 rounded-full" :style="{ backgroundColor: task.color }" />
                    <span class="font-medium text-slate-800 dark:text-slate-200">{{ task.name }}</span>
                    <span class="font-mono text-slate-500 dark:text-slate-400">{{ task.latestLatency.toFixed(1) }} ms</span>
                    <span class="font-mono text-slate-500 dark:text-slate-400">丢包 {{ task.lossPercent.toFixed(1) }}%</span>
                  </button>
                </div>
              </div>

              <div class="relative h-64 w-full">
                <svg
                  class="h-full w-full select-none overflow-visible"
                  :viewBox="`0 0 ${CHART_W} ${CHART_H}`"
                  preserveAspectRatio="none"
                >
                  <g v-for="yt in pingChart.yTicks" :key="`ping-y-${yt.label}`">
                    <line
                      :x1="PAD_L"
                      :y1="yt.y"
                      :x2="PAD_L + PLOT_W"
                      :y2="yt.y"
                      class="server-chart-gridline"
                      stroke-dasharray="3 3"
                    />
                    <text
                      :x="PAD_L - 8"
                      :y="yt.y + 3.5"
                      text-anchor="end"
                      class="server-chart-axis-text"
                    >
                      {{ yt.label }}
                    </text>
                  </g>
                  <g v-for="(xt, idx) in pingChart.xTicks" :key="`ping-x-${idx}`">
                    <line
                      :x1="xt.x"
                      :y1="PAD_T"
                      :x2="xt.x"
                      :y2="PLOT_BOTTOM"
                      class="server-chart-gridline"
                      stroke-dasharray="3 3"
                    />
                    <text
                      :x="xt.x"
                      :y="CHART_H - 6"
                      :text-anchor="idx === 0 ? 'start' : idx === pingChart.xTicks.length - 1 ? 'end' : 'middle'"
                      class="server-chart-axis-text"
                    >
                      {{ xt.label }}
                    </text>
                  </g>
                  <line :x1="PAD_L" :y1="PAD_T" :x2="PAD_L" :y2="PLOT_BOTTOM" class="server-chart-axis-line" />
                  <line :x1="PAD_L" :y1="PLOT_BOTTOM" :x2="PAD_L + PLOT_W" :y2="PLOT_BOTTOM" class="server-chart-axis-line" />
                  <path
                    v-for="s in pingChart.series"
                    :key="s.id"
                    :d="s.linePath"
                    fill="none"
                    :stroke="s.color"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                </svg>
              </div>
            </div>

            <div
              v-else
              class="server-detail-panel p-8 text-center text-sm text-slate-500 dark:text-slate-400"
            >
              暂无延迟采样数据
            </div>
          </div>
        </section>
      </div>

      <!-- ==================================================== -->
      <!-- OVERVIEW & SERVER CARDS GRID VIEW                    -->
      <!-- ==================================================== -->
      <template v-else>
        <!-- Top 4 Overview Strip (Matches Komari Glass Overview Bar) -->
        <section
          class="servers-overview-strip"
          aria-label="服务器总览"
        >
          <!-- 1. 在线节点 -->
          <div class="servers-overview-card">
            <div class="servers-overview-top">
              <span class="servers-overview-label">在线节点</span>
              <span class="servers-overview-icon" aria-hidden="true">
                <ClubIcon name="server" class="h-4 w-4" />
              </span>
            </div>
            <div class="servers-overview-main">
              <span class="servers-overview-value is-emerald">{{ overview.online }}</span>
              <span class="servers-overview-unit">/ {{ overview.total }} 台</span>
            </div>
            <div class="servers-overview-sub">
              <span>{{ overview.statusText }}</span>
            </div>
          </div>

          <!-- 2. 在线资产 -->
          <div class="servers-overview-card">
            <div class="servers-overview-top">
              <span class="servers-overview-label">在线资产</span>
              <span class="servers-overview-icon" aria-hidden="true">
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 7h18" />
                  <path d="M3 11h3.75a2 2 0 0 1 1.6.8l.45.6a4 4 0 0 0 6.4 0l.45-.6a2 2 0 0 1 1.6-.8H21" />
                </svg>
              </span>
            </div>
            <div class="servers-overview-main">
              <span class="servers-overview-value">{{ overview.totalValueText }}</span>
            </div>
            <div class="servers-overview-sub">
              <span>剩余 {{ overview.remainingValueText }}</span>
              <span>{{ overview.paidCount }} 台计费</span>
            </div>
          </div>

          <!-- 3. 累计流量 -->
          <div class="servers-overview-card">
            <div class="servers-overview-top">
              <span class="servers-overview-label">累计流量</span>
              <span class="servers-overview-icon" aria-hidden="true">
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <ellipse cx="12" cy="5" rx="9" ry="3" />
                  <path d="M3 5V19A9 3 0 0 0 21 19V5" />
                  <path d="M3 12A9 3 0 0 0 21 12" />
                </svg>
              </span>
            </div>
            <div class="servers-overview-main">
              <span class="servers-overview-value">{{ overview.trafficTotalValue }}</span>
              <span class="servers-overview-unit">{{ overview.trafficTotalUnit }}</span>
            </div>
            <div class="servers-overview-sub">
              <span class="servers-sub-emerald">上传 {{ overview.trafficUpText }}</span>
              <span class="servers-sub-sky">下载 {{ overview.trafficDownText }}</span>
            </div>
          </div>

          <!-- 4. 实时网速 -->
          <div class="servers-overview-card">
            <div class="servers-overview-top">
              <span class="servers-overview-label">实时网速</span>
              <span class="servers-overview-icon" aria-hidden="true">
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
                </svg>
              </span>
            </div>
            <div class="servers-overview-main">
              <span class="servers-overview-value">{{ overview.speedTotalText }}</span>
            </div>
            <div class="servers-overview-sub">
              <span class="servers-sub-emerald">↑ {{ overview.speedUpText }}</span>
              <span class="servers-sub-sky">↓ {{ overview.speedDownText }}</span>
            </div>
          </div>
        </section>

        <!-- Server Nodes Grid -->
        <section aria-label="服务器节点列表">
          <div
            v-if="nodes.length === 0 && !isInitialLoading"
            class="servers-empty-panel"
          >
            <p class="text-sm font-medium text-slate-600 dark:text-slate-300">
              当前暂无公开的服务器节点数据
            </p>
          </div>

          <div
            v-else
            class="grid grid-cols-1 items-start gap-4 md:grid-cols-2 lg:grid-cols-3"
          >
            <article
              v-for="(node, index) in nodes"
              :key="node.id"
              role="button"
              tabindex="0"
              class="server-node-card is-interactive"
              :class="{ 'is-offline': !node.online }"
              :style="{ '--card-delay': `${Math.min(index, 11) * 90}ms` }"
              :aria-label="`查看 ${node.name} 节点详细硬件与负载面板`"
              @click="selectNode(node.id)"
              @keydown.enter.prevent="selectNode(node.id)"
              @keydown.space.prevent="selectNode(node.id)"
            >
              <!-- Card Header: Status Dot + Name + OS Icon + Country Code -->
              <header class="server-card-header">
                <div class="flex min-w-0 flex-1 items-center gap-2.5">
                  <span class="server-status-indicator" aria-hidden="true">
                    <span
                      class="server-status-core"
                      :class="node.online ? 'is-online' : 'is-offline'"
                    />
                    <span
                      class="server-status-ping"
                      :class="node.online ? 'is-online' : 'is-offline'"
                    />
                  </span>
                  <h2 class="server-node-name" :title="node.name">
                    {{ node.name }}
                  </h2>
                </div>

                <div class="flex shrink-0 items-center gap-1.5">
                  <span
                    class="server-os-badge"
                    :title="node.os || node.osLabel"
                    :aria-label="node.osLabel"
                  >
                    <svg
                      v-if="node.osKey === 'ubuntu'"
                      class="h-4 w-4"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="10" fill="#E95420" />
                      <circle cx="12" cy="12" r="4.3" fill="none" stroke="#ffffff" stroke-width="1.5" />
                      <circle cx="6.2" cy="12" r="1.45" fill="#ffffff" />
                      <circle cx="14.9" cy="7.0" r="1.45" fill="#ffffff" />
                      <circle cx="14.9" cy="17.0" r="1.45" fill="#ffffff" />
                    </svg>
                    <svg
                      v-else-if="node.osKey === 'debian'"
                      class="h-4 w-4"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="10" fill="#A80030" />
                      <path
                        d="M12 6.5c3.2 0 5.5 2.3 5.5 5.2 0 2.6-2 4.6-4.5 4.6-1.8 0-3.2-1.2-3.2-2.8 0-1.3.9-2.3 2.2-2.3 1 0 1.7.7 1.7 1.5"
                        fill="none"
                        stroke="#ffffff"
                        stroke-width="1.6"
                        stroke-linecap="round"
                      />
                    </svg>
                    <svg
                      v-else-if="node.osKey === 'windows'"
                      class="h-4 w-4"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path fill="#00ADEF" d="M3 4.5 10.8 3.4v7.8H3V4.5Zm8.8-1.2L21 2v9.2h-9.2V3.3ZM3 12.8h7.8v7.8L3 19.5v-6.7Zm8.8 0H21V22l-9.2-1.3v-7.9Z" />
                    </svg>
                    <svg
                      v-else
                      class="h-4 w-4"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="10" fill="#0284c7" />
                      <path
                        d="M9 9.5h.01M15 9.5h.01M8.5 14c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2"
                        fill="none"
                        stroke="#ffffff"
                        stroke-width="1.7"
                        stroke-linecap="round"
                      />
                    </svg>
                  </span>

                  <span
                    class="server-country-code font-mono"
                    :title="node.countryName"
                  >
                    {{ node.countryCode }}
                  </span>
                </div>
              </header>

              <!-- Card Body -->
              <div class="server-card-body">
                <!-- Sub-header Pills: Online Days & Billing Cycle -->
                <div class="server-pills-row">
                  <span class="server-chip-pill">
                    在线 {{ node.uptimeDays }} 天
                  </span>
                  <span
                    v-if="node.billingLabel"
                    class="server-chip-pill ml-auto"
                    :title="node.billingLabel"
                  >
                    {{ node.billingLabel }}
                  </span>
                </div>

                <!-- 2x2 Resource Progress Grid (CPU, Memory, Disk, Traffic) -->
                <div class="grid grid-cols-2 gap-x-4 gap-y-3">
                  <!-- CPU -->
                  <div class="server-metric-block">
                    <div class="server-metric-head">
                      <span class="server-metric-label">CPU</span>
                      <span class="server-metric-val">{{ node.cpuPercentText }}</span>
                    </div>
                    <div class="server-bar-track" aria-hidden="true">
                      <div
                        class="server-bar-fill"
                        :class="progressFillClass(node.cpuStatus)"
                        :style="{ width: `${node.cpuUsage}%` }"
                      />
                    </div>
                    <span class="server-metric-sub" :title="`系统负载 (1m, 5m, 15m): ${node.loadText}`">
                      {{ node.loadText }}
                    </span>
                  </div>

                  <!-- 内存 -->
                  <div class="server-metric-block">
                    <div class="server-metric-head">
                      <span class="server-metric-label">内存</span>
                      <span class="server-metric-val">{{ node.ramPercentText }}</span>
                    </div>
                    <div class="server-bar-track" aria-hidden="true">
                      <div
                        class="server-bar-fill"
                        :class="progressFillClass(node.ramStatus)"
                        :style="{ width: `${node.ramPercent}%` }"
                      />
                    </div>
                    <span class="server-metric-sub" :title="node.ramSubText">
                      {{ node.ramSubText }}
                    </span>
                  </div>

                  <!-- 硬盘 -->
                  <div class="server-metric-block">
                    <div class="server-metric-head">
                      <span class="server-metric-label">硬盘</span>
                      <span class="server-metric-val">{{ node.diskPercentText }}</span>
                    </div>
                    <div class="server-bar-track" aria-hidden="true">
                      <div
                        class="server-bar-fill"
                        :class="progressFillClass(node.diskStatus)"
                        :style="{ width: `${node.diskPercent}%` }"
                      />
                    </div>
                    <span class="server-metric-sub" :title="node.diskSubText">
                      {{ node.diskSubText }}
                    </span>
                  </div>

                  <!-- 流量 -->
                  <div class="server-metric-block">
                    <div class="server-metric-head">
                      <span class="server-metric-label">流量</span>
                      <span class="server-metric-val">{{ node.trafficValueText }}</span>
                    </div>
                    <div class="server-bar-track" aria-hidden="true">
                      <div
                        class="server-bar-fill"
                        :class="progressFillClass(node.trafficStatus)"
                        :style="{ width: `${node.trafficPercent}%` }"
                      />
                    </div>
                    <span class="server-metric-sub" :title="node.trafficSubText">
                      {{ node.trafficSubText }}
                    </span>
                  </div>
                </div>

                <!-- 3 Telemetry & Billing Mini-Panels -->
                <div class="grid grid-cols-3 gap-1.5">
                  <!-- Panel 1: Real-time Speed -->
                  <div class="server-data-panel" role="group" aria-label="实时速率">
                    <span class="server-data-line is-emerald">
                      <svg class="h-2.5 w-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="m18 15-6-6-6 6" />
                      </svg>
                      <span class="truncate">{{ node.speedUpText }}</span>
                    </span>
                    <span class="server-data-line is-sky">
                      <svg class="h-2.5 w-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                      <span class="truncate">{{ node.speedDownText }}</span>
                    </span>
                  </div>

                  <!-- Panel 2: Cumulative Traffic -->
                  <div class="server-data-panel" role="group" aria-label="累计流量">
                    <span class="server-data-line">
                      <svg class="h-2.5 w-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      <span class="truncate">{{ node.netTotalUpText }}</span>
                    </span>
                    <span class="server-data-line">
                      <svg class="h-2.5 w-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      <span class="truncate">{{ node.netTotalDownText }}</span>
                    </span>
                  </div>

                  <!-- Panel 3: Expiry & Remaining Asset Value -->
                  <div class="server-data-panel" role="group" aria-label="剩余周期与价值">
                    <span class="server-data-line">
                      <svg class="h-2.5 w-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      <span class="truncate">{{ node.remainingDaysLabel || '-' }}</span>
                    </span>
                    <span class="server-data-line">
                      <svg class="h-2.5 w-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
                        <path d="M7 7h.01" />
                      </svg>
                      <span class="truncate">{{ node.remainingValueLabel }}</span>
                    </span>
                  </div>
                </div>

                <!-- Bottom Ping & Packet Loss Bar Panels -->
                <div class="grid grid-cols-2 gap-1.5">
                  <!-- Latency -->
                  <div class="server-ping-panel" role="group" aria-label="节点延迟">
                    <div class="server-ping-head">
                      <span class="server-ping-label">延迟</span>
                      <span class="server-ping-val">{{ node.ping.latencyDisplay }}</span>
                    </div>
                    <div
                      class="server-ping-bars"
                      :style="{ gridTemplateColumns: `repeat(${Math.max(node.ping.latencyBars.length, 1)}, minmax(0, 1fr))` }"
                      aria-hidden="true"
                    >
                      <span
                        v-for="bar in node.ping.latencyBars"
                        :key="bar.key"
                        class="server-ping-bar"
                        :class="signalBarClass(bar.level)"
                        :title="bar.tooltip"
                      />
                    </div>
                  </div>

                  <!-- Packet Loss -->
                  <div class="server-ping-panel" role="group" aria-label="节点丢包">
                    <div class="server-ping-head">
                      <span class="server-ping-label">丢包</span>
                      <span class="server-ping-val">{{ node.ping.lossDisplay }}</span>
                    </div>
                    <div
                      class="server-ping-bars"
                      :style="{ gridTemplateColumns: `repeat(${Math.max(node.ping.lossBars.length, 1)}, minmax(0, 1fr))` }"
                      aria-hidden="true"
                    >
                      <span
                        v-for="bar in node.ping.lossBars"
                        :key="bar.key"
                        class="server-ping-bar"
                        :class="signalBarClass(bar.level)"
                        :title="bar.tooltip"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.servers-page-header {
  padding-top: 6.25rem;
  padding-bottom: 2rem;
}

.servers-header-layout {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1.5rem;
  padding-bottom: 1.75rem;
  border-bottom: 1px solid #dce4e8;
}
:global(.dark .servers-header-layout) {
  border-bottom-color: #1e293b;
}

.servers-header-description {
  margin-top: 0.625rem;
  max-width: 38rem;
  font-size: 0.875rem;
  line-height: 1.75;
  color: #64748b;
}
:global(.dark .servers-header-description) {
  color: #94a3b8;
}

.servers-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.servers-sync-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4375rem 0.75rem;
  border: 1px solid #dce4e8;
  border-radius: 6px;
  background-color: #ffffff;
  color: #475569;
}
:global(.dark .servers-sync-pill) {
  border-color: #243242;
  background-color: #111923;
  color: #94a3b8;
}

.servers-sync-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
}
.servers-sync-dot.is-online {
  background-color: #10b981;
  box-shadow: 0 0 0 3px rgb(16 185 129 / 0.18);
}
.servers-sync-dot.is-warning {
  background-color: #f59e0b;
  box-shadow: 0 0 0 3px rgb(245 158 11 / 0.18);
}

.servers-ctrl-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.4375rem 0.75rem;
  border: 1px solid #dce4e8;
  border-radius: 6px;
  background-color: #ffffff;
  color: #334155;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    border-color 150ms ease,
    background-color 150ms ease,
    color 150ms ease;
}
:global(.dark .servers-ctrl-btn) {
  border-color: #243242;
  background-color: #111923;
  color: #cbd5e1;
}
.servers-ctrl-btn:hover:not(:disabled) {
  border-color: #0284c7;
  color: #0284c7;
}
:global(.dark .servers-ctrl-btn:hover:not(:disabled)) {
  border-color: #38bdf8;
  color: #38bdf8;
}
.servers-ctrl-btn.is-primary {
  border-color: rgb(16 185 129 / 0.35);
  background-color: rgb(16 185 129 / 0.08);
  color: #047857;
}
:global(.dark .servers-ctrl-btn.is-primary) {
  border-color: rgb(16 185 129 / 0.35);
  background-color: rgb(16 185 129 / 0.12);
  color: #34d399;
}
.servers-ctrl-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.servers-error-panel,
.servers-empty-panel {
  padding: 2.5rem 1.5rem;
  border: 1px solid #dce4e8;
  border-radius: 10px;
  background-color: #ffffff;
  text-align: center;
}
:global(.dark .servers-error-panel),
:global(.dark .servers-empty-panel) {
  border-color: #243242;
  background-color: #111923;
}

/* Overview Strip (4 Summary Cards) */
.servers-overview-strip {
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  border: 1px solid #dce4e8;
  border-radius: 10px;
  background-color: #ffffff;
  box-shadow: 0 1px 3px rgb(15 23 42 / 0.04);
  overflow: hidden;
  animation: server-overview-enter 500ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
@media (min-width: 640px) {
  .servers-overview-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (min-width: 1024px) {
  .servers-overview-strip {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
:global(.dark .servers-overview-strip) {
  border-color: #1f2b37;
  background-color: #111720;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.25);
}

.servers-overview-card {
  min-width: 0;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #edf2f5;
}
@media (min-width: 640px) {
  .servers-overview-card:nth-child(odd) {
    border-right: 1px solid #edf2f5;
  }
  .servers-overview-card:nth-child(n + 3) {
    border-bottom: 0;
  }
}
@media (min-width: 1024px) {
  .servers-overview-card {
    border-bottom: 0;
    border-right: 1px solid #edf2f5;
  }
  .servers-overview-card:last-child {
    border-right: 0;
  }
}
:global(.dark .servers-overview-card) {
  border-color: #1c2632;
}

.servers-overview-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.servers-overview-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #64748b;
}
:global(.dark .servers-overview-label) {
  color: #8b9bb0;
}

.servers-overview-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.875rem;
  height: 1.875rem;
  border-radius: 7px;
  background-color: rgb(16 185 129 / 0.1);
  color: #059669;
}
:global(.dark .servers-overview-icon) {
  background-color: rgb(16 185 129 / 0.13);
  color: #10b981;
}

.servers-overview-main {
  display: flex;
  align-items: baseline;
  gap: 0.375rem;
  min-width: 0;
}

.servers-overview-value {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
  font-size: 1.625rem;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:global(.dark .servers-overview-value) {
  color: #f8fafc;
}
.servers-overview-value.is-emerald {
  color: #059669;
}
:global(.dark .servers-overview-value.is-emerald) {
  color: #10b981;
}

.servers-overview-unit {
  flex-shrink: 0;
  font-size: 0.75rem;
  font-weight: 600;
  color: #64748b;
}
:global(.dark .servers-overview-unit) {
  color: #8b9bb0;
}

.servers-overview-sub {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  margin-top: 0.4375rem;
  min-height: 1rem;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: #64748b;
  overflow: hidden;
  white-space: nowrap;
}
:global(.dark .servers-overview-sub) {
  color: #8b9bb0;
}

.servers-sub-emerald {
  color: #047857;
  font-weight: 600;
}
:global(.dark .servers-sub-emerald) {
  color: #10b981;
}

.servers-sub-sky {
  color: #0369a1;
  font-weight: 600;
}
:global(.dark .servers-sub-sky) {
  color: #3b82f6;
}

/* Server Node Card */
.server-node-card {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  border: 1px solid #dce4e8;
  border-radius: 12px;
  background-color: #ffffff;
  box-shadow: 0 1px 3px rgb(15 23 42 / 0.04);
  overflow: hidden;
  will-change: transform, opacity;
  animation: server-card-enter 580ms cubic-bezier(0.22, 1, 0.36, 1) var(--card-delay, 0ms) both;
  transition:
    border-color 200ms cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 200ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
}
.server-node-card.is-interactive {
  cursor: pointer;
}
.server-node-card.is-interactive:hover {
  border-color: #94b8cb;
  box-shadow: 0 10px 26px rgb(15 23 42 / 0.09);
  transform: translateY(-3px);
}
.server-node-card.is-interactive:active {
  transform: translateY(-1px) scale(0.994);
}
.server-node-card.is-interactive:focus-visible {
  outline: 2px solid #10b981;
  outline-offset: 2px;
}
:global(.dark .server-node-card) {
  border-color: #1f2b37;
  background-color: #111720;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.25);
}
:global(.dark .server-node-card.is-interactive:hover) {
  border-color: #2f455c;
  box-shadow: 0 12px 28px rgb(0 0 0 / 0.4);
}

.server-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-height: 2.75rem;
  padding: 0.75rem 1rem;
}

.server-status-indicator {
  position: relative;
  display: inline-flex;
  width: 0.625rem;
  height: 0.625rem;
  flex-shrink: 0;
}
.server-status-core {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
}
.server-status-core.is-online {
  background-color: #10b981;
}
.server-status-core.is-offline {
  background-color: #ef4444;
}
.server-status-ping {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  opacity: 0.45;
  animation: server-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
}
.server-status-ping.is-online {
  background-color: #10b981;
}
.server-status-ping.is-offline {
  background-color: #ef4444;
}
@keyframes server-ping {
  75%, 100% {
    transform: scale(2.1);
    opacity: 0;
  }
}

.server-node-name {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 700;
  line-height: 1.3;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:global(.dark .server-node-name) {
  color: #f8fafc;
}

.server-os-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.server-country-code {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: #334155;
}
:global(.dark .server-country-code) {
  color: #e2e8f0;
}

.server-card-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: space-between;
  gap: 0.875rem;
  padding: 0 1rem 1rem;
}

.server-pills-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-top: -0.25rem;
  min-height: 1.25rem;
}

.server-chip-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border: 1px solid #e2e8f0;
  border-radius: 9999px;
  background-color: #f8fafc;
  color: #475569;
  font-size: 0.6875rem;
  font-weight: 500;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
:global(.dark .server-chip-pill) {
  border-color: #24303f;
  background-color: #18212d;
  color: #94a3b8;
}

/* 2x2 Resource Bars */
.server-metric-block {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.server-metric-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.75rem;
}

.server-metric-label {
  color: #64748b;
}
:global(.dark .server-metric-label) {
  color: #8b9bb0;
}

.server-metric-val {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: #0f172a;
}
:global(.dark .server-metric-val) {
  color: #f1f5f9;
}

.server-bar-track {
  width: 100%;
  height: 0.25rem;
  border-radius: 9999px;
  background-color: #e2e8f0;
  overflow: hidden;
}
:global(.dark .server-bar-track) {
  background-color: #1e2936;
}

.server-bar-fill {
  height: 100%;
  border-radius: 9999px;
  transform-origin: left center;
  animation: server-bar-sweep 680ms cubic-bezier(0.22, 1, 0.36, 1) calc(var(--card-delay, 0ms) + 160ms) both;
  transition: width 320ms cubic-bezier(0.22, 1, 0.36, 1);
}
.server-bar-fill-success {
  background-color: #10b981;
}
.server-bar-fill-info {
  background-color: #3b82f6;
}
.server-bar-fill-warning {
  background-color: #f59e0b;
}
.server-bar-fill-error {
  background-color: #ef4444;
}

.server-metric-sub {
  font-size: 0.6875rem;
  font-variant-numeric: tabular-nums;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:global(.dark .server-metric-sub) {
  color: #8b9bb0;
}

/* 3 Mini Telemetry Panels */
.server-data-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.25rem;
  padding: 0.4375rem 0.5rem;
  border: 1px solid #edf2f6;
  border-radius: 8px;
  background-color: #f8fafc;
  min-width: 0;
}
:global(.dark .server-data-panel) {
  border-color: #1d2733;
  background-color: #151d28;
}

.server-data-line {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
  font-size: 0.6875rem;
  font-variant-numeric: tabular-nums;
  color: #475569;
}
:global(.dark .server-data-line) {
  color: #94a3b8;
}
.server-data-line.is-emerald {
  color: #047857;
  font-weight: 600;
}
:global(.dark .server-data-line.is-emerald) {
  color: #10b981;
}
.server-data-line.is-sky {
  color: #0369a1;
  font-weight: 600;
}
:global(.dark .server-data-line.is-sky) {
  color: #3b82f6;
}

/* Bottom Ping & Loss Bar Panels */
.server-ping-panel {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 0.375rem;
  height: 2.75rem;
  padding: 0.5rem;
  border: 1px solid #edf2f6;
  border-radius: 8px;
  background-color: #f8fafc;
}
:global(.dark .server-ping-panel) {
  border-color: #1d2733;
  background-color: #151d28;
}

.server-ping-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.6875rem;
  line-height: 1;
}

.server-ping-label {
  color: #64748b;
}
:global(.dark .server-ping-label) {
  color: #8b9bb0;
}

.server-ping-val {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: #334155;
}
:global(.dark .server-ping-val) {
  color: #cbd5e1;
}

.server-ping-bars {
  display: grid;
  align-items: end;
  gap: 2px;
  flex: 1;
  min-height: 0.5rem;
}

.server-ping-bar {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 4px;
  border-radius: 1.5px;
  transform-origin: bottom center;
  animation: server-signal-pop 480ms cubic-bezier(0.22, 1, 0.36, 1) calc(var(--card-delay, 0ms) + 220ms) both;
}

.server-signal-empty {
  background-color: #e2e8f0;
}
:global(.dark .server-signal-empty) {
  background-color: #233040;
}

.server-signal-1 {
  background-color: #10b981;
}
.server-signal-2 {
  background-color: #34d399;
}
.server-signal-3 {
  background-color: #fbbf24;
}
.server-signal-4 {
  background-color: #f97316;
}
.server-signal-5 {
  background-color: #ef4444;
}

/* ========================================== */
/* Node Detail Panel Styles                   */
/* ========================================== */
.server-detail-enter {
  animation: server-detail-enter 480ms cubic-bezier(0.22, 1, 0.36, 1) var(--detail-delay, 0ms) both;
}

@keyframes server-overview-enter {
  0% {
    opacity: 0;
    transform: translate3d(0, 14px, 0);
  }
  100% {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

@keyframes server-card-enter {
  0% {
    opacity: 0;
    transform: translate3d(0, 22px, 0) scale(0.975);
  }
  100% {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
}

@keyframes server-bar-sweep {
  0% {
    transform: scaleX(0);
    opacity: 0.4;
  }
  100% {
    transform: scaleX(1);
    opacity: 1;
  }
}

@keyframes server-signal-pop {
  0% {
    transform: scaleY(0.2);
    opacity: 0;
  }
  100% {
    transform: scaleY(1);
    opacity: 1;
  }
}

@keyframes server-detail-enter {
  0% {
    opacity: 0;
    transform: translate3d(0, 16px, 0) scale(0.99);
  }
  100% {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .servers-overview-strip,
  .server-node-card,
  .server-bar-fill,
  .server-ping-bar,
  .server-detail-enter {
    animation: none !important;
    transition: none !important;
  }
}

.server-detail-panel {
  border: 1px solid #dce4e8;
  border-radius: 10px;
  background-color: #ffffff;
  box-shadow: 0 1px 3px rgb(15 23 42 / 0.04);
}
:global(.dark .server-detail-panel) {
  border-color: #1f2b37;
  background-color: #111720;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.25);
}

.server-back-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.125rem;
  height: 2.125rem;
  border: 1px solid transparent;
  border-radius: 8px;
  background-color: transparent;
  color: #475569;
  cursor: pointer;
  transition:
    background-color 150ms ease,
    border-color 150ms ease,
    color 150ms ease;
}
.server-back-btn:hover {
  border-color: #dce4e8;
  background-color: #f8fafc;
  color: #0f172a;
}
:global(.dark .server-back-btn) {
  color: #94a3b8;
}
:global(.dark .server-back-btn:hover) {
  border-color: #243242;
  background-color: #182230;
  color: #f8fafc;
}

.server-detail-country {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9375rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #334155;
}
:global(.dark .server-detail-country) {
  color: #e2e8f0;
}

.server-detail-status-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.3;
}
.server-detail-status-pill.is-online {
  border: 1px solid rgb(16 185 129 / 0.35);
  background-color: rgb(16 185 129 / 0.12);
  color: #047857;
}
:global(.dark .server-detail-status-pill.is-online) {
  border-color: rgb(16 185 129 / 0.35);
  background-color: rgb(16 185 129 / 0.15);
  color: #34d399;
}
.server-detail-status-pill.is-offline {
  border: 1px solid rgb(239 68 68 / 0.35);
  background-color: rgb(239 68 68 / 0.12);
  color: #b91c1c;
}
:global(.dark .server-detail-status-pill.is-offline) {
  border-color: rgb(239 68 68 / 0.35);
  background-color: rgb(239 68 68 / 0.15);
  color: #f87171;
}

.server-detail-info-grid {
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  column-gap: 1rem;
}
@media (min-width: 640px) {
  .server-detail-info-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.server-detail-info-item {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.625rem 0;
}
.server-detail-info-item.has-top-divider {
  border-top: 1px solid #edf2f6;
}
@media (max-width: 639px) {
  .server-detail-info-item:not(:first-child) {
    border-top: 1px solid #edf2f6;
  }
}
:global(.dark .server-detail-info-item.has-top-divider) {
  border-top-color: #1d2733;
}
@media (max-width: 639px) {
  :global(.dark .server-detail-info-item:not(:first-child)) {
    border-top-color: #1d2733;
  }
}

.server-detail-info-icon {
  margin-top: 0.125rem;
  display: flex;
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background-color: #f1f5f9;
  color: #64748b;
}
:global(.dark .server-detail-info-icon) {
  background-color: #192330;
  color: #8b9bb0;
}

.server-detail-info-label {
  margin: 0;
  font-size: 0.6875rem;
  line-height: 1.3;
  color: #64748b;
}
:global(.dark .server-detail-info-label) {
  color: #8b9bb0;
}

.server-detail-info-value {
  margin: 0.125rem 0 0;
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.4;
  color: #0f172a;
  word-break: break-word;
}
:global(.dark .server-detail-info-value) {
  color: #f1f5f9;
}

/* Segmented Controls (负载/延迟 & 实时/1小时/4小时/1天) */
.server-segmented-group {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem;
  border: 1px solid #dce4e8;
  border-radius: 8px;
  background-color: #ffffff;
  width: fit-content;
}
:global(.dark .server-segmented-group) {
  border-color: #1f2b37;
  background-color: #111720;
}

.server-segment-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.3125rem 0.6875rem;
  border: 0;
  border-radius: 6px;
  background-color: transparent;
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 150ms ease,
    color 150ms ease;
}
.server-segment-btn:hover:not(.is-active) {
  color: #0f172a;
}
:global(.dark .server-segment-btn) {
  color: #8b9bb0;
}
:global(.dark .server-segment-btn:hover:not(.is-active)) {
  color: #f1f5f9;
}
.server-segment-btn.is-active {
  background-color: #10b981;
  color: #042f2e;
}
:global(.dark .server-segment-btn.is-active) {
  background-color: #34d399;
  color: #022c22;
}

/* Chart SVG Elements */
.server-chart-gridline {
  stroke: #e2e8f0;
  stroke-width: 1;
}
:global(.dark .server-chart-gridline) {
  stroke: #1c2633;
}

.server-chart-axis-line {
  stroke: #cbd5e1;
  stroke-width: 1;
}
:global(.dark .server-chart-axis-line) {
  stroke: #2a3748;
}

.server-chart-axis-text {
  fill: #64748b;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
  font-size: 10px;
}
:global(.dark .server-chart-axis-text) {
  fill: #7c8da3;
}

.server-chart-crosshair {
  stroke: #94a3b8;
  stroke-width: 1;
}
:global(.dark .server-chart-crosshair) {
  stroke: #64748b;
}
</style>
