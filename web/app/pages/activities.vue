<script setup lang="ts">
/**
 * `/activities` - 往期活动回顾 (Editorial Touhou Club Activity Archives).
 *
 * 统一全站 club-paper 纸本风雅与线框体系，并与活动中心转场动画无缝衔接：
 * - 页面载入与转场序列（.is-entered）完美对接活动中心 (/events) 物理动效
 * - 竖式朱印盖印（events-seal-press）、卷轴标题展开（events-title-unfurl）
 * - 对偶跃迁链接（/events ↔ /activities）对称滑入（events-archive-slide）
 * - 筛选芯片阶梯式升起（events-tab-rise）与回忆卡片多级升浮（events-card-rise）
 * - 纯粹的 SSR 分页与无 JS 优雅降级契约
 */
import type { PublicActivitiesPage, PublicActivity } from '@guatswr/shared'
import { computed, onMounted, ref } from 'vue'
import { ACTIVITIES_PAGE_SIZE } from '#shared/content'
import { usePublicPageSeo } from '~/composables/usePublicPageSeo'
import { displayImageSource, displayThumbSource } from '~/utils/public-image'
import { formatArchiveDate } from '~/utils/club-date'
import { parsePageParam } from '~/utils/public-query'
import { totalPageCount } from '~/utils/public-pagination'
import EventPageHeader from '~/components/EventPageHeader.vue'
import '~/assets/css/activities.css'

const route = useRoute()
const requestedPage = computed(() => parsePageParam(route.query.page))
const page = computed(() => requestedPage.value ?? 1)
const isEntered = ref(false)

onMounted(() => {
  requestAnimationFrame(() => {
    isEntered.value = true
  })
})

const { data, error, status, refresh } = await useFetch<PublicActivitiesPage>('/api/activities', {
  // Keyed by the normalized page so each page has its own cache slot.
  key: () => `public-activities-${page.value}`,
  query: computed(() => ({ page: page.value, limit: ACTIVITIES_PAGE_SIZE })),
  default: (): PublicActivitiesPage => ({ total: 0, page: 1, limit: ACTIVITIES_PAGE_SIZE, items: [] }),
})

const total = computed(() => data.value.total)
const items = computed(() => data.value.items)
const totalPages = computed(() => totalPageCount(total.value, ACTIVITIES_PAGE_SIZE))
const loading = computed(() => status.value === 'pending')
const failed = computed(() => Boolean(error.value))
const outOfRange = computed(() => total.value > 0 && page.value > totalPages.value)

if (import.meta.server) {
  if (requestedPage.value === null) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid page parameter' })
  }
  if (outOfRange.value) {
    throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  }
  if (failed.value) setResponseStatus(502)
}

// SEO canonical and metadata
usePublicPageSeo(() => ({
  title: '社团活动记录',
  description: '一场聚会，一段故事。翻翻我们一起走过的日子。',
  path: '/activities',
  query: page.value > 1 ? { page: page.value } : {},
}))

// ---------------------------------------------------------------------------
// 交互状态：搜索、标签筛选、年份筛选、视图与排序
// ---------------------------------------------------------------------------
const searchQuery = ref('')
const selectedTag = ref('all')
const selectedYear = ref('all')
const viewMode = ref<'grid' | 'timeline'>('grid')
const sortOrder = ref<'desc' | 'asc'>('desc')

function toggleSortOrder() {
  sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc'
}

const hasActiveFilter = computed(() =>
  searchQuery.value.trim() !== '' || selectedTag.value !== 'all' || selectedYear.value !== 'all',
)

// 可用年份与分类标签提取
const availableYears = computed(() => {
  const set = new Set<string>()
  for (const item of items.value) {
    if (item.date) {
      const y = item.date.slice(0, 4)
      if (/^\d{4}$/.test(y)) set.add(y)
    }
  }
  return Array.from(set).sort((a, b) => Number(b) - Number(a))
})

const yearFilterOptions = computed(() => [
  { label: '全部年份', value: 'all' },
  ...availableYears.value.map(y => ({ label: `${y}年`, value: y })),
])

const tagFilterOptions = computed(() => {
  const map = new Map<string, number>()
  for (const item of items.value) {
    const raw = (item.tag || '').trim()
    if (raw) {
      for (const t of raw.split(/\s+/)) {
        if (t) map.set(t, (map.get(t) || 0) + 1)
      }
    }
  }
  const options = [{ label: '全部', value: 'all', count: items.value.length }]
  for (const [tag, count] of map.entries()) {
    options.push({ label: tag, value: tag, count })
  }
  return options
})

// 过滤与排序后的数据
const filteredItems = computed(() => {
  let list = [...items.value]

  if (selectedTag.value !== 'all') {
    list = list.filter(item => (item.tag || '').includes(selectedTag.value))
  }

  if (selectedYear.value !== 'all') {
    list = list.filter(item => item.date && item.date.startsWith(selectedYear.value))
  }

  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(item =>
      (item.title && item.title.toLowerCase().includes(q))
      || (item.description && item.description.toLowerCase().includes(q))
      || (item.tag && item.tag.toLowerCase().includes(q)),
    )
  }

  if (sortOrder.value === 'asc') {
    list.sort((a, b) => (a.date > b.date ? 1 : -1))
  }
  else {
    list.sort((a, b) => (a.date < b.date ? 1 : -1))
  }

  return list
})

/** 第一页且无筛选时，将最新记录作为特辑 Spotlight 呈现 */
const isSpotlightActive = computed(() =>
  page.value === 1 && !hasActiveFilter.value && sortOrder.value === 'desc' && filteredItems.value.length > 0,
)

const featured = computed<PublicActivity | null>(() =>
  isSpotlightActive.value ? (filteredItems.value[0] ?? null) : null,
)

const restItems = computed(() =>
  isSpotlightActive.value ? filteredItems.value.slice(1) : filteredItems.value,
)

const featuredIndex = computed(() => (page.value - 1) * ACTIVITIES_PAGE_SIZE)

/** 档案序号 by position in the full chronicle, newest first. */
const archiveOrdinal = (index: number): string =>
  String(total.value - index).padStart(2, '0')

function getItemOrdinal(item: PublicActivity): string {
  const originalIndex = items.value.findIndex(it => it.id === item.id)
  const fullIndex = (page.value - 1) * ACTIVITIES_PAGE_SIZE + (originalIndex >= 0 ? originalIndex : 0)
  return archiveOrdinal(fullIndex)
}

function getActivityPhotosCount(activity: PublicActivity): number {
  if (Array.isArray(activity.images) && activity.images.length > 0) {
    return activity.images.length
  }
  return 0
}
</script>

<template>
  <div
    class="activities-stage club-paper"
    :class="{ 'is-entered': isEntered }"
  >
    <!-- 背景博丽结界与八角星轨几何暗纹（纯装饰，与活动中心相同速度与星轨坐标） -->
    <div class="activities-ambient" aria-hidden="true">
      <div class="activities-ambient-grid" />
      <svg class="activities-ambient-watermark" viewBox="0 0 360 360" fill="none">
        <circle cx="180" cy="180" r="164" stroke="currentColor" stroke-width="0.75" stroke-dasharray="3 6" />
        <circle cx="180" cy="180" r="136" stroke="currentColor" stroke-width="0.6" />
        <polygon
          points="180,22 292,68 338,180 292,292 180,338 68,292 22,180 68,68"
          stroke="currentColor"
          stroke-width="0.7"
        />
        <polygon
          points="180,52 270,90 308,180 270,270 180,308 90,270 52,180 90,90"
          stroke="currentColor"
          stroke-width="0.5"
          stroke-dasharray="2 4"
        />
        <rect
          x="104"
          y="104"
          width="152"
          height="152"
          stroke="currentColor"
          stroke-width="0.55"
          transform="rotate(45 180 180)"
        />
        <circle cx="180" cy="180" r="36" stroke="currentColor" stroke-width="0.6" />
      </svg>
    </div>

    <div class="club-container activities-container">
      <EventPageHeader
        title="社团活动记录"
        variant="activities"
        subtitle="一场聚会，一段故事。翻翻我们一起走过的日子。"
        link-to="/events"
        link-label="社团活动中心"
      />

      <!-- 加载状态 -->
      <p
        v-if="loading"
        class="py-20 text-center text-sm text-slate-500"
        role="status"
      >
        正在翻阅活动记录与相册旧卷…
      </p>

      <div v-else class="activities-content pt-4">
        <!-- 错误状态 -->
        <p
          v-if="failed"
          class="py-10 text-sm text-red-600 dark:text-red-400"
          role="status"
        >
          活动记录暂时无法加载，请稍后重试。
          <button
            type="button"
            class="club-text-link ml-3 cursor-pointer"
            @click="refresh()"
          >
            重新加载
          </button>
        </p>

        <!-- 越界错误 -->
        <p v-else-if="outOfRange" class="py-16 text-center text-sm text-slate-500">
          这一页没有活动记录。
          <NuxtLink to="/activities" class="club-text-link ml-2">回到第一页</NuxtLink>
        </p>

        <!-- 没有任何活动 -->
        <p v-else-if="!items.length" class="club-empty">
          我们的故事正在继续，活动记录将在这里更新。
        </p>

        <!-- 正常内容区 -->
        <template v-else>
          <!-- 操作与筛选工具栏 -->
          <section
            class="activities-toolbar"
            aria-label="活动筛选与视图控制"
          >
            <!-- 检索、排序与视图切换 -->
            <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <!-- 搜索框 -->
              <div class="activities-search-box">
                <span class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </span>
                <input
                  v-model="searchQuery"
                  type="search"
                  placeholder="搜索活动标题、关键词或故事记录…"
                  class="activities-search-input"
                >
                <button
                  v-if="searchQuery"
                  type="button"
                  class="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  aria-label="清空搜索"
                  @click="searchQuery = ''"
                >
                  <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <!-- 右侧：排序与视图切换 -->
              <div class="flex items-center justify-between sm:justify-end gap-2.5">
                <button
                  type="button"
                  class="activities-action-btn"
                  :title="sortOrder === 'desc' ? '当前：从新到旧' : '当前：从旧到新'"
                  @click="toggleSortOrder"
                >
                  <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6h18M6 12h12m-9 6h6" />
                  </svg>
                  <span>{{ sortOrder === 'desc' ? '从新到旧' : '从旧到新' }}</span>
                </button>

                <div class="activities-view-group" role="radiogroup" aria-label="视图选择">
                  <button
                    type="button"
                    class="activities-view-tab"
                    :class="{ 'is-active': viewMode === 'grid' }"
                    :aria-checked="viewMode === 'grid'"
                    role="radio"
                    @click="viewMode = 'grid'"
                  >
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="3" y="3" width="7" height="7" rx="1" />
                      <rect x="14" y="3" width="7" height="7" rx="1" />
                      <rect x="3" y="14" width="7" height="7" rx="1" />
                      <rect x="14" y="14" width="7" height="7" rx="1" />
                    </svg>
                    <span class="inline sm:hidden">画卷</span>
                    <span class="hidden sm:inline">画卷相册</span>
                  </button>
                  <button
                    type="button"
                    class="activities-view-tab"
                    :class="{ 'is-active': viewMode === 'timeline' }"
                    :aria-checked="viewMode === 'timeline'"
                    role="radio"
                    @click="viewMode = 'timeline'"
                  >
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="12" y1="3" x2="12" y2="21" />
                      <circle cx="12" cy="7" r="2" fill="currentColor" />
                      <circle cx="12" cy="17" r="2" fill="currentColor" />
                    </svg>
                    <span class="inline sm:hidden">轴线</span>
                    <span class="hidden sm:inline">编年轴线</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- 下排：分类与年份筛选轨（紧凑连贯排布，绝不左右分离） -->
            <div class="flex flex-wrap items-center gap-x-6 gap-y-2.5 pt-3 border-t border-slate-200/60 dark:border-slate-800/60">
              <div class="flex items-center gap-2">
                <span class="activities-rail-label">类别:</span>
                <div class="flex flex-wrap items-center gap-1.5">
                  <button
                    v-for="(t, idx) in tagFilterOptions"
                    :key="t.value"
                    type="button"
                    class="activities-rail-item"
                    :class="{ 'is-active': selectedTag === t.value }"
                    :style="{ '--rail-index': idx }"
                    @click="selectedTag = t.value"
                  >
                    <span>{{ t.label }}</span>
                    <span v-if="t.count !== undefined" class="activities-count-num">({{ t.count }})</span>
                  </button>
                </div>
              </div>

              <div v-if="yearFilterOptions.length > 2" class="flex items-center gap-2">
                <span class="activities-rail-label">年份:</span>
                <div class="flex flex-wrap items-center gap-1.5">
                  <button
                    v-for="(y, yIdx) in yearFilterOptions"
                    :key="y.value"
                    type="button"
                    class="activities-rail-item"
                    :class="{ 'is-active': selectedYear === y.value }"
                    :style="{ '--rail-index': tagFilterOptions.length + yIdx }"
                    @click="selectedYear = y.value"
                  >
                    <span>{{ y.label }}</span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          <!-- 筛选无结果提示 -->
          <div v-if="filteredItems.length === 0" class="py-16 text-center text-sm text-slate-500">
            <p>未找到符合当前筛选条件的回忆记录，可尝试更换关键词或选择全部类别。</p>
          </div>

          <!-- 视图 1：画卷相册模式 (Gallery Grid) -->
          <template v-else-if="viewMode === 'grid'">
            <!-- 头条精选特卷 (第一页且无筛选时展示) -->
            <NuxtLink
              v-if="featured"
              :to="`/activity/${featured.id}`"
              class="activities-featured group"
            >
              <div class="activities-featured-media">
                <ProgressiveImage
                  v-if="displayThumbSource(featured.cover_image)"
                  rise
                  :src="displayThumbSource(featured.cover_image) ?? ''"
                  :fallback-src="displayImageSource(featured.cover_image) ?? ''"
                  :alt="featured.title"
                  wrapper-class="h-full w-full"
                  img-class="h-full w-full object-cover transition-transform duration-700 motion-safe:group-hover:scale-105"
                />
                <div
                  v-else
                  class="h-full w-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400"
                  aria-hidden="true"
                >
                  <ClubIcon name="book" class="w-12 h-12 opacity-30" />
                </div>

                <div v-if="getActivityPhotosCount(featured) > 0" class="activities-photo-pill">
                  <span>{{ getActivityPhotosCount(featured) }} 图</span>
                </div>
              </div>

              <div class="flex flex-col justify-between py-1">
                <div>
                  <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span class="activities-ordinal">第 {{ archiveOrdinal(featuredIndex) }} 录</span>
                    <time :datetime="featured.date">{{ formatArchiveDate(featured.date) }}</time>
                    <span v-if="featured.tag" class="activities-tag">{{ featured.tag }}</span>
                  </div>

                  <h2 class="activities-featured-title">
                    {{ featured.title }}
                  </h2>

                  <p
                    v-if="featured.description"
                    class="mt-3 line-clamp-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400"
                  >
                    {{ featured.description }}
                  </p>
                </div>

                <div class="pt-4 flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 mt-6">
                  <span class="activities-cta">
                    翻开这段回忆
                    <span class="transition-transform duration-200 motion-safe:group-hover:translate-x-1" aria-hidden="true">→</span>
                  </span>
                  <span class="text-xs font-mono text-slate-400">#{{ archiveOrdinal(featuredIndex) }}</span>
                </div>
              </div>
            </NuxtLink>

            <!-- 列表卡片网格 (带阶梯延时动效) -->
            <div v-if="restItems.length" class="activities-grid">
              <NuxtLink
                v-for="(activity, cIdx) in restItems"
                :key="activity.id"
                :to="`/activity/${activity.id}`"
                class="activities-card group"
                :style="{ '--card-index': Math.min(cIdx, 12) }"
              >
                <div class="activities-card-media">
                  <ProgressiveImage
                    v-if="displayThumbSource(activity.cover_image)"
                    rise
                    :src="displayThumbSource(activity.cover_image) ?? ''"
                    :fallback-src="displayImageSource(activity.cover_image) ?? ''"
                    :alt="activity.title"
                    wrapper-class="h-full w-full"
                    img-class="h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-105"
                  />
                  <div
                    v-else
                    class="h-full w-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400"
                    aria-hidden="true"
                  >
                    <ClubIcon name="book" class="w-8 h-8 opacity-25" />
                  </div>

                  <div v-if="getActivityPhotosCount(activity) > 0" class="activities-photo-pill">
                    <span>{{ getActivityPhotosCount(activity) }} 图</span>
                  </div>
                </div>

                <div class="activities-card-body">
                  <div>
                    <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span class="activities-ordinal">第 {{ getItemOrdinal(activity) }} 录</span>
                      <time :datetime="activity.date">{{ formatArchiveDate(activity.date) }}</time>
                      <span v-if="activity.tag" class="activities-tag">{{ activity.tag }}</span>
                    </div>

                    <h2 class="activities-card-title">
                      {{ activity.title }}
                    </h2>

                    <p
                      v-if="activity.description"
                      class="mt-2 line-clamp-2 text-xs sm:text-sm leading-relaxed text-slate-500 dark:text-slate-400"
                    >
                      {{ activity.description }}
                    </p>
                  </div>

                  <div class="flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-3 mt-4">
                    <span class="activities-cta">
                      翻开这段回忆
                      <span class="transition-transform duration-200 motion-safe:group-hover:translate-x-1" aria-hidden="true">→</span>
                    </span>
                    <span class="text-[11px] font-mono text-slate-400">#{{ getItemOrdinal(activity) }}</span>
                  </div>
                </div>
              </NuxtLink>
            </div>
          </template>

          <!-- 视图 2：编年轴线模式 (Chronicle Timeline) -->
          <template v-else-if="viewMode === 'timeline'">
            <div class="relative py-4">
              <!-- 垂直时间纵线 -->
              <div class="activities-timeline-spine" aria-hidden="true" />

              <div class="space-y-4">
                <article
                  v-for="(activity, tIdx) in filteredItems"
                  :key="activity.id"
                  class="activities-timeline-entry group"
                  :style="{ '--node-index': Math.min(tIdx, 12) }"
                >
                  <div class="activities-timeline-dot" aria-hidden="true" />

                  <NuxtLink
                    :to="`/activity/${activity.id}`"
                    class="activities-timeline-card group/item"
                  >
                    <!-- 缩略图 -->
                    <div class="sm:w-44 sm:h-28 shrink-0 aspect-[16/10] sm:aspect-auto overflow-hidden bg-slate-100 dark:bg-slate-800 relative border border-slate-200/80 dark:border-slate-800">
                      <ProgressiveImage
                        v-if="displayThumbSource(activity.cover_image)"
                        rise
                        :src="displayThumbSource(activity.cover_image) ?? ''"
                        :fallback-src="displayImageSource(activity.cover_image) ?? ''"
                        :alt="activity.title"
                        wrapper-class="h-full w-full"
                        img-class="h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-105"
                      />
                      <div
                        v-else
                        class="h-full w-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400"
                        aria-hidden="true"
                      >
                        <ClubIcon name="book" class="w-8 h-8 opacity-25" />
                      </div>
                      <span v-if="getActivityPhotosCount(activity) > 0" class="activities-photo-pill">
                        {{ getActivityPhotosCount(activity) }} 图
                      </span>
                    </div>

                    <!-- 文字信息 -->
                    <div class="flex-1 min-w-0 mt-3 sm:mt-0 flex flex-col justify-between">
                      <div>
                        <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                          <span class="activities-ordinal">第 {{ getItemOrdinal(activity) }} 录</span>
                          <time :datetime="activity.date">{{ formatArchiveDate(activity.date) }}</time>
                          <span v-if="activity.tag" class="activities-tag">{{ activity.tag }}</span>
                        </div>

                        <h2 class="font-serif text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 group-hover/item:text-sky-600 dark:group-hover/item:text-sky-400 transition-colors mt-1">
                          {{ activity.title }}
                        </h2>

                        <p v-if="activity.description" class="mt-1 text-xs sm:text-sm leading-relaxed text-slate-500 dark:text-slate-400 line-clamp-2">
                          {{ activity.description }}
                        </p>
                      </div>

                      <div class="mt-2.5 flex items-center justify-between">
                        <span class="activities-cta text-xs">
                          翻开这段回忆
                          <span class="transition-transform duration-200 motion-safe:group-hover:translate-x-1" aria-hidden="true">→</span>
                        </span>
                      </div>
                    </div>
                  </NuxtLink>
                </article>
              </div>
            </div>
          </template>
        </template>

        <!-- 分页控件：在无激活筛选且总数 > 0 时呈现 -->
        <PublicPagination
          v-if="total > 0 && !hasActiveFilter"
          base-path="/activities"
          :page="page"
          :total="total"
          :limit="ACTIVITIES_PAGE_SIZE"
          label="活动记录分页"
        />
      </div>
    </div>
  </div>
</template>
