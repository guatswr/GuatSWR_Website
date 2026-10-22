<script setup lang="ts">
/**
 * `/activity/:id` - archived `views/public/ActivityDetail.vue`.
 *
 * One typed request to `/api/content/activity/:id` returns both the display
 * metadata and the server-sanitized Markdown tree, so the header and the body
 * can never describe different upstream records. A missing/private record is a
 * real 404 and an upstream failure is a real 502; the archived page instead
 * redirected to the list on any error.
 */
import type { ActivityContentResponse } from '#shared/content'
import { usePublicPageSeo } from '~/composables/usePublicPageSeo'
import { DEFAULT_DESCRIPTION } from '~/utils/public-seo'
import { displayImageSource, displayThumbSource } from '~/utils/public-image'
import { formatArchiveDate } from '~/utils/club-date'
import { activitySeoNode } from '#shared/seo'
import { defineArticle, useSchemaOrg } from '#schema-org/app'

definePageMeta({ key: route => route.fullPath })

const route = useRoute()
const router = useRouter()

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

/** Archived `router.back()`, with an ordinary-link fallback when there is no history. */
const goBack = (event: MouseEvent): void => {
  const state = window.history.state as { back?: string | null } | null
  if (!state?.back) return
  event.preventDefault()
  router.back()
}

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
  <div class="club-paper min-h-screen">
    <p
      v-if="loading"
      class="py-32 text-center text-sm text-slate-500 dark:text-slate-400"
      role="status"
    >
      正在展开这幅画卷…
    </p>

    <article v-else-if="activity" class="memory">
      <div class="club-container">
        <nav class="memory-nav" aria-label="返回">
          <NuxtLink to="/activities" class="club-text-link" @click="goBack">
            <span aria-hidden="true">←</span> 返回活动记录
          </NuxtLink>
        </nav>

        <header class="memory-header">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
            <span class="memory-seal" aria-hidden="true">记</span>
            <time :datetime="activity.date">{{ formatArchiveDate(activity.date) }}</time>
            <span v-if="activity.tag" class="memory-tag">{{ activity.tag }}</span>
          </div>
          <h1 class="memory-title">
            {{ activity.title }}
          </h1>
          <div class="memory-meta">
            <div class="flex items-center gap-3">
              <ProgressiveImage
                v-if="activity.created_by_avatar && displayImageSource(activity.created_by_avatar)"
                :src="displayImageSource(activity.created_by_avatar) ?? ''"
                :thumb="displayThumbSource(activity.created_by_avatar) ?? undefined"
                alt="记录者头像"
                wrapper-class="h-9 w-9"
                img-class="h-9 w-9 rounded-full border border-slate-200 object-cover dark:border-slate-700"
              />
              <div
                v-else
                class="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-sm font-bold text-sky-700 dark:border-slate-700 dark:bg-slate-800 dark:text-sky-300"
                aria-hidden="true"
              >
                {{ authorInitial }}
              </div>
              <div>
                <p class="memory-meta-label">记录者</p>
                <p class="memory-meta-name">{{ activity.created_by || '未知用户' }}</p>
              </div>
            </div>
            <div
              v-if="activity.updated_by && activity.updated_by !== activity.created_by"
              class="flex items-center gap-3 border-l border-slate-200 pl-6 dark:border-slate-700"
            >
              <div
                class="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-sm font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                aria-hidden="true"
              >
                {{ activity.updated_by.charAt(0).toUpperCase() }}
              </div>
              <div>
                <p class="memory-meta-label">最后修订</p>
                <p class="memory-meta-name">{{ activity.updated_by }}</p>
              </div>
            </div>
          </div>
        </header>

        <figure v-if="coverSource" class="memory-figure">
          <a
            :href="coverSource"
            :aria-label="`查看大图：${activity.title}`"
            @click.prevent="openLightbox(coverSource)"
          >
            <ProgressiveImage
              eager
              :src="coverSource"
              :thumb="coverThumb ?? undefined"
              :alt="activity.title"
              wrapper-class="memory-figure-frame"
              img-class="h-full w-full object-cover"
            />
            <span class="memory-figure-hint" aria-hidden="true">点击展开画卷</span>
          </a>
        </figure>

        <div v-if="activity.description" class="memory-lede">
          {{ activity.description }}
        </div>

        <div class="memory-prose">
          <SafeMarkdown :nodes="body" inherit-typography />
        </div>

        <section v-if="gallery.length > 0" class="memory-gallery" aria-labelledby="gallery-title">
          <h2 id="gallery-title" class="memory-gallery-title">
            <span class="memory-seal" aria-hidden="true">影</span> 活动剪影
          </h2>
          <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
            <a
              v-for="item in gallery"
              :key="item.key"
              :href="item.src"
              class="memory-gallery-item group"
              :aria-label="`查看大图：${activity.title}`"
              @click.prevent="openLightbox(item.src)"
            >
              <ProgressiveImage
                :src="item.src"
                :thumb="item.thumb ?? undefined"
                alt="活动剪影"
                wrapper-class="aspect-video w-full"
                img-class="h-full w-full object-cover transition-transform duration-700 motion-safe:group-hover:scale-105"
              />
              <span class="memory-figure-hint" aria-hidden="true">点击展开画卷</span>
            </a>
          </div>
        </section>

        <footer class="memory-coda">
          <span class="memory-coda-stamp" aria-hidden="true">录</span>
          <p class="memory-coda-text">回忆收到这里，故事还在继续。</p>
          <div class="flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
            <NuxtLink to="/activities" class="club-text-link">回到活动记录</NuxtLink>
            <NuxtLink to="/events" class="club-text-link">看看近期活动 <span aria-hidden="true">↗</span></NuxtLink>
          </div>
        </footer>
      </div>
    </article>

    <p
      v-else
      class="mx-auto my-24 max-w-xl px-6 text-center text-sm text-slate-500"
      role="status"
    >
      活动不存在或已删除。
      <NuxtLink to="/activities" class="club-text-link ml-2">返回活动列表</NuxtLink>
    </p>

    <ImageLightbox
      v-model:open="lightboxOpen"
      :src="currentImage"
      alt="活动配图预览"
    />
  </div>
</template>

<style scoped>
.memory {
  padding-block: 2.5rem 5rem;
}
.memory-nav {
  margin-bottom: 1.5rem;
}

.memory-header {
  max-width: 44rem;
}
.memory-seal {
  display: inline-flex;
  align-items: center;
  padding: 0.1rem 0.35rem;
  border: 1px solid rgb(163 78 71 / 0.4);
  background-color: rgb(163 78 71 / 0.07);
  color: #a34e47;
  font-family: var(--club-serif);
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1.5;
  letter-spacing: 0.1em;
}
:global(.dark .memory-seal) {
  border-color: rgb(240 168 153 / 0.4);
  background-color: rgb(240 168 153 / 0.1);
  color: #f0a899;
}
.memory-tag {
  color: #0369a1;
}
:global(.dark .memory-tag) {
  color: #7dd3fc;
}
.memory-title {
  margin-top: 1.25rem;
  font-family: var(--club-serif);
  font-size: clamp(1.9rem, 4.5vw, 3.1rem);
  font-weight: 650;
  line-height: 1.3;
  letter-spacing: -0.02em;
  color: #0f172a;
  word-break: break-word;
  text-wrap: balance;
}
:global(.dark .memory-title) {
  color: #f1f5f9;
}
.memory-meta {
  margin-top: 1.75rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1.5rem;
  border-top: 1px solid #e2e8f0;
  padding-top: 1.25rem;
}
:global(.dark .memory-meta) {
  border-top-color: #243447;
}
.memory-meta-label {
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #64748b;
}
:global(.dark .memory-meta-label) {
  color: #94a3b8;
}
.memory-meta-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: #1e293b;
}
:global(.dark .memory-meta-name) {
  color: #f1f5f9;
}

.memory-figure {
  margin-top: 2.5rem;
}
.memory-figure a {
  position: relative;
  display: block;
  cursor: zoom-in;
}
.memory-figure-frame {
  width: 100%;
  max-height: 34rem;
  overflow: hidden;
  border: 1px solid #dce4e8;
  background-color: #f8fafc;
}
:global(.dark .memory-figure-frame) {
  border-color: #293847;
  background-color: #0d151f;
}
.memory-figure-hint {
  position: absolute;
  right: 0.75rem;
  bottom: 0.75rem;
  padding: 0.2rem 0.55rem;
  background-color: rgb(15 23 42 / 0.55);
  color: #f1f5f9;
  font-size: 0.6875rem;
  letter-spacing: 0.04em;
  opacity: 0;
  transition: opacity 200ms ease;
}
.memory-figure a:is(:hover, :focus-visible) .memory-figure-hint,
.memory-gallery-item:is(:hover, :focus-visible) .memory-figure-hint {
  opacity: 1;
}

.memory-lede {
  margin-top: 2.25rem;
  max-width: 44rem;
  border-left: 2px solid #a34e47;
  background-color: #fbfbf8;
  padding: 1.25rem 1.5rem;
  font-size: 1rem;
  line-height: 1.9;
  color: #475569;
}
:global(.dark .memory-lede) {
  background-color: #101a25;
  color: #cbd5e1;
}

.memory-prose {
  margin-top: 2.25rem;
  max-width: 44rem;
  font-size: 1.05rem;
  line-height: 1.9;
  color: #334155;
}
:global(.dark .memory-prose) {
  color: #cbd5e1;
}
.memory-prose :deep(h1),
.memory-prose :deep(h2),
.memory-prose :deep(h3) {
  margin-top: 1.6em;
  margin-bottom: 0.7em;
  font-family: var(--club-serif);
  font-weight: 650;
  line-height: 1.4;
  color: #0f172a;
}
:global(.dark .memory-prose h1),
:global(.dark .memory-prose h2),
:global(.dark .memory-prose h3) {
  color: #f1f5f9;
}
.memory-prose :deep(p) {
  margin-bottom: 1.25em;
}
.memory-prose :deep(ul),
.memory-prose :deep(ol) {
  margin-bottom: 1.25em;
  padding-left: 1.5em;
}
.memory-prose :deep(blockquote) {
  border-left: 2px solid #a34e47;
  background-color: rgb(163 78 71 / 0.05);
  padding: 0.75em 1.25em;
  color: #475569;
}
:global(.dark .memory-prose blockquote) {
  background-color: rgb(240 168 153 / 0.06);
  color: #cbd5e1;
}
.memory-prose :deep(img) {
  border: 1px solid #e2e8f0;
}
:global(.dark .memory-prose img) {
  border-color: #293847;
}
@media (max-width: 768px) {
  .memory-prose {
    font-size: 1rem;
    line-height: 1.8;
  }
}

.memory-gallery {
  margin-top: 3.5rem;
  border-top: 1px solid #e2e8f0;
  padding-top: 2.5rem;
}
:global(.dark .memory-gallery) {
  border-top-color: #243447;
}
.memory-gallery-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-family: var(--club-serif);
  font-size: 1.35rem;
  font-weight: 600;
  color: #0f172a;
}
:global(.dark .memory-gallery-title) {
  color: #f1f5f9;
}
.memory-gallery .grid {
  margin-top: 1.75rem;
}
.memory-gallery-item {
  position: relative;
  display: block;
  overflow: hidden;
  border: 1px solid #dce4e8;
  background-color: #f1f5f9;
  cursor: zoom-in;
}
:global(.dark .memory-gallery-item) {
  border-color: #293847;
  background-color: #1e293b;
}

.memory-coda {
  margin-top: 4rem;
  border-top: 1px solid #dce4e8;
  padding-top: 2.5rem;
  text-align: center;
}
:global(.dark .memory-coda) {
  border-top-color: #293847;
}
.memory-coda-stamp {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 2.5rem;
  width: 2.5rem;
  border: 1px solid rgb(163 78 71 / 0.5);
  color: #a34e47;
  font-family: var(--club-serif);
  font-size: 1.25rem;
  font-weight: 700;
  transform: rotate(-4deg);
}
:global(.dark .memory-coda-stamp) {
  border-color: rgb(240 168 153 / 0.5);
  color: #f0a899;
}
.memory-coda-text {
  margin-top: 1rem;
  font-family: var(--club-serif);
  font-size: 0.9375rem;
  letter-spacing: 0.04em;
  color: #64748b;
}
:global(.dark .memory-coda-text) {
  color: #94a3b8;
}
.memory-coda .club-text-link {
  margin-top: 1.5rem;
}

@media (prefers-reduced-motion: reduce) {
  .memory-figure-hint {
    transition: none;
  }
}
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
</style>
