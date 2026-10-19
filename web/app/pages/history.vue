<script setup lang="ts">
/**
 * `/history` - archived `views/public/History.vue`.
 *
 * The archived page used `v-html` for backend HTML descriptions. The public
 * adapter now sanitizes them on the server (`/api/content/history`), so the
 * browser only renders the allowlisted tree. The month rail is ordinary
 * anchor links, so jumping to a month works before hydration; the
 * IntersectionObserver and the rAF-throttled scroll listener start on the
 * client only and are fully removed on unmount.
 */
import type { HistoryContentResponse, HistoryDisplayEntry } from '#shared/content'
import { usePublicPageSeo } from '~/composables/usePublicPageSeo'
import { historyAnchor, monthItems, monthKey, monthRailHeight } from '~/utils/history'
import { displayImageSource, displayThumbSource } from '~/utils/public-image'

const { data, error, status, refresh } = await useFetch<HistoryContentResponse>('/api/content/history', {
  key: 'public-history',
  default: (): HistoryContentResponse => ({ items: [] }),
})

if (import.meta.server && error.value) setResponseStatus(502)

const entries = computed<readonly HistoryDisplayEntry[]>(() => data.value.items)
const months = computed(() => monthItems(entries.value))
const railHeight = computed(() => monthRailHeight(months.value.length))
const currentMonth = ref(months.value[0]?.month ?? '')

const loading = computed(() => status.value === 'pending')
const failed = computed(() => Boolean(error.value))

// --- Lightbox -------------------------------------------------------------
const lightboxOpen = ref(false)
const currentImage = ref('')
const openLightbox = (src: string): void => {
  currentImage.value = src
  lightboxOpen.value = true
}

// --- Month rail -----------------------------------------------------------
const timeline = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null
let ticking = false
let frame: number | null = null

const monthElements = (): HTMLElement[] =>
  timeline.value ? Array.from(timeline.value.querySelectorAll<HTMLElement>('[data-history-index]')) : []

const setMonthFromIndex = (index: number): void => {
  const key = monthKey(entries.value[index]?.date)
  if (key) currentMonth.value = key
}

const updateFromViewport = (): void => {
  const elements = monthElements()
  if (elements.length === 0) return
  const anchor = window.innerHeight * 0.35
  let best: HTMLElement | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const element of elements) {
    const distance = Math.abs(element.getBoundingClientRect().top - anchor)
    if (distance < bestDistance) {
      bestDistance = distance
      best = element
    }
  }
  if (best) setMonthFromIndex(Number(best.dataset.historyIndex))
}

const disconnectObserver = (): void => {
  observer?.disconnect()
  observer = null
}

const initObserver = (): void => {
  disconnectObserver()
  if (typeof IntersectionObserver === 'undefined') return
  observer = new IntersectionObserver((records) => {
    const visible = records
      .filter(record => record.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
    const first = visible[0]
    if (!first) return
    setMonthFromIndex(Number((first.target as HTMLElement).dataset.historyIndex))
  }, { rootMargin: '-35% 0px -55% 0px', threshold: [0, 0.1] })
  for (const element of monthElements()) observer.observe(element)
}

const onScroll = (): void => {
  if (ticking) return
  ticking = true
  frame = window.requestAnimationFrame(() => {
    frame = null
    ticking = false
    updateFromViewport()
  })
}

const onResize = (): void => {
  initObserver()
  updateFromViewport()
}

const scrollToMonth = (index: number): void => {
  setMonthFromIndex(index)
  const target = timeline.value?.querySelector<HTMLElement>(`[data-history-index="${index}"]`)
  if (!target) return
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
}

onMounted(() => {
  initObserver()
  updateFromViewport()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  disconnectObserver()
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onResize)
  if (frame !== null) window.cancelAnimationFrame(frame)
  frame = null
  ticking = false
})

usePublicPageSeo({
  title: '绯想天群史',
  description: '记录我们一路走来的点点滴滴。从最初的几人小群，到如今的幻想乡大家庭。',
  path: '/history',
})
</script>

<template>
  <div class="min-h-screen bg-[#f8fafc] dark:bg-slate-950 py-16 font-sans relative overflow-hidden history-bg">
    <div class="absolute inset-0 pointer-events-none">
      <div class="absolute -top-24 -left-20 w-72 h-72 bg-red-200/50 dark:bg-red-500/20 rounded-full blur-3xl"/>
      <div class="absolute top-1/3 -right-24 w-96 h-96 bg-amber-200/40 dark:bg-amber-500/15 rounded-full blur-3xl"/>
      <div class="absolute bottom-0 left-1/3 w-80 h-80 bg-rose-200/40 dark:bg-rose-500/15 rounded-full blur-3xl"/>
      <div class="absolute top-20 left-1/2 w-2 h-2 rounded-full bg-red-300/60 dark:bg-red-400/40 shadow-[0_0_20px_rgba(239,68,68,0.5)]"/>
      <div class="absolute top-64 left-24 w-1.5 h-1.5 rounded-full bg-amber-300/70 dark:bg-amber-400/40 shadow-[0_0_16px_rgba(251,191,36,0.5)]"/>
      <div class="absolute bottom-40 right-32 w-2.5 h-2.5 rounded-full bg-rose-300/70 dark:bg-rose-400/40 shadow-[0_0_18px_rgba(251,113,133,0.5)]"/>
    </div>
    <div class="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-16">
        <h1 class="text-4xl md:text-5xl font-bold text-gray-800 dark:text-gray-100 font-serif mb-4 flex justify-center items-center gap-3">
          绯想天群史
        </h1>
        <p class="text-gray-500 dark:text-gray-400 italic max-w-2xl mx-auto">
          记录我们一路走来的点点滴滴。从最初的几人小群，到如今的幻想乡大家庭。
        </p>
        <div class="w-24 h-1 bg-red-400 mx-auto mt-6 rounded-full"/>
      </div>

      <div v-if="loading" class="text-center py-20 text-gray-400 dark:text-gray-300">
        <div class="animate-spin text-3xl mb-2">⏳</div>
        <p>正在回溯时间...</p>
      </div>
      <div v-else-if="failed" class="text-center py-20 text-red-500">
        <p class="font-bold">后端连接异常，请联系管理员Taropoi</p>
        <button type="button" class="club-text-link mt-4" @click="refresh()">重新加载</button>
      </div>

      <div v-else ref="timeline" class="relative">
        <div class="absolute left-8 md:left-1/2 top-0 bottom-0 w-1 bg-gray-200 dark:bg-slate-800 transform md:-translate-x-1/2"/>

        <div class="space-y-12">
          <div
            v-for="(event, index) in entries"
            :id="historyAnchor(index)"
            :key="event.id"
            :data-history-index="index"
            class="relative flex flex-col md:flex-row items-center md:justify-between group scroll-mt-24"
          >
            <div
              :class="[
                'hidden md:block w-5/12',
                index % 2 === 0 ? 'order-1' : 'order-3',
              ]"
            />
            <div class="absolute left-8 md:left-1/2 transform -translate-x-1/2 w-8 h-8 bg-red-500 rounded-full border-4 border-white dark:border-slate-900 shadow-md z-10 flex items-center justify-center order-2">
              <div class="w-2 h-2 bg-white dark:bg-slate-200 rounded-full"/>
            </div>

            <div
              :class="[
                'w-[calc(100%-4rem)] ml-16 md:ml-0 md:w-5/12 bg-white/95 dark:bg-slate-900/90 backdrop-blur-md p-8 md:p-10 rounded-2xl shadow-md hover:shadow-xl border border-gray-100/80 dark:border-slate-800/80 transition-all duration-300 relative',
                index % 2 === 0
                  ? 'md:order-3 md:text-left'
                  : 'md:order-1 md:text-right',
              ]"
            >
              <div
                class="flex items-center gap-3 mb-4"
                :class="index % 2 === 0 ? '' : 'md:justify-end'"
              >
                <span class="inline-flex items-center gap-1 px-3 py-1 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-200 text-xs font-bold rounded-full border border-red-100/70 dark:border-red-900/40 shadow-sm">
                  <span class="text-[10px]">🗓️</span> {{ event.date }}
                </span>
              </div>

              <h3 class="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-3 font-serif tracking-wide group-hover:text-red-600 transition">
                {{ event.title }}
              </h3>

              <a
                v-if="displayImageSource(event.image)"
                :href="displayImageSource(event.image) ?? '#'"
                class="block w-full mb-4 overflow-hidden rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 cursor-zoom-in"
                :aria-label="`查看大图：${event.title}`"
                @click.prevent="openLightbox(displayImageSource(event.image) ?? '')"
              >
                <ProgressiveImage
                  :src="displayImageSource(event.image) ?? ''"
                  :thumb="displayThumbSource(event.image) ?? undefined"
                  alt="History Image"
                  fit="contain"
                  wrapper-class="w-full"
                  img-class="w-full h-auto max-h-[400px] object-contain mx-auto hover:opacity-90 transition"
                />
              </a>

              <div class="mt-4 rounded-xl bg-gradient-to-br from-white via-white to-red-50/70 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 border border-red-100/80 dark:border-red-400/30 shadow-md shadow-red-100/50 dark:shadow-red-900/30 ring-1 ring-red-200/60 dark:ring-red-400/30 p-4 md:p-5 relative overflow-hidden text-left">
                <div class="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-red-200/30 dark:bg-red-500/20 blur-2xl"/>
                <div class="absolute -bottom-10 -left-10 w-28 h-28 rounded-full bg-red-100/40 dark:bg-red-600/20 blur-2xl"/>
                <div class="history-description relative text-gray-700 dark:text-gray-200 leading-7 md:leading-8 text-[15px] md:text-base whitespace-pre-line break-words">
                  <SafeMarkdown :nodes="event.description" inherit-typography />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="months.length > 0"
          class="hidden lg:flex flex-col items-center gap-3 fixed right-6 top-1/2 -translate-y-1/2 z-30"
        >
          <div
            class="w-10 rounded-full bg-white/70 dark:bg-slate-900/70 border border-gray-200/70 dark:border-slate-700/70 backdrop-blur-md shadow-lg flex flex-col items-center justify-center py-3 relative"
            :style="{ height: `${railHeight}px` }"
          >
            <div class="absolute inset-3 rounded-full border border-dashed border-gray-200/60 dark:border-slate-700/60"/>
            <div class="flex flex-col gap-2 relative z-10">
              <a
                v-for="item in months"
                :key="item.month"
                :href="`#${historyAnchor(item.index)}`"
                class="w-3.5 h-3.5 rounded-full border transition"
                :class="
                  currentMonth === item.month
                    ? 'bg-red-500 border-red-400 scale-110 shadow-[0_0_10px_rgba(239,68,68,0.6)]'
                    : 'bg-gray-300/70 dark:bg-slate-700 border-gray-300/70 dark:border-slate-600 hover:bg-red-300'
                "
                :title="item.month"
                :aria-label="`跳转到 ${item.month}`"
                :aria-current="currentMonth === item.month ? 'true' : undefined"
                @click.prevent="scrollToMonth(item.index)"
              />
            </div>
          </div>
          <div class="px-3 py-1.5 text-xs rounded-full bg-white/80 dark:bg-slate-900/80 border border-gray-200/70 dark:border-slate-700/70 text-gray-500 dark:text-gray-300 shadow-sm backdrop-blur-md">
            {{ currentMonth || '月份' }}
          </div>
        </div>

        <div class="text-center mt-16 relative z-10">
          <span class="inline-block px-6 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-full text-gray-400 dark:text-gray-300 text-sm shadow-sm">
            Next Dream...
          </span>
        </div>
      </div>
    </div>

    <ImageLightbox
      v-model:open="lightboxOpen"
      :src="currentImage"
      alt="History Image"
    />
  </div>
</template>

<style>
.history-bg::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    radial-gradient(circle at 20% 10%, rgba(239, 68, 68, 0.1), transparent 45%),
    radial-gradient(circle at 80% 20%, rgba(251, 191, 36, 0.1), transparent 50%),
    radial-gradient(circle at 30% 80%, rgba(244, 63, 94, 0.1), transparent 50%);
  opacity: 0.8;
}

.history-bg::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(180deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0) 40%),
    radial-gradient(rgba(148, 163, 184, 0.25) 1px, transparent 1px);
  background-size: auto, 18px 18px;
  opacity: 0.35;
}

.dark .history-bg::after {
  background-image:
    linear-gradient(180deg, rgba(2, 6, 23, 0.7) 0%, rgba(2, 6, 23, 0) 40%),
    radial-gradient(rgba(51, 65, 85, 0.35) 1px, transparent 1px);
  opacity: 0.25;
}

@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
</style>
