<script setup lang="ts">
/**
 * `/logs` - archived `views/public/Logs.vue`.
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
import { LOGS_PAGE_SIZE, LOGS_PAGE_SIZES } from '#shared/content'
import { usePublicPageSeo } from '~/composables/usePublicPageSeo'
import {
  LOG_ACTIONS,
  LOG_CHART,
  LOG_RANGE_OPTIONS,
  actionStyleClass,
  averageDuration,
  bounceRate,
  buildLogChart,
  buildPoints,
  buildSmoothPath,
  chartMaximum,
  environmentIconUrl,
  formatAction,
  formatChartDate,
  formatLogTime,
  formatNumber,
  logRangeWindow,
  pageTitle,
  topEntryPath,
} from '~/utils/logs'
import type { UmamiWindow } from '~/utils/logs'
import { buildPublicPath, parsePageParam, parsePageSizeParam, parseTextParam, queryValue } from '~/utils/public-query'
import { displayImageSource } from '~/utils/public-image'

const route = useRoute()
const router = useRouter()

const ENVIRONMENT_TYPES = ['browser', 'os', 'device'] as const
const TOP_LIMITS = [5, 8, 10] as const

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
  return LOG_RANGE_OPTIONS.some(option => option.key === raw) ? raw : LOG_RANGE_OPTIONS[0]?.key ?? '7d'
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
const initialRange = activeRange.value
if (!rangeWindows.value[initialRange]) {
  rangeWindows.value[initialRange] = logRangeWindow(initialRange, Date.now())
}

const umamiRequest = computed(() => {
  const range = activeRange.value
  const window = rangeWindows.value[range] ?? logRangeWindow(range, Date.now())
  return {
    startAt: String(window.startAt),
    endAt: String(window.endAt),
    unit: window.unit,
    limit: String(topLimit.value),
    envType: environmentType.value,
  }
})

const { data: umami, error: umamiError, status: umamiStatus } = await useFetch<PublicUmamiStats>('/api/logs/umami', {
  key: () => `public-logs-umami-${activeRange.value}-${environmentType.value}-${topLimit.value}`,
  query: umamiRequest,
  default: (): PublicUmamiStats => ({
    meta: { startAt: 0, endAt: 0, unit: '', limit: 0, envType: '' },
    summary: { pageviews: 0, visitors: 0, visits: 0, bounces: 0, totaltime: 0 },
    series: { pageviews: [], visitors: [] },
    top: { pages: [], environments: [] },
  }),
})

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

const statisticsUnavailable = computed(() => Boolean(umamiError.value))
const statisticsLoading = computed(() => umamiStatus.value === 'pending' && !umamiError.value)
const summary = computed(() => umami.value.summary)
const hasStatistics = computed(() => !statisticsUnavailable.value)

// --- Chart ----------------------------------------------------------------
const chartData = computed(() => buildLogChart({
  rangeKey: activeRange.value,
  endAt: Number(umami.value.meta.endAt)
    || rangeWindows.value[activeRange.value]?.endAt
    || Date.now(),
  pageviews: umami.value.series.pageviews,
  visitors: umami.value.series.visitors,
}))
const chartMax = computed(() => chartMaximum(chartData.value))
const pageviewPoints = computed(() => buildPoints(chartData.value.map(item => item.pageviews), chartMax.value))
const visitorPoints = computed(() => buildPoints(chartData.value.map(item => item.visitors), chartMax.value))
const pageviewPath = computed(() => buildSmoothPath(pageviewPoints.value))
const visitorPath = computed(() => buildSmoothPath(visitorPoints.value))

const hoveredIndex = ref<number | null>(null)
const hoverInfo = computed(() => {
  if (hoveredIndex.value === null) return null
  const datum = chartData.value[hoveredIndex.value]
  const point = pageviewPoints.value[hoveredIndex.value] ?? visitorPoints.value[hoveredIndex.value]
  if (!datum || !point) return null
  return {
    x: point.x,
    y: point.y,
    date: formatChartDate(datum.date),
    pageviews: datum.pageviews,
    visitors: datum.visitors,
  }
})

const setHoveredIndex = (index: number | null): void => {
  if (index === null) {
    hoveredIndex.value = null
    return
  }
  hoveredIndex.value = Math.max(0, Math.min(index, chartData.value.length - 1))
}

const onChartMove = (event: MouseEvent): void => {
  const svg = event.currentTarget as SVGSVGElement | null
  if (!svg || chartData.value.length === 0) return
  const rect = svg.getBoundingClientRect()
  if (rect.width === 0) return
  const x = (event.clientX - rect.left) / rect.width * LOG_CHART.width
  const step = chartData.value.length > 1
    ? (LOG_CHART.width - LOG_CHART.padding * 2) / (chartData.value.length - 1)
    : 0
  setHoveredIndex(step ? Math.round((x - LOG_CHART.padding) / step) : 0)
}

// --- Controls -------------------------------------------------------------
const usernameInput = ref(username.value)
const actionInput = ref(action.value)
const showRules = ref(false)

const linkFor = (overrides: Record<string, string | number | null | undefined>): string =>
  buildPublicPath('/logs', { ...filterQuery.value, ...umamiQuery.value, ...overrides })

const applyFilters = async (): Promise<void> => {
  await router.push(linkFor({
    username: usernameInput.value.trim() || undefined,
    action: actionInput.value || undefined,
    page: undefined,
  }))
}

const changePageSize = async (size: number): Promise<void> => {
  await router.push(linkFor({ limit: size === LOGS_PAGE_SIZE ? undefined : size }))
}

const pageSummary = computed(() => ({
  from: total.value === 0 ? 0 : (page.value - 1) * pageSize.value + 1,
  to: Math.min(page.value * pageSize.value, total.value),
}))

const envIcon = (value: string): string | null => environmentIconUrl(value, environmentType.value)

// A getter, so the canonical URL follows client-side filter/range changes.
usePublicPageSeo(() => ({
  title: '日志档案',
  description: '这里记录了桂航绯想天的每一次变迁。所有的内容都是由同好们一点一滴积累而成，见证着这个小小同好会的成长。',
  path: '/logs',
  query: {
    ...filterQuery.value,
    ...(page.value > 1 ? { page: page.value } : {}),
    ...(activeRange.value !== LOG_RANGE_OPTIONS[0]?.key ? { range: activeRange.value } : {}),
    ...(environmentType.value !== 'browser' ? { env: environmentType.value } : {}),
    ...(topLimit.value !== 5 ? { top: topLimit.value } : {}),
  },
}))
</script>

<template>
  <div class="min-h-screen bg-[#FDFBF7] dark:bg-slate-900 font-sans pb-20 text-gray-900 dark:text-slate-100">
    <div class="bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800 pt-16 pb-12 mb-10">
      <div class="max-w-6xl mx-auto px-4 text-center">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-500 mb-6 shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 class="text-3xl md:text-4xl font-bold text-gray-800 dark:text-slate-100 font-serif mb-3 tracking-tight">日志档案</h1>
        <p class="text-gray-500 dark:text-slate-400 max-w-lg mx-auto leading-relaxed">
          这里记录了桂航绯想天的每一次变迁。所有的内容都是由同好们一点一滴积累而成，见证着这个小小同好会的成长。
        </p>
      </div>
    </div>

    <div class="max-w-6xl mx-auto px-4 space-y-10">
      <section class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden">
        <div class="p-5 border-b border-gray-50 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div class="flex items-center gap-2">
            <span class="text-xl">📈</span>
            <h2 class="font-bold text-lg text-gray-800 dark:text-slate-100">站点统计</h2>
          </div>
          <div class="flex flex-wrap gap-2 text-xs">
            <NuxtLink
              v-for="item in LOG_RANGE_OPTIONS"
              :key="item.key"
              :to="linkFor({ range: item.key })"
              class="px-3 py-1 rounded-full border transition"
              :class="item.key === activeRange
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-200 hover:text-indigo-600 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700 dark:hover:border-indigo-400'"
              :aria-current="item.key === activeRange ? 'true' : undefined"
            >
              {{ item.label }}
            </NuxtLink>
          </div>
        </div>

        <div v-if="statisticsLoading" class="py-12 text-center text-gray-400">
          <div class="inline-block animate-spin text-2xl mb-2">⏳</div>
          <p class="text-sm">正在获取站点数据...</p>
        </div>

        <div v-else-if="statisticsUnavailable" class="py-10 text-center text-gray-400">
          <div class="text-2xl mb-2">📡</div>
          <p class="text-sm">统计数据暂不可用</p>
        </div>

        <div v-else-if="hasStatistics" class="p-6 space-y-6">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="rounded-xl border border-gray-100 dark:border-slate-800 p-4 bg-white dark:bg-slate-900">
              <div class="text-xs text-gray-400">页面浏览</div>
              <div class="text-2xl font-bold text-gray-900 mt-2">{{ formatNumber(summary.pageviews) }}</div>
              <div class="text-[10px] text-gray-400 mt-1">Pageviews</div>
            </div>
            <div class="rounded-xl border border-gray-100 dark:border-slate-800 p-4 bg-white dark:bg-slate-900">
              <div class="text-xs text-gray-400">独立访客</div>
              <div class="text-2xl font-bold text-gray-900 mt-2">{{ formatNumber(summary.visitors) }}</div>
              <div class="text-[10px] text-gray-400 mt-1">Visitors</div>
            </div>
            <div class="rounded-xl border border-gray-100 dark:border-slate-800 p-4 bg-white dark:bg-slate-900">
              <div class="text-xs text-gray-400">跳出率</div>
              <div class="text-2xl font-bold text-gray-900 mt-2">{{ bounceRate(summary) }}</div>
              <div class="text-[10px] text-gray-400 mt-1">Bounces</div>
            </div>
            <div class="rounded-xl border border-gray-100 dark:border-slate-800 p-4 bg-white dark:bg-slate-900">
              <div class="text-xs text-gray-400">平均停留</div>
              <div class="text-2xl font-bold text-gray-900 mt-2">{{ averageDuration(summary) }}</div>
              <div class="text-[10px] text-gray-400 mt-1">Avg. Time</div>
            </div>
          </div>

          <div class="rounded-2xl border border-gray-100 dark:border-slate-800 p-5 bg-white dark:bg-slate-900">
            <div class="flex items-center justify-between mb-4">
              <div>
                <h3 class="font-bold text-sm text-gray-700 dark:text-slate-200">访客/浏览量趋势</h3>
                <div class="text-[10px] text-gray-400">{{ LOG_RANGE_OPTIONS.find(option => option.key === activeRange)?.label || '趋势' }}</div>
              </div>
            </div>
            <div v-if="chartData.length === 0" class="text-xs text-gray-400 py-6 text-center">
              暂无趋势数据
            </div>
            <div v-else class="w-full overflow-x-auto">
              <div class="relative pb-8">
                <svg
                  :viewBox="`0 0 ${LOG_CHART.width} ${LOG_CHART.height}`"
                  class="w-full h-44"
                  role="img"
                  :aria-label="`${activeRange} 访客与浏览量趋势`"
                  @mousemove="onChartMove"
                  @mouseleave="setHoveredIndex(null)"
                >
                  <path :d="pageviewPath" fill="none" stroke="#6366F1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  <path :d="visitorPath" fill="none" stroke="#10B981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  <g>
                    <circle
                      v-for="(point, index) in pageviewPoints"
                      :key="`pv-${index}`"
                      :cx="point.x"
                      :cy="point.y"
                      r="3"
                      fill="#6366F1"
                      class="cursor-pointer"
                      @mouseenter="setHoveredIndex(index)"
                    />
                    <circle
                      v-for="(point, index) in visitorPoints"
                      :key="`vt-${index}`"
                      :cx="point.x"
                      :cy="point.y"
                      r="3"
                      fill="#10B981"
                      class="cursor-pointer"
                      @mouseenter="setHoveredIndex(index)"
                    />
                  </g>
                </svg>
                <div
                  v-if="hoverInfo"
                  class="absolute bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg shadow-md px-3 py-2 text-xs text-gray-700 dark:text-slate-200 pointer-events-none"
                  :style="{
                    left: `${(hoverInfo.x / LOG_CHART.width) * 100}%`,
                    top: `${(hoverInfo.y / LOG_CHART.height) * 100}%`,
                    transform: 'translate(-50%, -115%)',
                  }"
                >
                  <div class="font-medium text-gray-800">{{ hoverInfo.date }}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="rounded-xl border border-gray-100 dark:border-slate-800 p-4">
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-bold text-sm text-gray-700 dark:text-slate-200">热门页面</h3>
                <div class="flex items-center gap-2 text-[10px] text-gray-400">
                  <span>Top Pages</span>
                  <select
                    :value="topLimit"
                    class="border border-gray-200 dark:border-slate-700 rounded-md px-2 py-0.5 text-[10px] text-gray-500 dark:text-slate-300 bg-white dark:bg-slate-900"
                    aria-label="热门页面数量"
                    @change="router.push(linkFor({ top: Number(($event.target as HTMLSelectElement).value) }))"
                  >
                    <option v-for="limit in TOP_LIMITS" :key="limit" :value="limit">{{ limit }}</option>
                  </select>
                </div>
              </div>
              <div class="space-y-3">
                <div v-for="(entry, index) in umami.top.pages.slice(0, topLimit)" :key="`page-${index}`" class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <a
                      :href="topEntryPath(entry) || '#'"
                      class="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-300 dark:hover:text-indigo-200 font-medium truncate"
                      target="_blank"
                      rel="noopener"
                    >
                      <span class="w-5 h-5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 dark:text-indigo-300 flex items-center justify-center text-[10px]">↗</span>
                      <span class="truncate">{{ pageTitle(topEntryPath(entry)) }}</span>
                    </a>
                    <div class="text-[10px] text-gray-400 truncate">{{ topEntryPath(entry) || '访问' }}</div>
                  </div>
                  <div class="text-sm font-mono text-gray-800">{{ formatNumber(entry.y || 0) }}</div>
                </div>
                <div v-if="umami.top.pages.length === 0" class="text-xs text-gray-400">暂无数据</div>
              </div>
            </div>

            <div class="rounded-xl border border-gray-100 dark:border-slate-800 p-4">
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-bold text-sm text-gray-700 dark:text-slate-200">Environment</h3>
                <div class="flex items-center gap-2 text-[10px] text-gray-400">
                  <span>Top Environments</span>
                  <select
                    :value="environmentType"
                    class="border border-gray-200 dark:border-slate-700 rounded-md px-2 py-0.5 text-[10px] text-gray-500 dark:text-slate-300 bg-white dark:bg-slate-900"
                    aria-label="环境维度"
                    @change="router.push(linkFor({ env: ($event.target as HTMLSelectElement).value }))"
                  >
                    <option value="browser">Browser</option>
                    <option value="os">OS</option>
                    <option value="device">Device</option>
                  </select>
                </div>
              </div>
              <div class="space-y-3">
                <div v-for="(entry, index) in umami.top.environments" :key="`env-${index}`" class="flex items-center justify-between gap-3">
                  <div class="min-w-0 flex items-center gap-2">
                    <span class="inline-flex w-6 h-6 rounded-md bg-gray-100 dark:bg-slate-800 items-center justify-center">
                      <img
                        v-if="envIcon(String(entry.x || ''))"
                        :src="envIcon(String(entry.x || '')) ?? ''"
                        class="w-4 h-4"
                        alt=""
                        loading="lazy"
                        referrerpolicy="no-referrer"
                      >
                      <span v-else class="text-gray-400 text-[10px]" aria-hidden="true">▣</span>
                    </span>
                    <div>
                      <div class="text-sm text-gray-700 truncate">{{ entry.x || 'Unknown' }}</div>
                      <div class="text-[10px] text-gray-400 truncate">环境</div>
                    </div>
                  </div>
                  <div class="text-sm font-mono text-gray-800">{{ formatNumber(entry.y || 0) }}</div>
                </div>
                <div v-if="umami.top.environments.length === 0" class="text-xs text-gray-400">暂无数据</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section v-if="cards.length > 0">
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-2">
            <span class="text-2xl">🏆</span>
            <h2 class="font-bold text-xl text-gray-800 font-serif">贡献榜</h2>
          </div>
          <button
            type="button"
            class="text-xs font-medium text-indigo-500 hover:text-indigo-700 flex items-center gap-1 transition-colors px-3 py-1.5 rounded-full hover:bg-indigo-50"
            :aria-expanded="showRules"
            @click="showRules = !showRules"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {{ showRules ? '收起算法说明' : '如何计算贡献？' }}
          </button>
        </div>

        <div v-show="showRules" class="bg-indigo-50/50 rounded-xl p-5 mb-6 text-sm text-gray-600 border border-indigo-100">
          <h4 class="font-bold text-indigo-700 mb-3 flex items-center gap-2">
            贡献值计算规则
          </h4>
          <div class="grid md:grid-cols-2 gap-6">
            <ul class="space-y-2 list-disc pl-4 marker:text-indigo-300">
              <li><strong>核心公式：</strong> 贡献值 = 用户执行“有效内容编辑”的总次数。</li>
              <li><strong>统计范围：</strong> 基于全站历史数据统计，展示贡献前 10 名的用户。</li>
            </ul>
            <div class="bg-white/60 rounded-lg p-3 text-xs border border-indigo-50">
              <p class="font-bold text-gray-700 mb-1">✅ 计入贡献的操作：</p>
              <p class="mb-2">发布/修改/删除（异变、成员、历史记录）、更新系统配置、更新个人资料。</p>
              <p class="font-bold text-gray-700 mb-1">❌ 不计入的操作：</p>
              <p>日常登录、单纯文件上传、管理员账号管理（如创建账号、重置密码）。</p>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div
            v-for="(entry, index) in cards"
            :key="index"
            class="relative flex items-center gap-4 bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group"
          >
            <div
              class="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm"
              :class="{
                'bg-yellow-400': index === 0,
                'bg-gray-400': index === 1,
                'bg-orange-400': index === 2,
                'bg-indigo-100 text-indigo-600': index > 2,
              }"
            >
              {{ index + 1 }}
            </div>

            <div
              class="w-12 h-12 rounded-full p-0.5 bg-gradient-to-tr from-gray-100 to-gray-200 shrink-0"
              :class="{
                'from-yellow-200 to-yellow-100': index === 0,
                'from-gray-300 to-gray-100': index === 1,
                'from-orange-200 to-orange-100': index === 2,
              }"
            >
              <div class="w-full h-full rounded-full overflow-hidden bg-white">
                <img v-if="displayImageSource(entry.user_avatar)" :src="displayImageSource(entry.user_avatar) ?? ''" class="w-full h-full object-cover" alt="">
                <div v-else class="w-full h-full flex items-center justify-center text-xs text-gray-400 bg-gray-50">
                  {{ entry.username.charAt(0) || '?' }}
                </div>
              </div>
            </div>

            <div class="flex-1 min-w-0">
              <div class="text-base font-bold text-gray-800 truncate group-hover:text-indigo-600 transition-colors">{{ entry.username || '神秘访客' }}</div>
              <!-- The archived row showed the internal `user_id`; the public projection redacts it. -->
              <div class="text-xs text-gray-400 truncate mt-0.5">UID: Unknown</div>
            </div>

            <div class="text-right">
              <div class="text-lg font-bold text-gray-900 font-mono">{{ entry.count }}</div>
              <div class="text-[10px] text-gray-400 uppercase tracking-wider">Edits</div>
            </div>
          </div>
        </div>
      </section>

      <section class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden">
        <form
          class="p-5 border-b border-gray-50 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          method="get"
          action="/logs"
          @submit.prevent="applyFilters()"
        >
          <input type="hidden" name="range" :value="activeRange">
          <input type="hidden" name="env" :value="environmentType">
          <input type="hidden" name="top" :value="topLimit">
          <input type="hidden" name="limit" :value="pageSize">

          <div class="flex items-center gap-2">
            <span class="text-xl">📜</span>
            <h2 class="font-bold text-lg text-gray-800 dark:text-slate-100">变更明细</h2>
            <span class="text-xs px-2 py-0.5 bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-200 rounded-full font-mono">{{ total }}</span>
          </div>

          <div class="flex gap-2 w-full sm:w-auto">
            <div class="relative flex-grow sm:flex-grow-0">
              <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                v-model="usernameInput"
                name="username"
                placeholder="搜索用户..."
                aria-label="搜索用户"
                class="pl-9 pr-3 py-2 w-full border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 outline-none transition bg-white dark:bg-slate-900 dark:text-slate-100"
                @keyup.enter="applyFilters()"
              >
            </div>

            <div class="relative flex-grow sm:flex-grow-0">
              <select
                v-model="actionInput"
                name="action"
                aria-label="动作类型"
                class="w-full appearance-none pl-3 pr-8 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 outline-none transition bg-white dark:bg-slate-900 dark:text-slate-100 cursor-pointer"
                @change="applyFilters()"
              >
                <option value="">全部动作类型</option>
                <option v-for="entry in LOG_ACTIONS" :key="entry" :value="entry">{{ formatAction(entry) }}</option>
              </select>
              <span class="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </div>

            <button type="submit" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg shadow-sm transition-colors flex-shrink-0">
              搜索
            </button>
            <noscript>
              <button type="submit" class="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg flex-shrink-0">
                应用
              </button>
            </noscript>
          </div>
        </form>

        <div v-if="loading" class="py-20 text-center">
          <div class="inline-block animate-spin text-3xl mb-3 text-indigo-500">⏳</div>
          <p class="text-gray-400 text-sm">正在读取历史档案...</p>
        </div>

        <div v-else-if="failedLogs" class="py-20 text-center">
          <div class="text-3xl mb-3">📡</div>
          <p class="text-red-500 font-medium">无法连接到数据中心，请稍后再试</p>
          <button type="button" class="mt-4 text-indigo-600 hover:underline text-sm" @click="refreshLogs()">重试连接</button>
        </div>

        <div v-else-if="logs.length === 0" class="py-20 text-center text-gray-400">
          <div class="text-4xl mb-3 opacity-30">📭</div>
          <p>没有找到相关记录</p>
        </div>

        <div v-else class="overflow-x-auto focus-visible:outline-2 focus-visible:outline-sky-600 focus-visible:-outline-offset-2" tabindex="0" role="region" aria-label="操作日志表格（可横向滚动）">
          <table class="w-full text-left border-collapse">
            <thead class="bg-gray-50/80 dark:bg-slate-800/60 border-b border-gray-100 dark:border-slate-800 text-xs uppercase tracking-wider text-gray-500 dark:text-slate-300 font-medium">
              <tr>
                <th class="px-6 py-4 w-48">操作时间</th>
                <th class="px-6 py-4 w-48">执行者</th>
                <th class="px-6 py-4 w-40">动作</th>
                <th class="px-6 py-4">详细内容</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50 dark:divide-slate-800">
              <tr v-for="entry in logs" :key="entry.id" class="hover:bg-gray-50/50 dark:hover:bg-slate-800/40 transition-colors group">
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center gap-2 text-gray-500 font-mono text-sm">
                    <span class="w-1.5 h-1.5 rounded-full bg-gray-300 group-hover:bg-indigo-400 transition-colors"/>
                    {{ formatLogTime(entry.created_at) }}
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-gray-100 p-0.5 border border-gray-100 shrink-0">
                      <img v-if="displayImageSource(entry.user_avatar)" :src="displayImageSource(entry.user_avatar) ?? ''" class="w-full h-full rounded-full object-cover" alt="">
                      <div v-else class="w-full h-full rounded-full flex items-center justify-center text-xs text-gray-400 font-bold bg-white">
                        {{ entry.username.charAt(0) || '?' }}
                      </div>
                    </div>
                    <span class="font-medium text-gray-700 text-sm">{{ entry.username || 'Unknown' }}</span>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span
                    class="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold border tracking-wide uppercase shadow-sm"
                    :class="actionStyleClass(entry.action)"
                  >
                    {{ formatAction(entry.action) }}
                  </span>
                </td>
                <td class="px-6 py-4">
                  <p class="text-sm text-gray-600 leading-relaxed truncate max-w-xs sm:max-w-sm lg:max-w-md" :title="entry.details">
                    {{ entry.details || '-' }}
                  </p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="px-6 py-4 border-t border-gray-50 bg-gray-50/50 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div class="text-xs text-gray-500">
            显示第 <span class="font-bold text-gray-700">{{ pageSummary.from }}</span>
            至 <span class="font-bold text-gray-700">{{ pageSummary.to }}</span> 条，
            共 <span class="font-bold text-gray-700">{{ total }}</span> 条记录
          </div>

          <div class="flex items-center gap-2">
            <NuxtLink
              v-if="page > 1"
              :to="linkFor({ page: page - 1 })"
              class="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition shadow-sm"
            >
              上一页
            </NuxtLink>
            <span v-else class="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 opacity-50 cursor-not-allowed" aria-disabled="true">
              上一页
            </span>

            <div class="hidden sm:flex px-2 text-sm font-medium text-gray-600">
              {{ page }}
            </div>

            <NuxtLink
              v-if="logs.length >= pageSize"
              :to="linkFor({ page: page + 1 })"
              class="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition shadow-sm"
            >
              下一页
            </NuxtLink>
            <span v-else class="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 opacity-50 cursor-not-allowed" aria-disabled="true">
              下一页
            </span>

            <div class="h-4 w-px bg-gray-300 mx-2"/>

            <select
              :value="pageSize"
              class="text-xs border-none bg-transparent text-gray-500 focus:ring-0 cursor-pointer hover:text-gray-700"
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
