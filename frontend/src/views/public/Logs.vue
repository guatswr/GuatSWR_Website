<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import axios from 'axios'

const logs = ref([])
const logTotal = ref(0)
const logPage = ref(1)
const logLimit = ref(20)
const logFilter = reactive({ username: '', action: '' })
const loading = ref(false)
const stats = ref([])
const umami = ref({
  meta: null,
  summary: null,
  series: { pageviews: [], visitors: [] },
  top: { pages: [], environments: [] }
})
const umamiLoading = ref(false)
const umamiError = ref('')
const rangeOptions = [
  { key: '7d', label: '近7天', days: 7, unit: 'day' },
  { key: '30d', label: '近30天', days: 30, unit: 'day' },
  { key: '1y', label: '近1年', days: 365, unit: 'month' },
  { key: 'all', label: '全部', days: null, unit: 'month' }
]
const activeRange = ref('7d')
const topLimit = ref(5)
const envType = ref('browser')
const hoveredIndex = ref(null)
const chartWidth = 600
const chartHeight = 160
const chartPadding = 22
const errorMsg = ref('')
const showRules = ref(false) // 控制算法说明的显示/隐藏

// 动作字典，用于筛选
const logActions = [
  'LOGIN', 'UPLOAD', 'CREATE_ACTIVITY', 'UPDATE_ACTIVITY', 'DELETE_ACTIVITY',
  'CREATE_MEMBER', 'UPDATE_MEMBER', 'DELETE_MEMBER',
  'CREATE_HISTORY', 'UPDATE_HISTORY', 'DELETE_HISTORY',
  'UPDATE_CONFIG', 'CREATE_USER', 'DELETE_USER', 'RESET_PWD',
  'UPDATE_PROFILE'
]

// 辅助函数：格式化时间
const formatTime = (isoString) => {
  if (!isoString) return '-'
  const date = new Date(isoString)
  return date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 辅助函数：动作颜色映射
const getActionStyle = (action) => {
  if (action.includes('DELETE') || action.includes('RESET')) {
    return 'bg-red-50 text-red-600 border-red-100'
  }
  if (action.includes('CREATE') || action.includes('UPLOAD')) {
    return 'bg-emerald-50 text-emerald-600 border-emerald-100'
  }
  if (action.includes('UPDATE')) {
    return 'bg-blue-50 text-blue-600 border-blue-100'
  }
  if (action.includes('LOGIN')) {
    return 'bg-purple-50 text-purple-600 border-purple-100'
  }
  return 'bg-gray-50 text-gray-600 border-gray-200'
}

// 辅助函数：动作友好显示 (可选，去除下划线)
const formatAction = (action) => {
  return action.replace(/_/g, ' ')
}

const fetchStats = async () => {
  try {
    const res = await axios.get('/api/logs/stats')
    stats.value = res.data?.stats || []
  } catch (e) {
    // ignore stats error
  }
}

const fetchLogs = async () => {
  loading.value = true
  errorMsg.value = '' // 重置错误
  try {
    const params = { page: logPage.value, limit: logLimit.value, username: logFilter.username, action: logFilter.action }
    const res = await axios.get('/api/logs', { params })
    logs.value = res.data.logs || []
    logTotal.value = res.data.total || 0
  } catch (err) {
    errorMsg.value = '无法连接到数据中心，请稍后再试'
  } finally {
    loading.value = false
  }
}

const getRangeConfig = (rangeKey) => {
  const option = rangeOptions.find(item => item.key === rangeKey) || rangeOptions[0]
  const endAt = Date.now()
  const startAt = option.days ? (endAt - option.days * 24 * 60 * 60 * 1000) : 0
  return { startAt, endAt, unit: option.unit, label: option.label }
}

const fetchUmami = async (rangeKey = activeRange.value) => {
  umamiLoading.value = true
  umamiError.value = ''
  try {
    const { startAt, endAt, unit, label } = getRangeConfig(rangeKey)
    const res = await axios.get('/api/logs/umami', { params: { startAt, endAt, unit, limit: topLimit.value, envType: envType.value } })
    umami.value = {
      meta: { ...(res.data?.meta || {}), label },
      summary: res.data?.summary || null,
      series: res.data?.series || { pageviews: [], visitors: [] },
      top: res.data?.top || { pages: [], environments: [] }
    }
  } catch (e) {
    umamiError.value = '统计数据暂不可用'
  } finally {
    umamiLoading.value = false
  }
}

const formatNumber = (value) => {
  const num = Number(value || 0)
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return String(num)
}

const formatDuration = (seconds) => {
  const sec = Math.max(0, Math.round(Number(seconds || 0)))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m <= 0) return `${s}s`
  return `${m}m ${s}s`
}

const getBounceRate = (summary) => {
  const bounces = Number(summary?.bounces || 0)
  const visitors = Number(summary?.visitors || 0)
  if (!visitors) return '0%'
  return `${Math.round((bounces / visitors) * 100)}%`
}

const getAvgDuration = (summary) => {
  const total = Number(summary?.totaltime || 0)
  const visitors = Number(summary?.visitors || 0)
  if (!visitors) return '0s'
  return formatDuration(total / visitors)
}

const parseDateSafe = (value) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

const toDayKey = (date) => date.toISOString().slice(0, 10)
const toMonthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

const buildSeriesMap = (series, unit) => {
  const map = new Map()
  series.forEach((item) => {
    const date = parseDateSafe(item?.x)
    if (!date) return
    const key = unit === 'month' ? toMonthKey(date) : toDayKey(date)
    map.set(key, Number(item?.y ?? 0))
  })
  return map
}

const getSeriesMinDate = (series) => {
  let min = null
  series.forEach((item) => {
    const date = parseDateSafe(item?.x)
    if (!date) return
    if (!min || date < min) min = date
  })
  return min
}

const buildDateKeys = (startDate, endDate, unit) => {
  const keys = []
  const cursor = new Date(startDate)
  if (unit === 'month') {
    cursor.setDate(1)
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1)
    while (cursor <= end) {
      keys.push(toMonthKey(cursor))
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return keys
  }
  const end = new Date(endDate)
  while (cursor <= end) {
    keys.push(toDayKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return keys
}

const buildChartDataByRange = (unit, startDate, endDate, pageviews, visitors) => {
  const pvMap = buildSeriesMap(pageviews, unit)
  const visMap = buildSeriesMap(visitors, unit)
  const keys = buildDateKeys(startDate, endDate, unit)
  return keys.map((key) => ({
    date: key,
    pageviews: pvMap.get(key) ?? 0,
    visitors: visMap.get(key) ?? 0
  }))
}

const chartData = computed(() => {
  const pageviews = umami.value?.series?.pageviews || []
  const visitors = umami.value?.series?.visitors || []
  const length = Math.max(pageviews.length, visitors.length)
  const metaEndAt = umami.value?.meta?.endAt ? new Date(umami.value.meta.endAt) : new Date()
  const dataMinDate = getSeriesMinDate([...pageviews, ...visitors])

  if (activeRange.value === '30d') {
    const desiredStart = new Date(metaEndAt)
    desiredStart.setDate(desiredStart.getDate() - 29)
    const actualStart = dataMinDate && dataMinDate > desiredStart ? dataMinDate : desiredStart
    return buildChartDataByRange('day', actualStart, metaEndAt, pageviews, visitors)
  }

  if (activeRange.value === '1y') {
    const desiredStart = new Date(metaEndAt.getFullYear(), metaEndAt.getMonth() - 11, 1)
    const minMonth = dataMinDate ? new Date(dataMinDate.getFullYear(), dataMinDate.getMonth(), 1) : null
    const actualStart = minMonth && minMonth > desiredStart ? minMonth : desiredStart
    const endMonth = new Date(metaEndAt.getFullYear(), metaEndAt.getMonth(), 1)
    return buildChartDataByRange('month', actualStart, endMonth, pageviews, visitors)
  }

  return Array.from({ length }, (_, idx) => ({
    date: pageviews[idx]?.x || visitors[idx]?.x || '',
    pageviews: Number(pageviews[idx]?.y ?? 0),
    visitors: Number(visitors[idx]?.y ?? 0)
  }))
})

const chartMax = computed(() => {
  if (chartData.value.length === 0) return 1
  return Math.max(...chartData.value.flatMap(item => [item.pageviews, item.visitors]), 1)
})

const buildPoints = (values) => {
  if (!values.length) return []
  const xStep = values.length > 1 ? (chartWidth - chartPadding * 2) / (values.length - 1) : 0
  return values.map((value, idx) => {
    const x = chartPadding + xStep * idx
    const ratio = value / (chartMax.value || 1)
    const y = chartHeight - chartPadding - ratio * (chartHeight - chartPadding * 2)
    return { x, y, value }
  })
}

const buildSmoothPath = (points) => {
  if (!points.length) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] || p2
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  }
  return d
}

const pageviewPoints = computed(() => buildPoints(chartData.value.map(item => item.pageviews)))
const visitorPoints = computed(() => buildPoints(chartData.value.map(item => item.visitors)))
const pageviewPath = computed(() => buildSmoothPath(pageviewPoints.value))
const visitorPath = computed(() => buildSmoothPath(visitorPoints.value))

const formatChartDate = (value) => {
  if (!value) return '-'
  if (typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split('-')
    return `${year}年${Number(month)}月`
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-')
    return `${year}年${Number(month)}月${Number(day)}日`
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

const setHoveredIndex = (index) => {
  if (index === null || index === undefined) {
    hoveredIndex.value = null
    return
  }
  hoveredIndex.value = Math.max(0, Math.min(index, chartData.value.length - 1))
}

const handlePointEnter = (index) => {
  setHoveredIndex(index)
}

const handlePointLeave = () => {
  hoveredIndex.value = null
}

const handleChartMove = (event) => {
  const svg = event.currentTarget
  if (!svg || chartData.value.length === 0) return
  const rect = svg.getBoundingClientRect()
  const offsetX = event.clientX - rect.left
  const ratio = offsetX / rect.width
  const x = ratio * chartWidth
  const xStep = chartData.value.length > 1 ? (chartWidth - chartPadding * 2) / (chartData.value.length - 1) : 0
  const index = xStep ? Math.round((x - chartPadding) / xStep) : 0
  setHoveredIndex(index)
}

const hoverInfo = computed(() => {
  if (hoveredIndex.value === null) return null
  const data = chartData.value[hoveredIndex.value]
  if (!data) return null
  const point = pageviewPoints.value[hoveredIndex.value] || visitorPoints.value[hoveredIndex.value]
  if (!point) return null
  return {
    x: point.x,
    y: point.y,
    date: formatChartDate(data.date),
    pageviews: data.pageviews,
    visitors: data.visitors
  }
})

const getPathValue = (item) => item?.x || item?.url || item?.pathname || ''

const routeTitleMap = {
  '/': '首页',
  '/activities': '记忆碎片',
  '/members': '绯想天住民',
  '/history': '绯想天群史',
  '/social': '博丽大结界',
  '/join': '加入我们',
  '/logs': '站点日志',
  '/login': '登录',
  '/events': '异变进行时'
}

const getPageTitle = (path) => {
  if (!path) return '未知页面'
  if (routeTitleMap[path]) return routeTitleMap[path]
  if (path.startsWith('/activity/')) return '活动详情'
  if (path.startsWith('/events/')) return '异变进行时'
  if (path.startsWith('/admin')) return '后台页面'
  return path
}

const handleTopLimitChange = () => {
  fetchUmami(activeRange.value)
}

const handleEnvTypeChange = () => {
  fetchUmami(activeRange.value)
}

const normalizeEnvKey = (value) => String(value || '').toLowerCase()

const browserIconList = [
  { keywords: ['chrome', 'google chrome'], url: 'https://cdn.simpleicons.org/googlechrome/4285f4' },
  { keywords: ['edge', 'Edge (Chromium)'], url: 'https://cdn.simpleicons.org/microsoftedge/0ea5e9' },
  { keywords: ['firefox', 'mozilla'], url: 'https://cdn.simpleicons.org/firefox/ff7139' },
  { keywords: ['safari'], url: 'https://cdn.simpleicons.org/safari/2563eb' },
  { keywords: ['opera'], url: 'https://cdn.simpleicons.org/opera/ff1b2d' },
  { keywords: ['brave'], url: 'https://cdn.simpleicons.org/brave/f97316' },
  { keywords: ['chromium'], url: 'https://cdn.simpleicons.org/chromium/4b5563' },
  { keywords: ['yandex'], url: 'https://cdn.simpleicons.org/yandexbrowser/ff0000' },
  { keywords: ['uc'], url: 'https://cdn.simpleicons.org/ucbrowser/ff9a00' },
  { keywords: ['qq'], url: 'https://cdn.simpleicons.org/qq/12b7f5' },
  { keywords: ['360', 'qihoo', '360 secure'], url: 'https://cdn.simpleicons.org/360/00a4ff' }
]

const osIconList = [
  { keywords: ['Windows 11','Windows 10','windows', 'win','Winodws 10/11'], url: 'https://cdn.simpleicons.org/windows/1e3a8a' },
  { keywords: ['mac', 'macos', 'os x'], url: 'https://cdn.simpleicons.org/apple/111827' },
  { keywords: ['ios', 'iphone', 'ipad'], url: 'https://cdn.simpleicons.org/apple/6b7280' },
  { keywords: ['android'], url: 'https://cdn.simpleicons.org/android/22c55e' },
  { keywords: ['linux', 'ubuntu', 'debian', 'centos', 'arch'], url: 'https://cdn.simpleicons.org/linux/7c3aed' },
  { keywords: ['chrome os', 'chromeos'], url: 'https://cdn.simpleicons.org/googlechromeos/4285f4' }
]

const deviceIconList = [
  { keywords: ['desktop', 'pc','laptop', 'computer'], url: 'https://cdn.simpleicons.org/windows/64748b' },
  { keywords: ['mobile', 'phone', 'smartphone'], url: 'https://cdn.simpleicons.org/android/22c55e' },
  { keywords: ['tablet', 'ipad'], url: 'https://cdn.simpleicons.org/apple/6b7280' },
  { keywords: ['bot', 'spider', 'crawler'], url: 'https://cdn.simpleicons.org/robotframework/0ea5e9' }
]

const getIconByKeywords = (value, list, fallback) => {
  const key = normalizeEnvKey(value)
  if (!key) return fallback
  const matched = list.find(item => item.keywords.some(k => key.includes(k)))
  return matched?.url || fallback
}

const getEnvIconUrl = (name) => {
  if (envType.value === 'browser') return getIconByKeywords(name, browserIconList, 'https://cdn.simpleicons.org/internetexplorer/64748b')
  if (envType.value === 'os') return getIconByKeywords(name, osIconList, 'https://cdn.simpleicons.org/gnome/64748b')
  if (envType.value === 'device') return getIconByKeywords(name, deviceIconList, 'https://cdn.simpleicons.org/devices/64748b')
  return 'https://cdn.simpleicons.org/devices/64748b'
}

const handleRangeChange = (key) => {
  activeRange.value = key
  fetchUmami(key)
}

const handleSearch = () => {
  logPage.value = 1
  fetchLogs()
}

onMounted(() => {
  fetchStats()
  fetchLogs()
  fetchUmami(activeRange.value)
})
</script>

<template>
  <div class="min-h-screen bg-[#FDFBF7] dark:bg-slate-900 font-sans pb-20 text-gray-900 dark:text-slate-100">
    <!-- 头部 Hero 区域 -->
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
      
      <!-- 站点统计 -->
      <section class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden">
        <div class="p-5 border-b border-gray-50 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div class="flex items-center gap-2">
            <span class="text-xl">📈</span>
            <h2 class="font-bold text-lg text-gray-800 dark:text-slate-100">站点统计</h2>
          </div>
          <div class="flex flex-wrap gap-2 text-xs">
            <button
              v-for="item in rangeOptions"
              :key="item.key"
              class="px-3 py-1 rounded-full border transition"
              :class="item.key === activeRange ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-200 hover:text-indigo-600 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700 dark:hover:border-indigo-400'"
              @click="handleRangeChange(item.key)"
            >
              {{ item.label }}
            </button>
          </div>
        </div>

        <div v-if="umamiLoading" class="py-12 text-center text-gray-400">
          <div class="inline-block animate-spin text-2xl mb-2">⏳</div>
          <p class="text-sm">正在获取站点数据...</p>
        </div>

        <div v-else-if="umamiError" class="py-10 text-center text-gray-400">
          <div class="text-2xl mb-2">📡</div>
          <p class="text-sm">{{ umamiError }}</p>
        </div>

        <div v-else-if="umami.summary" class="p-6 space-y-6">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="rounded-xl border border-gray-100 dark:border-slate-800 p-4 bg-white dark:bg-slate-900">
              <div class="text-xs text-gray-400">页面浏览</div>
              <div class="text-2xl font-bold text-gray-900 mt-2">{{ formatNumber(umami.summary.pageviews) }}</div>
              <div class="text-[10px] text-gray-400 mt-1">Pageviews</div>
            </div>
            <div class="rounded-xl border border-gray-100 dark:border-slate-800 p-4 bg-white dark:bg-slate-900">
              <div class="text-xs text-gray-400">独立访客</div>
              <div class="text-2xl font-bold text-gray-900 mt-2">{{ formatNumber(umami.summary.visitors) }}</div>
              <div class="text-[10px] text-gray-400 mt-1">Visitors</div>
            </div>
            <div class="rounded-xl border border-gray-100 dark:border-slate-800 p-4 bg-white dark:bg-slate-900">
              <div class="text-xs text-gray-400">跳出率</div>
              <div class="text-2xl font-bold text-gray-900 mt-2">{{ getBounceRate(umami.summary) }}</div>
              <div class="text-[10px] text-gray-400 mt-1">Bounces</div>
            </div>
            <div class="rounded-xl border border-gray-100 dark:border-slate-800 p-4 bg-white dark:bg-slate-900">
              <div class="text-xs text-gray-400">平均停留</div>
              <div class="text-2xl font-bold text-gray-900 mt-2">{{ getAvgDuration(umami.summary) }}</div>
              <div class="text-[10px] text-gray-400 mt-1">Avg. Time</div>
            </div>
          </div>

          <div class="rounded-2xl border border-gray-100 dark:border-slate-800 p-5 bg-white dark:bg-slate-900">
            <div class="flex items-center justify-between mb-4">
              <div>
                <h3 class="font-bold text-sm text-gray-700 dark:text-slate-200">访客/浏览量趋势</h3>
                <div class="text-[10px] text-gray-400">{{ umami.meta?.label || '趋势' }}</div>
              </div>
            </div>
            <div v-if="(umami.series.pageviews || []).length === 0 && (umami.series.visitors || []).length === 0" class="text-xs text-gray-400 py-6 text-center">
              暂无趋势数据
            </div>
            <div v-else class="w-full overflow-x-auto">
              <div class="relative pb-8">
                <svg
                  viewBox="0 0 600 160"
                  class="w-full h-44"
                  @mousemove="handleChartMove"
                  @mouseleave="handlePointLeave"
                >
                  <path
                    :d="pageviewPath"
                    fill="none"
                    stroke="#6366F1"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <path
                    :d="visitorPath"
                    fill="none"
                    stroke="#10B981"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <g>
                    <circle
                      v-for="(p, idx) in pageviewPoints"
                      :key="`pv-${idx}`"
                      :cx="p.x"
                      :cy="p.y"
                      r="3"
                      fill="#6366F1"
                      class="cursor-pointer"
                      @mouseenter="handlePointEnter(idx)"
                    />
                    <circle
                      v-for="(p, idx) in visitorPoints"
                      :key="`vt-${idx}`"
                      :cx="p.x"
                      :cy="p.y"
                      r="3"
                      fill="#10B981"
                      class="cursor-pointer"
                      @mouseenter="handlePointEnter(idx)"
                    />
                  </g>
                </svg>
                <div
                  v-if="hoverInfo"
                  class="absolute bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg shadow-md px-3 py-2 text-xs text-gray-700 dark:text-slate-200 pointer-events-none"
                  :style="{ left: `${(hoverInfo.x / chartWidth) * 100}%`, top: `${(hoverInfo.y / chartHeight) * 100}%`, transform: 'translate(-50%, -115%)' }"
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
                    v-model.number="topLimit"
                    class="border border-gray-200 dark:border-slate-700 rounded-md px-2 py-0.5 text-[10px] text-gray-500 dark:text-slate-300 bg-white dark:bg-slate-900"
                    @change="handleTopLimitChange"
                  >
                    <option :value="5">5</option>
                    <option :value="8">8</option>
                    <option :value="10">10</option>
                  </select>
                </div>
              </div>
              <div class="space-y-3">
                <div v-for="(p, idx) in (umami.top.pages || []).slice(0, topLimit)" :key="`page-${idx}`" class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <a
                      :href="getPathValue(p) || '#'"
                      class="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-300 dark:hover:text-indigo-200 font-medium truncate"
                      target="_blank"
                      rel="noopener"
                    >
                      <span class="w-5 h-5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 dark:text-indigo-300 flex items-center justify-center text-[10px]">↗</span>
                      <span class="truncate">{{ getPageTitle(getPathValue(p)) }}</span>
                    </a>
                    <div class="text-[10px] text-gray-400 truncate">{{ getPathValue(p) || '访问' }}</div>
                  </div>
                  <div class="text-sm font-mono text-gray-800">{{ formatNumber(p.y || p.pageviews || p.count || 0) }}</div>
                </div>
                <div v-if="(umami.top.pages || []).length === 0" class="text-xs text-gray-400">暂无数据</div>
              </div>
            </div>

            <div class="rounded-xl border border-gray-100 dark:border-slate-800 p-4">
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-bold text-sm text-gray-700 dark:text-slate-200">Environment</h3>
                <div class="flex items-center gap-2 text-[10px] text-gray-400">
                  <span>Top Environments</span>
                  <select
                    v-model="envType"
                    class="border border-gray-200 dark:border-slate-700 rounded-md px-2 py-0.5 text-[10px] text-gray-500 dark:text-slate-300 bg-white dark:bg-slate-900"
                    @change="handleEnvTypeChange"
                  >
                    <option value="browser">Browser</option>
                    <option value="os">OS</option>
                    <option value="device">Device</option>
                  </select>
                </div>
              </div>
              <div class="space-y-3">
                <div v-for="(r, idx) in umami.top.environments" :key="`env-${idx}`" class="flex items-center justify-between gap-3">
                  <div class="min-w-0 flex items-center gap-2">
                    <span class="inline-flex w-6 h-6 rounded-md bg-gray-100 dark:bg-slate-800 items-center justify-center">
                      <img
                        :src="getEnvIconUrl(r.x || r.browser || r.os || r.device)"
                        class="w-4 h-4"
                        alt="icon"
                        loading="lazy"
                        referrerpolicy="no-referrer"
                      >
                    </span>
                    <div>
                      <div class="text-sm text-gray-700 truncate">{{ r.x || r.browser || r.os || r.device || 'Unknown' }}</div>
                      <div class="text-[10px] text-gray-400 truncate">{{ r.label || '环境' }}</div>
                    </div>
                  </div>
                  <div class="text-sm font-mono text-gray-800">{{ formatNumber(r.y || r.pageviews || r.count || 0) }}</div>
                </div>
                <div v-if="(umami.top.environments || []).length === 0" class="text-xs text-gray-400">暂无数据</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 贡献排行榜 -->
      <section v-if="stats.length > 0">
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-2">
            <span class="text-2xl">🏆</span>
            <h2 class="font-bold text-xl text-gray-800 font-serif">贡献榜</h2>
          </div>
          <button 
            @click="showRules = !showRules" 
            class="text-xs font-medium text-indigo-500 hover:text-indigo-700 flex items-center gap-1 transition-colors px-3 py-1.5 rounded-full hover:bg-indigo-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {{ showRules ? '收起算法说明' : '如何计算贡献？' }}
          </button>
        </div>

        <!-- 算法说明卡片 (可折叠) -->
        <div v-show="showRules" class="bg-indigo-50/50 rounded-xl p-5 mb-6 text-sm text-gray-600 border border-indigo-100 animate-fadeIn">
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
            v-for="(s, idx) in stats" 
            :key="idx" 
            class="relative flex items-center gap-4 bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group"
          >
            <!-- 排名标记 -->
            <div 
              class="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm"
              :class="{
                'bg-yellow-400': idx === 0,
                'bg-gray-400': idx === 1,
                'bg-orange-400': idx === 2,
                'bg-indigo-100 text-indigo-600': idx > 2
              }"
            >
              {{ idx + 1 }}
            </div>

            <!-- 头像 -->
            <div 
              class="w-12 h-12 rounded-full p-0.5 bg-gradient-to-tr from-gray-100 to-gray-200 shrink-0"
              :class="{
                'from-yellow-200 to-yellow-100': idx === 0,
                'from-gray-300 to-gray-100': idx === 1,
                'from-orange-200 to-orange-100': idx === 2
              }"
            >
              <div class="w-full h-full rounded-full overflow-hidden bg-white">
                <img v-if="s.user_avatar" :src="s.user_avatar" class="w-full h-full object-cover" alt="avatar">
                <div v-else class="w-full h-full flex items-center justify-center text-xs text-gray-400 bg-gray-50">
                  {{ s.username?.charAt(0) || '?' }}
                </div>
              </div>
            </div>

            <!-- 信息 -->
            <div class="flex-1 min-w-0">
              <div class="text-base font-bold text-gray-800 truncate group-hover:text-indigo-600 transition-colors">{{ s.username || '神秘访客' }}</div>
              <div class="text-xs text-gray-400 truncate mt-0.5">UID: {{ s.user_id || 'Unknown' }}</div>
            </div>

            <!-- 贡献数 -->
            <div class="text-right">
              <div class="text-lg font-bold text-gray-900 font-mono">{{ s.count }}</div>
              <div class="text-[10px] text-gray-400 uppercase tracking-wider">Edits</div>
            </div>
          </div>
        </div>
      </section>

      <!-- 日志列表主体 -->
      <section class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden">
        <!-- 筛选工具栏 -->
        <div class="p-5 border-b border-gray-50 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div class="flex items-center gap-2">
            <span class="text-xl">📜</span>
            <h2 class="font-bold text-lg text-gray-800 dark:text-slate-100">变更明细</h2>
            <span class="text-xs px-2 py-0.5 bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-200 rounded-full font-mono">{{ logTotal }}</span>
          </div>
          
          <div class="flex gap-2 w-full sm:w-auto">
             <div class="relative flex-grow sm:flex-grow-0">
               <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
               </span>
              <input 
                  v-model="logFilter.username" 
                  placeholder="搜索用户..." 
                class="pl-9 pr-3 py-2 w-full border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 outline-none transition bg-white dark:bg-slate-900 dark:text-slate-100"
                  @keyup.enter="handleSearch"
               >
             </div>
             
             <div class="relative flex-grow sm:flex-grow-0">
                <select 
                  v-model="logFilter.action" 
                  class="w-full appearance-none pl-3 pr-8 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 outline-none transition bg-white dark:bg-slate-900 dark:text-slate-100 cursor-pointer"
                  @change="handleSearch"
                >
                  <option value="">全部动作类型</option>
                  <option v-for="act in logActions" :key="act" :value="act">{{ formatAction(act) }}</option>
                </select>
                <span class="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none text-gray-400">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
             </div>
             
             <button @click="handleSearch" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg shadow-sm transition-colors flex-shrink-0">
               搜索
             </button>
          </div>
        </div>

        <!-- 状态展示 -->
        <div v-if="loading" class="py-20 text-center">
           <div class="inline-block animate-spin text-3xl mb-3 text-indigo-500">⏳</div>
           <p class="text-gray-400 text-sm">正在读取历史档案...</p>
        </div>

        <div v-else-if="errorMsg" class="py-20 text-center">
           <div class="text-3xl mb-3">📡</div>
           <p class="text-red-500 font-medium">{{ errorMsg }}</p>
           <button @click="fetchLogs" class="mt-4 text-indigo-600 hover:underline text-sm">重试连接</button>
        </div>

        <div v-else-if="logs.length === 0" class="py-20 text-center text-gray-400">
           <div class="text-4xl mb-3 opacity-30">📭</div>
           <p>没有找到相关记录</p>
        </div>

        <!-- 日志表格 -->
        <div v-else class="overflow-x-auto">
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
              <tr v-for="log in logs" :key="log.id" class="hover:bg-gray-50/50 dark:hover:bg-slate-800/40 transition-colors group">
                <!-- 时间 -->
                <td class="px-6 py-4 whitespace-nowrap">
                   <div class="flex items-center gap-2 text-gray-500 font-mono text-sm">
                     <span class="w-1.5 h-1.5 rounded-full bg-gray-300 group-hover:bg-indigo-400 transition-colors"></span>
                     {{ formatTime(log.created_at) }}
                   </div>
                </td>

                <!-- 用户 -->
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-gray-100 p-0.5 border border-gray-100 shrink-0">
                       <img v-if="log.user_avatar" :src="log.user_avatar" class="w-full h-full rounded-full object-cover" alt="avatar">
                       <div v-else class="w-full h-full rounded-full flex items-center justify-center text-xs text-gray-400 font-bold bg-white">
                         {{ log.username?.charAt(0) || '?' }}
                       </div>
                    </div>
                    <span class="font-medium text-gray-700 text-sm">{{ log.username || 'Unknown' }}</span>
                  </div>
                </td>

                <!-- 动作 -->
                <td class="px-6 py-4 whitespace-nowrap">
                  <span 
                    class="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold border tracking-wide uppercase shadow-sm"
                    :class="getActionStyle(log.action)"
                  >
                    {{ formatAction(log.action) }}
                  </span>
                </td>

                <!-- 详情 -->
                <td class="px-6 py-4">
                  <p class="text-sm text-gray-600 leading-relaxed truncate max-w-xs sm:max-w-sm lg:max-w-md" :title="log.details">
                    {{ log.details || '-' }}
                  </p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 分页 -->
        <div class="px-6 py-4 border-t border-gray-50 bg-gray-50/50 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div class="text-xs text-gray-500">
            显示第 <span class="font-bold text-gray-700">{{ (logPage - 1) * logLimit + 1 }}</span> 
            至 <span class="font-bold text-gray-700">{{ Math.min(logPage * logLimit, logTotal) }}</span> 条，
            共 <span class="font-bold text-gray-700">{{ logTotal }}</span> 条记录
          </div>
          
          <div class="flex items-center gap-2">
            <button 
              :disabled="logPage <= 1" 
              @click="logPage--;fetchLogs()" 
              class="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
            >
              上一页
            </button>
            
            <div class="hidden sm:flex px-2 text-sm font-medium text-gray-600">
              {{ logPage }}
            </div>

            <button 
              :disabled="logs.length < logLimit" 
              @click="logPage++;fetchLogs()" 
              class="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
            >
              下一页
            </button>
            
            <div class="h-4 w-px bg-gray-300 mx-2"></div>

            <select 
              v-model="logLimit" 
              @change="fetchLogs()" 
              class="text-xs border-none bg-transparent text-gray-500 focus:ring-0 cursor-pointer hover:text-gray-700"
            >
              <option :value="20">20 条/页</option>
              <option :value="50">50 条/页</option>
              <option :value="100">100 条/页</option>
            </select>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.animate-fadeIn {
  animation: fadeIn 0.2s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>