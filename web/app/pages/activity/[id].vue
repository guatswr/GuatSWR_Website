<script setup lang="ts">
/**
 * `/activity/:id` - 往期活动纪事正文页 (Editorial Activity Memory & Chronicle).
 *
 * 统一全站 club-paper 纸本风雅与线框体系，并与活动中心转场动画无缝衔接：
 * - 页面载入与转场序列（.is-entered）对接全站物理动效
 * - 纪事档案标识（memory-dossier-tag）、题图画卷展开（memory-figure）
 * - 卷首纲要（TOC）、文章题记与富排版 Markdown 渲染
 * - 活动剪影画卷与原生 Top-layer Lightbox 模态
 * - 纯粹的 SSR 状态码契约（404 / 502）与无 JS 优雅降级契约
 */
import type { ActivityContentResponse } from '#shared/content'
import type { PublishedRevisionLog } from '@guatswr/shared'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { usePublicPageSeo } from '~/composables/usePublicPageSeo'
import { DEFAULT_DESCRIPTION } from '~/utils/public-seo'
import { displayImageSource, displayThumbSource } from '~/utils/public-image'
import { formatArchiveDate } from '~/utils/club-date'
import { activitySeoNode } from '#shared/seo'
import { defineArticle, useSchemaOrg } from '#schema-org/app'
import ClubIcon from '~/components/ClubIcon.vue'

definePageMeta({ key: route => route.fullPath })

const route = useRoute()
const router = useRouter()

const isEntered = ref(false)

const activityId = computed(() => {
  const param = route.params.id
  return Array.isArray(param) ? (param[0] ?? '') : String(param ?? '')
})
const validActivityId = computed(() => /^[1-9][0-9]{0,9}$/.test(activityId.value))

const { data, error, status } = await useFetch<ActivityContentResponse | null>(
  () => `/api/content/activity/${activityId.value}`,
  {
    key: () => `public-activity-${activityId.value}`,
    immediate: validActivityId.value,
    default: () => null,
  },
)

if (import.meta.server) {
  if (!validActivityId.value) {
    throw createError({ statusCode: 404, statusMessage: 'Activity not found' })
  }
  if (error.value) {
    throw createError({
      statusCode: error.value.statusCode === 404 ? 404 : 502,
      statusMessage: error.value.statusCode === 404 ? 'Activity not found' : 'Activity unavailable',
    })
  }
}

const activity = computed(() => data.value?.activity ?? null)
const body = computed(() => data.value?.body ?? [])
const headings = computed(() => data.value?.headings ?? [])

const coverSource = computed(() => displayImageSource(activity.value?.cover_image ?? ''))
const coverThumb = computed(() => displayThumbSource(activity.value?.cover_image ?? ''))
const authorInitial = computed(() => (activity.value?.created_by || 'A').charAt(0).toUpperCase())
const gallery = computed(() => (activity.value?.images ?? [])
  .map((image, index) => ({
    key: `${index}-${image}`,
    src: displayImageSource(image),
    thumb: displayThumbSource(image),
  }))
  .filter((item): item is { key: string, src: string, thumb: string | null } => item.src !== null))

const loading = computed(() => status.value === 'pending')
const lightboxOpen = ref(false)
const currentImage = ref('')
const openLightbox = (src: string): void => {
  currentImage.value = src
  lightboxOpen.value = true
}

/** Published change summaries are public; full snapshots stay in the admin area. */
const historyOpen = ref(false), historyPage = ref(1)
const historyDialog = ref<HTMLDialogElement | null>(null)
const { data: revisionLog, status: historyStatus, error: historyError, refresh: refreshHistory, clear: clearHistory } = await useFetch<PublishedRevisionLog>(
  () => `/api/content/activity/${activityId.value}/revisions`,
  { key: () => `activity-revision-log-${activityId.value}`, query: { page: historyPage }, immediate: false, server: false, watch: false },
)
const historyAdminPath = computed(() => `/admin/activities?history=${activityId.value}`)
const revisionActions: Record<string, string> = { baseline: '启用时基线', create: '发布文章', update: '保存发布', restore: '恢复历史内容' }
const revisionFieldLabels: Record<string, string> = { title: '标题', tag: '标签', date: '日期', description: '摘要', content: '正文', cover_image: '封面', images: '相册' }
const revisionTime = (value: number) => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
const revisionAction = (value: string) => revisionActions[value] || '内容更新'
const revisionChanges = (fields: readonly string[]) => fields.map(field => revisionFieldLabels[field] || field).join('、')
const openHistory = async (): Promise<void> => {
  historyPage.value = 1
  historyOpen.value = true
  await nextTick()
  if (historyDialog.value && !historyDialog.value.open) historyDialog.value.showModal()
  await refreshHistory()
}
const closeHistory = (): void => {
  if (historyDialog.value?.open) historyDialog.value.close()
  historyOpen.value = false
  clearHistory()
}
async function changeHistoryPage(offset: number) {
  historyPage.value += offset
  await refreshHistory()
}
onBeforeUnmount(closeHistory)

/** Archived `router.back()`, with an ordinary-link fallback when there is no history. */
const goBack = (event: MouseEvent): void => {
  const state = window.history.state as { back?: string | null } | null
  if (!state?.back) return
  event.preventDefault()
  router.back()
}

/** 递归提取正文字符数，用于字数统计与预计阅读时间 */
function extractNodeText(nodes: readonly unknown[]): string {
  let text = ''
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue
    const n = node as Record<string, unknown>
    if (n.type === 'text' && typeof n.value === 'string') {
      text += n.value
    } else if (Array.isArray(n.children)) {
      text += extractNodeText(n.children)
    }
  }
  return text
}

const wordCount = computed(() => {
  const raw = extractNodeText(body.value).replace(/\s+/g, '')
  return raw.length + (activity.value?.description?.trim().length ?? 0)
})

const readingMinutes = computed(() => Math.max(1, Math.ceil(wordCount.value / 350)))

/** 复制分享链接提示 */
const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null
const copyShareLink = async () => {
  if (import.meta.server) return
  try {
    const url = window.location.href
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(url)
    } else {
      const input = document.createElement('input')
      input.value = url
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
    }
    copied.value = true
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => {
      copied.value = false
    }, 2200)
  } catch {
    // Graceful fallback
  }
}

const scrollToTop = () => {
  if (import.meta.client) {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

/** 随滚动的阅读进度与章节大纲高亮联动 */
const readingProgress = ref(0)
const showFloatingDock = ref(false)
const activeHeadingId = ref('')
const tocExpanded = ref(true)
const floatingTocOpen = ref(false)
const isLargeText = ref(false)
const toastMessage = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null

const showToast = (msg: string) => {
  toastMessage.value = msg
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastMessage.value = ''
  }, 2200)
}

let scrollTicking = false
const updateScrollMetrics = () => {
  if (typeof window === 'undefined') return
  const scrollTop = window.scrollY || document.documentElement.scrollTop
  const docHeight = document.documentElement.scrollHeight - window.innerHeight
  if (docHeight > 0) {
    readingProgress.value = Math.min(100, Math.max(0, Math.round((scrollTop / docHeight) * 100)))
  } else {
    readingProgress.value = 0
  }
  showFloatingDock.value = scrollTop > 380

  // ScrollSpy 高亮当前视野所在的小节
  if (headings.value.length > 0) {
    let current = ''
    for (const h of headings.value) {
      const el = document.getElementById(h.id)
      if (el) {
        const top = el.getBoundingClientRect().top
        if (top <= 140) {
          current = h.id
        } else {
          break
        }
      }
    }
    activeHeadingId.value = current || (headings.value[0]?.id ?? '')
  }
}

const onScroll = () => {
  if (!scrollTicking) {
    scrollTicking = true
    requestAnimationFrame(() => {
      updateScrollMetrics()
      scrollTicking = false
    })
  }
}

const scrollToHeading = (id: string, event?: MouseEvent) => {
  if (event) event.preventDefault()
  if (import.meta.client) {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
      floatingTocOpen.value = false
    }
  }
}

const handleProseClick = async (event: MouseEvent) => {
  const target = event.target as HTMLElement | null
  if (!target) return

  // 点击正文内任何配图，无缝打开全屏大图模态画卷
  if (target.tagName === 'IMG') {
    const img = target as HTMLImageElement
    const src = img.currentSrc || img.src
    if (src) {
      event.preventDefault()
      openLightbox(src)
    }
    return
  }

  // 章节标题点击或悬浮锚点点击，快捷复制小节直达链接
  const heading = target.closest('h1, h2, h3, h4, h5, h6') as HTMLElement | null
  if (heading && heading.id) {
    if (target.tagName !== 'A' || target.getAttribute('href') === `#${heading.id}`) {
      if (import.meta.client) {
        const url = new URL(window.location.href)
        url.hash = heading.id
        try {
          if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(url.href)
          }
          showToast('已复制该小节直达链接')
        } catch {
          // fallback
        }
      }
    }
  }
}

onMounted(() => {
  requestAnimationFrame(() => {
    isEntered.value = true
  })
  window.addEventListener('scroll', onScroll, { passive: true })
  updateScrollMetrics()
})

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('scroll', onScroll)
  }
  if (copyTimer) clearTimeout(copyTimer)
  if (toastTimer) clearTimeout(toastTimer)
})

usePublicPageSeo(() => ({
  title: activity.value?.title || '活动详情',
  description: activity.value?.description || DEFAULT_DESCRIPTION,
  path: `/activity/${activityId.value}`,
  image: coverSource.value,
  type: 'article',
  ogSiteName: '桂航绯想天 | 车万同好会',
  twitterCard: 'summary',
}))

if (import.meta.server && activity.value) {
  useSchemaOrg([defineArticle(activitySeoNode(activity.value, useSiteConfig().url))])
}

useHead({
  htmlAttrs: { class: 'activity-detail-bg' },
  bodyAttrs: { class: 'activity-detail-bg' },
})
</script>

<template>
  <div
    class="memory-stage club-paper min-h-screen"
    :class="{ 'is-entered': isEntered }"
  >
    <!-- 顶部丝滑阅读进度条 -->
    <div
      class="memory-progress-track"
      aria-hidden="true"
    >
      <div
        class="memory-progress-bar"
        :style="{ width: `${readingProgress}%` }"
      />
    </div>
    <!-- 背景博丽结界与八角星轨几何暗纹（纯装饰，与活动中心相同速度与星轨坐标） -->
    <div class="memory-ambient" aria-hidden="true">
      <div class="memory-ambient-grid" />
      <svg class="memory-ambient-watermark" viewBox="0 0 360 360" fill="none">
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

    <!-- 加载中指示器 -->
    <p
      v-if="loading"
      class="py-32 text-center text-sm text-slate-500 dark:text-slate-400"
      role="status"
    >
      正在展开这幅画卷…
    </p>

    <!-- 主体文章画卷 -->
    <article v-else-if="activity" class="memory">
      <div class="club-container memory-container">
        <!-- 顶部导航条 -->
        <nav class="memory-nav" aria-label="返回">
          <NuxtLink to="/activities" class="memory-back-link club-text-link" @click="goBack">
            <span class="memory-back-arrow" aria-hidden="true">←</span>
            <span>返回活动记录</span>
          </NuxtLink>

          <div class="memory-nav-tools">
            <span v-if="wordCount > 0" class="memory-badge-chip">
              <ClubIcon name="book" class="h-3 w-3" />
              <span>{{ wordCount }} 字 · 约 {{ readingMinutes }} 分钟</span>
            </span>
            <span v-if="gallery.length > 0" class="memory-badge-chip">
              <span class="memory-badge-dot" aria-hidden="true" />
              <span>剪影 {{ gallery.length }} 幅</span>
            </span>
            <button
              type="button"
              class="memory-share-btn"
              :class="{ 'is-copied': copied }"
              :title="copied ? '链接已复制到剪贴板' : '复制文章分享链接'"
              @click="copyShareLink"
            >
              <span v-if="copied" class="text-emerald-600 dark:text-emerald-400 font-medium">已复制链接 ✓</span>
              <span v-else class="flex items-center gap-1.5">
                <ClubIcon name="external" class="h-3 w-3" />
                <span>分享本篇</span>
              </span>
            </button>
          </div>
        </nav>

        <!-- 文章卷首题头 -->
        <header class="memory-header">
          <div class="memory-kicker-row">
            <span class="memory-kicker-text">社团活动记录 · 纪事长卷</span>
            <span class="memory-kicker-sep" aria-hidden="true">/</span>
            <time :datetime="activity.date" class="memory-date-display">
              <ClubIcon name="calendar" class="h-3.5 w-3.5 inline-block opacity-75" />
              {{ formatArchiveDate(activity.date) }}
            </time>
            <span v-if="activity.tag" class="memory-tag">{{ activity.tag }}</span>
          </div>

          <h1 class="memory-title">
            {{ activity.title }}
          </h1>

          <!-- 记录者与修订者元信息卡片（包含创建文章、最近编辑与维基百科式查看更改记录） -->
          <div class="memory-meta">
            <!-- 1. 创建文章 -->
            <div class="memory-meta-group">
              <ProgressiveImage
                v-if="activity.created_by_avatar && displayImageSource(activity.created_by_avatar)"
                :src="displayImageSource(activity.created_by_avatar) ?? ''"
                :thumb="displayThumbSource(activity.created_by_avatar) ?? undefined"
                alt="创建者头像"
                wrapper-class="h-9 w-9 shrink-0"
                img-class="h-9 w-9 rounded-full border border-slate-200 object-cover dark:border-slate-700 shadow-sm"
              />
              <div
                v-else
                class="memory-avatar-fallback"
                aria-hidden="true"
              >
                {{ authorInitial }}
              </div>
              <div class="memory-meta-texts">
                <span class="memory-meta-label">创建文章 · Scribe</span>
                <span class="memory-meta-name">{{ activity.created_by || '桂航同好' }}</span>
                <span v-if="activity.created_at" class="memory-meta-sub">
                  创建于 {{ activity.created_at.slice(0, 10) }}
                </span>
              </div>
            </div>

            <!-- 2. 最近编辑 -->
            <div class="memory-meta-group memory-meta-editor">
              <div
                class="memory-avatar-fallback is-editor"
                aria-hidden="true"
              >
                {{ (activity.updated_by || activity.created_by || 'A').charAt(0).toUpperCase() }}
              </div>
              <div class="memory-meta-texts">
                <span class="memory-meta-label">最近编辑 · Revision</span>
                <span class="memory-meta-name">
                  {{ activity.updated_by || activity.created_by || '桂航同好' }}
                  <span
                    v-if="activity.updated_by && activity.updated_by === activity.created_by"
                    class="memory-meta-pill"
                  >原作者</span>
                  <span
                    v-else-if="activity.updated_by"
                    class="memory-meta-pill is-editor"
                  >同好校订</span>
                </span>
                <span class="memory-meta-sub">
                  {{ activity.updated_by ? '当前保存内容的编辑者' : '未单独登记编辑者' }}
                </span>
              </div>
            </div>

            <!-- Published revision log; no private snapshots are loaded on the public page. -->
            <div class="memory-meta-actions">
              <button
                type="button"
                class="memory-history-btn"
                title="查看本篇文章已发布内容的修订摘要"
                @click="openHistory"
              >
                <ClubIcon name="book" class="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                <span>查看更改记录</span>
                <span class="memory-history-btn-badge" aria-hidden="true">LOG</span>
              </button>
            </div>
          </div>
        </header>

        <!-- 封面题照画卷 -->
        <figure v-if="coverSource" class="memory-figure">
          <a
            :href="coverSource"
            :aria-label="`查看大图：${activity.title}`"
            class="memory-figure-link group"
            @click.prevent="openLightbox(coverSource)"
          >
            <div class="memory-figure-frame">
              <ProgressiveImage
                eager
                :src="coverSource"
                :thumb="coverThumb ?? undefined"
                :alt="activity.title"
                wrapper-class="w-full"
                img-class="h-full w-full object-cover transition-transform duration-700 motion-safe:group-hover:scale-[1.015]"
              />
              <div class="memory-figure-label" aria-hidden="true">
                <span class="memory-figure-tag font-mono">FIG. 01</span>
                <span class="memory-figure-sep" aria-hidden="true">/</span>
                <span>题照</span>
              </div>
              <span class="memory-figure-hint" aria-hidden="true">
                <span>点击展开画卷</span>
                <span class="memory-hint-icon" aria-hidden="true">↗</span>
              </span>
            </div>
          </a>
        </figure>

        <!-- 卷首题记 / 导言 -->
        <div v-if="activity.description" class="memory-lede">
          <div class="memory-lede-badge font-mono" aria-hidden="true">PROLOGUE // 题记</div>
          <p class="memory-lede-text">{{ activity.description }}</p>
        </div>

        <!-- 卷首纲要（章节目录，文章小节数 >= 2 时渲染） -->
        <nav
          v-if="headings.length >= 2"
          class="memory-toc"
          aria-label="文章纲要"
        >
          <div class="memory-toc-head">
            <div class="flex items-center gap-2">
              <span class="memory-toc-tag font-mono" aria-hidden="true">TOC</span>
              <span class="memory-toc-title">卷首纲要</span>
              <span class="memory-toc-count">共 {{ headings.length }} 节</span>
            </div>
            <button
              type="button"
              class="memory-toc-toggle-btn"
              :aria-expanded="tocExpanded"
              @click="tocExpanded = !tocExpanded"
            >
              <span>{{ tocExpanded ? '折叠纲要' : '展开纲要' }}</span>
              <span class="memory-toc-toggle-arrow" :class="{ 'is-collapsed': !tocExpanded }" aria-hidden="true">▾</span>
            </button>
          </div>
          <ol v-show="tocExpanded" class="memory-toc-list">
            <li
              v-for="h in headings"
              :key="h.id"
              :class="['memory-toc-item', `depth-${h.depth}`, { 'is-active': activeHeadingId === h.id }]"
            >
              <a
                :href="`#${h.id}`"
                class="memory-toc-link"
                :class="{ 'is-active': activeHeadingId === h.id }"
                @click="scrollToHeading(h.id, $event)"
              >
                <span class="memory-toc-bullet" aria-hidden="true" />
                <span class="memory-toc-name">{{ h.text }}</span>
              </a>
            </li>
          </ol>
        </nav>

        <!-- 文章 Markdown 正文画卷 -->
        <div
          class="memory-prose"
          :class="{ 'is-large-text': isLargeText }"
          @click="handleProseClick"
        >
          <SafeMarkdown :nodes="body" inherit-typography />
        </div>

        <!-- 社团纪事档案存根与知识共享许可 (Colophon & License) -->
        <section class="memory-colophon" aria-label="社团纪事存根与归档许可">
          <div class="memory-colophon-inner">
            <div class="memory-colophon-header">
              <div class="flex items-center gap-2">
                <span class="memory-colophon-tag font-mono" aria-hidden="true">ARCHIVE</span>
                <h3 class="memory-colophon-title">社团纪事档案存根 · Colophon</h3>
              </div>
              <span class="memory-colophon-id">№ GUAT-ACT-{{ String(activity.id).padStart(4, '0') }}</span>
            </div>
            <div class="memory-colophon-grid">
              <div class="memory-colophon-cell">
                <span class="colophon-label">篇目纪称</span>
                <span class="colophon-value">{{ activity.title }}</span>
              </div>
              <div class="memory-colophon-cell">
                <span class="colophon-label">初创执笔</span>
                <span class="colophon-value">{{ activity.created_by || '桂航同好' }}</span>
              </div>
              <div class="memory-colophon-cell">
                <span class="colophon-label">结集纪年</span>
                <span class="colophon-value">{{ activity.created_at || '早期档案' }}</span>
              </div>
              <div class="memory-colophon-cell">
                <span class="colophon-label">时点定格</span>
                <span class="colophon-value">{{ formatArchiveDate(activity.date) }}</span>
              </div>
            </div>
            <div class="memory-colophon-license">
              <p>
                <span class="colophon-license-tag">CC BY-NC-SA 4.0</span>
                本篇活动纪事遵循知识共享署名-非商业性使用-相同方式共享 4.0 国际许可协议。桂航车万同好社团活动图文资料欢迎交流转载，转载请注明原出处与原执笔人。
              </p>
            </div>
          </div>
        </section>

        <!-- 活动剪影画廊 -->
        <section v-if="gallery.length > 0" class="memory-gallery" aria-labelledby="gallery-title">
          <div class="memory-gallery-header">
            <h2 id="gallery-title" class="memory-gallery-title">
              <span class="memory-gallery-tag font-mono" aria-hidden="true">GALLERY</span>
              <span>活动剪影</span>
            </h2>
            <span class="memory-gallery-counter">收录留影 {{ gallery.length }} 幅</span>
          </div>

          <div class="memory-gallery-grid">
            <a
              v-for="(item, idx) in gallery"
              :key="item.key"
              :href="item.src"
              class="memory-gallery-item group"
              :aria-label="`查看大图：${activity.title}`"
              @click.prevent="openLightbox(item.src)"
            >
              <div class="memory-gallery-frame">
                <ProgressiveImage
                  :src="item.src"
                  :thumb="item.thumb ?? undefined"
                  alt="活动剪影"
                  wrapper-class="aspect-video w-full"
                  img-class="h-full w-full object-cover transition-transform duration-700 motion-safe:group-hover:scale-105"
                />
                <div class="memory-gallery-tag" aria-hidden="true">
                  <span>№ {{ String(idx + 1).padStart(2, '0') }}</span>
                </div>
                <span class="memory-figure-hint" aria-hidden="true">点击展开画卷</span>
              </div>
            </a>
          </div>
        </section>

        <!-- 文末操作：仅保留回到卷首 -->
        <div class="memory-coda">
          <button
            type="button"
            class="memory-scroll-top-btn"
            title="回到文章顶部"
            @click="scrollToTop"
          >
            <span aria-hidden="true">↑</span>
            <span>回到卷首</span>
          </button>
        </div>
      </div>
    </article>

    <!-- 异常状态指示 -->
    <p
      v-else
      class="mx-auto my-24 max-w-xl px-6 text-center text-sm text-slate-500"
      role="status"
    >
      活动不存在或已删除。
      <NuxtLink to="/activities" class="club-text-link ml-2">返回活动列表</NuxtLink>
    </p>

    <!-- 原生模态大图查看器 -->
    <ImageLightbox
      v-model:open="lightboxOpen"
      :src="currentImage"
      alt="活动配图预览"
    />

    <!-- Native top-layer dialog keeps focus and keyboard dismissal within the log. -->
    <Teleport to="body">
      <dialog v-if="historyOpen" ref="historyDialog" class="memory-stage memory-history-overlay" aria-labelledby="history-modal-title" @click.self="closeHistory" @cancel.prevent="closeHistory">
        <div class="memory-history-panel">
          <div class="memory-history-header">
            <div class="flex items-center gap-2.5">
              <span class="memory-history-tag font-mono" aria-hidden="true">LOG</span>
              <div><h3 id="history-modal-title" class="memory-history-title">文章修订记录</h3><p class="memory-history-subtitle">《{{ activity?.title }}》已发布内容的更改日志</p></div>
            </div>
            <button type="button" class="memory-history-close-btn" aria-label="关闭更改记录" @click="closeHistory">&times;</button>
          </div>
          <div class="memory-history-body">
            <p v-if="historyStatus === 'pending'" class="memory-history-state" role="status">正在读取更改记录…</p>
            <div v-else-if="historyError" class="memory-history-state" role="alert"><p>暂时无法读取修订记录，请稍后重试。</p><button type="button" class="memory-history-confirm-btn" @click="refreshHistory()">重新读取记录</button></div>
            <template v-else>
              <div class="memory-history-dev-banner">
                <div class="memory-history-dev-texts"><h4 class="memory-history-dev-title">{{ revisionLog?.available ? `已收录 ${revisionLog.total} 条发布记录` : '该文章尚未启用修订归档' }}</h4><p class="memory-history-dev-desc">这里仅显示已发布修订的摘要。基线记录表示功能启用时的快照，无法重建更早的编辑过程。历史全文、草稿和恢复操作仅供管理员使用。</p></div>
              </div>
              <ol v-if="revisionLog?.items.length" class="memory-revision-list" aria-label="已发布修订摘要">
                <li v-for="item in revisionLog.items" :key="item.sequence" class="memory-revision-entry">
                  <div class="memory-revision-heading"><strong>发布记录 {{ item.sequence }} · {{ revisionAction(item.action) }}</strong><time :datetime="new Date(item.created_at).toISOString()">{{ revisionTime(item.created_at) }}</time></div>
                  <p>记录者：{{ item.actor_name }}</p><p v-if="item.action === 'baseline'">当前内容基线，不代表文章首次编辑时间。</p><p v-else>变更范围：{{ revisionChanges(item.changed_fields) || '发布状态或初始内容' }}</p>
                </li>
              </ol>
              <p v-else-if="revisionLog?.available" class="memory-history-state">暂无已发布修订记录。文章保存发布后会自动记录。</p>
              <nav v-if="revisionLog && revisionLog.total > revisionLog.limit" class="memory-history-pagination" aria-label="修订摘要分页"><button type="button" class="memory-history-confirm-btn" :disabled="historyPage <= 1" @click="changeHistoryPage(-1)">上一页</button><span>{{ historyPage }} / {{ Math.ceil(revisionLog.total / revisionLog.limit) }}</span><button type="button" class="memory-history-confirm-btn" :disabled="historyPage * revisionLog.limit >= revisionLog.total" @click="changeHistoryPage(1)">下一页</button></nav>
            </template>
            <div class="memory-history-summary-box">
              <h5 class="memory-history-summary-title">当前文章档案</h5><ul class="memory-history-summary-list"><li class="memory-history-summary-item"><span class="memory-summary-label">创建登记：</span><span class="memory-summary-value">{{ activity?.created_by || '桂航同好' }}</span><span v-if="activity?.created_at" class="memory-summary-time">（{{ activity.created_at }}）</span></li><li class="memory-history-summary-item"><span class="memory-summary-label">最近编辑登记：</span><span class="memory-summary-value">{{ activity?.updated_by || activity?.created_by || '桂航同好' }}</span></li><li v-if="activity?.date" class="memory-history-summary-item"><span class="memory-summary-label">活动日期：</span><span class="memory-summary-value">{{ formatArchiveDate(activity.date) }}</span></li></ul>
            </div>
          </div>
          <div class="memory-history-footer"><span class="memory-history-notice">访客可查看发布摘要；管理员可进入后台对比全文与恢复。</span><div class="memory-history-footer-actions"><NuxtLink class="memory-history-confirm-btn" :to="historyAdminPath" @click="closeHistory">管理员查看完整历史</NuxtLink><button type="button" class="memory-history-confirm-btn" @click="closeHistory">关闭记录</button></div></div>
        </div>
      </dialog>
    </Teleport>

    <!-- 右下角阅读辅助浮动罗盘 (Floating Reading Dock) -->
    <Transition name="memory-dock">
      <aside
        v-if="showFloatingDock"
        class="memory-floating-dock"
        aria-label="阅读辅助工具"
      >
        <!-- 1. 阅读进度徽记 -->
        <div
          class="memory-dock-progress"
          :title="`当前阅读进度：${readingProgress}%`"
        >
          <svg class="memory-dock-ring" viewBox="0 0 36 36" aria-hidden="true">
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              class="text-slate-200 dark:text-slate-700"
            />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-dasharray="94.25"
              :stroke-dashoffset="94.25 - (94.25 * readingProgress) / 100"
              stroke-linecap="round"
              class="text-sky-600 dark:text-sky-400 transition-all duration-150"
              transform="rotate(-90 18 18)"
            />
          </svg>
          <span class="memory-dock-percent">{{ readingProgress }}%</span>
        </div>

        <!-- 2. 大纲目录快捷切换（当小节数 >= 2） -->
        <div v-if="headings.length >= 2" class="relative">
          <button
            type="button"
            class="memory-dock-btn"
            :class="{ 'is-active': floatingTocOpen }"
            :title="floatingTocOpen ? '收起大纲' : '展开文章大纲'"
            @click="floatingTocOpen = !floatingTocOpen"
          >
            <ClubIcon name="book" class="h-4 w-4" />
          </button>

          <!-- 浮动大纲弹窗 -->
          <div
            v-if="floatingTocOpen"
            class="memory-dock-toc-popover"
            @click.stop
          >
            <div class="memory-dock-toc-head">
              <span class="font-bold text-xs">文章大纲导航</span>
              <button
                type="button"
                class="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                @click="floatingTocOpen = false"
              >
                &times;
              </button>
            </div>
            <ol class="memory-dock-toc-list">
              <li
                v-for="h in headings"
                :key="h.id"
                :class="['memory-dock-toc-item', `depth-${h.depth}`, { 'is-active': activeHeadingId === h.id }]"
              >
                <a
                  :href="`#${h.id}`"
                  class="memory-dock-toc-link"
                  @click="scrollToHeading(h.id, $event)"
                >
                  <span class="memory-toc-bullet" aria-hidden="true" />
                  <span>{{ h.text }}</span>
                </a>
              </li>
            </ol>
          </div>
        </div>

        <!-- 3. 字号舒适度调节切换 -->
        <button
          type="button"
          class="memory-dock-btn"
          :class="{ 'is-active': isLargeText }"
          :title="isLargeText ? '恢复标准字号' : '切换舒适大字号'"
          @click="isLargeText = !isLargeText"
        >
          <span class="font-serif font-bold text-xs">{{ isLargeText ? 'A⁻' : 'A⁺' }}</span>
        </button>

        <!-- 4. 回到卷首 -->
        <button
          type="button"
          class="memory-dock-btn is-top"
          title="回到文章顶部"
          @click="scrollToTop"
        >
          <span class="text-sm leading-none" aria-hidden="true">↑</span>
        </button>
      </aside>
    </Transition>

    <!-- 浮动通知气泡 (Toast) -->
    <Transition name="memory-toast">
      <div
        v-if="toastMessage"
        class="memory-toast"
        role="status"
        aria-live="polite"
      >
        <ClubIcon name="sparkles" class="h-3.5 w-3.5 text-sky-500" />
        <span>{{ toastMessage }}</span>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* ==========================================================================
   桂航绯想天 · 活动纪事详情页 (Activity Memory & Chronicle Detail)
   统一全站 club-paper 纸本风雅与线框体系，并与“活动中心”转场动画无缝衔接
   ========================================================================== */

.memory-stage {
  --act-border: #dce4e8;
  --act-rule: rgb(220 228 232 / 0.7);
  --act-surface: #ffffff;
  --act-subtle-bg: rgb(248 250 252 / 0.85);
  --act-ink-strong: #0f172a;
  --act-ink: #1e293b;
  --act-body: #475569;
  --act-muted: #64748b;
  --act-sky: #0369a1;
  --act-sky-tint: rgb(3 105 161 / 0.07);
  --act-ambient-mark: rgb(3 105 161 / 0.05);
  --act-ambient-line: rgb(3 105 161 / 0.045);

  position: relative;
  overflow-x: clip;
}

:global(.dark .memory-stage) {
  --act-border: #293847;
  --act-rule: rgb(41 56 71 / 0.7);
  --act-surface: #14202b;
  --act-subtle-bg: rgb(18 28 39 / 0.85);
  --act-ink-strong: #f1f5f9;
  --act-ink: #e2e8f0;
  --act-body: #94a3b8;
  --act-muted: #64748b;
  --act-sky: #7dd3fc;
  --act-sky-tint: rgb(125 211 252 / 0.08);
  --act-ambient-mark: rgb(56 189 248 / 0.05);
  --act-ambient-line: rgb(56 189 248 / 0.045);
}

/* --------------------------------------------------------------------------
   背景几何水印（与活动中心同一转速与星轨位置，转场时产生无缝连续视觉）
   -------------------------------------------------------------------------- */
.memory-ambient {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 0;
  transform: translateZ(0);
}

.memory-ambient-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, var(--act-ambient-line) 1px, transparent 1px),
    linear-gradient(to bottom, var(--act-ambient-line) 1px, transparent 1px);
  background-size: 4.5rem 4.5rem;
  mask-image: radial-gradient(ellipse 85% 65% at 50% 18%, #000 15%, transparent 80%);
}

.memory-ambient-watermark {
  position: absolute;
  top: 4.5rem;
  right: max(-5rem, calc(50% - 46rem));
  width: 24rem;
  height: 24rem;
  color: var(--act-ambient-mark);
}

/* 容器与版心 */
.memory {
  position: relative;
  z-index: 1;
  padding-block: 2rem 5.5rem;
}

.memory-container {
  max-width: 52rem;
}

/* --------------------------------------------------------------------------
   顶部导航条与快捷功能
   -------------------------------------------------------------------------- */
.memory-nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 2rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid var(--act-border);
}

.memory-back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.75rem;
  border: 1px solid var(--act-border);
  background-color: var(--act-surface);
  color: var(--act-ink);
  font-size: 0.8125rem;
  font-weight: 500;
  border-radius: 2px;
  transition: all 180ms ease;
}

.memory-back-link:hover {
  border-color: var(--act-sky);
  color: var(--act-sky);
  background-color: var(--act-subtle-bg);
}

.memory-back-arrow {
  transition: transform 180ms ease;
}

.memory-back-link:hover .memory-back-arrow {
  transform: translateX(-2px);
}

.memory-nav-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.625rem;
}

.memory-badge-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.3rem 0.625rem;
  border: 1px solid var(--act-border);
  background-color: var(--act-surface);
  color: var(--act-muted);
  font-size: 0.75rem;
  border-radius: 2px;
}

.memory-badge-dot {
  width: 5px;
  height: 5px;
  border-radius: 9999px;
  background-color: var(--act-sky);
}

.memory-share-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.3rem 0.65rem;
  border: 1px solid var(--act-border);
  background-color: var(--act-surface);
  color: var(--act-body);
  font-size: 0.75rem;
  border-radius: 2px;
  cursor: pointer;
  user-select: none;
  touch-action: manipulation;
  transition: all 180ms ease;
}

.memory-share-btn:hover {
  border-color: var(--act-sky);
  color: var(--act-ink-strong);
  background-color: var(--act-subtle-bg);
}

/* --------------------------------------------------------------------------
   文章卷首题头
   -------------------------------------------------------------------------- */
.memory-header {
  margin-top: 0.5rem;
}

.memory-kicker-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.625rem;
  font-size: 0.78125rem;
  color: var(--act-muted);
}

.memory-kicker-badge,
.memory-dossier-tag,
.memory-seal {
  display: inline-flex;
  align-items: center;
  padding: 0.12rem 0.45rem;
  border: 1px solid color-mix(in srgb, var(--act-sky) 30%, transparent);
  background-color: var(--act-sky-tint);
  color: var(--act-sky);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  line-height: 1.25;
  border-radius: 2px;
}

.memory-kicker-text {
  font-family: var(--club-serif);
  letter-spacing: 0.05em;
  color: var(--act-muted);
}

.memory-kicker-sep {
  opacity: 0.4;
}

.memory-date-display {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.8125rem;
  color: var(--act-body);
}

.memory-tag {
  display: inline-flex;
  align-items: center;
  padding: 0.12rem 0.5rem;
  border: 1px solid rgb(3 105 161 / 0.25);
  background-color: var(--act-sky-tint);
  color: var(--act-sky);
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 2px;
}

:global(.dark .memory-tag) {
  border-color: rgb(125 211 252 / 0.3);
  color: var(--act-sky);
}

.memory-title {
  margin-top: 1.125rem;
  font-family: var(--club-serif);
  font-size: clamp(1.85rem, 4.5vw, 2.9rem);
  font-weight: 700;
  line-height: 1.28;
  letter-spacing: -0.015em;
  color: var(--act-ink-strong);
  word-break: break-word;
  text-wrap: balance;
}

/* 记录者与修订者元信息条目（包含创建文章、最近编辑与历史记录） */
.memory-meta {
  margin-top: 1.5rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1.25rem;
  padding: 0.875rem 1.125rem;
  border: 1px solid var(--act-border);
  background-color: var(--act-surface);
  border-radius: 2px;
}

.memory-meta-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.memory-avatar-fallback {
  display: flex;
  height: 2.25rem;
  width: 2.25rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  border: 1px solid var(--act-border);
  background-color: var(--act-subtle-bg);
  font-family: var(--club-serif);
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--act-sky);
}

.memory-avatar-fallback.is-editor {
  color: var(--act-muted);
}

.memory-meta-texts {
  display: flex;
  flex-direction: column;
}

.memory-meta-label {
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--act-muted);
  line-height: 1.2;
}

.memory-meta-name {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.84375rem;
  font-weight: 600;
  color: var(--act-ink);
  line-height: 1.4;
}

.memory-meta-pill {
  font-size: 0.6875rem;
  font-weight: 500;
  padding: 0.05rem 0.35rem;
  border-radius: 2px;
  border: 1px solid var(--act-border);
  background-color: var(--act-subtle-bg);
  color: var(--act-muted);
}

.memory-meta-pill.is-editor {
  border-color: rgb(3 105 161 / 0.3);
  color: var(--act-sky);
  background-color: var(--act-sky-tint);
}

.memory-meta-editor {
  padding-left: 1.25rem;
  border-left: 1px solid var(--act-border);
}

.memory-meta-sub {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.75rem;
  color: var(--act-muted);
  line-height: 1.3;
}

.memory-meta-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
}

.memory-history-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.75rem;
  border: 1px solid var(--act-border);
  background-color: var(--act-subtle-bg);
  color: var(--act-ink);
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 2px;
  cursor: pointer;
  transition: all 180ms ease;
}

.memory-history-btn:hover {
  border-color: var(--act-sky);
  color: var(--act-sky);
  background-color: var(--act-surface);
  transform: translateY(-1px);
}

.memory-history-btn-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.05rem 0.35rem;
  border: 1px solid rgb(3 105 161 / 0.25);
  background-color: var(--act-sky-tint);
  color: var(--act-sky);
  font-size: 0.6875rem;
  border-radius: 2px;
  font-weight: 500;
  margin-left: 0.2rem;
}

@media (max-width: 640px) {
  .memory-meta-editor {
    border-left: none;
    padding-left: 0;
    width: 100%;
    border-top: 1px solid var(--act-border);
    padding-top: 0.75rem;
  }

  .memory-meta-actions {
    margin-left: 0;
    width: 100%;
    border-top: 1px solid var(--act-border);
    padding-top: 0.75rem;
    justify-content: flex-end;
  }
}

/* --------------------------------------------------------------------------
   封面题照画卷 (Hero Figure)
   -------------------------------------------------------------------------- */
.memory-figure {
  margin-top: 2.25rem;
}

.memory-figure-link {
  position: relative;
  display: block;
  cursor: zoom-in;
}

.memory-figure-frame {
  position: relative;
  width: 100%;
  max-height: 34rem;
  overflow: hidden;
  border: 1px solid var(--act-border);
  background-color: var(--act-surface);
  border-radius: 2px;
}

.memory-figure-label {
  position: absolute;
  top: 0.875rem;
  left: 0.875rem;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.55rem;
  border: 1px solid rgb(255 255 255 / 0.35);
  background-color: rgb(15 23 42 / 0.65);
  backdrop-filter: blur(4px);
  color: #f1f5f9;
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  border-radius: 2px;
}

.memory-figure-tag {
  color: #38bdf8;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.memory-figure-sep {
  opacity: 0.45;
}

.memory-figure-hint {
  position: absolute;
  right: 0.875rem;
  bottom: 0.875rem;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.65rem;
  border: 1px solid rgb(255 255 255 / 0.3);
  background-color: rgb(15 23 42 / 0.7);
  backdrop-filter: blur(4px);
  color: #f1f5f9;
  font-size: 0.6875rem;
  letter-spacing: 0.04em;
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 220ms ease, transform 220ms ease;
  border-radius: 2px;
}

.memory-figure-link:is(:hover, :focus-visible) .memory-figure-hint,
.memory-gallery-item:is(:hover, :focus-visible) .memory-figure-hint {
  opacity: 1;
  transform: translateY(0);
}

/* --------------------------------------------------------------------------
   题记 / 导读 (Editorial Lede)
   -------------------------------------------------------------------------- */
.memory-lede {
  margin-top: 2rem;
  position: relative;
  border: 1px solid var(--act-border);
  border-left: 3px solid var(--act-sky);
  background-color: var(--act-subtle-bg);
  padding: 1.25rem 1.5rem;
  border-radius: 2px;
}

.memory-lede-badge {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--act-sky);
  text-transform: uppercase;
  margin-bottom: 0.5rem;
}

.memory-lede-text {
  font-family: var(--club-serif);
  font-size: 1rem;
  line-height: 1.9;
  color: var(--act-ink);
}

/* --------------------------------------------------------------------------
   顶部阅读进度条 (Reading Progress Bar)
   -------------------------------------------------------------------------- */
.memory-progress-track {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  z-index: 60;
  background: transparent;
  pointer-events: none;
}

.memory-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #0284c7, #b91c1c);
  transition: width 100ms ease-out;
  box-shadow: 0 0 8px rgba(185, 28, 28, 0.4);
}

/* --------------------------------------------------------------------------
   卷首纲要 (Table of Contents)
   -------------------------------------------------------------------------- */
.memory-toc {
  margin-top: 2rem;
  padding: 1.125rem 1.35rem;
  border: 1px solid var(--act-border);
  background-color: var(--act-surface);
  border-radius: 2px;
}

.memory-toc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.625rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px dashed var(--act-border);
}

.memory-toc-tag,
.memory-toc-seal {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.1rem 0.4rem;
  border: 1px solid color-mix(in srgb, var(--act-sky) 35%, transparent);
  background-color: var(--act-sky-tint);
  color: var(--act-sky);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  border-radius: 2px;
}

.memory-toc-title {
  font-family: var(--club-serif);
  font-size: 0.875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--act-ink-strong);
}

.memory-toc-count {
  font-size: 0.75rem;
  color: var(--act-muted);
}

.memory-toc-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: var(--act-muted);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.2rem 0.4rem;
  border-radius: 2px;
  transition: color 150ms ease, background-color 150ms ease;
}

.memory-toc-toggle-btn:hover {
  color: var(--act-sky);
  background-color: var(--act-sky-tint);
}

.memory-toc-toggle-arrow {
  display: inline-block;
  transition: transform 200ms ease;
  font-size: 0.75rem;
}

.memory-toc-toggle-arrow.is-collapsed {
  transform: rotate(-90deg);
}

.memory-toc-list {
  margin-top: 0.875rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  list-style: none;
  padding-left: 0;
}

.memory-toc-item.depth-3 {
  padding-left: 1.25rem;
}

.memory-toc-item.depth-4 {
  padding-left: 2rem;
}

.memory-toc-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: var(--act-body);
  transition: color 180ms ease;
  line-height: 1.5;
}

.memory-toc-link:hover {
  color: var(--act-sky);
}

.memory-toc-bullet {
  width: 4px;
  height: 4px;
  border-radius: 9999px;
  background-color: var(--act-border);
  transition: background-color 180ms ease, transform 180ms ease;
}

.memory-toc-link:hover .memory-toc-bullet {
  background-color: var(--act-sky);
}

.memory-toc-link.is-active {
  color: var(--act-ink-strong);
  font-weight: 600;
}

.memory-toc-link.is-active .memory-toc-bullet {
  background-color: var(--act-sky);
  box-shadow: 0 0 6px rgba(2, 132, 199, 0.45);
  transform: scale(1.4);
}

/* --------------------------------------------------------------------------
   正文画卷 (Prose Section)
   严格遵守测试契约：.safe-markdown 基准字号 1.05rem (16.8px)，h2 margin-top: 1.5em
   -------------------------------------------------------------------------- */
.memory-prose {
  margin-top: 2.5rem;
  max-width: 52rem;
  font-size: 1.05rem;
  line-height: 1.9;
  color: var(--act-body);
}

.memory-prose :deep(h1),
.memory-prose :deep(h2),
.memory-prose :deep(h3) {
  margin-top: 1.5em;
  margin-bottom: 0.75em;
  font-family: var(--club-serif);
  font-weight: 700;
  line-height: 1.35;
  color: var(--act-ink-strong);
  scroll-margin-top: 5.5rem;
}

.memory-prose :deep(h2) {
  padding-bottom: 0.4em;
  border-bottom: 1px solid var(--act-border);
}

.memory-prose :deep(h2):hover::after,
.memory-prose :deep(h3):hover::after {
  content: ' §';
  color: var(--act-muted);
  font-size: 0.85em;
  font-weight: 400;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 150ms ease, color 150ms ease;
}

.memory-prose :deep(h2):hover::after:hover,
.memory-prose :deep(h3):hover::after:hover {
  opacity: 1;
  color: var(--act-sky);
}

.memory-prose :deep(ul),
.memory-prose :deep(ol) {
  margin-bottom: 1.25em;
  padding-left: 1.5em;
}

.memory-prose :deep(blockquote) {
  position: relative;
  border-left: 3.5px solid var(--act-sky);
  background-color: var(--act-sky-tint);
  padding: 1rem 1.5rem 1rem 1.6rem;
  color: var(--act-body);
  border-radius: 2px;
  margin: 1.5em 0;
}

.memory-prose :deep(blockquote)::after {
  content: '“';
  position: absolute;
  top: 0.1rem;
  right: 0.8rem;
  font-family: var(--club-serif);
  font-size: 3rem;
  line-height: 1;
  color: var(--act-sky);
  opacity: 0.15;
  pointer-events: none;
  user-select: none;
}

.memory-prose :deep(img) {
  border: 1px solid var(--act-border);
  background-color: var(--act-surface);
  border-radius: 3px;
  cursor: zoom-in;
  transition: transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease;
}

.memory-prose :deep(img):hover {
  border-color: var(--act-sky, #0284c7);
  box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.12);
  transform: translateY(-2px);
}

.memory-prose :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 1.5em 0;
  font-size: 0.9375rem;
  border-radius: 3px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.memory-prose :deep(th) {
  background-color: var(--act-subtle-bg, #f8fafc);
  font-family: var(--club-serif);
  font-weight: 700;
  color: var(--act-ink-strong, #0f172a);
  border: 1px solid var(--act-border, #dce4e8);
  padding: 0.65em 1em;
  text-align: left;
}

:global(.dark) .memory-prose :deep(th) {
  background-color: #101a24;
  color: #f1f5f9;
  border-color: #293847;
}

.memory-prose :deep(td) {
  border: 1px solid var(--act-border, #dce4e8);
  padding: 0.65em 1em;
  color: var(--act-body, #334155);
}

:global(.dark) .memory-prose :deep(td) {
  border-color: #293847;
  color: #cbd5e1;
}

.memory-prose :deep(tr:nth-child(even)) {
  background-color: rgba(2, 132, 199, 0.02);
}

:global(.dark) .memory-prose :deep(tr:nth-child(even)) {
  background-color: rgba(255, 255, 255, 0.02);
}

.memory-prose :deep(hr) {
  height: 1px;
  border: none;
  margin: 2.75rem 0;
  background: linear-gradient(90deg, transparent, var(--act-border, #dce4e8) 15%, var(--act-border, #dce4e8) 85%, transparent);
}

:global(.dark) .memory-prose :deep(hr) {
  background: linear-gradient(90deg, transparent, #293847 15%, #293847 85%, transparent);
}

.memory-prose.is-large-text {
  font-size: 1.1875rem;
  line-height: 2;
}

.memory-prose.is-large-text :deep(p) {
  font-size: 1.1875rem;
  line-height: 2;
}

@media (max-width: 768px) {
  .memory-prose {
    font-size: 1rem;
    line-height: 1.8;
  }
}

/* --------------------------------------------------------------------------
   社团纪事存根与归档许可 (Colophon & License)
   -------------------------------------------------------------------------- */
.memory-colophon {
  margin-top: 3.25rem;
  margin-bottom: 2rem;
  border: 1px solid var(--act-border);
  background-color: var(--act-subtle-bg, #f8fafc);
  border-radius: 3px;
  position: relative;
  overflow: hidden;
}

:global(.dark) .memory-colophon {
  border-color: #293847;
  background-color: #101a24;
}

.memory-colophon::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--act-sky), #6366f1);
}

.memory-colophon-inner {
  padding: 1.25rem 1.5rem;
}

.memory-colophon-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px dashed var(--act-border);
  margin-bottom: 1rem;
}

:global(.dark) .memory-colophon-header {
  border-bottom-color: #293847;
}

.memory-colophon-tag,
.memory-colophon-seal {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.12rem 0.48rem;
  border: 1px solid color-mix(in srgb, #6366f1 35%, var(--act-border));
  color: #4f46e5;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  line-height: 1.2;
  background-color: color-mix(in srgb, #6366f1 8%, transparent);
  border-radius: 2px;
}

:global(.dark) .memory-colophon-tag,
:global(.dark) .memory-colophon-seal {
  border-color: color-mix(in srgb, #a5b4fc 35%, transparent);
  color: #a5b4fc;
  background-color: color-mix(in srgb, #6366f1 14%, transparent);
}

.memory-colophon-title {
  font-family: var(--club-serif);
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--act-ink-strong);
}

.memory-colophon-id {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.6875rem;
  letter-spacing: 0.05em;
  color: var(--act-muted);
}

.memory-colophon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.75rem 1.25rem;
  margin-bottom: 1rem;
}

.memory-colophon-cell {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.colophon-label {
  font-size: 0.6875rem;
  color: var(--act-muted);
}

.colophon-value {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--act-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.dark) .colophon-value {
  color: #f1f5f9;
}

.memory-colophon-license {
  padding-top: 0.75rem;
  border-top: 1px dashed var(--act-border);
  font-size: 0.75rem;
  line-height: 1.6;
  color: var(--act-body);
}

:global(.dark) .memory-colophon-license {
  border-top-color: #293847;
  color: #94a3b8;
}

.colophon-license-tag {
  display: inline-block;
  margin-right: 0.4rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.6875rem;
  font-weight: 700;
  padding: 0.05rem 0.35rem;
  background-color: var(--act-surface, #ffffff);
  border: 1px solid var(--act-border);
  border-radius: 2px;
  color: var(--act-ink);
}

:global(.dark) .colophon-license-tag {
  background-color: #14202b;
  border-color: #293847;
  color: #f1f5f9;
}

/* --------------------------------------------------------------------------
   右下角浮动阅读罗盘 (Floating Reading Dock)
   -------------------------------------------------------------------------- */
.memory-floating-dock {
  position: fixed;
  bottom: 2.5rem;
  right: 2rem;
  z-index: 45;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem;
  background-color: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--act-border, #dce4e8);
  border-radius: 9999px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15);
  transition: transform 200ms ease, opacity 200ms ease;
}

:global(.dark) .memory-floating-dock {
  background-color: rgba(20, 32, 43, 0.92);
  border-color: #293847;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
}

.memory-dock-progress {
  position: relative;
  width: 2.25rem;
  height: 2.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.memory-dock-ring {
  width: 100%;
  height: 100%;
}

.memory-dock-percent {
  position: absolute;
  font-size: 0.5625rem;
  font-weight: 700;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: var(--act-ink-strong);
  line-height: 1;
}

.memory-dock-btn {
  width: 2.25rem;
  height: 2.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: transparent;
  border: none;
  border-radius: 9999px;
  color: var(--act-body);
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease, transform 150ms ease;
}

.memory-dock-btn:hover {
  background-color: var(--act-subtle-bg, #f1f5f9);
  color: var(--act-sky, #0284c7);
  transform: scale(1.08);
}

:global(.dark) .memory-dock-btn:hover {
  background-color: #1e293b;
  color: #7dd3fc;
}

.memory-dock-btn.is-active {
  background-color: var(--act-sky-tint);
  color: var(--act-sky);
}

.memory-dock-btn.is-top:hover {
  color: var(--act-sky);
}

/* 浮动大纲弹窗 */
.memory-dock-toc-popover {
  position: absolute;
  bottom: 0;
  right: calc(100% + 0.75rem);
  width: 16rem;
  max-height: 20rem;
  overflow-y: auto;
  background-color: var(--act-surface, #ffffff);
  border: 1px solid var(--act-border, #dce4e8);
  border-radius: 4px;
  box-shadow: 0 15px 30px -5px rgba(0, 0, 0, 0.2);
  padding: 0.75rem;
  z-index: 50;
  animation: memory-dock-pop 180ms ease-out;
}

:global(.dark) .memory-dock-toc-popover {
  background-color: #14202b !important;
  border-color: #293847 !important;
}

.memory-dock-toc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid var(--act-border);
  margin-bottom: 0.5rem;
  color: var(--act-ink-strong);
}

.memory-dock-toc-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  list-style: none;
  padding-left: 0;
  margin: 0;
}

.memory-dock-toc-item.depth-3 {
  padding-left: 0.75rem;
}

.memory-dock-toc-item.depth-4 {
  padding-left: 1.25rem;
}

.memory-dock-toc-link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  color: var(--act-body);
  line-height: 1.4;
  text-decoration: none;
  transition: color 150ms ease;
}

.memory-dock-toc-link:hover {
  color: var(--act-sky);
}

.memory-dock-toc-item.is-active .memory-dock-toc-link {
  color: var(--act-sky);
  font-weight: 600;
}

.memory-dock-toc-item.is-active .memory-toc-bullet {
  background-color: var(--act-sky);
}

@keyframes memory-dock-pop {
  from {
    opacity: 0;
    transform: scale(0.95) translateX(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateX(0);
  }
}

.memory-dock-enter-active,
.memory-dock-leave-active {
  transition: opacity 250ms ease, transform 250ms ease;
}

.memory-dock-enter-from,
.memory-dock-leave-to {
  opacity: 0;
  transform: translateY(16px);
}

/* 浮动通知气泡 (Toast) */
.memory-toast {
  position: fixed;
  bottom: 5.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background-color: var(--act-surface, #ffffff);
  border: 1px solid var(--act-border, #dce4e8);
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15);
  border-radius: 9999px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--act-ink-strong, #0f172a);
  pointer-events: none;
}

:global(.dark) .memory-toast {
  background-color: #14202b !important;
  border-color: #293847 !important;
  color: #f1f5f9 !important;
}

.memory-toast-enter-active,
.memory-toast-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}

.memory-toast-enter-from,
.memory-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}

@media (max-width: 768px) {
  .memory-floating-dock {
    bottom: 1.5rem;
    right: 1rem;
    padding: 0.3rem;
  }
}

/* --------------------------------------------------------------------------
   活动剪影 (Photo Gallery)
   -------------------------------------------------------------------------- */
.memory-gallery {
  margin-top: 3.75rem;
  border-top: 1px solid var(--act-border);
  padding-top: 2.5rem;
}

.memory-gallery-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.75rem;
}

.memory-gallery-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-family: var(--club-serif);
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--act-ink-strong);
}

.memory-gallery-title .memory-gallery-tag {
  position: static;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.12rem 0.45rem;
  border: 1px solid color-mix(in srgb, var(--act-sky) 35%, transparent);
  background-color: var(--act-sky-tint);
  color: var(--act-sky);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  border-radius: 2px;
}

.memory-gallery-counter {
  font-size: 0.78125rem;
  color: var(--act-muted);
}

.memory-gallery-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.25rem;
}

@media (min-width: 640px) {
  .memory-gallery-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.memory-gallery-item {
  position: relative;
  display: block;
  cursor: zoom-in;
}

.memory-gallery-frame {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--act-border);
  background-color: var(--act-surface);
  border-radius: 2px;
  transition: border-color 200ms ease;
}

.memory-gallery-item:hover .memory-gallery-frame {
  border-color: var(--act-sky);
}

.memory-gallery-tag {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  padding: 0.15rem 0.45rem;
  background-color: rgb(15 23 42 / 0.65);
  backdrop-filter: blur(4px);
  color: #f1f5f9;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.6875rem;
  letter-spacing: 0.05em;
  border-radius: 2px;
}

/* --------------------------------------------------------------------------
   文末操作与回到卷首
   -------------------------------------------------------------------------- */
.memory-coda {
  margin-top: 3.5rem;
  padding-top: 2rem;
  border-top: 1px solid var(--act-border);
  display: flex;
  justify-content: center;
}

.memory-scroll-top-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 1.15rem;
  border: 1px solid var(--act-border);
  background-color: var(--act-surface);
  color: var(--act-body);
  font-size: 0.8125rem;
  font-weight: 500;
  border-radius: 2px;
  cursor: pointer;
  transition: all 180ms ease;
}

.memory-scroll-top-btn:hover {
  border-color: var(--act-sky);
  color: var(--act-ink-strong);
  background-color: var(--act-subtle-bg);
  transform: translateY(-1px);
}

/* --------------------------------------------------------------------------
   维基百科风格：更改记录与历史版本弹窗 (Revision History Modal)
   -------------------------------------------------------------------------- */
.memory-history-overlay {
  --act-border: #dce4e8;
  --act-surface: #ffffff;
  --act-subtle-bg: #f8fafc;
  --act-ink-strong: #0f172a;
  --act-ink: #1e293b;
  --act-body: #475569;
  --act-muted: #64748b;
  --act-sky: #0369a1;
  --act-sky-tint: rgb(3 105 161 / 0.08);

  position: fixed;
  inset: 0;
  width: 100%;
  max-width: none;
  height: 100dvh;
  max-height: none;
  margin: 0;
  border: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  background-color: rgb(15 23 42 / 0.72);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  animation: memory-modal-fade 180ms ease;
}

:global(.dark .memory-history-overlay),
:global(.dark) .memory-history-overlay {
  --act-border: #293847;
  --act-surface: #14202b;
  --act-subtle-bg: #101a24;
  --act-ink-strong: #f1f5f9;
  --act-ink: #e2e8f0;
  --act-body: #94a3b8;
  --act-muted: #64748b;
  --act-sky: #7dd3fc;
  --act-sky-tint: rgb(125 211 252 / 0.1);
}

.memory-history-panel {
  position: relative;
  width: 100%;
  max-width: 48rem;
  max-height: 90dvh;
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
  background-color: var(--act-surface, #ffffff);
  border: 1px solid var(--act-border, #dce4e8);
  box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.35);
  border-radius: 4px;
  overflow: hidden;
  animation: memory-modal-zoom 200ms cubic-bezier(0.16, 1, 0.3, 1);
  color: var(--act-ink, #1e293b);
}

:global(.dark) .memory-history-panel,
:global(.dark .memory-history-panel) {
  background-color: #14202b !important;
  border-color: #293847 !important;
  color: #e2e8f0 !important;
}

.memory-history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.125rem 1.35rem;
  border-bottom: 1px solid var(--act-border, #dce4e8);
  background-color: #f8fafc;
  background-color: var(--act-subtle-bg, #f8fafc);
}

:global(.dark) .memory-history-header,
:global(.dark .memory-history-header) {
  border-bottom-color: #293847 !important;
  background-color: #101a24 !important;
}

.memory-history-header .memory-history-tag,
.memory-history-header .memory-seal {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.12rem 0.45rem;
  border: 1px solid color-mix(in srgb, var(--act-sky) 35%, transparent);
  background-color: var(--act-sky-tint);
  color: var(--act-sky);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  border-radius: 2px;
}

:global(.dark) .memory-history-header .memory-history-tag,
:global(.dark) .memory-history-header .memory-seal,
:global(.dark .memory-history-header .memory-history-tag),
:global(.dark .memory-history-header .memory-seal) {
  border-color: color-mix(in srgb, #7dd3fc 35%, transparent) !important;
  background-color: rgb(12 74 110 / 0.28) !important;
  color: #7dd3fc !important;
}

.memory-history-title {
  font-family: var(--club-serif);
  font-size: 1rem;
  font-weight: 700;
  color: var(--act-ink-strong, #0f172a);
}

:global(.dark) .memory-history-title,
:global(.dark .memory-history-title) {
  color: #f1f5f9 !important;
}

.memory-history-subtitle {
  font-size: 0.75rem;
  color: var(--act-muted, #64748b);
  margin-top: 0.15rem;
}

.memory-history-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 2rem;
  width: 2rem;
  border: 1px solid transparent;
  background: transparent;
  color: var(--act-muted, #64748b);
  font-size: 1.5rem;
  line-height: 1;
  border-radius: 2px;
  cursor: pointer;
  transition: all 150ms ease;
}

.memory-history-close-btn:hover {
  border-color: var(--act-border, #dce4e8);
  color: var(--act-ink-strong, #0f172a);
  background-color: var(--act-surface, #ffffff);
}

:global(.dark) .memory-history-close-btn:hover,
:global(.dark .memory-history-close-btn:hover) {
  border-color: #293847;
  color: #f1f5f9;
  background-color: #14202b;
}

.memory-history-body {
  padding: 1.35rem;
  overflow-y: auto;
  max-height: 60vh;
  background-color: #ffffff;
  background-color: var(--act-surface, #ffffff);
}

:global(.dark) .memory-history-body,
:global(.dark .memory-history-body) {
  background-color: #14202b !important;
}

.memory-history-dev-banner {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.125rem 1.25rem;
  border: 1px solid rgb(3 105 161 / 0.25);
  background-color: rgb(240 249 255 / 0.95);
  border-radius: 3px;
  margin-bottom: 1.25rem;
}

:global(.dark) .memory-history-dev-banner,
:global(.dark .memory-history-dev-banner) {
  border-color: rgb(125 211 252 / 0.25) !important;
  background-color: rgb(12 74 110 / 0.28) !important;
}

.memory-history-dev-badge,
.memory-history-dev-seal {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 2.25rem;
  width: 2.25rem;
  border-radius: 9999px;
  border: 1px solid rgb(3 105 161 / 0.3);
  background-color: #ffffff;
  flex-shrink: 0;
}

:global(.dark) .memory-history-dev-badge,
:global(.dark) .memory-history-dev-seal,
:global(.dark .memory-history-dev-badge),
:global(.dark .memory-history-dev-seal) {
  border-color: rgb(125 211 252 / 0.3);
  background-color: #162636;
}

.memory-history-dev-title {
  font-family: var(--club-serif);
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--act-ink-strong, #0f172a);
}

:global(.dark) .memory-history-dev-title,
:global(.dark .memory-history-dev-title) {
  color: #f1f5f9 !important;
}

.memory-history-dev-desc {
  margin-top: 0.3rem;
  font-size: 0.78125rem;
  line-height: 1.6;
  color: var(--act-body, #475569);
}

:global(.dark) .memory-history-dev-desc,
:global(.dark .memory-history-dev-desc) {
  color: #94a3b8 !important;
}

.memory-history-summary-box {
  border: 1px solid var(--act-border, #dce4e8);
  background-color: #f8fafc;
  background-color: var(--act-subtle-bg, #f8fafc);
  padding: 1rem 1.25rem;
  border-radius: 3px;
}

:global(.dark) .memory-history-summary-box,
:global(.dark .memory-history-summary-box) {
  border-color: #293847 !important;
  background-color: #101a24 !important;
}

.memory-history-summary-title {
  font-family: var(--club-serif);
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--act-ink, #0f172a);
  margin-bottom: 0.625rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px dashed var(--act-border, #dce4e8);
}

:global(.dark) .memory-history-summary-title,
:global(.dark .memory-history-summary-title) {
  color: #f1f5f9 !important;
  border-bottom-color: #293847 !important;
}

.memory-history-summary-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  list-style: none;
  padding-left: 0;
  margin: 0;
}

.memory-history-summary-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.78125rem;
  line-height: 1.5;
}

.memory-summary-label {
  color: var(--act-muted, #64748b);
  font-weight: 500;
}

.memory-summary-value {
  color: var(--act-ink, #0f172a);
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

:global(.dark) .memory-summary-value,
:global(.dark .memory-summary-value) {
  color: #f1f5f9 !important;
}

.memory-summary-badge {
  font-size: 0.6875rem;
  padding: 0.05rem 0.3rem;
  border: 1px solid var(--act-border, #dce4e8);
  background-color: var(--act-surface, #ffffff);
  color: var(--act-muted, #64748b);
  border-radius: 2px;
}

:global(.dark) .memory-summary-badge,
:global(.dark .memory-summary-badge) {
  border-color: #293847;
  background-color: #14202b;
  color: #94a3b8;
}

.memory-summary-time {
  font-size: 0.75rem;
  color: var(--act-muted, #64748b);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.memory-history-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.875rem 1.35rem;
  border-top: 1px solid var(--act-border, #dce4e8);
  background-color: #f8fafc;
  background-color: var(--act-subtle-bg, #f8fafc);
}

:global(.dark) .memory-history-footer,
:global(.dark .memory-history-footer) {
  border-top-color: #293847 !important;
  background-color: #101a24 !important;
}

.memory-history-notice {
  font-size: 0.6875rem;
  color: var(--act-muted, #64748b);
}

.memory-history-confirm-btn {
  display: inline-flex;
  align-items: center;
  padding: 0.4rem 1rem;
  border: 1px solid var(--act-border, #dce4e8);
  background-color: #ffffff;
  color: #0f172a;
  font-size: 0.75rem;
  font-weight: 600;
  border-radius: 2px;
  cursor: pointer;
  transition: all 150ms ease;
}

:global(.dark) .memory-history-confirm-btn,
:global(.dark .memory-history-confirm-btn) {
  border-color: #293847;
  background-color: #1a2937;
  color: #f1f5f9;
}

.memory-history-confirm-btn:hover {
  border-color: #0369a1;
  color: #0369a1;
}

:global(.dark) .memory-history-confirm-btn:hover,
:global(.dark .memory-history-confirm-btn:hover) {
  border-color: #7dd3fc;
  color: #7dd3fc;
}

@keyframes memory-modal-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes memory-modal-zoom {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* --------------------------------------------------------------------------
   动画与无障碍友好降级
   -------------------------------------------------------------------------- */
@keyframes memory-astrolabe-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.memory-stage.is-entered .memory-ambient-watermark {
  animation: memory-astrolabe-spin 90s linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  .memory-stage * {
    animation: none !important;
    transition: none !important;
  }
}
/* Live published revision summaries. */
.memory-history-overlay::backdrop { background: transparent; }
.memory-history-state { padding: 1rem 0; color: var(--act-body); }
.memory-revision-list { display: grid; gap: 0.75rem; list-style: none; padding: 0; margin: 0 0 1.25rem; }
.memory-history-confirm-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.memory-revision-entry { padding: 1rem; border: 1px solid var(--act-border); border-radius: 3px; background: var(--act-subtle-bg); overflow-wrap: anywhere; }
.memory-revision-heading { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.5rem; }
.memory-revision-heading time { font-size: 0.75rem; color: var(--act-muted); }
.memory-revision-entry p { margin-top: 0.4rem; font-size: 0.8125rem; color: var(--act-body); }
.memory-history-pagination,.memory-history-footer-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; }
.memory-history-pagination { justify-content: space-between; margin-bottom: 1.25rem; }
@media (max-width: 600px) { .memory-history-footer { flex-wrap: wrap; } .memory-history-footer-actions { width: 100%; } }
</style>

<style>
/* Archived `activity-detail-bg`: the body/layout step aside so the page's own
   paper background controls the overscroll area. */
body.activity-detail-bg {
  background: transparent !important;
}
body.activity-detail-bg #__nuxt,
body.activity-detail-bg #__nuxt > div,
body.activity-detail-bg main {
  background: transparent !important;
}
/* Live published revision summaries. */
.memory-history-overlay::backdrop { background: transparent; }
.memory-history-state { padding: 1rem 0; color: var(--act-body); }
.memory-revision-list { display: grid; gap: 0.75rem; list-style: none; padding: 0; margin: 0 0 1.25rem; }
.memory-history-confirm-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.memory-revision-entry { padding: 1rem; border: 1px solid var(--act-border); border-radius: 3px; background: var(--act-subtle-bg); overflow-wrap: anywhere; }
.memory-revision-heading { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.5rem; }
.memory-revision-heading time { font-size: 0.75rem; color: var(--act-muted); }
.memory-revision-entry p { margin-top: 0.4rem; font-size: 0.8125rem; color: var(--act-body); }
.memory-history-pagination,.memory-history-footer-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; }
.memory-history-pagination { justify-content: space-between; margin-bottom: 1.25rem; }
@media (max-width: 600px) { .memory-history-footer { flex-wrap: wrap; } .memory-history-footer-actions { width: 100%; } }
</style>

