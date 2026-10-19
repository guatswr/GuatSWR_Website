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

useHead({
  htmlAttrs: { class: 'activity-detail-bg' },
  bodyAttrs: { class: 'activity-detail-bg' },
})
</script>

<template>
  <div class="club-paper min-h-screen relative font-sans overflow-x-hidden">
    <Transition name="fade-fast">
      <div
        v-if="loading"
        class="fixed inset-0 z-[100] bg-white dark:bg-slate-950 flex flex-col items-center justify-center"
      >
        <div class="loader-unit flex flex-col items-center animate-[floating_3s_ease-in-out_infinite]">
          <div class="taiji-spinner relative w-20 h-20 mb-6">
            <div class="absolute inset-0 border-4 border-gray-100 dark:border-slate-800 rounded-full"/>
            <div class="absolute inset-0 border-4 border-red-600 rounded-full border-t-transparent animate-spin"/>
            <div class="absolute inset-0 flex items-center justify-center text-4xl text-red-600">☯</div>
          </div>
          <svg class="w-60 h-10" viewBox="0 0 240 40">
            <text
              x="50%"
              y="50%"
              text-anchor="middle"
              dominant-baseline="middle"
              class="font-serif font-bold text-xl fill-gray-700 dark:fill-gray-200"
            >
              少女祈祷中
              <tspan class="dot-1">·</tspan>
              <tspan class="dot-2">·</tspan>
              <tspan class="dot-3">·</tspan>
            </text>
          </svg>
        </div>
      </div>
    </Transition>

    <Transition name="fade-content">
      <div
        v-if="!loading && activity"
        class="relative z-10 w-full md:max-w-5xl mx-auto my-6 md:my-12 overflow-hidden min-h-[calc(100vh-3rem)] md:min-h-0"
      >
        <div class="h-[300px] md:h-[550px] w-full relative group overflow-hidden">
          <ProgressiveImage
            v-if="coverSource"
            eager
            :src="coverSource"
            :thumb="coverThumb ?? undefined"
            alt="Cover"
            wrapper-class="w-full h-full"
            img-class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div class="absolute inset-0 bg-black/40"/>

          <div class="absolute inset-0 flex items-end p-6 md:p-12">
            <div class="w-full max-w-4xl">
              <div class="flex flex-col items-start gap-4 animate-[slideUp_0.6s_ease-out]">
                <div class="flex flex-wrap items-center gap-3 text-white/90 text-sm font-mono tracking-wider drop-shadow-md">
                  <span class="inline-flex items-center gap-2">
                    <span class="bg-red-600 w-2 h-4 rounded-sm shadow-sm"/>
                    <span>{{ activity.date }}</span>
                  </span>
                  <span class="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full bg-white/15 text-white border border-white/20 backdrop-blur">
                    <span class="text-[10px]">🏷️</span>
                    {{ activity.tag || '未标注' }}
                  </span>
                </div>
                <h1 class="text-3xl md:text-5xl lg:text-6xl font-bold !text-white font-serif tracking-wide leading-tight drop-shadow-lg">
                  {{ activity.title }}
                </h1>
              </div>
            </div>
          </div>

          <NuxtLink
            to="/activities"
            class="absolute top-4 left-4 md:top-8 md:left-8 bg-black/20 hover:bg-black/40 text-white px-4 py-2 md:px-5 md:py-2.5 rounded-full backdrop-blur-md transition border border-white/20 flex items-center gap-2 group/back shadow-lg z-20"
            @click="goBack"
          >
            <span class="transform group-hover/back:-translate-x-1 transition text-sm md:text-base">← 返回</span>
          </NuxtLink>
        </div>

        <div class="p-6 md:p-12 bg-transparent relative">
          <div class="flex flex-wrap items-center gap-6 mb-8 pb-6 border-b border-gray-200/60 dark:border-slate-700/70">
            <div class="flex items-center gap-3">
              <ProgressiveImage
                v-if="activity.created_by_avatar && displayImageSource(activity.created_by_avatar)"
                :src="displayImageSource(activity.created_by_avatar) ?? ''"
                :thumb="displayThumbSource(activity.created_by_avatar) ?? undefined"
                alt="Avatar"
                wrapper-class="w-10 h-10"
                img-class="w-10 h-10 rounded-full border border-gray-200 dark:border-slate-700 object-cover shadow-sm"
              />
              <div
                v-else
                class="w-10 h-10 rounded-full bg-blue-100 dark:bg-slate-800 text-blue-500 dark:text-blue-200 flex items-center justify-center font-bold shadow-sm text-sm"
              >
                {{ authorInitial }}
              </div>
              <div>
                <p class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold">
                  发布者
                </p>
                <p class="text-sm font-bold text-gray-800 dark:text-gray-100">
                  {{ activity.created_by || '未知用户' }}
                </p>
              </div>
            </div>

            <div
              v-if="activity.updated_by"
              class="flex items-center gap-3 pl-6 border-l border-gray-200/60 dark:border-slate-700/70"
            >
              <ProgressiveImage
                v-if="activity.updated_by_avatar && displayImageSource(activity.updated_by_avatar)"
                :src="displayImageSource(activity.updated_by_avatar) ?? ''"
                :thumb="displayThumbSource(activity.updated_by_avatar) ?? undefined"
                alt="Avatar"
                wrapper-class="w-10 h-10"
                img-class="w-10 h-10 rounded-full border border-gray-200 dark:border-slate-700 object-cover shadow-sm"
              />
              <div
                v-else
                class="w-10 h-10 rounded-full bg-orange-100 dark:bg-slate-800 text-orange-500 dark:text-orange-200 flex items-center justify-center font-bold shadow-sm text-sm"
              >
                {{ activity.updated_by.charAt(0).toUpperCase() }}
              </div>
              <div>
                <p class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold">
                  最后编辑
                </p>
                <p class="text-sm font-bold text-gray-800 dark:text-gray-100">
                  {{ activity.updated_by }}
                </p>
              </div>
            </div>
          </div>

          <div
            v-if="activity.description"
            class="bg-gray-50/80 dark:bg-slate-800/80 border-l-4 border-red-500 p-5 md:p-8 mb-10 text-gray-600 dark:text-gray-200 italic rounded-r-xl shadow-sm leading-relaxed text-sm md:text-base backdrop-blur-sm"
          >
            {{ activity.description }}
          </div>

          <div class="markdown-body bg-white dark:bg-slate-900 border border-gray-100/60 dark:border-slate-700 rounded-xl p-5 md:p-8">
            <SafeMarkdown :nodes="body" />
          </div>

          <div
            v-if="gallery.length > 0"
            class="mt-16 pt-10 border-t border-gray-200/60 dark:border-slate-700/70"
          >
            <h3 class="text-xl font-bold mb-6 font-serif text-gray-800 dark:text-gray-100 flex items-center gap-2">
              <span>📷</span> 活动剪影 (Highlights)
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <a
                v-for="item in gallery"
                :key="item.key"
                :href="item.src"
                class="overflow-hidden group cursor-zoom-in relative aspect-video bg-gray-100 dark:bg-slate-800 block w-full text-left"
                :aria-label="`查看大图：${activity.title}`"
                @click.prevent="openLightbox(item.src)"
              >
                <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition z-10 flex items-center justify-center pointer-events-none">
                  <span class="text-white opacity-0 group-hover:opacity-100 transition text-sm bg-black/50 px-3 py-1.5 rounded-full backdrop-blur-sm border border-white/20">🔍 点击查看大图</span>
                </div>
                <ProgressiveImage
                  :src="item.src"
                  :thumb="item.thumb ?? undefined"
                  alt="Gallery image"
                  wrapper-class="w-full h-full"
                  img-class="w-full h-full object-cover transform group-hover:scale-105 transition duration-700"
                />
              </a>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <p
      v-if="!loading && !activity"
      class="relative z-10 mx-auto my-24 max-w-xl px-6 text-center text-sm text-slate-500"
      role="status"
    >
      活动不存在或已删除。
      <NuxtLink to="/activities" class="club-text-link ml-2">返回活动列表</NuxtLink>
    </p>

    <ImageLightbox
      v-model:open="lightboxOpen"
      :src="currentImage"
      alt="Full view"
    />
  </div>
</template>

<style scoped>
.markdown-body {
  border-radius: 0.75rem;
}

.dot-1 { animation: ping-pong-dot-1 2.4s step-end infinite; }
.dot-2 { animation: ping-pong-dot-2 2.4s step-end infinite; }
.dot-3 { animation: ping-pong-dot-3 2.4s step-end infinite; }

.fade-fast-leave-active { transition: opacity 0.3s ease; }
.fade-fast-leave-to { opacity: 0; }
.fade-content-enter-active { transition: opacity 0.4s ease-out; }
.fade-content-enter-from { opacity: 0; }
</style>

<style>
/* Keyframes are global: Tailwind arbitrary `animate-[...]` utilities (and the
   lightbox component, which lives in another SFC) reference these names. */
@keyframes ping-pong-dot-1 {
  0% { visibility: visible; }
  50% { visibility: hidden; }
  66.6% { visibility: visible; }
}
@keyframes ping-pong-dot-2 {
  0% { visibility: visible; }
  33.3% { visibility: hidden; }
  83.3% { visibility: visible; }
}
@keyframes ping-pong-dot-3 {
  0% { visibility: visible; }
  16.6% { visibility: hidden; }
}

@keyframes floating {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

@keyframes zoomIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

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
