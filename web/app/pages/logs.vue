<script setup lang="ts">
/**
 * `/logs` - 站点日志档案 (Editorial Touhou Club Audit Trails & Site Analytics).
 *
 * Filter state (page, page size, user, action, Umami range/environment/top
 * limit) lives in the URL, so the whole page - log table, contributor ranking
 * and statistics panels - is server-rendered and usable without JavaScript.
 * The filter controls stay inside a real `GET` form, so a no-JS visitor can
 * still submit them; with JavaScript the same controls push a client route.
 *
 * Statistics come from the frozen `/api/logs/umami` adapter. An unconfigured
 * Umami instance answers 503, which is a real "statistics unavailable" state:
 * the page says so and never presents invented zeroes as measured data.
 */
import type { PublicLogsPage, PublicLogStat, PublicUmamiStats } from '@guatswr/shared'
import { START_LOCATION } from 'vue-router'
import { LOGS_PAGE_SIZE, LOGS_PAGE_SIZES } from '#shared/content'
import { usePublicPageSeo } from '~/composables/usePublicPageSeo'
import {
  ENVIRONMENT_TABS,
  LOG_ACTIONS,
  LOG_RANGE_OPTIONS,
  actionStyleClass,
  averageDuration,
  bounceRate,
  buildLogChart,
  environmentIconUrl,
  formatAction,
  formatCountry,
  formatDimensionName,
  formatLogTime,
  formatNumber,
  logRangeWindow,
  pageTitle,
  topEntryPath,
} from '~/utils/logs'
import type { UmamiWindow, LogChartUnit } from '~/utils/logs'
import TrafficChart from '~/components/logs/TrafficChart.vue'
import { buildPublicPath, parsePageParam, parsePageSizeParam, parseTextParam, queryValue } from '~/utils/public-query'
import { displayImageSource } from '~/utils/public-image'
import ClubIcon from '~/components/ClubIcon.vue'
import { vReveal } from '~/utils/motion'

definePageMeta({
  key: route => route.path,
  scrollToTop(to, from) {
    if (from === START_LOCATION) return Boolean(to.hash) || typeof window === 'undefined' || window.scrollY === 0
    return to.path !== from.path
  },
})

const route = useRoute()
const router = useRouter()

const ENVIRONMENT_TYPES = ['browser', 'os', 'device', 'referrer', 'country', 'region', 'city'] as const
const TOP_LIMITS = [5, 8, 10, 15] as const

const requestedPage = computed(() => parsePageParam(route.query.page))
const page = computed(() => requestedPage.value ?? 1)
const pageSize = computed(() => parsePageSizeParam(route.query.limit, LOGS_PAGE_SIZES, LOGS_PAGE_SIZE))
const username = computed(() => parseTextParam(route.query.username))
const action = computed(() => {
  const raw = parseTextParam(route.query.action, 32)
  return LOG_ACTIONS.includes(raw) ? raw : ''
})
const activeRange = computed(() => {
  const raw = parseTextParam(route.query.range, 8)
  return LOG_RANGE_OPTIONS.some(option => option.key === raw) ? raw : '7d'
})
const environmentType = computed(() => {
  const raw = parseTextParam(route.query.env, 12)
  return (ENVIRONMENT_TYPES as readonly string[]).includes(raw) ? raw : 'browser'
})
const topLimit = computed(() => {
  const raw = queryValue(route.query.top)
  const parsed = Number(raw)
  return (TOP_LIMITS as readonly number[]).includes(parsed) ? parsed : 5
})

const chartInterval = computed(() => {
  const raw = parseTextParam(route.query.interval, 8)
  const allowed = ['24h', '7d', '30d'].includes(activeRange.value) ? ['hour', 'day'] : ['day', 'month']
  return allowed.includes(raw) ? raw : 'auto'
})

/** Inbound filters that pagination and filter links must carry forward. */
const filterQuery = computed<Record<string, string>>(() => {
  const query: Record<string, string> = {}
  if (username.value) query.username = username.value
  if (action.value) query.action = action.value
  if (pageSize.value !== LOGS_PAGE_SIZE) query.limit = String(pageSize.value)
  return query
})

const umamiQuery = computed<Record<string, string>>(() => ({
  range: activeRange.value,
  env: environmentType.value,
  top: String(topLimit.value),
  ...(chartInterval.value === 'auto' ? {} : { interval: chartInterval.value }),
}))

// --- Data -----------------------------------------------------------------
const { data: logPage, error: logsError, status: logsStatus, refresh: refreshLogs } =
  await useFetch<PublicLogsPage>('/api/logs', {
    // Keyed by the normalized filters so each view has its own cache slot.
    key: () => `public-logs-${page.value}-${pageSize.value}-${username.value}-${action.value}`,
    query: computed(() => {
      const query: Record<string, string | number> = {
        page: page.value,
        limit: pageSize.value,
      }
      if (username.value) query.username = username.value
      if (action.value) query.action = action.value
      return query
    }),
    default: (): PublicLogsPage => ({ total: 0, logs: [] }),
  })

const { data: stats } = await useFetch<PublicLogStat[]>('/api/logs/stats', {
  key: 'public-log-stats',
  default: () => [],
})

/**
 * Umami windows are cached in the payload for the range that SSR rendered, so
 * hydration reuses the server's timestamps instead of re-fetching with a
 * clock that has moved on.
 */
const rangeWindows = useState<Record<string, UmamiWindow>>('public-logs-umami-windows', () => ({}))
watch(activeRange, range => {
  if (!rangeWindows.value[range]) rangeWindows.value[range] = logRangeWindow(range, Date.now())
}, { immediate: true, flush: 'sync' })

const umamiRequest = computed(() => {
  const range = activeRange.value
  const window = rangeWindows.value[range] ?? logRangeWindow(range, Date.now())
  return {
    startAt: String(window.startAt),
    endAt: String(window.endAt),
    unit: chartInterval.value === 'auto' ? window.unit : chartInterval.value,
    limit: String(topLimit.value),
    envType: environmentType.value,
  }
})

const { data: incomingUmami, error: umamiError, status: umamiStatus, refresh: retryStatistics } = await useFetch<PublicUmamiStats>('/api/logs/umami', {
  key: () => `public-logs-umami-${activeRange.value}-${environmentType.value}-${topLimit.value}-${chartInterval.value}`,
  query: umamiRequest,
  default: (): PublicUmamiStats => ({
    meta: { startAt: 0, endAt: 0, unit: '', limit: 0, envType: '' },
    summary: { pageviews: 0, visitors: 0, visits: 0, bounces: 0, totaltime: 0 },
    series: { pageviews: [], visitors: [] },
    top: { pages: [], environments: [] },
  }),
})

// Query navigation retains mounted content while the new keyed request resolves.
// Overview data is independent of audience/top-list filters; preserving its
// reference also preserves a pinned chart readout and avoids replaying reveals.
const overviewKey = computed(() => JSON.stringify([umamiRequest.value.startAt, umamiRequest.value.endAt, umamiRequest.value.unit, chartInterval.value]))
const acceptedOverviewKey = ref('')
const statisticsSnapshot = shallowRef<PublicUmamiStats | null>(null)
const overviewSnapshot = shallowRef<PublicUmamiStats | null>(null)
watch([incomingUmami, umamiStatus], ([value, status]) => {
  if (status !== 'success' || !value.meta.endAt || value.meta.envType !== environmentType.value) return
  statisticsSnapshot.value = value
  if (!overviewSnapshot.value || acceptedOverviewKey.value !== overviewKey.value) {
    overviewSnapshot.value = value
    acceptedOverviewKey.value = overviewKey.value
  }
}, { immediate: true, flush: 'sync' })
const umami = computed(() => statisticsSnapshot.value ?? incomingUmami.value)
const overview = computed(() => overviewSnapshot.value ?? umami.value)
const displayedEnvironment = computed(() => umami.value.meta.envType || environmentType.value)
const overviewUpdating = computed(() => umamiStatus.value === 'pending' && acceptedOverviewKey.value !== overviewKey.value)

if (import.meta.server) {
  if (requestedPage.value === null) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid page parameter' })
  }
  if (logsError.value) setResponseStatus(502)
}

const logs = computed(() => logPage.value.logs)
const total = computed(() => logPage.value.total)
const loading = computed(() => logsStatus.value === 'pending')
const failedLogs = computed(() => Boolean(logsError.value))
const cards = computed(() => stats.value)

const statisticsUnavailable = computed(() => Boolean(umamiError.value) && !statisticsSnapshot.value)
const statisticsLoading = computed(() => umamiStatus.value === 'pending' && !umamiError.value)
const initialStatisticsLoading = computed(() => statisticsLoading.value && !statisticsSnapshot.value)
const summary = computed(() => overview.value.summary)
const hasStatistics = computed(() => Boolean(statisticsSnapshot.value))

// --- Chart ----------------------------------------------------------------
const chartUnit = computed<LogChartUnit>(() => {
  const unit = overview.value.meta.unit
  return ['hour', 'day', 'month', 'year'].includes(unit) ? unit as LogChartUnit : logRangeWindow(activeRange.value, 0).unit
})
const chartData = computed(() => buildLogChart({
  rangeKey: activeRange.value,
  startAt: Number(overview.value.meta.startAt) || rangeWindows.value[activeRange.value]?.startAt || 0,
  endAt: Number(overview.value.meta.endAt) || rangeWindows.value[activeRange.value]?.endAt || Date.now(),
  unit: chartUnit.value,
  timezone: overview.value.meta.timezone ?? 'UTC',
  pageviews: overview.value.series.pageviews,
  visitors: overview.value.series.visitors,
}))
const maxPageCount = computed(() => {
  const counts = umami.value.top.pages.map(p => Number(p.y || 0))
  return Math.max(...counts, 1)
})

const totalTopPagesCount = computed(() => {
  return umami.value.top.pages.reduce((sum, item) => sum + Number(item.y || 0), 0)
})

const pagePercent = (count: number | string | undefined | null): string => {
  const num = Number(count || 0)
  if (!totalTopPagesCount.value || num <= 0) return '0%'
  const pct = (num / totalTopPagesCount.value) * 100
  return pct >= 10 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`
}

const maxEnvCount = computed(() => {
  const counts = umami.value.top.environments.map(e => Number(e.y || 0))
  return Math.max(...counts, 1)
})

const totalEnvCount = computed(() => {
  if (displayedEnvironment.value === 'region' && umami.value.location) return umami.value.location.total
  return umami.value.top.environments.reduce((sum, item) => sum + Number(item.y || 0), 0)
})

const envPercent = (count: number | string | undefined | null): string => {
  const num = Number(count || 0)
  if (!totalEnvCount.value || num <= 0) return '0%'
  const pct = (num / totalEnvCount.value) * 100
  return pct >= 10 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`
}

// --- Controls -------------------------------------------------------------
const usernameInput = ref(username.value)
const actionInput = ref(action.value)
const showRules = ref(false)
watch([username, action], ([name, value]) => { usernameInput.value = name; actionInput.value = value })

const linkFor = (overrides: Record<string, string | number | null | undefined>): string =>
  buildPublicPath('/logs', { ...filterQuery.value, ...umamiQuery.value, ...(page.value > 1 ? { page: page.value } : {}), ...overrides })

const applyFilters = async (): Promise<void> => {
  await router.push(linkFor({
    username: usernameInput.value.trim() || undefined,
    action: actionInput.value || undefined,
    page: undefined,
  }))
}

const changePageSize = async (size: number): Promise<void> => {
  await router.push(linkFor({ limit: size === LOGS_PAGE_SIZE ? undefined : size, page: undefined }))
}

const pageSummary = computed(() => ({
  from: total.value === 0 ? 0 : (page.value - 1) * pageSize.value + 1,
  to: Math.min(page.value * pageSize.value, total.value),
}))

const envIcon = (value: string): string | null => environmentIconUrl(value, displayedEnvironment.value)

// A getter, so the canonical URL follows client-side filter/range changes.
usePublicPageSeo(() => ({
  title: '日志档案',
  description: '这里记录了桂航绯想天的每一次变迁。所有的内容都是由同好们一点一滴积累而成，见证着这个小小同好会的成长。',
  path: '/logs',
  query: {
    ...filterQuery.value,
    ...(page.value > 1 ? { page: page.value } : {}),
    ...(activeRange.value !== '7d' ? { range: activeRange.value } : {}),
    ...(chartInterval.value !== 'auto' ? { interval: chartInterval.value } : {}),
    ...(environmentType.value !== 'browser' ? { env: environmentType.value } : {}),
    ...(topLimit.value !== 5 ? { top: topLimit.value } : {}),
  },
}))
</script>

<template>
  <div class="logs-stage club-paper min-h-screen font-sans pb-20 text-slate-900 dark:text-slate-100">
    <header class="logs-page-header">
      <div class="club-container logs-header-layout club-hero-step">
        <div>
          <h1 class="club-page-title">日志档案</h1>
          <p class="logs-header-description">查看访问趋势、访客分布与站点内容的变更记录。</p>
        </div>
        <nav class="logs-section-nav" aria-label="日志页快捷导航">
          <a href="#site-statistics" class="is-primary"><ClubIcon name="chart" />站点统计<ClubIcon name="arrow" /></a>
          <a href="#operation-logs">操作日志<span>{{ total }} 条</span></a>
        </nav>
      </div>
    </header>

    <div class="club-container space-y-10 sm:space-y-12">
      <!-- Section 1: Site Analytics (Umami) -->
      <section id="site-statistics" v-reveal class="logs-panel logs-statistics-panel" aria-labelledby="site-statistics-title" :aria-busy="statisticsLoading || undefined">
        <div class="logs-panel-header club-hero-step" style="--motion-order: 1">
          <div class="flex items-center gap-3">
            <span class="logs-section-marker font-mono" aria-hidden="true">01</span>
            <div>
              <h2 id="site-statistics-title" class="club-section-heading">站点统计</h2>
              <p class="logs-statistics-status" role="status" aria-live="polite">
                <span v-if="statisticsLoading" class="logs-updating">正在更新统计，保留上次结果…</span>
                <template v-else-if="umamiError && hasStatistics">更新失败，暂显示上次结果。<button type="button" @click="retryStatistics()">重试</button></template>
                <span v-else>全站访问趋势与访客分布</span>
              </p>
            </div>
          </div>
          <div class="logs-range-group">
            <NuxtLink
              v-for="item in LOG_RANGE_OPTIONS"
              :key="item.key"
              :to="linkFor({ range: item.key })"
              class="logs-range-tab"
              :class="{ 'is-active': item.key === activeRange }"
              :aria-current="item.key === activeRange ? 'true' : undefined"
            >
              {{ item.label }}
            </NuxtLink>
          </div>
        </div>

        <div v-if="initialStatisticsLoading" class="py-16 text-center text-slate-400">
          <svg class="w-6 h-6 animate-spin mx-auto mb-2.5 text-sky-600/80 dark:text-sky-400/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" fill="none" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p class="text-xs font-medium">正在获取站点数据...</p>
        </div>

        <div v-else-if="statisticsUnavailable" class="py-16 text-center text-slate-400">
          <svg class="w-7 h-7 mx-auto mb-2 text-slate-400/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
          <p class="text-xs font-medium">统计数据暂不可用</p>
        </div>

        <div v-else-if="hasStatistics" class="logs-statistics-content p-5 sm:p-6 space-y-6">
          <!-- 5 Stat Metric Cards -->
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
            <div class="logs-metric-item club-hero-step" style="--motion-order: 1">
              <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>页面浏览</span>
                <svg class="w-4 h-4 text-sky-600/80 dark:text-sky-400/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </div>
              <div class="logs-metric-value">{{ formatNumber(summary.pageviews) }}</div>
              <div class="logs-metric-sub">Pageviews</div>
            </div>

            <div class="logs-metric-item club-hero-step" style="--motion-order: 2">
              <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>独立访客</span>
                <ClubIcon name="users" class="w-4 h-4 text-emerald-600/80 dark:text-emerald-400/80" />
              </div>
              <div class="logs-metric-value">{{ formatNumber(summary.visitors) }}</div>
              <div class="logs-metric-sub">Visitors</div>
            </div>

            <div class="logs-metric-item club-hero-step" style="--motion-order: 3">
              <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>访问会话</span>
                <svg class="w-4 h-4 text-purple-600/80 dark:text-purple-400/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                  <path d="M8 16H3v5" />
                </svg>
              </div>
              <div class="logs-metric-value">{{ formatNumber(summary.visits) }}</div>
              <div class="logs-metric-sub">Sessions</div>
            </div>

            <div class="logs-metric-item club-hero-step" style="--motion-order: 4">
              <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>跳出率</span>
                <svg class="w-4 h-4 text-amber-600/80 dark:text-amber-400/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </div>
              <div class="logs-metric-value">{{ bounceRate(summary) }}</div>
              <div class="logs-metric-sub">Bounce Rate</div>
            </div>

            <div class="logs-metric-item club-hero-step" style="--motion-order: 5">
              <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>平均停留</span>
                <svg class="w-4 h-4 text-indigo-600/80 dark:text-indigo-400/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 16 14" />
                </svg>
              </div>
              <div class="logs-metric-value">{{ averageDuration(summary) }}</div>
              <div class="logs-metric-sub">Avg. Duration</div>
            </div>
          </div>

          <TrafficChart
            v-reveal="{ variant: 'scale' }"
            :data="chartData"
            :unit="chartUnit"
            :interval="chartInterval"
            :range="activeRange"
            :timezone="overview.meta.timezone ?? 'UTC'"
            :reference-time="rangeWindows[activeRange]?.endAt ?? Number(umami.meta.endAt)"
            :loading="overviewUpdating"
            @interval="router.push(linkFor({ interval: $event }))"
          />

          <!-- Top Content & Audience Insights Grid -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Top Content -->
            <div v-reveal class="logs-subcard">
              <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-2">
                  <ClubIcon name="book" class="w-4 h-4 text-sky-600/80 dark:text-sky-400/80" />
                  <h3 class="font-bold text-sm text-slate-800 dark:text-slate-200">热门访问内容</h3>
                </div>
                <div class="flex items-center gap-2 text-xs text-slate-400">
                  <span class="font-mono text-[11px]">TOP</span>
                  <select
                    :value="topLimit"
                    class="logs-select-sm"
                    aria-label="热门页面数量"
                    @change="router.push(linkFor({ top: Number(($event.target as HTMLSelectElement).value) }))"
                  >
                    <option v-for="limit in TOP_LIMITS" :key="limit" :value="limit">{{ limit }}</option>
                  </select>
                </div>
              </div>
              <div class="space-y-2.5">
                <div
                  v-for="(entry, index) in umami.top.pages.slice(0, topLimit)"
                  :key="`page-${index}`"
                  class="relative flex items-center justify-between gap-3 p-2.5 rounded border border-slate-100 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 overflow-hidden group transition-all"
                >
                  <div
                    class="absolute inset-y-0 left-0 bg-sky-50/80 dark:bg-sky-950/40 transition-all duration-500 pointer-events-none"
                    :style="{ width: `${Math.round((Number(entry.y || 0) / maxPageCount) * 100)}%` }"
                  />
                  <div class="relative z-10 min-w-0 flex items-center gap-2.5">
                    <span
                      class="w-5 h-5 rounded flex items-center justify-center text-[10px] font-mono font-bold shrink-0"
                      :class="index === 0 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60' : index === 1 ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600' : index === 2 ? 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-200 dark:border-orange-800/60' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700'"
                    >
                      {{ index + 1 }}
                    </span>
                    <div class="min-w-0">
                      <a
                        :href="topEntryPath(entry) || '#'"
                        class="inline-flex items-center gap-1.5 text-sm text-slate-800 hover:text-sky-600 dark:text-slate-200 dark:hover:text-sky-400 font-medium truncate"
                        target="_blank"
                        rel="noopener"
                      >
                        <span class="truncate">{{ pageTitle(topEntryPath(entry)) }}</span>
                        <ClubIcon name="external" class="w-3 h-3 text-sky-500 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
                      </a>
                      <div class="text-[11px] text-slate-400 font-mono truncate">{{ topEntryPath(entry) || '/' }}</div>
                    </div>
                  </div>
                  <div class="relative z-10 text-right shrink-0">
                    <div class="text-sm font-mono font-bold text-slate-800 dark:text-slate-200">
                      {{ formatNumber(entry.y || 0) }}
                    </div>
                    <div class="text-[10px] text-slate-400 font-mono">
                      {{ pagePercent(entry.y) }}
                    </div>
                  </div>
                </div>
                <div v-if="umami.top.pages.length === 0" class="text-xs text-slate-400 py-6 text-center">暂无页面访问数据</div>
              </div>
            </div>

            <!-- Audience & Dimensions -->
            <div v-reveal="{ delay: 70 }" class="logs-subcard logs-audience-panel" aria-label="访客画像" data-preserve-chart-readout>
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div class="flex items-center gap-2">
                  <svg class="w-4 h-4 text-emerald-600/80 dark:text-emerald-400/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                  <h3 class="font-bold text-sm text-slate-800 dark:text-slate-200">多维访客画像</h3>
                </div>
                <!-- Visitor dimensions -->
                <div class="flex items-center gap-1 p-0.5 rounded bg-slate-100 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700 overflow-x-auto max-w-full">
                  <NuxtLink
                    v-for="tab in ENVIRONMENT_TABS"
                    :key="tab.key"
                    :to="linkFor({ env: tab.key })"
                    class="logs-dim-tab shrink-0"
                    :class="{ 'is-active': environmentType === tab.key }"
                    :aria-current="environmentType === tab.key ? 'true' : undefined"
                  >
                    {{ tab.label }}
                  </NuxtLink>
                </div>
              </div>

              <p v-if="displayedEnvironment === 'region'" class="mb-4 text-xs leading-6 text-slate-500 dark:text-slate-400">
                <template v-if="umami.location">
                  共 {{ formatNumber(umami.location.total) }} 位访客，已识别省级地区 {{ formatNumber(umami.location.located) }} 位，未知 {{ formatNumber(umami.location.unknown) }} 位。占比以全部访客为分母。
                </template>
                <template v-else>占比为当前榜单内占比；省份识别覆盖率暂不可用。</template>
                地区表示网络出口归属；历史缺失数据保留未知。
              </p>
              <p class="logs-dimension-status" role="status" aria-live="polite">
                <template v-if="statisticsLoading">正在获取{{ ENVIRONMENT_TABS.find(tab => tab.key === environmentType)?.label }}，当前显示{{ ENVIRONMENT_TABS.find(tab => tab.key === displayedEnvironment)?.label }}。</template>
                <template v-else-if="umamiError">更新失败，保留上次的画像数据。</template>
              </p>
              <div class="logs-dimension-list space-y-2.5">
                <div
                  v-for="(entry, index) in umami.top.environments"
                  :key="`env-${index}`"
                  class="relative flex items-center justify-between gap-3 p-2.5 rounded border border-slate-100 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 overflow-hidden group transition-all"
                >
                  <div
                    class="absolute inset-y-0 left-0 bg-emerald-50/80 dark:bg-emerald-950/40 transition-all duration-500 pointer-events-none"
                    :style="{ width: `${Math.round((Number(entry.y || 0) / maxEnvCount) * 100)}%` }"
                  />
                  <div class="relative z-10 min-w-0 flex items-center gap-2.5">
                    <!-- Icon / Flag Slot -->
                    <span class="inline-flex w-7 h-7 rounded bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 items-center justify-center shrink-0 text-sm">
                      <!-- Country Flag -->
                      <span v-if="displayedEnvironment === 'country'" class="text-base leading-none select-none">
                        {{ formatCountry(String(entry.x || '')).flag }}
                      </span>
                      <!-- City icon -->
                      <svg v-else-if="displayedEnvironment === 'city' || displayedEnvironment === 'region'" class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      <!-- Referrer icon -->
                      <svg v-else-if="displayedEnvironment === 'referrer'" class="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="2" y1="12" x2="22" y2="12" />
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                      </svg>
                      <!-- Standard Env Icon (Browser / OS / Device) -->
                      <img
                        v-else-if="envIcon(String(entry.x || ''))"
                        :src="envIcon(String(entry.x || '')) ?? ''"
                        class="w-4 h-4 object-contain"
                        alt=""
                        loading="lazy"
                        referrerpolicy="no-referrer"
                      >
                      <span v-else class="text-slate-400 text-xs font-mono" aria-hidden="true">[-]</span>
                    </span>

                    <!-- Label & Details -->
                    <div class="min-w-0">
                      <div class="text-sm font-medium text-slate-800 dark:text-slate-200 truncate" data-testid="audience-value">
                        {{ formatDimensionName(String(entry.x || ''), displayedEnvironment) }}
                      </div>
                      <div class="text-[10px] text-slate-400 font-mono truncate">
                        {{ String(entry.x || '').trim() || 'DIRECT / NONE' }}
                      </div>
                    </div>
                  </div>

                  <!-- Count & Ratio -->
                  <div class="relative z-10 text-right shrink-0">
                    <div class="text-sm font-mono font-bold text-slate-800 dark:text-slate-200">
                      {{ formatNumber(entry.y || 0) }}
                    </div>
                    <div class="text-[10px] text-slate-400 font-mono">
                      {{ envPercent(entry.y) }}
                    </div>
                  </div>
                </div>
                <div v-if="umami.top.environments.length === 0" class="text-xs text-slate-400 py-6 text-center">暂无此维度数据</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 2: Contributor Leaderboard -->
      <section v-if="cards.length > 0" v-reveal aria-label="贡献榜">
        <div class="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div class="flex items-center gap-3">
            <span class="logs-section-marker font-mono" aria-hidden="true">02</span>
            <div>
              <h2 class="club-section-heading">贡献榜</h2>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">同好们为资料库添砖加瓦的足迹</p>
            </div>
          </div>
          <button
            type="button"
            class="logs-rules-btn"
            :aria-expanded="showRules"
            @click="showRules = !showRules"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>{{ showRules ? '收起算法说明' : '如何计算贡献？' }}</span>
          </button>
        </div>

        <!-- Rules Accordion Panel -->
        <div v-show="showRules" class="logs-rules-panel">
          <div class="flex items-center gap-2.5 mb-4">
            <span class="logs-spec-badge font-mono" aria-hidden="true">SPEC</span>
            <h3 class="font-bold text-base text-indigo-950 dark:text-indigo-200 font-serif">
              贡献值计算规则
            </h3>
          </div>
          <div class="grid md:grid-cols-2 gap-5">
            <div class="logs-rules-card">
              <ul class="space-y-2 list-disc pl-4 marker:text-indigo-400 text-xs sm:text-sm">
                <li><strong>核心公式：</strong> 贡献值 = 用户执行“有效内容编辑”的总次数。</li>
                <li><strong>统计范围：</strong> 基于全站历史数据统计，展示贡献前 10 名的用户。</li>
              </ul>
            </div>
            <div class="logs-rules-card text-xs space-y-2.5">
              <div>
                <p class="font-bold text-emerald-700 dark:text-emerald-400 mb-1 flex items-center gap-1.5">
                  <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>计入贡献的操作：</span>
                </p>
                <p class="text-slate-600 dark:text-slate-400 pl-4 leading-relaxed">
                  发布/修改/删除（异变、成员、历史记录）、更新系统配置、更新个人资料。
                </p>
              </div>
              <div class="pt-2 border-t border-indigo-50/80 dark:border-slate-800">
                <p class="font-bold text-rose-600 dark:text-rose-400 mb-1 flex items-center gap-1.5">
                  <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                  <span>不计入的操作：</span>
                </p>
                <p class="text-slate-600 dark:text-slate-400 pl-4 leading-relaxed">
                  日常登录、单纯文件上传、管理员账号管理（如创建账号、重置密码）。
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Contributor Cards Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div
            v-for="(entry, index) in cards"
            :key="index"
            class="logs-contributor-card group"
            :class="[
              index === 0
                ? 'is-champion'
                : index === 1
                ? 'is-runner-up'
                : index === 2
                ? 'is-third'
                : 'is-standard'
            ]"
          >
            <!-- Rank Badge -->
            <div
              class="logs-rank-badge font-mono"
              :class="{
                'bg-amber-600 text-white': index === 0,
                'bg-slate-600 text-white': index === 1,
                'bg-amber-700 text-white': index === 2,
                'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700': index > 2,
              }"
            >
              {{ index + 1 }}
            </div>

            <!-- Avatar -->
            <div
              class="w-12 h-12 rounded-full p-0.5 shrink-0 transition-transform group-hover:scale-105"
              :class="{
                'bg-gradient-to-tr from-yellow-400 to-amber-300 shadow-2xs': index === 0,
                'bg-gradient-to-tr from-slate-300 to-slate-200 shadow-2xs': index === 1,
                'bg-gradient-to-tr from-orange-400 to-amber-300 shadow-2xs': index === 2,
                'bg-slate-200 dark:bg-slate-700': index > 2,
              }"
            >
              <div class="w-full h-full rounded-full overflow-hidden bg-white dark:bg-slate-800 flex items-center justify-center">
                <img
                  v-if="displayImageSource(entry.user_avatar)"
                  :src="displayImageSource(entry.user_avatar) ?? ''"
                  class="w-full h-full object-cover"
                  alt=""
                  loading="lazy"
                >
                <div v-else class="w-full h-full flex items-center justify-center text-xs font-bold text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/80">
                  {{ entry.username.charAt(0) || '?' }}
                </div>
              </div>
            </div>

            <!-- User Info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="text-base font-bold text-slate-800 dark:text-slate-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  {{ entry.username || '神秘访客' }}
                </span>
                <span
                  v-if="index === 0"
                  class="logs-honor-pill font-mono"
                >
                  TOP 1
                </span>
              </div>
              <div class="text-xs text-gray-400 dark:text-slate-500 font-mono truncate mt-0.5">UID: Unknown</div>
            </div>

            <!-- Edit Count -->
            <div class="text-right shrink-0">
              <div class="text-lg font-bold text-slate-900 dark:text-slate-100 font-mono tracking-tight">{{ entry.count }}</div>
              <div class="text-[10px] text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wider">Edits</div>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 3: Audit Log Table -->
      <section id="operation-logs" v-reveal class="logs-panel" aria-label="操作日志">
        <!-- Filter Form -->
        <form
          class="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex flex-col md:flex-row md:items-center justify-between gap-4"
          method="get"
          action="/logs"
          @submit.prevent="applyFilters()"
        >
          <input type="hidden" name="range" :value="activeRange">
          <input type="hidden" name="env" :value="environmentType">
          <input type="hidden" name="top" :value="topLimit">
          <input v-if="chartInterval !== 'auto'" type="hidden" name="interval" :value="chartInterval">
          <input type="hidden" name="limit" :value="pageSize">

          <div class="flex items-center gap-3">
            <span class="logs-section-marker font-mono" aria-hidden="true">03</span>
            <div>
              <div class="flex items-center gap-2">
                <h2 class="club-section-heading">变更明细</h2>
                <span class="logs-total-badge font-mono">{{ total }}</span>
              </div>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">全站实体的新增、修改与操作审计追踪</p>
            </div>
          </div>

          <!-- Filter Controls -->
          <div class="flex flex-wrap sm:flex-nowrap items-center gap-2.5 w-full md:w-auto">
            <div class="relative flex-grow sm:w-44">
              <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                v-model="usernameInput"
                name="username"
                placeholder="搜索用户..."
                aria-label="搜索用户"
                class="pl-8 pr-3 py-1.5 w-full border border-slate-200 dark:border-slate-700 rounded text-sm focus:ring-1 focus:ring-sky-500 focus:border-sky-500 outline-none transition bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                @keyup.enter="applyFilters()"
              >
            </div>

            <div class="relative flex-grow sm:w-44">
              <select
                v-model="actionInput"
                name="action"
                aria-label="动作类型"
                class="w-full appearance-none pl-3 pr-8 py-1.5 border border-slate-200 dark:border-slate-700 rounded text-sm focus:ring-1 focus:ring-sky-500 focus:border-sky-500 outline-none transition bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 cursor-pointer"
                @change="applyFilters()"
              >
                <option value="">全部动作类型</option>
                <option v-for="entry in LOG_ACTIONS" :key="entry" :value="entry">{{ formatAction(entry) }}</option>
              </select>
              <span class="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-slate-400">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </span>
            </div>

            <button
              type="submit"
              class="club-button-primary px-4 py-1.5 text-sm font-semibold rounded cursor-pointer transition-colors flex-shrink-0"
            >
              搜索
            </button>
            <noscript>
              <button type="submit" class="px-4 py-1.5 bg-gray-200 text-gray-700 text-sm rounded flex-shrink-0">
                应用
              </button>
            </noscript>
          </div>
        </form>

        <!-- Loading State -->
        <div v-if="loading" class="py-20 text-center text-slate-400">
          <svg class="w-7 h-7 animate-spin mx-auto mb-3 text-sky-600/80 dark:text-sky-400/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" fill="none" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p class="text-sm font-medium">正在读取历史档案...</p>
        </div>

        <!-- Error State -->
        <div v-else-if="failedLogs" class="py-20 text-center text-slate-400">
          <svg class="w-8 h-8 mx-auto mb-3 text-rose-500/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p class="text-rose-500 font-medium text-sm">无法连接到数据中心，请稍后再试</p>
          <button type="button" class="mt-4 text-sky-600 dark:text-sky-400 hover:underline text-xs font-semibold cursor-pointer" @click="refreshLogs()">重试连接</button>
        </div>

        <!-- Empty State -->
        <div v-else-if="logs.length === 0" class="py-20 text-center text-gray-400">
          <ClubIcon name="book" class="w-10 h-10 mx-auto mb-3 opacity-25" />
          <p>没有找到相关记录</p>
        </div>

        <!-- Table Container -->
        <div
          v-else
          class="log-table-region overflow-x-auto focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:-outline-offset-2"
          tabindex="0"
          role="region"
          aria-label="操作日志表格（可横向滚动）"
        >
          <table class="w-full text-left border-collapse">
            <thead class="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-800 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-300 font-semibold">
              <tr>
                <th class="px-6 py-4 w-48 min-w-[170px]">操作时间</th>
                <th class="px-6 py-4 w-48 min-w-[150px]">执行者</th>
                <th class="px-6 py-4 w-40 min-w-[130px]">动作</th>
                <th class="px-6 py-4 min-w-[260px]">详细内容</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              <tr v-for="entry in logs" :key="entry.id" class="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors group">
                <td class="px-6 py-4 whitespace-nowrap">
                  <time class="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-mono text-sm">
                    <span class="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 group-hover:bg-sky-500 transition-colors" />
                    {{ formatLogTime(entry.created_at) }}
                  </time>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200/60 dark:border-slate-700 shrink-0">
                      <img
                        v-if="displayImageSource(entry.user_avatar)"
                        :src="displayImageSource(entry.user_avatar) ?? ''"
                        class="w-full h-full rounded-full object-cover"
                        alt=""
                        loading="lazy"
                      >
                      <div v-else class="w-full h-full rounded-full flex items-center justify-center text-xs text-slate-400 dark:text-slate-500 font-bold bg-white dark:bg-slate-900">
                        {{ entry.username.charAt(0) || '?' }}
                      </div>
                    </div>
                    <span class="font-medium text-slate-800 dark:text-slate-200 text-sm">{{ entry.username || 'Unknown' }}</span>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span
                    class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border tracking-wide uppercase shadow-2xs font-mono"
                    :class="actionStyleClass(entry.action)"
                  >
                    {{ formatAction(entry.action) }}
                  </span>
                </td>
                <td class="px-6 py-4">
                  <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed truncate max-w-xs sm:max-w-sm lg:max-w-md font-sans" :title="entry.details">
                    {{ entry.details || '-' }}
                  </p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div class="log-pagination px-6 py-4 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div class="text-xs text-slate-500 dark:text-slate-400">
            显示第 <span class="font-bold text-slate-700 dark:text-slate-200">{{ pageSummary.from }}</span>
            至 <span class="font-bold text-slate-700 dark:text-slate-200">{{ pageSummary.to }}</span> 条，
            共 <span class="font-bold text-slate-700 dark:text-slate-200">{{ total }}</span> 条记录
          </div>

          <div class="flex items-center gap-2">
            <NuxtLink
              v-if="page > 1"
              :to="linkFor({ page: page - 1 })"
              class="logs-page-link"
            >
              上一页
            </NuxtLink>
            <span v-else class="logs-page-link is-disabled" aria-disabled="true">
              上一页
            </span>

            <div class="hidden sm:flex px-2 text-sm font-mono font-bold text-slate-700 dark:text-slate-300">
              {{ page }}
            </div>

            <NuxtLink
              v-if="logs.length >= pageSize"
              :to="linkFor({ page: page + 1 })"
              class="logs-page-link"
            >
              下一页
            </NuxtLink>
            <span v-else class="logs-page-link is-disabled" aria-disabled="true">
              下一页
            </span>

            <div class="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-2" />

            <select
              :value="pageSize"
              class="text-xs border border-slate-200 dark:border-slate-700 rounded px-2 py-1 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer focus:ring-1 focus:ring-sky-500 outline-none"
              aria-label="每页条数"
              @change="changePageSize(Number(($event.target as HTMLSelectElement).value))"
            >
              <option v-for="size in LOGS_PAGE_SIZES" :key="size" :value="size">{{ size }} 条/页</option>
            </select>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Architectural Section Marker & Section Headings */
.logs-section-marker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: #0369a1;
  background-color: rgb(3 105 161 / 0.06);
  border: 1px solid rgb(3 105 161 / 0.22);
  border-radius: 3px;
  letter-spacing: -0.02em;
}
:global(.dark .logs-section-marker),
.dark .logs-section-marker {
  color: #38bdf8;
  background-color: rgb(56 189 248 / 0.08);
  border-color: rgb(56 189 248 / 0.25);
}

.club-section-heading {
  font-family: var(--club-serif);
  font-size: 1.125rem;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: 0.01em;
}
:global(.dark .club-section-heading),
.dark .club-section-heading {
  color: #f1f5f9;
}

/* Common panels */
.logs-panel {
  background-color: #ffffff;
  border: 1px solid #dce4e8;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.03);
}
:global(.dark .logs-panel),
.dark .logs-panel {
  background-color: #14202b;
  border-color: #293847;
}

.logs-panel-header {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #eef2f5;
  background-color: #fafbfc;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
@media (min-width: 640px) {
  .logs-panel-header {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
  }
}
:global(.dark .logs-panel-header),
.dark .logs-panel-header {
  border-color: #243241;
  background-color: #101a24;
}

/* Dimension tabs */
.logs-dim-tab {
  padding: 0.2rem 0.55rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: #64748b;
  border-radius: 2px;
  transition: all 120ms ease;
  white-space: nowrap;
}
.logs-dim-tab:hover {
  color: #0f172a;
}
.logs-dim-tab.is-active {
  background-color: #059669;
  color: #ffffff;
}
:global(.dark .logs-dim-tab) {
  color: #94a3b8;
}
:global(.dark .logs-dim-tab:hover) {
  color: #f1f5f9;
}
:global(.dark .logs-dim-tab.is-active) {
  background-color: #10b981;
  color: #ffffff;
}

/* Range tabs */
.logs-range-group {
  display: inline-flex;
  gap: 0.25rem;
  padding: 0.2rem;
  border: 1px solid #dce4e8;
  background-color: #ffffff;
  border-radius: 4px;
}
:global(.dark .logs-range-group),
.dark .logs-range-group {
  border-color: #293847;
  background-color: #101a24;
}

.logs-range-tab {
  padding: 0.25rem 0.65rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: #64748b;
  border-radius: 2px;
  transition: all 120ms ease;
}
.logs-range-tab:hover {
  color: #0f172a;
}
.logs-range-tab.is-active {
  background-color: #0369a1;
  color: #ffffff;
}
:global(.dark .logs-range-tab) {
  color: #94a3b8;
}
:global(.dark .logs-range-tab:hover) {
  color: #f1f5f9;
}
:global(.dark .logs-range-tab.is-active) {
  background-color: #0284c7;
  color: #ffffff;
}

/* Metric items */
.logs-metric-item {
  border: 1px solid #dce4e8;
  border-radius: 3px;
  padding: 1rem 1.15rem;
  background-color: #fafbfc;
}
:global(.dark .logs-metric-item),
.dark .logs-metric-item {
  border-color: #293847;
  background-color: #101a24;
}

.logs-metric-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: clamp(1.4rem, 2.2vw, 1.85rem);
  font-weight: 700;
  color: #0f172a;
  margin-top: 0.5rem;
  line-height: 1.2;
}
:global(.dark .logs-metric-value),
.dark .logs-metric-value {
  color: #f1f5f9;
}

.logs-metric-sub {
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #94a3b8;
  margin-top: 0.35rem;
}

/* Subcards */
.logs-subcard {
  border: 1px solid #dce4e8;
  border-radius: 3px;
  padding: 1.2rem;
  background-color: #ffffff;
}
:global(.dark .logs-subcard),
.dark .logs-subcard {
  border-color: #293847;
  background-color: #101a24;
}

.logs-select-sm {
  border: 1px solid #dce4e8;
  border-radius: 2px;
  padding: 0.15rem 0.45rem;
  font-size: 0.75rem;
  color: #334155;
  background-color: #fafbfc;
  outline: none;
  cursor: pointer;
}
:global(.dark .logs-select-sm),
.dark .logs-select-sm {
  border-color: #293847;
  color: #cbd5e1;
  background-color: #14202b;
}

/* Rules toggle and panel */
.logs-rules-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: rgb(79, 70, 229);
  padding: 0.3rem 0.75rem;
  border: 1px solid rgb(79 70 229 / 0.2);
  border-radius: 2px;
  background: transparent;
  cursor: pointer;
  transition: all 120ms ease;
}
.logs-rules-btn:hover {
  color: rgb(67, 56, 202);
  border-color: rgb(67 56 202 / 0.4);
  background-color: rgb(79 70 229 / 0.05);
}
:global(.dark .logs-rules-btn),
.dark .logs-rules-btn {
  color: rgb(165, 180, 252);
  border-color: rgb(165 180 252 / 0.2);
}
:global(.dark .logs-rules-btn:hover),
.dark .logs-rules-btn:hover {
  color: rgb(199, 210, 254);
  border-color: rgb(165 180 252 / 0.4);
}

.logs-rules-panel {
  border: 1px solid #dce4e8;
  border-left: 3px solid #0284c7;
  background-color: #fafbfc;
  padding: 1.25rem 1.5rem;
  margin-bottom: 1.5rem;
  border-radius: 2px;
}
:global(.dark .logs-rules-panel),
.dark .logs-rules-panel {
  border-color: #293847;
  border-left-color: #38bdf8;
  background-color: #101a24;
}

.logs-spec-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.1rem 0.35rem;
  border: 1px solid rgb(2 132 199 / 0.3);
  background-color: rgb(2 132 199 / 0.08);
  color: #0284c7;
  font-size: 0.65rem;
  font-weight: 700;
  border-radius: 2px;
  letter-spacing: 0.05em;
}
:global(.dark .logs-spec-badge),
.dark .logs-spec-badge {
  border-color: rgb(56 189 248 / 0.35);
  background-color: rgb(56 189 248 / 0.1);
  color: #38bdf8;
}

.logs-rules-card {
  border: 1px solid #e2e8f0;
  background-color: #ffffff;
  padding: 1rem 1.15rem;
  border-radius: 2px;
}
:global(.dark .logs-rules-card),
.dark .logs-rules-card {
  border-color: #293847;
  background-color: #14202b;
}

/* Contributor cards */
.logs-contributor-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.15rem 1.25rem;
  border: 1px solid #dce4e8;
  background-color: #ffffff;
  border-radius: 3px;
  transition: all 150ms ease;
}
:global(.dark .logs-contributor-card),
.dark .logs-contributor-card {
  border-color: #293847;
  background-color: #14202b;
}

.logs-contributor-card.is-champion {
  border-top: 2px solid #b45309;
}
.logs-contributor-card.is-runner-up {
  border-top: 2px solid #64748b;
}
.logs-contributor-card.is-third {
  border-top: 2px solid #c2410c;
}

.logs-rank-badge {
  position: absolute;
  top: -0.55rem;
  right: -0.55rem;
  width: 1.35rem;
  height: 1.35rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 2px;
  font-size: 0.65rem;
  font-weight: 700;
}

.logs-honor-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.08rem 0.4rem;
  border: 1px solid rgb(217 119 6 / 0.35);
  background-color: rgb(217 119 6 / 0.08);
  color: #b45309;
  font-size: 0.65rem;
  font-weight: 700;
  border-radius: 9999px;
  letter-spacing: 0.04em;
}
:global(.dark .logs-honor-pill),
.dark .logs-honor-pill {
  border-color: rgb(251 191 36 / 0.35);
  background-color: rgb(251 191 36 / 0.1);
  color: #fde68a;
}

.logs-total-badge {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.1rem 0.5rem;
  border: 1px solid #dce4e8;
  background-color: #fafbfc;
  color: #475569;
  border-radius: 2px;
}
:global(.dark .logs-total-badge),
.dark .logs-total-badge {
  border-color: #293847;
  background-color: #101a24;
  color: #94a3b8;
}

/* Page navigation links */
.logs-page-link {
  display: inline-flex;
  align-items: center;
  padding: 0.35rem 0.85rem;
  font-size: 0.8125rem;
  font-weight: 500;
  border: 1px solid #dce4e8;
  background-color: #ffffff;
  color: #334155;
  border-radius: 2px;
  transition: all 120ms ease;
}
.logs-page-link:hover:not(.is-disabled) {
  border-color: #0369a1;
  color: #0369a1;
}
.logs-page-link.is-disabled {
  opacity: 0.4;
  cursor: default;
}
:global(.dark .logs-page-link),
.dark .logs-page-link {
  border-color: #293847;
  background-color: #101a24;
  color: #cbd5e1;
}
:global(.dark .logs-page-link:hover:not(.is-disabled)),
.dark .logs-page-link:hover:not(.is-disabled) {
  border-color: #38bdf8;
  color: #38bdf8;
}

/* Compatibility & Contrast overrides required by tests */
html:not(.dark) div.text-gray-400,
html:not(.dark) p.text-gray-400 { color: #6b7280; }
span.bg-emerald-50.text-emerald-600 { color: #047857; }
span.bg-red-50.text-red-600 { color: #b91c1c; }
.dark .log-pagination { background-color: #0f172a; }

.log-table-region:focus-visible {
  outline: 2px solid #0284c7;
  outline-offset: -2px;
}

/* Compact header keeps the statistics heading visible on the first screen. */
.logs-page-header { padding-block: 2rem 1.5rem; margin-bottom: 1.5rem; border-bottom: 1px solid #dce4e8; }
.logs-header-layout { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1.25rem; }
.logs-header-description { margin-top: .65rem; font-size: .875rem; line-height: 1.8; color: #64748b; }
.logs-section-nav { display: flex; align-items: center; flex-wrap: wrap; gap: .6rem; }
.logs-section-nav a { display: inline-flex; align-items: center; justify-content: center; gap: .6rem; min-height: 2.75rem; padding: .65rem 1rem; border: 1px solid #dce4e8; border-radius: 5px; color: #475569; font-size: .8125rem; transition: background-color 180ms, border-color 180ms, translate 180ms; }
.logs-section-nav a svg { width: 1rem; height: 1rem; }
.logs-section-nav a span { color: #64748b; font-size: .6875rem; }
.logs-section-nav .is-primary { color: #fff; background: #0369a1; border-color: #0369a1; font-weight: 600; }
.logs-section-nav a:hover { translate: 0 -2px; border-color: #0284c7; }
.logs-section-nav .is-primary:hover { background: #075985; }
#site-statistics, #operation-logs { scroll-margin-top: calc(5.5rem + var(--club-safe-area-top, 0px)); }
.logs-statistics-status { min-height: 1.4rem; margin-top: .25rem; color: #64748b; font-size: .75rem; line-height: 1.8; }
.logs-statistics-status button { margin-left: .5rem; text-decoration: underline; color: #0369a1; }
.logs-updating::before { content: ''; display: inline-block; width: .5rem; height: .5rem; margin-right: .4rem; border-radius: 50%; background: #0284c7; animation: logs-update-pulse 1.2s ease-in-out infinite; }
.logs-dimension-status { min-height: 1.5rem; margin-bottom: .5rem; font-size: .6875rem; line-height: 1.7; color: #64748b; }
.logs-dimension-list { min-height: 20rem; }
.logs-statistics-panel { border-top: 2px solid #0284c7; }
@keyframes logs-update-pulse { 50% { opacity: .4; } }
:global(.dark .logs-page-header) { border-color: #293847; }
:global(.dark .logs-header-description), :global(.dark .logs-statistics-status), :global(.dark .logs-dimension-status) { color: #94a3b8; }
:global(.dark .logs-section-nav a) { border-color: #334155; color: #cbd5e1; }
:global(.dark .logs-section-nav .is-primary) { background: #075985; color: #f0f9ff; border-color: #0369a1; }
:global(.dark .logs-statistics-status button) { color: #7dd3fc; }
@media (max-width: 639px) { .logs-page-header { padding-block: 1.5rem 1.25rem; } .logs-section-nav { width: 100%; } .logs-section-nav a { flex: 1; } }
@media (prefers-reduced-motion: reduce) { .logs-updating::before { animation: none; } .logs-section-nav a { transition: none; translate: none; } }
</style>
