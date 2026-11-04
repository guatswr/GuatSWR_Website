<script setup lang="ts">
import type { PublicServerNode, PublicServersResponse, ServerBarStatus, ServerSignalLevel } from '#shared/servers'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { START_LOCATION } from 'vue-router'
import ClubIcon from '~/components/ClubIcon.vue'
import { formatBeijingDateTime } from '~/utils/beijing-time'
import { vReveal } from '~/utils/motion'

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

      <template v-else>
        <!-- Top 4 Overview Strip (Matches Komari Glass Overview Bar) -->
        <section
          v-reveal
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
              v-for="node in nodes"
              :key="node.id"
              v-reveal
              class="server-node-card"
              :class="{ 'is-offline': !node.online }"
              :aria-label="`${node.name} 节点状态卡片`"
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
                  <!-- Self-hosted inline OS Badge (Ubuntu orange circle / Linux / Windows) -->
                  <span
                    class="server-os-badge"
                    :title="node.os || node.osLabel"
                    :aria-label="node.osLabel"
                  >
                    <!-- Ubuntu Circle of Friends icon -->
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
                    <!-- Debian / Red swirl style -->
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
                    <!-- Windows -->
                    <svg
                      v-else-if="node.osKey === 'windows'"
                      class="h-4 w-4"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path fill="#00ADEF" d="M3 4.5 10.8 3.4v7.8H3V4.5Zm8.8-1.2L21 2v9.2h-9.2V3.3ZM3 12.8h7.8v7.8L3 19.5v-6.7Zm8.8 0H21V22l-9.2-1.3v-7.9Z" />
                    </svg>
                    <!-- Generic Linux / Server -->
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
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease,
    transform 180ms ease;
}
.server-node-card:hover {
  border-color: #b8c9d4;
  box-shadow: 0 6px 18px rgb(15 23 42 / 0.06);
}
:global(.dark .server-node-card) {
  border-color: #1f2b37;
  background-color: #111720;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.25);
}
:global(.dark .server-node-card:hover) {
  border-color: #2d3e50;
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
  transition: width 300ms ease-out;
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
</style>
