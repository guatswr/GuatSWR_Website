<script setup lang="ts">
/**
 * `/history` — Editorial Gensokyo Chronicle (`绯想天群史`).
 *
 * Server-sanitized descriptions are rendered via `SafeMarkdown`. The month rail
 * and year chapter tabs use native anchor links so navigation works before
 * hydration; scroll progress, active node resonance, and card reveal animations
 * attach on the client and clean up on unmount.
 */
import type { HistoryContentResponse, HistoryDisplayEntry } from '#shared/content'
import { usePublicPageSeo } from '~/composables/usePublicPageSeo'
import {
  formatHistoryOrdinal,
  historyAnchor,
  monthItems,
  monthKey,
  yearItems,
  yearKey,
} from '~/utils/history'
import { displayImageSource, displayThumbSource } from '~/utils/public-image'
import '~/assets/css/history-touch.css'

const { data, error, status, refresh } = await useFetch<HistoryContentResponse>('/api/content/history', {
  key: 'public-history',
  default: (): HistoryContentResponse => ({ items: [] }),
})

if (import.meta.server && error.value) setResponseStatus(502)

const entries = computed<readonly HistoryDisplayEntry[]>(() => data.value.items)
const months = computed(() => monthItems(entries.value))
const years = computed(() => yearItems(entries.value))

const currentMonth = ref(months.value[0]?.month ?? '')
const hoveredBookmarkYear = ref<string | null>(null)
const activeIndex = ref(0)
const hoveredIndex = ref<number | null>(null)
const spinePercent = ref(0)
const revealedSet = ref<Set<number>>(new Set([0]))
const motionReady = ref(false)
const pageEntered = ref(false)
// Default to readable touch surfaces in SSR; pointer choreography opts in on mount.
const touchMode = ref(true)
const displayedTotal = ref(entries.value.length)
let totalFrame: number | null = null

const animateTotalCount = (target: number): void => {
  if (typeof window === 'undefined') {
    displayedTotal.value = target
    return
  }
  if (totalFrame !== null) {
    window.cancelAnimationFrame(totalFrame)
    totalFrame = null
  }
  if (target <= 0) {
    displayedTotal.value = 0
    return
  }
  const duration = 680
  const startTime = performance.now()
  displayedTotal.value = 0
  const step = (now: number): void => {
    const elapsed = now - startTime
    const t = Math.min(1, Math.max(0, elapsed / duration))
    const eased = 1 - Math.pow(1 - t, 3)
    displayedTotal.value = Math.round(target * eased)
    if (t < 1) {
      totalFrame = window.requestAnimationFrame(step)
    }
    else {
      displayedTotal.value = target
      totalFrame = null
    }
  }
  totalFrame = window.requestAnimationFrame(step)
}

const focusedIndex = computed(() => hoveredIndex.value ?? activeIndex.value)
const activeYear = computed(() => {
  const fromMonth = currentMonth.value.slice(0, 4)
  if (/^\d{4}$/.test(fromMonth)) return fromMonth
  return yearKey(entries.value[activeIndex.value]?.date) || (years.value[0]?.year ?? '')
})
const expandedBookmarkYear = computed(() => hoveredBookmarkYear.value ?? activeYear.value)
const activeChapterIndex = computed(() => years.value.findIndex(chapter => chapter.year === activeYear.value))
const previousChapter = computed(() => years.value[activeChapterIndex.value - 1])
const nextChapter = computed(() => years.value[activeChapterIndex.value + 1])
const touchDockVisible = ref(false)

const loading = computed(() => status.value === 'pending')
const failed = computed(() => Boolean(error.value))

/** True when `index` is the first entry of a 4-digit year chapter. */
const isYearStart = (index: number): boolean => {
  const current = yearKey(entries.value[index]?.date)
  if (!current) return false
  if (index === 0) return true
  return yearKey(entries.value[index - 1]?.date) !== current
}

const yearChapterMeta = (index: number): { year: string, count: number } | null => {
  const year = yearKey(entries.value[index]?.date)
  if (!year) return null
  const found = years.value.find(item => item.year === year)
  return { year, count: found?.count ?? 1 }
}

const CHINESE_MONTH_NAMES = [
  '',
  '一月',
  '二月',
  '三月',
  '四月',
  '五月',
  '六月',
  '七月',
  '八月',
  '九月',
  '十月',
  '十一月',
  '十二月',
] as const

const formatCounterWatermark = (date: string | undefined): { ym: string, monthLabel: string, dayLabel: string } => {
  const raw = (date ?? '').trim()
  const match = raw.match(/^(\d{4})[-./](\d{1,2})(?:[-./](\d{1,2}))?/)
  if (!match) return { ym: raw, monthLabel: '群史纪事', dayLabel: '' }
  const year = match[1] ?? ''
  const mNum = Number(match[2])
  const monthPadded = String(mNum).padStart(2, '0')
  const dayPadded = match[3] ? `${String(Number(match[3])).padStart(2, '0')}日` : ''
  const monthName = CHINESE_MONTH_NAMES[mNum] ?? `${monthPadded}月`
  return {
    ym: `${year} · ${monthPadded}`,
    monthLabel: `${monthName}纪`,
    dayLabel: dayPadded,
  }
}

// --- Lightbox -------------------------------------------------------------
const lightboxOpen = ref(false)
const currentImage = ref('')
const openLightbox = (src: string): void => {
  currentImage.value = src
  lightboxOpen.value = true
}

// --- Timeline scroll & reveal ---------------------------------------------
const timeline = ref<HTMLElement | null>(null)
const ambient = ref<HTMLElement | null>(null)
const spineFill = ref<HTMLElement | null>(null)
const dockProgress = ref<HTMLElement | null>(null)
let revealObserver: IntersectionObserver | null = null
let contentRevealObserver: IntersectionObserver | null = null
let contentInView = new WeakSet<HTMLElement>()
let ticking = false
let frame: number | null = null
let touchFocusTimer: number | null = null
let touchMedia: MediaQueryList | null = null
let touchContactActive = false
let jumpObserver: ResizeObserver | null = null
let jumpTimer: number | null = null
let touchJump: { index: number, settled: boolean } | null = null

const cancelTouchJump = (): void => {
  jumpObserver?.disconnect()
  jumpObserver = null
  if (jumpTimer !== null) window.clearTimeout(jumpTimer)
  jumpTimer = null
  touchJump = null
}

const alignTouchJump = (): void => {
  if (!touchJump?.settled || touchContactActive) return
  const target = timeline.value?.querySelector<HTMLElement>(`[data-history-index="${touchJump.index}"]`)
  if (!target) return
  const difference = target.getBoundingClientRect().top - window.innerHeight * 0.24
  if (Math.abs(difference) > 2) window.scrollBy({ top: difference, behavior: 'instant' })
}

const setTouchMode = (touch: boolean): void => {
  const changed = touchMode.value !== touch
  touchMode.value = touch
  hoveredIndex.value = null
  if (changed && pageEntered.value) void nextTick(initContentReveals)
}

const syncTouchMode = (): void => setTouchMode(touchMedia?.matches ?? true)

const onStagePointerDown = (event: PointerEvent): void => {
  cancelTouchJump()
  if (event.pointerType === 'touch') setTouchMode(true)
  else if (event.pointerType === 'mouse' && !touchMedia?.matches) setTouchMode(false)
}

const clearTouchFocus = (): void => {
  if (touchFocusTimer !== null) window.clearTimeout(touchFocusTimer)
  touchFocusTimer = null
}

const scheduleTouchFocus = (): void => {
  clearTouchFocus()
  touchFocusTimer = window.setTimeout(() => {
    touchFocusTimer = null
    if (!touchContactActive) {
      if (touchJump) touchJump.settled = true
      alignTouchJump()
      updateFromViewport()
    }
  }, 120)
}

const onTouchStart = (): void => {
  cancelTouchJump()
  touchContactActive = true
  clearTouchFocus()
}

const onTouchEnd = (event: TouchEvent): void => {
  touchContactActive = event.touches.length > 0
  if (touchMode.value && !touchContactActive) scheduleTouchFocus()
}

const onEntryPointerEnter = (event: PointerEvent, index: number): void => {
  // A touch's compatibility mouse events must not pin the reading focus.
  if (!touchMode.value && event.pointerType === 'mouse') hoveredIndex.value = index
}

const updateSpineProgress = (progress: number, updateLabel: boolean): void => {
  // Progress only touches decorative surfaces. During a touch gesture, the
  // bookmark's hidden percentage label doesn't need to trigger a Vue render.
  ambient.value?.style.setProperty('--spine-progress', String(progress))
  if (spineFill.value) spineFill.value.style.transform = `scaleY(${progress})`
  if (dockProgress.value) dockProgress.value.style.transform = `scaleX(${progress})`
  if (updateLabel) spinePercent.value = Math.round(progress * 100)
}

const updateTimelineProgress = (updateLabel = true): void => {
  if (!timeline.value) return
  const viewportH = window.innerHeight
  const rect = timeline.value.getBoundingClientRect()
  const total = Math.max(1, rect.height - viewportH * 0.35)
  const passed = viewportH * 0.36 - rect.top
  updateSpineProgress(Math.min(1, Math.max(0.03, passed / total)), updateLabel)
  touchDockVisible.value = rect.top < viewportH * 0.28 && rect.bottom > viewportH * 0.22
}

const monthElements = (): HTMLElement[] =>
  timeline.value ? Array.from(timeline.value.querySelectorAll<HTMLElement>('[data-history-index]')) : []

const setActiveFromIndex = (index: number): void => {
  if (!Number.isFinite(index) || index < 0) return
  activeIndex.value = index
  const key = monthKey(entries.value[index]?.date)
  if (key) currentMonth.value = key
}

const updateFromViewport = (updateFocus = true): void => {
  const elements = monthElements()
  if (elements.length === 0) return
  const bounds = elements.map(element => ({ element, rect: element.getBoundingClientRect() }))
  const viewportH = window.innerHeight
  const anchor = viewportH * 0.36
  const scrollTop = window.scrollY || document.documentElement.scrollTop
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - viewportH)

  let bestIndex = 0
  if (scrollTop <= 16) {
    bestIndex = 0
  }
  else if (maxScroll > 0 && scrollTop >= maxScroll - 24) {
    bestIndex = elements.length - 1
  }
  else {
    let bestDistance = Number.POSITIVE_INFINITY
    for (const { element, rect } of bounds) {
      const idx = Number(element.dataset.historyIndex)
      if (!Number.isFinite(idx)) continue

      const distance = rect.top <= anchor && rect.bottom >= anchor
        ? Math.abs((rect.top + Math.min(rect.height * 0.35, 96)) - anchor) * 0.1
        : Math.min(Math.abs(rect.top - anchor), Math.abs(rect.bottom - anchor))

      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = idx
      }
    }
  }

  for (const { element, rect } of bounds) {
    if (rect.top < viewportH * 0.9) {
      const idx = Number(element.dataset.historyIndex)
      if (Number.isFinite(idx) && !revealedSet.value.has(idx)) {
        revealedSet.value.add(idx)
      }
    }
  }

  if (updateFocus) setActiveFromIndex(bestIndex)

  updateTimelineProgress(updateFocus)
}

const disconnectObservers = (): void => {
  revealObserver?.disconnect()
  revealObserver = null
  contentRevealObserver?.disconnect()
  contentRevealObserver = null
  contentInView = new WeakSet<HTMLElement>()
}

const revealContent = (element: HTMLElement): void => {
  if (!touchMode.value || !pageEntered.value
    || element.dataset.revealState !== 'pending' || !contentInView.has(element)) return
  if (element.dataset.historyReveal === 'image'
    && element.querySelector<HTMLElement>('.progressive-image')?.dataset.imageState !== 'ready') return
  element.dataset.revealState = 'visible'
  contentRevealObserver?.unobserve(element)
}

const onContentImageReady = (index: number): void => {
  const element = timeline.value?.querySelector<HTMLElement>(`[data-history-index="${index}"] [data-history-reveal="image"]`)
  if (element) revealContent(element)
}

const initContentReveals = (): void => {
  contentRevealObserver?.disconnect()
  contentRevealObserver = null
  contentInView = new WeakSet<HTMLElement>()
  if (!touchMode.value || !pageEntered.value || typeof IntersectionObserver === 'undefined') return

  contentRevealObserver = new IntersectionObserver((records) => {
    for (const record of records) {
      const element = record.target as HTMLElement
      if (!record.isIntersecting) {
        contentInView.delete(element)
        continue
      }
      contentInView.add(element)
      revealContent(element)
    }
  }, { rootMargin: '0px 0px -16% 0px', threshold: 0 })

  for (const element of timeline.value?.querySelectorAll<HTMLElement>('[data-history-reveal]') ?? []) {
    if (element.dataset.revealState === 'visible') continue
    // Include the first view. Each piece plays inside the viewport, and photos
    // wait for decoded pixels rather than spending their entrance on a poster.
    element.dataset.revealState = 'pending'
    contentRevealObserver.observe(element)
  }
}

const initObservers = (): void => {
  disconnectObservers()
  if (typeof IntersectionObserver === 'undefined') return
  const elements = monthElements()

  revealObserver = new IntersectionObserver((records) => {
    for (const record of records) {
      if (!record.isIntersecting) continue
      const idx = Number((record.target as HTMLElement).dataset.historyIndex)
      if (Number.isFinite(idx)) {
        revealedSet.value.add(idx)
        revealObserver?.unobserve(record.target)
      }
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 })

  for (const element of elements) {
    revealObserver.observe(element)
  }
  initContentReveals()
}

const onScroll = (): void => {
  if (hoveredBookmarkYear.value !== null) {
    hoveredBookmarkYear.value = null
  }
  if (touchMode.value) {
    // Finger scrolling advances progress; reading focus settles afterwards.
    scheduleTouchFocus()
  }
  if (ticking) return
  ticking = true
  frame = window.requestAnimationFrame(() => {
    frame = null
    ticking = false
    if (touchMode.value && revealObserver) {
      // IntersectionObserver handles reveals without measuring every card on
      // every frame. The full scan runs after the gesture, or as a fallback
      // when the browser has no observer support.
      updateTimelineProgress(false)
    }
    else updateFromViewport(!touchMode.value)
  })
}

const onResize = (): void => {
  // The observer follows viewport changes itself. Android's collapsing browser
  // toolbar can resize the viewport during a fling; keep that path light too.
  const updateFocus = touchFocusTimer === null && !touchContactActive
  if (touchMode.value && !updateFocus && revealObserver) updateTimelineProgress(false)
  else updateFromViewport(updateFocus)
}

const scrollToEntry = (index: number): void => {
  cancelTouchJump()
  clearTouchFocus()
  hoveredBookmarkYear.value = null
  revealedSet.value.add(index)
  setActiveFromIndex(index)
  const target = timeline.value?.querySelector<HTMLElement>(`[data-history-index="${index}"]`)
  if (!target) return
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const rect = target.getBoundingClientRect()
  const targetTop = Math.max(0, window.scrollY + rect.top - window.innerHeight * 0.24)
  if (touchMode.value) {
    // Lazy images along a long jump can resize the timeline after scrolling.
    // Briefly retain the requested anchor, then release it; a new gesture
    // cancels this immediately so reading never fights the user's finger.
    touchJump = { index, settled: false }
    if (typeof ResizeObserver !== 'undefined' && timeline.value) {
      jumpObserver = new ResizeObserver(alignTouchJump)
      jumpObserver.observe(timeline.value)
    }
    jumpTimer = window.setTimeout(cancelTouchJump, 2200)
    scheduleTouchFocus()
  }
  window.scrollTo({ top: targetTop, behavior: reduced ? 'auto' : 'smooth' })
}

const scrollToTop = (): void => {
  if (typeof window === 'undefined') return
  cancelTouchJump()
  hoveredBookmarkYear.value = null
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
}

watch(entries, async (next) => {
  displayedTotal.value = next.length
  if (typeof window === 'undefined') return
  await nextTick()
  initObservers()
  updateFromViewport()
})

onMounted(() => {
  touchMedia = window.matchMedia('(hover: none), (pointer: coarse)')
  syncTouchMode()
  if (!touchMode.value) [1, 2].forEach(index => revealedSet.value.add(index))
  touchMedia.addEventListener('change', syncTouchMode)
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced) {
    entries.value.forEach((_entry, idx) => revealedSet.value.add(idx))
    displayedTotal.value = entries.value.length
  }
  else {
    motionReady.value = true
    pageEntered.value = true
    animateTotalCount(entries.value.length)
  }
  initObservers()
  updateFromViewport()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize)
  window.addEventListener('touchstart', onTouchStart, { passive: true })
  window.addEventListener('touchend', onTouchEnd, { passive: true })
  window.addEventListener('touchcancel', onTouchEnd, { passive: true })
  window.addEventListener('wheel', cancelTouchJump, { passive: true })
})

onBeforeUnmount(() => {
  cancelTouchJump()
  disconnectObservers()
  clearTouchFocus()
  touchMedia?.removeEventListener('change', syncTouchMode)
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('touchstart', onTouchStart)
  window.removeEventListener('touchend', onTouchEnd)
  window.removeEventListener('touchcancel', onTouchEnd)
  window.removeEventListener('wheel', cancelTouchJump)
  if (frame !== null) window.cancelAnimationFrame(frame)
  if (totalFrame !== null) window.cancelAnimationFrame(totalFrame)
  frame = null
  totalFrame = null
  ticking = false
})

usePublicPageSeo({
  title: '绯想天群史',
  description: '记录我们一路走来的点点滴滴。从最初的几人小群，到如今的幻想乡大家庭。',
  path: '/history',
})
</script>

<template>
  <div
    class="club-paper history-stage min-h-screen font-sans relative"
    :class="{ 'is-entered': pageEntered }"
    :data-history-motion="touchMode ? 'touch' : 'pointer'"
    @pointerdown.capture="onStagePointerDown"
  >
    <div ref="ambient" class="history-ambient" aria-hidden="true">
      <div class="history-glow history-glow-vermilion" />
      <div class="history-glow history-glow-sky" />
      <div class="history-glow history-glow-amber" />

      <svg class="history-astrolabe is-primary" viewBox="0 0 400 400" fill="none">
        <circle cx="200" cy="200" r="186" stroke="currentColor" stroke-width="0.75" stroke-dasharray="4 6" />
        <circle cx="200" cy="200" r="168" stroke="currentColor" stroke-width="0.75" />
        <polygon
          points="200,32 319,81 368,200 319,319 200,368 81,319 32,200 81,81"
          stroke="currentColor"
          stroke-width="0.85"
        />
        <rect x="96" y="96" width="208" height="208" stroke="currentColor" stroke-width="0.7" />
        <rect x="96" y="96" width="208" height="208" transform="rotate(45 200 200)" stroke="currentColor" stroke-width="0.7" />
        <g stroke="currentColor" stroke-width="0.75" opacity="0.85">
          <polygon points="200,52 212,118 200,142 188,118" />
          <polygon points="200,52 212,118 200,142 188,118" transform="rotate(60 200 200)" />
          <polygon points="200,52 212,118 200,142 188,118" transform="rotate(120 200 200)" />
          <polygon points="200,52 212,118 200,142 188,118" transform="rotate(180 200 200)" />
          <polygon points="200,52 212,118 200,142 188,118" transform="rotate(240 200 200)" />
          <polygon points="200,52 212,118 200,142 188,118" transform="rotate(300 200 200)" />
        </g>
        <circle cx="200" cy="200" r="102" stroke="currentColor" stroke-width="0.75" stroke-dasharray="2 5" />
        <circle cx="200" cy="200" r="46" stroke="currentColor" stroke-width="0.85" />
        <line x1="200" y1="14" x2="200" y2="146" stroke="currentColor" stroke-width="0.5" stroke-dasharray="3 6" />
        <line x1="200" y1="254" x2="200" y2="386" stroke="currentColor" stroke-width="0.5" stroke-dasharray="3 6" />
        <line x1="14" y1="200" x2="146" y2="200" stroke="currentColor" stroke-width="0.5" stroke-dasharray="3 6" />
        <line x1="254" y1="200" x2="386" y2="200" stroke="currentColor" stroke-width="0.5" stroke-dasharray="3 6" />
        <text x="200" y="216" text-anchor="middle" class="history-astrolabe-nine">⑨</text>
      </svg>

      <svg class="history-astrolabe is-secondary" viewBox="0 0 320 320" fill="none">
        <circle cx="160" cy="160" r="146" stroke="currentColor" stroke-width="0.75" stroke-dasharray="3 6" />
        <polygon
          points="160,22 280,91 280,229 160,298 40,229 40,91"
          stroke="currentColor"
          stroke-width="0.8"
        />
        <g stroke="currentColor" stroke-width="0.9">
          <polygon points="160,36 171,98 160,122 149,98" transform="rotate(-68 160 160)" />
          <polygon points="160,30 172,96 160,122 148,96" transform="rotate(-38 160 160)" />
          <polygon points="160,40 170,100 160,122 150,100" transform="rotate(-10 160 160)" />
          <polygon points="160,40 170,100 160,122 150,100" transform="rotate(10 160 160)" />
          <polygon points="160,30 172,96 160,122 148,96" transform="rotate(38 160 160)" />
          <polygon points="160,36 171,98 160,122 149,98" transform="rotate(68 160 160)" />
        </g>
        <rect x="92" y="92" width="136" height="136" transform="rotate(45 160 160)" stroke="currentColor" stroke-width="0.7" />
        <circle cx="160" cy="160" r="42" stroke="currentColor" stroke-width="0.8" />
        <text x="160" y="174" text-anchor="middle" class="history-astrolabe-nine is-small">⑨</text>
      </svg>

      <span class="history-mote history-mote-1" />
      <span class="history-mote history-mote-2" />
      <span class="history-mote history-mote-3" />
      <span class="history-mote history-mote-4" />
      <span class="history-nine-mote history-nine-mote-1">⑨</span>
      <span class="history-nine-mote history-nine-mote-2">❄</span>
      <span class="history-nine-mote history-nine-mote-3">⑨</span>
    </div>

    <div class="relative z-10 club-container py-6 sm:py-10">
      <header class="history-header">
        <div class="history-header-main">
          <div class="history-title-group">
            <span class="history-seal-stamp" aria-hidden="true">史纪</span>
            <div class="history-title-copy">
              <h1 class="font-serif text-2xl font-semibold tracking-wide text-slate-900 sm:text-3xl dark:text-slate-100">
                绯想天群史
              </h1>
              <p class="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                记录我们一路走来的点点滴滴。从最初的几人小群，到如今的幻想乡大家庭。
              </p>
            </div>
          </div>

          <div v-if="entries.length > 0" class="history-total-badge" aria-label="已收录群史条目数">
            <span class="history-total-label">收录纪事</span>
            <span class="history-total-count">{{ displayedTotal }}</span>
          </div>
        </div>

        <nav
          v-if="years.length > 0"
          aria-label="按年份跳转群史"
          class="history-year-bar"
        >
          <a
            v-for="(chapter, tabIdx) in years"
            :key="chapter.year"
            :href="`#${historyAnchor(chapter.index)}`"
            class="history-year-tab"
            :class="{ 'is-active': activeYear === chapter.year }"
            :style="{ '--year-tab-delay': `${tabIdx * 65 + 220}ms` }"
            :aria-current="activeYear === chapter.year ? 'location' : undefined"
            @click.prevent="scrollToEntry(chapter.index)"
          >
            <span class="history-year-diamond" aria-hidden="true" />
            <span class="history-year-label">{{ chapter.year }} 年卷</span>
            <span class="history-year-count">{{ chapter.count }}</span>
          </a>
        </nav>
      </header>

      <div
        v-if="loading"
        class="py-20 text-center text-sm text-slate-600 dark:text-slate-300"
        role="status"
      >
        正在翻阅幻想乡编年史…
      </div>

      <div
        v-else-if="failed"
        class="club-empty text-center text-red-700 dark:text-red-300"
        role="alert"
      >
        <p class="font-semibold">后端连接异常，请联系管理员Taropoi</p>
        <button type="button" class="club-text-link mt-4" @click="refresh()">
          重新加载
        </button>
      </div>

      <div
        v-else
        class="history-layout"
      >
        <div
          ref="timeline"
          class="history-timeline relative min-w-0"
        >
          <div class="history-spine" aria-hidden="true">
            <div class="history-spine-track" />
            <div ref="spineFill" class="history-spine-progress" />
          </div>

          <div class="space-y-12">
            <div
              v-for="(event, index) in entries"
              :id="historyAnchor(index)"
              :key="event.id"
              :data-history-index="index"
              class="history-entry group scroll-mt-24"
              :class="{
                'is-even': index % 2 === 0,
                'is-odd': index % 2 !== 0,
                'is-active': focusedIndex === index,
                'is-passed': index <= activeIndex,
                'is-unrevealed': motionReady && !revealedSet.has(index),
                'is-revealed': !motionReady || revealedSet.has(index),
              }"
              :style="{ '--entry-delay': `${index < 3 ? 220 + index * 140 : 0}ms` }"
              @pointerenter="onEntryPointerEnter($event, index)"
              @pointerleave="hoveredIndex = null"
            >
              <div
                v-if="isYearStart(index) && yearChapterMeta(index)"
                class="history-year-divider"
              >
                <div class="history-year-banner" data-history-reveal="year">
                  <span class="history-year-banner-seal" aria-hidden="true">卷</span>
                  <span class="history-year-banner-title">{{ yearChapterMeta(index)?.year }} 年纪</span>
                  <span class="history-year-banner-meta">共 {{ yearChapterMeta(index)?.count }} 录</span>
                </div>
              </div>

              <div class="history-entry-row relative flex flex-col md:flex-row items-start md:items-center md:justify-between">
                <div
                  aria-hidden="true"
                  :class="[
                    'history-counter hidden md:flex md:w-[45%]',
                    index % 2 === 0 ? 'md:order-1 is-left' : 'md:order-3 is-right',
                  ]"
                >
                  <div class="history-counter-inner">
                    <div class="history-counter-ym">
                      {{ formatCounterWatermark(event.date).ym }}
                    </div>
                    <div class="history-counter-sub">
                      <span class="history-counter-diamond" />
                      <span>{{ formatCounterWatermark(event.date).monthLabel }}</span>
                      <template v-if="formatCounterWatermark(event.date).dayLabel">
                        <span class="history-counter-dot">·</span>
                        <span>{{ formatCounterWatermark(event.date).dayLabel }}</span>
                      </template>
                      <span class="history-counter-rule" />
                    </div>
                  </div>
                </div>

                <div
                  class="history-node order-2"
                  aria-hidden="true"
                >
                  <span class="history-node-ripple" />
                  <span class="history-node-ring" />
                  <span class="history-node-core" />
                </div>

                <div
                  :class="[
                    'history-card w-[calc(100%-3.5rem)] ml-14 md:ml-0 md:w-[45%] relative',
                    index % 2 === 0 ? 'md:order-3' : 'md:order-1',
                  ]"
                >
                  <span
                    class="history-connector hidden md:block"
                    :class="index % 2 === 0 ? 'is-right' : 'is-left'"
                    aria-hidden="true"
                  />

                  <div class="history-card-meta" data-history-reveal="date">
                    <div class="history-date-badge">
                      <span class="history-date-seal" aria-hidden="true">记</span>
                      <time class="history-date-text">{{ event.date }}</time>
                    </div>
                    <span class="history-serial" aria-hidden="true">
                      第 {{ formatHistoryOrdinal(index) }} 录
                    </span>
                  </div>

                  <h2 class="history-card-title" data-history-reveal="title">
                    {{ event.title }}
                  </h2>

                  <a
                    v-if="displayImageSource(event.image)"
                    :href="displayImageSource(event.image) ?? '#'"
                    class="history-figure"
                    data-history-reveal="image"
                    :aria-label="`查看大图：${event.title}`"
                    @click.prevent="openLightbox(displayImageSource(event.image) ?? '')"
                  >
                    <ProgressiveImage
                      :src="displayImageSource(event.image) ?? ''"
                      :thumb="displayThumbSource(event.image) ?? undefined"
                      :alt="event.title"
                      fit="contain"
                      :reveal-mode="touchMode ? 'uncover' : 'fade'"
                      wrapper-class="w-full"
                      img-class="history-figure-img w-full h-auto max-h-[380px] object-contain mx-auto"
                      @ready="onContentImageReady(index)"
                    />
                    <span class="history-figure-hint" aria-hidden="true">点击展开画卷</span>
                  </a>

                  <div class="history-prose-box" data-history-reveal="body">
                    <span class="history-prose-watermark" aria-hidden="true">⑨</span>
                    <div class="history-description relative text-slate-700 dark:text-slate-200 leading-7 md:leading-8 text-[15px] md:text-base whitespace-pre-line break-words">
                      <SafeMarkdown :nodes="event.description" inherit-typography />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <footer class="history-coda">
            <div class="history-coda-seal">
              <span class="history-coda-stamp" aria-hidden="true">续</span>
              <span class="history-coda-text">未完待续 · 幻想乡的故事仍在书写</span>
            </div>
          </footer>
        </div>

        <aside
          v-if="years.length > 0"
          aria-label="群史卷目书签"
          class="history-bookmark hidden lg:flex"
          @mouseleave="hoveredBookmarkYear = null"
        >
          <div class="history-bookmark-head">
            <span class="history-bookmark-seal" aria-hidden="true">卷目</span>
            <span class="history-bookmark-progress">{{ spinePercent }}%</span>
          </div>

          <div class="history-bookmark-tree">
            <div
              v-for="(chapter, bmIdx) in years"
              :key="chapter.year"
              class="history-bookmark-group"
              :class="{
                'is-active': activeYear === chapter.year,
                'is-expanded': expandedBookmarkYear === chapter.year,
              }"
              :style="{ '--bm-delay': `${bmIdx * 60 + 320}ms` }"
              @mouseenter="hoveredBookmarkYear = chapter.year"
            >
              <a
                :href="`#${historyAnchor(chapter.index)}`"
                class="history-bookmark-year"
                :aria-current="activeYear === chapter.year ? 'true' : undefined"
                @click.prevent="scrollToEntry(chapter.index)"
              >
                <span class="history-bookmark-node" aria-hidden="true" />
                <span class="history-bookmark-year-text">{{ chapter.year }}</span>
                <span class="history-bookmark-year-count">{{ chapter.count }}</span>
              </a>

              <div
                v-if="chapter.months.length > 0"
                class="history-bookmark-months-wrap"
                :class="{ 'is-open': expandedBookmarkYear === chapter.year }"
              >
                <div class="history-bookmark-months">
                  <a
                    v-for="m in chapter.months"
                    :key="m.month"
                    :href="`#${historyAnchor(m.index)}`"
                    class="history-bookmark-month"
                    :class="{ 'is-current': currentMonth === m.month }"
                    :title="m.month"
                    :aria-label="`跳转到 ${m.month}`"
                    :aria-current="currentMonth === m.month ? 'true' : undefined"
                    @click.prevent="scrollToEntry(m.index)"
                  >
                    <span class="history-bookmark-month-tick" aria-hidden="true" />
                    <span class="history-bookmark-month-label">{{ m.label }}</span>
                  </a>
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            class="history-bookmark-top"
            aria-label="回到卷首"
            @click="scrollToTop"
          >
            <span aria-hidden="true">↑</span>
            <span>回到卷首</span>
          </button>
        </aside>
      </div>
    </div>

    <nav
      v-if="years.length > 0 && !loading && !failed"
      class="history-touch-dock"
      :class="{ 'is-visible': touchMode && touchDockVisible && !lightboxOpen }"
      :inert="!touchMode || !touchDockVisible || lightboxOpen"
      aria-label="群史章节导航"
    >
      <button
        type="button"
        :disabled="!previousChapter"
        aria-label="上一年卷"
        @click="previousChapter && scrollToEntry(previousChapter.index)"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14 7-5 5 5 5" /></svg>
      </button>
      <div class="history-touch-dock-label">
        <Transition name="history-chapter" mode="out-in">
          <span :key="activeYear" class="history-touch-dock-year">{{ activeYear }} 年卷</span>
        </Transition>
        <span class="history-touch-dock-count">{{ activeIndex + 1 }} / {{ entries.length }}</span>
        <span class="history-touch-dock-track" aria-hidden="true"><span ref="dockProgress" /></span>
      </div>
      <button
        type="button"
        :disabled="!nextChapter"
        aria-label="下一年卷"
        @click="nextChapter && scrollToEntry(nextChapter.index)"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m10 7 5 5-5 5" /></svg>
      </button>
    </nav>

    <ImageLightbox
      v-model:open="lightboxOpen"
      :src="currentImage"
      alt="群史配图预览"
    />
  </div>
</template>

<style scoped>
.history-stage {
  --chronicle-vermilion: #a34e47;
  --chronicle-vermilion-soft: rgb(163 78 71 / 0.12);
  --chronicle-vermilion-tint: rgb(163 78 71 / 0.07);
  --chronicle-sky: #0369a1;
  --chronicle-sky-soft: rgb(3 105 161 / 0.12);
  --chronicle-paper-bg: #fbfbf8;
  --chronicle-card-bg: #ffffff;
  --chronicle-card-active-bg: #ffffff;
  --chronicle-subtle-bg: #f4f5f0;
  --chronicle-prose-bg: #fbfbf8;
  --chronicle-figure-bg: #f8fafc;
  --chronicle-bookmark-bg: rgb(251 251 248 / 0.94);
  --chronicle-border: #dce4e8;
  --chronicle-border-strong: #94a3b8;
  --chronicle-divider: #e2e8f0;
  --chronicle-divider-soft: #eef2f5;
  --chronicle-rule: #cbd5e1;
  --chronicle-spine-track: #dce4e8;
  --chronicle-node-idle: #94a3b8;
  --chronicle-ink-strong: #0f172a;
  --chronicle-ink-body: #334155;
  --chronicle-ink-secondary: #475569;
  --chronicle-ink-muted: #64748b;
  --chronicle-card-shadow: 0 10px 26px -18px rgb(15 23 42 / 0.14);
  --chronicle-card-active-shadow: 0 18px 36px -18px rgb(15 23 42 / 0.2);
  --chronicle-bookmark-shadow: 0 12px 28px -16px rgb(15 23 42 / 0.18);
  --chronicle-banner-shadow: 0 6px 18px -8px rgb(15 23 42 / 0.12);
}

:global(html.dark .history-stage) {
  --chronicle-vermilion: #f0a899;
  --chronicle-vermilion-soft: rgb(240 168 153 / 0.18);
  --chronicle-vermilion-tint: rgb(240 168 153 / 0.11);
  --chronicle-sky: #38bdf8;
  --chronicle-sky-soft: rgb(56 189 248 / 0.16);
  --chronicle-paper-bg: #101923;
  --chronicle-card-bg: #152231;
  --chronicle-card-active-bg: #19293b;
  --chronicle-subtle-bg: #131f2d;
  --chronicle-prose-bg: #101a25;
  --chronicle-figure-bg: #0d151f;
  --chronicle-bookmark-bg: rgb(21 34 49 / 0.94);
  --chronicle-border: #293847;
  --chronicle-border-strong: #4b6078;
  --chronicle-divider: #243447;
  --chronicle-divider-soft: #1f2f40;
  --chronicle-rule: #334155;
  --chronicle-spine-track: #26384b;
  --chronicle-node-idle: #64748b;
  --chronicle-ink-strong: #f1f5f9;
  --chronicle-ink-body: #cbd5e1;
  --chronicle-ink-secondary: #94a3b8;
  --chronicle-ink-muted: #94a3b8;
  --chronicle-card-shadow: 0 14px 30px -18px rgb(2 6 23 / 0.68);
  --chronicle-card-active-shadow: 0 20px 38px -16px rgb(2 6 23 / 0.8);
  --chronicle-bookmark-shadow: 0 14px 32px -16px rgb(2 6 23 / 0.72);
  --chronicle-banner-shadow: 0 8px 20px -8px rgb(2 6 23 / 0.65);
}

/* Two-column non-overlapping layout: timeline + dedicated right bookmark gutter */
.history-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
}

@media (min-width: 1024px) {
  .history-layout {
    grid-template-columns: minmax(0, 1fr) 6.25rem;
    gap: 2.25rem;
  }
}

/* Right-side Chronicle Margin Bookmark */
.history-bookmark {
  position: sticky;
  top: 6rem;
  align-self: start;
  z-index: 20;
  width: 6.25rem;
  flex-direction: column;
  padding: 0.75rem 0.75rem 0.625rem;
  border: 1px solid var(--chronicle-border);
  border-top: 2px solid var(--chronicle-vermilion);
  background-color: var(--chronicle-bookmark-bg);
  backdrop-filter: blur(10px);
  box-shadow: var(--chronicle-bookmark-shadow);
}

.history-bookmark-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 0.5rem;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid var(--chronicle-divider);
}

.history-bookmark-seal {
  padding: 0.1rem 0.3rem;
  border: 1px solid var(--chronicle-vermilion);
  background-color: var(--chronicle-vermilion-tint);
  color: var(--chronicle-vermilion);
  font-family: var(--club-serif);
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.history-bookmark-progress {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.6875rem;
  font-weight: 700;
  color: var(--chronicle-ink-secondary);
}

.history-bookmark-tree {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.history-bookmark-tree::before {
  content: '';
  position: absolute;
  left: 0.3125rem;
  top: 0.5rem;
  bottom: 0.5rem;
  width: 1px;
  background-color: var(--chronicle-rule);
}

.history-bookmark-group {
  position: relative;
}

.history-bookmark-year {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.25rem 0;
  color: var(--chronicle-ink-secondary);
  font-family: var(--club-serif);
  font-size: 0.8125rem;
  font-weight: 600;
  transition: color 200ms ease;
}

.history-bookmark-node {
  position: relative;
  z-index: 1;
  width: 0.4375rem;
  height: 0.4375rem;
  margin-left: 0.1rem;
  flex-shrink: 0;
  border: 1.5px solid var(--chronicle-node-idle);
  background-color: var(--chronicle-paper-bg);
  transform: rotate(45deg);
  transition:
    transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
    border-color 200ms ease,
    background-color 200ms ease;
}

.history-bookmark-group.is-active .history-bookmark-year,
.history-bookmark-year:hover {
  color: var(--chronicle-ink-strong);
}

.history-bookmark-group.is-active .history-bookmark-node,
.history-bookmark-year:hover .history-bookmark-node {
  border-color: var(--chronicle-vermilion);
  background-color: var(--chronicle-vermilion);
  transform: rotate(135deg) scale(1.15);
}

.history-bookmark-year-text {
  flex: 1;
  letter-spacing: 0.03em;
}

.history-bookmark-year-count {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.625rem;
  color: var(--chronicle-ink-muted);
}

.history-bookmark-months-wrap {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition:
    grid-template-rows 280ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 220ms ease;
}

.history-bookmark-months-wrap.is-open {
  grid-template-rows: 1fr;
  opacity: 1;
}

.history-bookmark-months {
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding-left: 0.75rem;
}

.history-bookmark-month {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.15rem 0.25rem;
  color: var(--chronicle-ink-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.6875rem;
  transition:
    color 180ms ease,
    transform 180ms ease;
}

.history-bookmark-month-tick {
  width: 0.35rem;
  height: 1px;
  background-color: var(--chronicle-rule);
  transition:
    width 200ms cubic-bezier(0.22, 1, 0.36, 1),
    background-color 180ms ease;
}

.history-bookmark-month:hover,
.history-bookmark-month.is-current {
  color: var(--chronicle-vermilion);
  font-weight: 700;
}

.history-bookmark-year:focus-visible,
.history-bookmark-month:focus-visible,
.history-bookmark-top:focus-visible,
.history-year-tab:focus-visible {
  outline: 2px solid var(--chronicle-vermilion);
  outline-offset: 2px;
}

.history-bookmark-month:hover .history-bookmark-month-tick,
.history-bookmark-month.is-current .history-bookmark-month-tick {
  width: 0.55rem;
  background-color: var(--chronicle-vermilion);
}

.history-bookmark-top {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  margin-top: 0.5rem;
  padding-top: 0.45rem;
  border-top: 1px solid var(--chronicle-divider);
  color: var(--chronicle-ink-secondary);
  font-family: var(--club-serif);
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: color 180ms ease;
}

.history-bookmark-top:hover {
  color: var(--chronicle-vermilion);
}

.history-ambient {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}

.history-ambient::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(rgb(148 163 184 / 0.22) 1px, transparent 1px),
    linear-gradient(90deg, rgb(148 163 184 / 0.06) 1px, transparent 1px);
  background-size: 24px 24px, 72px 72px;
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.78) 0%, rgba(0, 0, 0, 0.3) 100%);
}

:global(html.dark .history-ambient::before) {
  background-image:
    radial-gradient(rgb(71 85 105 / 0.3) 1px, transparent 1px),
    linear-gradient(90deg, rgb(51 65 85 / 0.12) 1px, transparent 1px);
}

/* Celestial Astrolabe / Octagonal Spell Rings */
.history-astrolabe {
  position: absolute;
  color: var(--chronicle-vermilion);
  opacity: 0.085;
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

:global(html.dark .history-astrolabe) {
  opacity: 0.11;
}

.history-astrolabe.is-primary {
  top: 4.5rem;
  right: -7rem;
  width: min(34rem, 52vw);
  height: min(34rem, 52vw);
  transform: rotate(calc(var(--spine-progress, 0) * 140deg));
}

.history-astrolabe.is-secondary {
  bottom: -6rem;
  left: -6rem;
  width: min(26rem, 44vw);
  height: min(26rem, 44vw);
  color: var(--chronicle-sky);
  transform: rotate(calc(var(--spine-progress, 0) * -110deg));
}

.history-astrolabe-nine {
  fill: currentColor;
  font-family: var(--club-serif);
  font-size: 46px;
  font-weight: 700;
  opacity: 0.9;
}

.history-astrolabe-nine.is-small {
  font-size: 40px;
}

.history-glow {
  position: absolute;
  border-radius: 9999px;
  filter: blur(72px);
  opacity: 0.45;
  animation: history-ambient-drift 14s ease-in-out infinite alternate;
}

.history-glow-vermilion {
  top: -5rem;
  left: -6rem;
  width: 24rem;
  height: 24rem;
  background: radial-gradient(circle, var(--chronicle-vermilion-soft), transparent 70%);
}

.history-glow-sky {
  top: 28%;
  right: -8rem;
  width: 28rem;
  height: 28rem;
  background: radial-gradient(circle, var(--chronicle-sky-soft), transparent 70%);
  animation-delay: -5s;
}

.history-glow-amber {
  bottom: 8%;
  left: 20%;
  width: 24rem;
  height: 24rem;
  background: radial-gradient(circle, rgb(217 119 6 / 0.12), transparent 70%);
  animation-delay: -9s;
}

.history-mote {
  position: absolute;
  width: 6px;
  height: 6px;
  transform: rotate(45deg);
  border: 1px solid var(--chronicle-vermilion);
  background: var(--chronicle-vermilion-soft);
  opacity: 0.35;
  animation: history-mote-float 10s ease-in-out infinite;
}

.history-mote-1 { top: 14%; left: 12%; animation-delay: 0s; }
.history-mote-2 { top: 38%; right: 14%; animation-delay: -3s; }
.history-mote-3 { top: 66%; left: 8%; animation-delay: -6s; }
.history-mote-4 { top: 82%; right: 18%; animation-delay: -1.5s; }

.history-nine-mote {
  position: absolute;
  font-family: var(--club-serif);
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--chronicle-sky);
  opacity: 0.16;
  animation: history-nine-float 12s ease-in-out infinite;
}

.history-nine-mote-1 { top: 22%; left: 6%; animation-delay: -1s; }
.history-nine-mote-2 { top: 54%; right: 8%; font-size: 1rem; animation-delay: -5s; }
.history-nine-mote-3 { top: 76%; left: 14%; animation-delay: -8s; }

/* Header & Year Bar */
.history-header {
  margin-bottom: 2.75rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid var(--chronicle-border);
  animation: history-header-enter 520ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
}

.history-header-main {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem 1.5rem;
}

.history-title-group {
  display: flex;
  align-items: flex-start;
  gap: 0.875rem;
}

.history-seal-stamp {
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  margin-top: 0.15rem;
  padding: 0.3rem 0.22rem;
  border: 1px solid var(--chronicle-vermilion);
  color: var(--chronicle-vermilion);
  background-color: var(--chronicle-vermilion-tint);
  font-family: var(--club-serif);
  font-size: 0.6875rem;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: 0.14em;
  writing-mode: vertical-rl;
  box-shadow: inset 0 0 0 2px var(--chronicle-vermilion-tint);
}

.history-total-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.35rem 0.75rem;
  border: 1px solid var(--chronicle-border);
  border-left: 2px solid var(--chronicle-vermilion);
  background-color: var(--chronicle-subtle-bg);
  font-size: 0.75rem;
}

.history-total-label {
  font-family: var(--club-serif);
  color: var(--chronicle-ink-secondary);
  font-weight: 600;
}

.history-total-count {
  padding-left: 0.5rem;
  border-left: 1px solid var(--chronicle-rule);
  color: var(--chronicle-ink-strong);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-weight: 700;
}

.history-year-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1.125rem;
}

.history-year-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.25rem;
  padding: 0.325rem 0.75rem;
  border: 1px solid var(--chronicle-border);
  border-top: 2px solid var(--chronicle-sky);
  background-color: var(--chronicle-subtle-bg);
  color: var(--chronicle-ink-body);
  font-size: 0.8125rem;
  transition:
    background-color 220ms ease,
    border-color 220ms ease,
    color 220ms ease,
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 220ms ease;
}

.history-year-tab:hover {
  background-color: var(--chronicle-card-active-bg);
  border-color: var(--chronicle-border-strong);
  border-top-color: var(--chronicle-vermilion);
  color: var(--chronicle-ink-strong);
  transform: translateY(-2px);
}

.history-year-tab.is-active {
  background-color: var(--chronicle-card-active-bg);
  border-color: var(--chronicle-vermilion);
  border-top: 2px solid var(--chronicle-vermilion);
  color: var(--chronicle-ink-strong);
  transform: translateY(-2px);
  box-shadow: 0 8px 18px -10px var(--chronicle-vermilion-soft);
}

.history-year-diamond {
  width: 0.375rem;
  height: 0.375rem;
  background-color: var(--chronicle-sky);
  transform: rotate(45deg);
  transition:
    transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
    background-color 220ms ease;
}

.history-year-tab:hover .history-year-diamond,
.history-year-tab.is-active .history-year-diamond {
  background-color: var(--chronicle-vermilion);
  transform: rotate(135deg) scale(1.25);
}

.history-year-label {
  font-family: var(--club-serif);
  font-weight: 600;
  letter-spacing: 0.04em;
}

.history-year-count {
  padding-left: 0.375rem;
  border-left: 1px solid var(--chronicle-rule);
  color: var(--chronicle-ink-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.6875rem;
  font-weight: 600;
}

/* Central Spine & Scroll Progress */
.history-spine {
  position: absolute;
  left: 1.5rem;
  top: 0;
  bottom: 0;
  width: 2px;
  transform: translateX(-50%);
  pointer-events: none;
}

@media (min-width: 768px) {
  .history-spine {
    left: 50%;
  }
}

.history-spine-track {
  position: absolute;
  inset: 0;
  background-color: var(--chronicle-spine-track);
}

.history-spine-progress {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    var(--chronicle-vermilion) 0%,
    var(--chronicle-sky) 92%,
    transparent 100%
  );
  transform: scaleY(0);
  transform-origin: top;
  transition: transform 140ms ease-out;
}

/* Year Chapter Banner on Timeline */
.history-year-divider {
  position: relative;
  z-index: 15;
  display: flex;
  justify-content: flex-start;
  margin-bottom: 1.75rem;
  padding-left: 0.25rem;
}

@media (min-width: 768px) {
  .history-year-divider {
    justify-content: center;
    padding-left: 0;
  }
}

.history-year-banner {
  display: inline-flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.375rem 0.9rem;
  border: 1px solid var(--chronicle-border);
  border-top: 2px solid var(--chronicle-vermilion);
  background-color: var(--chronicle-card-bg);
  box-shadow: var(--chronicle-banner-shadow);
}

.history-year-banner-seal {
  display: inline-grid;
  place-items: center;
  width: 1.25rem;
  height: 1.25rem;
  border: 1px solid var(--chronicle-vermilion);
  background-color: var(--chronicle-vermilion-tint);
  color: var(--chronicle-vermilion);
  font-family: var(--club-serif);
  font-size: 0.6875rem;
  font-weight: 700;
}

.history-year-banner-title {
  font-family: var(--club-serif);
  font-size: 0.9375rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--chronicle-ink-strong);
}

.history-year-banner-meta {
  padding-left: 0.5rem;
  border-left: 1px solid var(--chronicle-rule);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--chronicle-ink-secondary);
}

/* Opposite-side Chronicle Counter-Stamp */
.history-counter {
  align-items: center;
  pointer-events: none;
  user-select: none;
}

.history-counter.is-left {
  justify-content: flex-end;
  padding-right: 1.5rem;
  text-align: right;
}

.history-counter.is-right {
  justify-content: flex-start;
  padding-left: 1.5rem;
  text-align: left;
}

.history-counter-inner {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  opacity: 0.24;
  transition:
    opacity 360ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 360ms cubic-bezier(0.22, 1, 0.36, 1);
}

.history-counter.is-left .history-counter-inner {
  align-items: flex-end;
  transform: translateX(-6px);
}

.history-counter.is-right .history-counter-inner {
  align-items: flex-start;
  transform: translateX(6px);
}

.history-entry.is-active .history-counter-inner,
.history-entry:hover .history-counter-inner {
  opacity: 0.72;
  transform: translateX(0);
}

.history-counter-ym {
  font-family: var(--club-serif);
  font-size: clamp(1.5rem, 2.2vw, 2.15rem);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: 0.08em;
  color: var(--chronicle-ink-muted);
  transition: color 280ms ease;
}

.history-entry.is-active .history-counter-ym,
.history-entry:hover .history-counter-ym {
  color: var(--chronicle-vermilion);
}

.history-counter-sub {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-family: var(--club-serif);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--chronicle-ink-secondary);
}

.history-counter.is-left .history-counter-sub {
  flex-direction: row-reverse;
}

.history-counter-diamond {
  width: 0.35rem;
  height: 0.35rem;
  border: 1px solid var(--chronicle-vermilion);
  transform: rotate(45deg);
  transition: background-color 240ms ease;
}

.history-entry.is-active .history-counter-diamond,
.history-entry:hover .history-counter-diamond {
  background-color: var(--chronicle-vermilion);
}

.history-counter-dot {
  opacity: 0.6;
}

.history-counter-rule {
  width: 1.75rem;
  height: 1px;
  background-color: var(--chronicle-rule);
  transition:
    width 320ms cubic-bezier(0.22, 1, 0.36, 1),
    background-color 240ms ease;
}

.history-entry.is-active .history-counter-rule,
.history-entry:hover .history-counter-rule {
  width: 2.75rem;
  background-color: var(--chronicle-vermilion);
}

/* Central Node (Spell Ring) */
.history-node {
  position: absolute;
  left: 1.5rem;
  top: 1.75rem;
  z-index: 12;
  width: 2rem;
  height: 2rem;
  transform: translateX(-50%);
  display: grid;
  place-items: center;
}

@media (min-width: 768px) {
  .history-node {
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
  }
}

.history-node-ring {
  position: absolute;
  width: 1.35rem;
  height: 1.35rem;
  border: 1.5px solid var(--chronicle-node-idle);
  background-color: var(--chronicle-paper-bg);
  transform: rotate(45deg);
  transition:
    transform 480ms cubic-bezier(0.22, 1, 0.36, 1),
    border-color 280ms ease,
    background-color 280ms ease,
    box-shadow 280ms ease;
}

.history-node-core {
  position: relative;
  width: 0.45rem;
  height: 0.45rem;
  background-color: var(--chronicle-node-idle);
  transform: rotate(45deg);
  transition:
    transform 360ms cubic-bezier(0.22, 1, 0.36, 1),
    background-color 280ms ease;
}

.history-node-ripple {
  position: absolute;
  width: 1.75rem;
  height: 1.75rem;
  border: 1px solid var(--chronicle-vermilion);
  transform: rotate(45deg) scale(0.7);
  opacity: 0;
  pointer-events: none;
}

.history-entry.is-passed .history-node-ring {
  border-color: var(--chronicle-sky);
}

.history-entry.is-passed .history-node-core {
  background-color: var(--chronicle-sky);
}

.history-entry.is-active .history-node-ring,
.history-entry:hover .history-node-ring {
  border-color: var(--chronicle-vermilion);
  transform: rotate(225deg) scale(1.16);
  box-shadow: 0 0 14px var(--chronicle-vermilion-soft);
}

.history-entry.is-active .history-node-core,
.history-entry:hover .history-node-core {
  background-color: var(--chronicle-vermilion);
  transform: rotate(225deg) scale(1.3);
}

.history-entry.is-active .history-node-ripple {
  animation: history-node-pulse 2.2s cubic-bezier(0.22, 1, 0.36, 1) infinite;
}

/* Horizontal Connector Beam */
.history-connector {
  position: absolute;
  top: 50%;
  width: calc(11.11% - 0.85rem);
  height: 1px;
  background: linear-gradient(90deg, var(--chronicle-vermilion), var(--chronicle-rule));
  transition:
    transform 420ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 320ms ease;
}

.history-connector.is-right {
  right: 100%;
  transform-origin: left center;
}

.history-connector.is-left {
  left: 100%;
  transform-origin: right center;
}

/* Chronicle Dossier Card */
.history-card {
  padding: 1.5rem 1.625rem;
  background-color: var(--chronicle-card-bg);
  border: 1px solid var(--chronicle-border);
  border-top: 2px solid var(--chronicle-sky);
  box-shadow: var(--chronicle-card-shadow);
  transition:
    opacity 540ms cubic-bezier(0.22, 1, 0.36, 1),
    translate 540ms cubic-bezier(0.22, 1, 0.36, 1),
    background-color 260ms ease,
    border-color 260ms ease,
    box-shadow 260ms ease;
}

/* Corner talisman brackets */
.history-card::before {
  content: '';
  position: absolute;
  inset: 5px;
  pointer-events: none;
  background:
    linear-gradient(var(--chronicle-vermilion), var(--chronicle-vermilion)) left top / 9px 1px no-repeat,
    linear-gradient(var(--chronicle-vermilion), var(--chronicle-vermilion)) left top / 1px 9px no-repeat,
    linear-gradient(var(--chronicle-vermilion), var(--chronicle-vermilion)) right top / 9px 1px no-repeat,
    linear-gradient(var(--chronicle-vermilion), var(--chronicle-vermilion)) right top / 1px 9px no-repeat,
    linear-gradient(var(--chronicle-vermilion), var(--chronicle-vermilion)) left bottom / 9px 1px no-repeat,
    linear-gradient(var(--chronicle-vermilion), var(--chronicle-vermilion)) left bottom / 1px 9px no-repeat,
    linear-gradient(var(--chronicle-vermilion), var(--chronicle-vermilion)) right bottom / 9px 1px no-repeat,
    linear-gradient(var(--chronicle-vermilion), var(--chronicle-vermilion)) right bottom / 1px 9px no-repeat;
  opacity: 0;
  transition: opacity 260ms ease;
}

.history-stage[data-history-motion='pointer'] .history-entry.is-active .history-card {
  background-color: var(--chronicle-card-active-bg);
  border-color: var(--chronicle-border-strong);
  border-top-color: var(--chronicle-vermilion);
  box-shadow: var(--chronicle-card-active-shadow);
  /* Entrance owns transform; focus owns translate so neither retargets the
     other's animation when a card becomes active during its entrance. */
  translate: 0 -3px;
}

.history-stage[data-history-motion='pointer'] .history-entry.is-active .history-card::before {
  opacity: 0.55;
}

@media (hover: hover) and (pointer: fine) {
  .history-stage[data-history-motion='pointer'] .history-card:hover {
    background-color: var(--chronicle-card-active-bg);
    border-color: var(--chronicle-border-strong);
    border-top-color: var(--chronicle-vermilion);
    box-shadow: var(--chronicle-card-active-shadow);
    translate: 0 -3px;
  }

  .history-stage[data-history-motion='pointer'] .history-card:hover::before {
    opacity: 0.55;
  }
}

/* Page-enter & Scroll-reveal Choreography */
.history-stage.is-entered .history-astrolabe.is-primary {
  animation: history-astrolabe-enter 920ms cubic-bezier(0.16, 1, 0.3, 1) 120ms backwards;
}

.history-stage.is-entered .history-astrolabe.is-secondary {
  animation: history-astrolabe-enter 980ms cubic-bezier(0.16, 1, 0.3, 1) 220ms backwards;
}

.history-stage.is-entered .history-seal-stamp {
  animation: history-seal-press 520ms cubic-bezier(0.22, 1, 0.36, 1) 150ms backwards;
}

.history-stage.is-entered .history-title-copy {
  animation: history-title-unfurl 560ms cubic-bezier(0.22, 1, 0.36, 1) 200ms backwards;
}

.history-stage.is-entered .history-total-badge {
  animation: history-badge-slide 520ms cubic-bezier(0.22, 1, 0.36, 1) 250ms backwards;
}

.history-stage.is-entered .history-year-tab {
  animation: history-tab-rise 480ms cubic-bezier(0.22, 1, 0.36, 1) var(--year-tab-delay, 240ms) backwards;
}

.history-stage.is-entered .history-spine {
  transform-origin: top center;
  animation: history-spine-draw 880ms cubic-bezier(0.22, 1, 0.36, 1) 200ms backwards;
}

.history-stage.is-entered .history-bookmark {
  transform-origin: top center;
  animation: history-bookmark-unroll 580ms cubic-bezier(0.22, 1, 0.36, 1) 260ms backwards;
}

.history-stage.is-entered .history-bookmark-group {
  animation: history-tab-rise 440ms cubic-bezier(0.22, 1, 0.36, 1) var(--bm-delay, 320ms) backwards;
}

.history-stage[data-history-motion='pointer'] .history-entry.is-unrevealed .history-year-banner,
.history-entry.is-unrevealed .history-node,
.history-entry.is-unrevealed .history-card,
.history-entry.is-unrevealed .history-counter,
.history-entry.is-unrevealed .history-connector {
  opacity: 0;
}

.history-stage.is-entered[data-history-motion='pointer'] .history-entry.is-revealed .history-year-banner {
  animation: history-banner-enter 540ms cubic-bezier(0.22, 1, 0.36, 1) var(--entry-delay, 0ms) backwards;
}

.history-stage.is-entered .history-entry.is-revealed .history-node {
  animation: history-node-enter 500ms cubic-bezier(0.22, 1, 0.36, 1) calc(var(--entry-delay, 0ms) + 60ms) backwards;
}

.history-stage.is-entered[data-history-motion='pointer'] .history-entry.is-revealed .history-card {
  animation: history-card-enter-mobile 600ms cubic-bezier(0.22, 1, 0.36, 1) calc(var(--entry-delay, 0ms) + 80ms) backwards;
}

@media (min-width: 768px) {
  .history-stage.is-entered[data-history-motion='pointer'] .history-entry.is-even.is-revealed .history-card {
    animation: history-card-enter-even 620ms cubic-bezier(0.22, 1, 0.36, 1) calc(var(--entry-delay, 0ms) + 80ms) backwards;
  }
  .history-stage.is-entered[data-history-motion='pointer'] .history-entry.is-odd.is-revealed .history-card {
    animation: history-card-enter-odd 620ms cubic-bezier(0.22, 1, 0.36, 1) calc(var(--entry-delay, 0ms) + 80ms) backwards;
  }
  .history-stage.is-entered .history-entry.is-revealed .history-connector {
    animation: history-connector-enter 480ms cubic-bezier(0.22, 1, 0.36, 1) calc(var(--entry-delay, 0ms) + 160ms) backwards;
  }
  .history-stage.is-entered .history-entry.is-revealed .history-counter {
    animation: history-counter-enter 560ms cubic-bezier(0.22, 1, 0.36, 1) calc(var(--entry-delay, 0ms) + 140ms) backwards;
  }
}

.history-card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--chronicle-divider-soft);
}

.history-date-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

.history-date-seal {
  display: inline-grid;
  place-items: center;
  width: 1.2rem;
  height: 1.2rem;
  border: 1px solid var(--chronicle-vermilion);
  background-color: var(--chronicle-vermilion-tint);
  color: var(--chronicle-vermilion);
  font-family: var(--club-serif);
  font-size: 0.65rem;
  font-weight: 700;
}

.history-date-text {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--chronicle-ink-body);
}

.history-serial {
  font-family: var(--club-serif);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--chronicle-ink-muted);
}

.history-card-title {
  margin-top: 0.875rem;
  margin-bottom: 0.875rem;
  font-family: var(--club-serif);
  font-size: 1.375rem;
  font-weight: 650;
  line-height: 1.4;
  letter-spacing: 0.02em;
  color: var(--chronicle-ink-strong);
  transition: color 220ms ease;
}

.history-stage[data-history-motion='pointer'] .history-entry.is-active .history-card-title {
  color: var(--chronicle-vermilion);
}

@media (hover: hover) and (pointer: fine) {
  .history-stage[data-history-motion='pointer'] .history-card:hover .history-card-title {
    color: var(--chronicle-vermilion);
  }
}

.history-figure {
  position: relative;
  display: block;
  width: 100%;
  margin-bottom: 1rem;
  padding: 0.375rem;
  border: 1px solid var(--chronicle-divider);
  background-color: var(--chronicle-figure-bg);
  overflow: hidden;
  cursor: zoom-in;
}

.history-figure :deep(.progressive-image) {
  background: var(--chronicle-figure-bg);
}

:deep(.history-figure-img) {
  transition: transform 480ms cubic-bezier(0.22, 1, 0.36, 1);
}

@media (hover: hover) and (pointer: fine) {
  .history-stage[data-history-motion='pointer'] .history-figure:hover :deep(.history-figure-img) {
    transform: scale(1.025);
  }
}

.history-figure-hint {
  position: absolute;
  right: 0.625rem;
  bottom: 0.625rem;
  padding: 0.2rem 0.55rem;
  border: 1px solid rgb(255 255 255 / 0.22);
  background-color: rgb(15 23 42 / 0.78);
  color: #f8fafc;
  font-family: var(--club-serif);
  font-size: 0.6875rem;
  letter-spacing: 0.06em;
  opacity: 0;
  transform: translateY(4px);
  transition:
    opacity 200ms ease,
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

@media (hover: hover) and (pointer: fine) {
  .history-stage[data-history-motion='pointer'] .history-figure:hover .history-figure-hint {
    opacity: 1;
    transform: translateY(0);
  }
}

.history-prose-box {
  position: relative;
  margin-top: 0.75rem;
  padding: 1rem 1.125rem;
  border: 1px solid var(--chronicle-divider);
  border-left: 2px solid var(--chronicle-vermilion);
  background-color: var(--chronicle-prose-bg);
  overflow: hidden;
  text-align: left;
}

.history-prose-watermark {
  position: absolute;
  right: -10px;
  bottom: -10px;
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border: 1px solid var(--chronicle-vermilion);
  color: var(--chronicle-vermilion);
  font-family: var(--club-serif);
  font-size: 1.15rem;
  font-weight: 700;
  transform: rotate(15deg);
  opacity: 0.085;
  pointer-events: none;
}

/* Footer Coda */
.history-coda {
  position: relative;
  z-index: 12;
  display: flex;
  justify-content: center;
  margin-top: 4rem;
}

.history-coda-seal {
  display: inline-flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 1.125rem;
  border: 1px solid var(--chronicle-border);
  border-top: 2px solid var(--chronicle-vermilion);
  background-color: var(--chronicle-card-bg);
  color: var(--chronicle-ink-secondary);
  font-family: var(--club-serif);
  font-size: 0.8125rem;
  letter-spacing: 0.08em;
  box-shadow: var(--chronicle-banner-shadow);
}

.history-coda-stamp {
  display: inline-grid;
  place-items: center;
  width: 1.25rem;
  height: 1.25rem;
  border: 1px solid var(--chronicle-vermilion);
  background-color: var(--chronicle-vermilion-tint);
  color: var(--chronicle-vermilion);
  font-size: 0.6875rem;
  font-weight: 700;
}

@keyframes history-header-enter {
  0% {
    opacity: 0;
    transform: translateY(14px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes history-astrolabe-enter {
  0% {
    opacity: 0;
    scale: 0.82;
  }
  100% {
    scale: 1;
  }
}

@keyframes history-seal-press {
  0% {
    opacity: 0;
    transform: scale(1.42) rotate(-8deg);
  }
  70% {
    opacity: 1;
    transform: scale(0.96) rotate(1deg);
  }
  100% {
    opacity: 1;
    transform: scale(1) rotate(0deg);
  }
}

@keyframes history-title-unfurl {
  0% {
    opacity: 0;
    transform: translateX(-16px);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes history-badge-slide {
  0% {
    opacity: 0;
    transform: translateX(16px);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes history-tab-rise {
  0% {
    opacity: 0;
    transform: translateY(12px) scale(0.95);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes history-spine-draw {
  0% {
    opacity: 0;
    clip-path: inset(0 0 100% 0);
  }
  100% {
    opacity: 1;
    clip-path: inset(0 0 0 0);
  }
}

@keyframes history-bookmark-unroll {
  0% {
    opacity: 0;
    transform: translateY(-18px) scaleY(0.9);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scaleY(1);
  }
}

@keyframes history-banner-enter {
  0% {
    opacity: 0;
    transform: translateY(14px) scale(0.92);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes history-node-enter {
  0% {
    opacity: 0;
    scale: 0.2;
  }
  75% {
    opacity: 1;
    scale: 1.12;
  }
  100% {
    opacity: 1;
    scale: 1;
  }
}

@keyframes history-connector-enter {
  0% {
    opacity: 0;
    transform: scaleX(0);
  }
  100% {
    opacity: 1;
    transform: scaleX(1);
  }
}

@keyframes history-card-enter-mobile {
  0% {
    opacity: 0;
    transform: translateY(24px) scale(0.97);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes history-card-enter-even {
  0% {
    opacity: 0;
    transform: translate3d(32px, 20px, 0) scale(0.97);
  }
  100% {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
}

@keyframes history-card-enter-odd {
  0% {
    opacity: 0;
    transform: translate3d(-32px, 20px, 0) scale(0.97);
  }
  100% {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
}

@keyframes history-counter-enter {
  0% {
    opacity: 0;
    scale: 0.94;
  }
  100% {
    opacity: 1;
    scale: 1;
  }
}

@keyframes history-node-pulse {
  0% {
    opacity: 0.75;
    transform: rotate(45deg) scale(0.8);
  }
  100% {
    opacity: 0;
    transform: rotate(45deg) scale(1.75);
  }
}

@keyframes history-ambient-drift {
  0% {
    transform: translate(0, 0) scale(1);
  }
  100% {
    transform: translate(18px, 14px) scale(1.08);
  }
}

@keyframes history-mote-float {
  0%, 100% {
    transform: translateY(0) rotate(45deg);
    opacity: 0.25;
  }
  50% {
    transform: translateY(-18px) rotate(135deg);
    opacity: 0.6;
  }
}

@keyframes history-nine-float {
  0%, 100% {
    transform: translateY(0) rotate(-6deg);
    opacity: 0.12;
  }
  50% {
    transform: translateY(-14px) rotate(8deg);
    opacity: 0.24;
  }
}

@media (prefers-reduced-motion: reduce) {
  .history-header,
  .history-seal-stamp,
  .history-title-copy,
  .history-total-badge,
  .history-glow,
  .history-astrolabe,
  .history-mote,
  .history-nine-mote,
  .history-spine,
  .history-bookmark,
  .history-bookmark-group,
  .history-year-banner,
  .history-node,
  .history-counter,
  .history-counter-inner,
  .history-node-ring,
  .history-node-core,
  .history-node-ripple,
  .history-connector,
  .history-card,
  .history-year-tab,
  .history-year-diamond,
  .history-spine-progress {
    animation: none !important;
    transition: none !important;
    transform: none !important;
  }
  .history-stage .history-card {
    translate: none !important;
  }
  .history-entry.is-unrevealed .history-year-banner,
  .history-entry.is-unrevealed .history-node,
  .history-entry.is-unrevealed .history-card,
  .history-entry.is-unrevealed .history-counter,
  .history-entry.is-unrevealed .history-connector {
    opacity: 1 !important;
  }
}
</style>
