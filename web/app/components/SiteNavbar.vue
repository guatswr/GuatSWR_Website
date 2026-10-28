<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useSiteConfigStore } from '~/stores/site-config'
import { browserScrollFrame } from '~/utils/scroll-frame'
import { supportsScrollTimeline } from '~/utils/hero-timeline'

const site = useSiteConfigStore(usePinia())
const route = useRoute()
const navRef = ref<HTMLElement | null>(null)
const navRowRef = ref<HTMLElement | null>(null)
const progressRef = ref<HTMLElement | null>(null)
const nativeReadingProgress = ref(false)
const collapseScroll = ref<number>()
const isDesktop = ref(false)
const desktopActivityButton = ref<HTMLButtonElement | null>(null)
const mobileActivityButton = ref<HTMLButtonElement | null>(null)
const mobileMenuButton = ref<HTMLButtonElement | null>(null)
const isMenuOpen = ref(false)
const isActivitiesOpen = ref(false)
const isMobileActivitiesOpen = ref(false)
const isScrolled = ref(false)
const isPastFirstScreen = ref(false)
const isCompact = computed(() => isScrolled.value && !isMenuOpen.value)
const isImmersive = computed(() => route.path === '/' && !isPastFirstScreen.value && !isMenuOpen.value)
let desktopQuery: MediaQueryList | undefined

const { themeMode, isDark, toggleTheme } = useTheme()
const themeLabel = computed(() => {
  const current = `${themeMode.value === 'auto' ? '自动 · ' : ''}${isDark.value ? '夜间' : '日间'}`
  return `当前${current}模式，切换为${isDark.value ? '日间' : '夜间'}模式`
})
const activityLinks = [
  { name: '活动中心', path: '/events', desc: '联机、挑战与线下相聚', tag: '异变进行时' },
  { name: '往期活动回顾', path: '/activities', desc: '照片、记录与共同的回忆', tag: '记忆碎片' },
]
const navLinks = [
  { name: '成员', path: '/members', title: '绯想天住民', number: '03' },
  { name: '群史', path: '/history', title: '绯想天群史', number: '04' },
  { name: '社群链接', path: '/social', title: '博丽大结界', number: '05' },
]
const isActivityRoute = computed(() => route.path === '/activities' || route.path.startsWith('/activity/') || route.path === '/events' || route.path.startsWith('/events/'))
function closeMenus() {
  isMenuOpen.value = false
  isActivitiesOpen.value = false
  isMobileActivitiesOpen.value = false
}
function toggleMenu() {
  const nextOpen = !isMenuOpen.value
  closeMenus()
  isMenuOpen.value = nextOpen
}
function handleEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (isActivitiesOpen.value) {
    isActivitiesOpen.value = false
    desktopActivityButton.value?.focus()
  }
  else if (isMobileActivitiesOpen.value && isMenuOpen.value) {
    isMobileActivitiesOpen.value = false
    mobileActivityButton.value?.focus()
  }
  else if (isMenuOpen.value) {
    closeMenus()
    mobileMenuButton.value?.focus()
  }
  else return
  event.preventDefault()
}
function handleOutside(event: Event) {
  if (navRef.value && event.target instanceof Node && !navRef.value.contains(event.target)) closeMenus()
}
function handleActivityFocusOut(event: FocusEvent) {
  if (event.currentTarget instanceof HTMLElement && (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget as Node))) isActivitiesOpen.value = false
}
let scrollFrame: number | null = null
let frame: ReturnType<typeof browserScrollFrame> | undefined
let resizeObserver: ResizeObserver | undefined
let heroElement: HTMLElement | null = null
let mounted = false
let geometryDirty = true
let firstScreenHeight = 0
let documentHeight = 0
let navHeight = 56
let readingProgress = -1
let usingScrollObservers = false
let thresholdObserver: IntersectionObserver | undefined
let heroObserver: IntersectionObserver | undefined
let observedHero: HTMLElement | null = null
let heroMargin = ''

function syncCompactThreshold() {
  const scrollY = window.scrollY
  const next = isScrolled.value ? scrollY > 12 : scrollY > 36
  if (isScrolled.value !== next) isScrolled.value = next
}

function handleThresholdScroll() {
  // IO notifications can arrive well after compositor scrolling. React in the
  // scroll task while expanded; compact-state scrolling does no geometry reads.
  if (mounted && !isScrolled.value) syncCompactThreshold()
}

function handleThresholdScrollEnd() {
  if (mounted) syncCompactThreshold()
}

function updateHeroObserver() {
  if (!usingScrollObservers) return
  const hero = route.path === '/' ? document.querySelector<HTMLElement>('.club-banner') : null
  const threshold = navHeight + (isPastFirstScreen.value ? 12 : 0)
  const margin = `-${threshold}px 0px 0px 0px`
  if (hero === observedHero && margin === heroMargin) return
  heroObserver?.disconnect()
  observedHero = hero
  heroMargin = margin
  if (!hero) { isPastFirstScreen.value = false; return }
  heroObserver = new IntersectionObserver(entries => {
    const entry = entries[0]
    if (!mounted || !entry || entry.target !== observedHero || route.path !== '/') return
    const past = !entry.isIntersecting && entry.boundingClientRect.bottom <= threshold
    if (isPastFirstScreen.value !== past) {
      isPastFirstScreen.value = past
      updateHeroObserver()
    }
  }, { threshold: 0, rootMargin: margin })
  heroObserver.observe(hero)
}

function refreshNavGeometry(event: TransitionEvent) {
  if (event.target !== event.currentTarget || event.propertyName !== 'height') return
  navHeight = navRef.value?.offsetHeight ?? navHeight
  updateHeroObserver()
}

function invalidateGeometry() {
  if (usingScrollObservers) {
    updateHeroObserver()
    return
  }
  geometryDirty = true
  handleScroll()
}

function updateScrollState() {
  scrollFrame = null
  if (!mounted || !frame) return
  const snapshot = frame.snapshot
  const scrollY = snapshot?.scrollY ?? window.scrollY
  const viewportHeight = snapshot?.height ?? window.innerHeight
  if (geometryDirty) {
    geometryDirty = false
    const nextHero = document.querySelector<HTMLElement>('.club-banner')
    if (nextHero !== heroElement) {
      if (heroElement) resizeObserver?.unobserve(heroElement)
      heroElement = nextHero
      if (heroElement) resizeObserver?.observe(heroElement)
    }
    firstScreenHeight = heroElement?.offsetHeight ?? viewportHeight
    documentHeight = document.documentElement.scrollHeight
  }
  // Hysteresis avoids rapid toggling near the top threshold: collapse into the
  // compact bar after scrolling past 36px, and restore the full header when
  // scrolling back up to the top (<= 12px).
  const nextScrolled = isScrolled.value ? scrollY > 12 : scrollY > 36

  // On the homepage ('/'), keep the translucent frosted-glass navbar across the
  // first screen (.club-banner), and transition to opaque once scrolled past it.
  let nextPastFirstScreen = false
  if (route.path === '/') {
    const threshold = Math.max(80, firstScreenHeight - navHeight)
    nextPastFirstScreen = isPastFirstScreen.value
      ? scrollY > threshold - 12
      : scrollY > threshold
  }

  const scrollable = documentHeight - viewportHeight
  const nextProgress = scrollable > 0 ? Math.min(1, Math.max(0, scrollY / scrollable)) : 0
  frame.write(() => {
    if (!mounted) return
    if (isScrolled.value !== nextScrolled) isScrolled.value = nextScrolled
    if (isPastFirstScreen.value !== nextPastFirstScreen) isPastFirstScreen.value = nextPastFirstScreen
    if (!nativeReadingProgress.value && Math.abs(readingProgress - nextProgress) > 0.002) {
      readingProgress = nextProgress
      progressRef.value?.style.setProperty('transform', `scaleX(${nextProgress})`)
    }
  })
}

function handleScroll() {
  if (scrollFrame !== null || !frame) return
  scrollFrame = frame.read(updateScrollState)
}
// The hero waits for the real height transition, then measures subsequent
// scrolling from this position. Cancel stale completions on expansion or routing.
watch([isCompact, isDesktop, () => route.fullPath], async ([compact, desktop], _, onCleanup) => {
  collapseScroll.value = undefined
  if (!compact || !desktop) return
  let cancelled = false
  onCleanup(() => { cancelled = true })
  await nextTick()
  if (cancelled) return
  const animations = navRowRef.value?.getAnimations() ?? []
  await Promise.allSettled(animations.map(animation => animation.finished))
  if (!cancelled) collapseScroll.value = window.scrollY
}, { flush: 'post' })

function handleDesktopChange() {
  isDesktop.value = desktopQuery?.matches ?? false
  closeMenus()
}
watch(() => route.fullPath, () => {
  closeMenus()
  if (import.meta.client) nextTick(invalidateGeometry)
})
onMounted(() => {
  mounted = true
  // Preserve the early controller's hysteresis, then hand off only after Vue
  // has applied the same compact state. No hydration-time flicker or DOM edits.
  isScrolled.value = document.documentElement.hasAttribute('data-nav-boot-compact')
  syncCompactThreshold()
  void nextTick(() => { if (mounted) document.dispatchEvent(new Event('club:navbar-ready')) })
  frame = browserScrollFrame(window)
  nativeReadingProgress.value = supportsScrollTimeline()
  navHeight = navRef.value?.offsetHeight ?? 56
  const expand = document.querySelector('[data-nav-boundary="expand"]')
  const compact = document.querySelector('[data-nav-boundary="compact"]')
  usingScrollObservers = nativeReadingProgress.value && typeof IntersectionObserver !== 'undefined' && !!expand && !!compact
  if (usingScrollObservers && expand && compact) {
    thresholdObserver = new IntersectionObserver(() => {
      if (!mounted) return
      // Entries describe a past layout. Re-read the current offset so a stale
      // top snapshot cannot undo an already-triggered collapse (or vice versa).
      syncCompactThreshold()
    })
    thresholdObserver.observe(expand)
    thresholdObserver.observe(compact)
    updateHeroObserver()
  }
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === navRef.value) {
          navHeight = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height
        } else geometryDirty = true
      }
      if (usingScrollObservers) updateHeroObserver()
      else handleScroll()
    })
    resizeObserver.observe(document.documentElement)
    if (!usingScrollObservers && navRef.value) resizeObserver.observe(navRef.value)
  }
  if (!usingScrollObservers) handleScroll()
  desktopQuery = window.matchMedia('(min-width: 1024px)')
  handleDesktopChange()
  desktopQuery.addEventListener('change', handleDesktopChange)
  if (usingScrollObservers) {
    window.addEventListener('scroll', handleThresholdScroll, { passive: true })
    window.addEventListener('scrollend', handleThresholdScrollEnd, { passive: true })
  } else window.addEventListener('scroll', handleScroll, { passive: true })
  window.addEventListener('resize', invalidateGeometry, { passive: true })
  document.addEventListener('load', invalidateGeometry, true)
  document.fonts?.addEventListener('loadingdone', invalidateGeometry)
  document.addEventListener('pointerdown', handleOutside)
  document.addEventListener('focusin', handleOutside)
  document.addEventListener('keydown', handleEscape)
})
onBeforeUnmount(() => {
  mounted = false
  if (scrollFrame !== null) {
    frame?.cancel(scrollFrame)
    scrollFrame = null
  }
  resizeObserver?.disconnect()
  thresholdObserver?.disconnect()
  heroObserver?.disconnect()
  desktopQuery?.removeEventListener('change', handleDesktopChange)
  window.removeEventListener('scroll', handleScroll)
  window.removeEventListener('scroll', handleThresholdScroll)
  window.removeEventListener('scrollend', handleThresholdScrollEnd)
  window.removeEventListener('resize', invalidateGeometry)
  document.removeEventListener('load', invalidateGeometry, true)
  document.fonts?.removeEventListener('loadingdone', invalidateGeometry)
  document.removeEventListener('pointerdown', handleOutside)
  document.removeEventListener('focusin', handleOutside)
  document.removeEventListener('keydown', handleEscape)
})
</script>

<template>
  <nav
    ref="navRef"
    aria-label="主导航"
    class="club-navbar fixed inset-x-0 top-0 z-50"
    :data-immersive="isImmersive"
    :data-compact="isCompact"
    :data-collapse-scroll="collapseScroll"
    :data-native-progress="nativeReadingProgress"
  >
    <span ref="progressRef" class="club-navbar-progress" aria-hidden="true" />
    <div class="club-container">
      <div ref="navRowRef" class="club-navbar-row" @transitionend="refreshNavGeometry">
        <NuxtLink
          :prefetch="false"
          to="/"
          class="club-wordmark shrink-0"
          aria-label="桂航绯想天 GUAT TOUHOU FANS CLUB 首页"
          @click="closeMenus"
        >
          <span class="club-wordmark-avatar" aria-hidden="true">
            <ClubAvatar
              :src="site.config.badge_image"
              loading="lazy"
              class="h-9 w-9 shrink-0"
            />
          </span>
          <span class="club-wordmark-text">
            <span
              class="club-wordmark-title club-display whitespace-nowrap font-serif font-bold tracking-wider"
              >桂航绯想天</span
            >
            <span
              class="club-wordmark-subtitle whitespace-nowrap font-medium"
              >GUAT TOUHOU FANS CLUB</span
            >
          </span>
        </NuxtLink>

        <div class="hidden items-center gap-1 lg:flex">
          <NuxtLink
            :prefetch="false"
            to="/"
            class="nav-link"
            exact-active-class="nav-link-active"
            @click="closeMenus"
            ><span class="nav-number" aria-hidden="true">01</span
            ><span class="nav-label">首页</span></NuxtLink
          >
          <div class="relative flex items-center" @focusout="handleActivityFocusOut">
            <button
              id="desktop-activities-trigger"
              ref="desktopActivityButton"
              type="button"
              class="nav-link"
              :class="
                isActivityRoute || isActivitiesOpen ? 'nav-link-active' : ''
              "
              :aria-expanded="isActivitiesOpen"
              aria-controls="desktop-activities-panel"
              @click="isActivitiesOpen = !isActivitiesOpen"
            >
              <span class="nav-number" aria-hidden="true">02</span
              ><span class="nav-label">活动</span>
              <svg
                class="nav-chevron transition-transform duration-300"
                :class="isActivitiesOpen ? 'rotate-180' : ''"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                aria-hidden="true"
              >
                <path
                  d="m6 9 6 6 6-6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
            <Transition name="club-menu">
              <div
                v-show="isActivitiesOpen"
                id="desktop-activities-panel"
                :inert="!isActivitiesOpen"
                role="group"
                aria-labelledby="desktop-activities-trigger"
                class="club-nav-panel absolute left-0 top-full mt-2 w-72 border p-2 shadow-lg"
              >
                <NuxtLink
                  v-for="link in activityLinks"
                  :key="link.path"
                  :prefetch="false"
                  :to="link.path"
                  class="block border-l-2 border-transparent px-4 py-3 text-slate-700 transition-colors hover:border-sky-500 hover:bg-sky-50 dark:text-slate-200 dark:hover:bg-slate-800"
                  active-class="bg-sky-50 text-sky-700 dark:bg-slate-800 dark:text-sky-300"
                  @click="closeMenus"
                >
                  <span
                    class="flex items-center justify-between gap-2 text-sm font-semibold"
                    >{{ link.name
                    }}<span
                      class="text-[10px] font-normal text-slate-500 dark:text-slate-400"
                      >{{ link.tag }}</span
                    ></span
                  >
                  <span
                    class="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400"
                    >{{ link.desc }}</span
                  >
                </NuxtLink>
              </div>
            </Transition>
          </div>
          <NuxtLink
            v-for="link in navLinks"
            :key="link.path"
            :prefetch="false"
            :to="link.path"
            :title="link.title"
            class="nav-link"
            active-class="nav-link-active"
            @click="closeMenus"
            ><span class="nav-number" aria-hidden="true">{{ link.number }}</span
            ><span class="nav-label">{{ link.name }}</span></NuxtLink
          >
          <div
            class="nav-divider"
            aria-hidden="true"
          />
          <button
            type="button"
            class="nav-icon"
            :aria-label="themeLabel"
            :title="themeLabel"
            @click="toggleTheme"
          >
            <svg
              v-if="isDark"
              class="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="4" />
              <path
                d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"
                stroke-linecap="round"
              />
            </svg>
            <svg
              v-else
              class="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              aria-hidden="true"
            >
              <path
                d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <NuxtLink
            :prefetch="false"
            to="/join"
            class="club-invitation club-nav-join whitespace-nowrap"
            @click="closeMenus"
          >
            <span class="club-nav-join-seal-wrap" aria-hidden="true">
              <span class="club-invitation-seal">入社</span>
            </span>
            <span class="club-invitation-label">加入我们</span>
            <ClubIcon name="arrow" class="club-invitation-arrow" />
          </NuxtLink>
        </div>

        <div class="flex shrink-0 items-center gap-1 lg:hidden">
          <button
            type="button"
            class="nav-icon"
            :aria-label="themeLabel"
            :title="themeLabel"
            @click="toggleTheme"
          >
            <svg
              v-if="isDark"
              class="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="4" />
              <path
                d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"
                stroke-linecap="round"
              />
            </svg>
            <svg
              v-else
              class="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              aria-hidden="true"
            >
              <path
                d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <button
            ref="mobileMenuButton"
            type="button"
            class="nav-icon"
            :aria-label="isMenuOpen ? '关闭导航菜单' : '打开导航菜单'"
            :aria-expanded="isMenuOpen"
            aria-controls="mobile-navigation"
            @click="toggleMenu"
          >
            <svg
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="1.8"
              aria-hidden="true"
            >
              <path
                v-if="!isMenuOpen"
                d="M4 6h16M4 12h16M4 18h16"
                stroke-linecap="round"
              />
              <path v-else d="m6 6 12 12M6 18 18 6" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <Transition name="club-menu">
      <div
        v-show="isMenuOpen"
        id="mobile-navigation"
        :inert="!isMenuOpen"
        class="club-nav-panel max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain border-t px-4 pb-5 pt-3 lg:hidden"
      >
        <div class="mx-auto max-w-7xl space-y-1">
          <NuxtLink
            :prefetch="false"
            to="/"
            class="mobile-nav-link"
            exact-active-class="nav-link-active"
            @click="closeMenus"
            ><span class="nav-number" aria-hidden="true">01</span
            >首页</NuxtLink
          >
          <button
            id="mobile-activities-trigger"
            ref="mobileActivityButton"
            type="button"
            class="mobile-nav-link w-full justify-between"
            :class="isActivityRoute ? 'nav-link-active' : ''"
            :aria-expanded="isMobileActivitiesOpen"
            aria-controls="mobile-activities-panel"
            @click="isMobileActivitiesOpen = !isMobileActivitiesOpen"
          >
            <span class="flex items-center gap-3"
              ><span class="nav-number" aria-hidden="true">02</span>活动</span
            >
            <svg
              class="h-4 w-4 transition-transform duration-200"
              :class="isMobileActivitiesOpen ? 'rotate-180' : ''"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              aria-hidden="true"
            >
              <path
                d="m6 9 6 6 6-6"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <Transition name="club-menu">
            <div
              v-show="isMobileActivitiesOpen"
              id="mobile-activities-panel"
              :inert="!isMobileActivitiesOpen"
              role="group"
              aria-labelledby="mobile-activities-trigger"
              class="ml-4 space-y-1 border-l border-sky-100 pl-3 dark:border-slate-800"
            >
              <NuxtLink
                v-for="link in activityLinks"
                :key="link.path"
                :prefetch="false"
                :to="link.path"
                class="mobile-nav-link flex-wrap gap-x-2 text-sm"
                active-class="nav-link-active"
                @click="closeMenus"
                >{{ link.name
                }}<span
                  class="text-xs font-normal text-slate-500 dark:text-slate-400"
                  >{{ link.tag }}</span
                ></NuxtLink
              >
            </div>
          </Transition>
          <NuxtLink
            v-for="link in navLinks"
            :key="link.path"
            :prefetch="false"
            :to="link.path"
            :title="link.title"
            class="mobile-nav-link"
            active-class="nav-link-active"
            @click="closeMenus"
            ><span class="nav-number" aria-hidden="true">{{ link.number }}</span
            >{{ link.name }}</NuxtLink
          >
          <div
            class="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800"
          >
            <NuxtLink
              :prefetch="false"
              to="/logs"
              class="mobile-nav-link justify-center text-sm"
              @click="closeMenus"
              >站点日志</NuxtLink
            >
            <NuxtLink
              :prefetch="false"
              to="/login"
              class="mobile-nav-link justify-center text-sm"
              @click="closeMenus"
              >管理员登录</NuxtLink
            >
          </div>
          <NuxtLink
            :prefetch="false"
            to="/join"
            class="club-invitation club-nav-join-mobile mt-3 flex w-full min-h-12"
            @click="closeMenus"
            ><span class="club-invitation-seal" aria-hidden="true">入社</span>
            <span class="club-invitation-label">加入桂航绯想天</span>
            <ClubIcon name="arrow" class="club-invitation-arrow"
          /></NuxtLink>
        </div>
      </div>
    </Transition>
  </nav>
</template>

<style scoped>
@reference '../assets/css/main.css';
/* Tailwind 4 uses bottom margins for space-y; keep the archived navigation's
   sibling-top spacing, including its lower action rows. */
.space-y-1 > :not([hidden]) {
  margin-block: 0;
}
.space-y-1 > :not([hidden]) ~ :not([hidden]) {
  margin-top: 0.25rem;
}
.club-navbar {
  --nav-ink: #334155;
  --nav-accent: #0369a1;
  --nav-spring: cubic-bezier(0.34, 1.24, 0.64, 1);
  --nav-collapse: cubic-bezier(0.32, 0.94, 0.6, 1);
  --nav-duration: 540ms;
  padding-top: env(safe-area-inset-top, 0px);
  color: var(--nav-ink);
  background-color: #fbfbf8;
  border-bottom: 1px solid rgb(148 163 184 / 0.22);
  backdrop-filter: blur(18px) saturate(180%);
  -webkit-backdrop-filter: blur(18px) saturate(180%);
  box-shadow: 0 2px 12px -4px rgb(15 23 42 / 0.05);
  transform: translateZ(0);
  transition:
    background-color 480ms ease-in-out,
    color 380ms ease-in-out,
    border-color 480ms ease-in-out,
    box-shadow 480ms ease-in-out;
}
:global(.club-scroll-boundary) {
  position: absolute;
  top: 12px;
  left: 0;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
:global(.club-scroll-boundary[data-nav-boundary='compact']) {
  top: 36px;
}
:global(.dark .club-navbar) {
  --nav-ink: #e2e8f0;
  --nav-accent: #bae6fd;
  background-color: #101923;
  border-bottom-color: rgb(71 85 105 / 0.36);
  box-shadow: 0 2px 14px -4px rgb(2 6 23 / 0.42);
}
.club-navbar[data-compact='true'],
:global(html[data-nav-boot-compact] .club-navbar) {
  border-bottom-color: rgb(148 163 184 / 0.3);
  box-shadow: 0 6px 20px -6px rgb(15 23 42 / 0.1);
}
:global(.dark .club-navbar[data-compact='true']),
:global(html.dark[data-nav-boot-compact] .club-navbar) {
  border-bottom-color: rgb(71 85 105 / 0.48);
  box-shadow: 0 6px 24px -6px rgb(2 6 23 / 0.56);
}
/* Homepage first screen: translucent frosted glass over the hero banner */
.club-navbar[data-immersive='true'] {
  --nav-ink: #f1f5f9;
  --nav-accent: #bae6fd;
  background-color: rgb(15 23 42 / 0.28);
  border-bottom-color: rgb(255 255 255 / 0.22);
  box-shadow:
    0 4px 24px -4px rgb(2 6 23 / 0.22),
    inset 0 1px 0 0 rgb(255 255 255 / 0.16);
}
.club-navbar[data-immersive='true'][data-compact='true'],
:global(html[data-nav-boot-compact] .club-navbar[data-immersive='true']) {
  background-color: rgb(15 23 42 / 0.4);
  border-bottom-color: rgb(255 255 255 / 0.26);
}
.club-navbar-progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 1px;
  background: var(--nav-accent);
  transform: scaleX(0);
  transform-origin: left;
  pointer-events: none;
}
@supports (animation-timeline: scroll(root block)) {
  .club-navbar[data-native-progress='true'] .club-navbar-progress {
    animation: club-reading-progress auto linear both;
    animation-timeline: scroll(root block);
  }
}
@keyframes club-reading-progress {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}
.club-navbar-row {
  display: flex;
  height: 4rem;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  transition: height var(--nav-duration) var(--nav-spring);
}
.club-navbar[data-compact='true'] .club-navbar-row,
:global(html[data-nav-boot-compact] .club-navbar .club-navbar-row) {
  height: 3.25rem;
}
.club-wordmark {
  display: flex;
  min-height: 2.75rem;
  align-items: center;
  color: var(--nav-ink);
  text-decoration: none;
}
.club-wordmark-avatar {
  display: none;
}
@media (min-width: 1024px) {
  .club-wordmark-avatar {
    display: inline-flex;
    width: 2.25rem;
    height: 2.25rem;
    margin-right: 0.625rem;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    transform-origin: left center;
    transition:
      width var(--nav-duration) var(--nav-spring),
      margin-right var(--nav-duration) var(--nav-spring),
      opacity 380ms ease-out 40ms,
      transform var(--nav-duration) var(--nav-spring);
  }
  .club-navbar[data-compact='true'] .club-wordmark-avatar,
  :global(html[data-nav-boot-compact] .club-navbar .club-wordmark-avatar) {
    width: 0;
    margin-right: 0;
    opacity: 0;
    transform: translateX(-8px) scale(0.72);
    pointer-events: none;
    transition:
      width 480ms var(--nav-collapse),
      margin-right 480ms var(--nav-collapse),
      opacity 280ms ease-out,
      transform 480ms var(--nav-collapse);
  }
}
.club-wordmark-text {
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.club-wordmark-title {
  display: inline-block;
  font-size: 1.1875rem;
  line-height: 1.2;
  transition: letter-spacing var(--nav-duration) var(--nav-spring);
}
.club-navbar[data-compact='true'] .club-wordmark-title,
:global(html[data-nav-boot-compact] .club-navbar .club-wordmark-title) {
  letter-spacing: 0.12em;
}
.club-wordmark-subtitle {
  display: block;
  font-size: 0.5625rem;
  letter-spacing: 0.18em;
  line-height: 1;
  height: 0.75rem;
  margin-top: 0.15rem;
  opacity: 0.68;
  overflow: hidden;
  transform-origin: left top;
  transition:
    height var(--nav-duration) var(--nav-spring),
    margin-top var(--nav-duration) var(--nav-spring),
    opacity 380ms ease-out 40ms,
    transform var(--nav-duration) var(--nav-spring);
}
.club-navbar[data-compact='true'] .club-wordmark-subtitle,
:global(html[data-nav-boot-compact] .club-navbar .club-wordmark-subtitle) {
  height: 0;
  margin-top: 0;
  opacity: 0;
  transform: translateY(-4px);
  transition:
    height 480ms var(--nav-collapse),
    margin-top 480ms var(--nav-collapse),
    opacity 280ms ease-out,
    transform 480ms var(--nav-collapse);
}
.nav-number {
  display: inline-flex;
  align-items: center;
  font-family: ui-monospace, monospace;
  font-size: 0.65625rem;
  font-weight: 400;
  line-height: 1;
  opacity: 0.6;
  width: 1.05rem;
  margin-right: 0.375rem;
  overflow: hidden;
  transform-origin: left center;
  transition:
    width var(--nav-duration) var(--nav-spring),
    margin-right var(--nav-duration) var(--nav-spring),
    opacity 380ms ease-out 40ms,
    transform var(--nav-duration) var(--nav-spring);
}
.club-navbar[data-compact='true'] .nav-link .nav-number,
:global(html[data-nav-boot-compact] .club-navbar .nav-link .nav-number) {
  width: 0;
  margin-right: 0;
  opacity: 0;
  transform: translateY(-3px) scale(0.75);
  transition:
    width 480ms var(--nav-collapse),
    margin-right 480ms var(--nav-collapse),
    opacity 280ms ease-out,
    transform 480ms var(--nav-collapse);
}
.nav-label {
  display: inline-flex;
  align-items: center;
  line-height: 1;
}
.nav-chevron {
  width: 0.875rem;
  height: 0.875rem;
  margin-left: 0.375rem;
  flex-shrink: 0;
}
/* Default state: exact original .nav-link and underline/diamond bar design */
.nav-link {
  position: relative;
  display: inline-flex;
  height: 2.75rem;
  align-items: center;
  justify-content: center;
  padding: 0 0.625rem;
  border: 0;
  background: transparent;
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  color: var(--nav-ink);
  cursor: pointer;
  transition:
    color 240ms ease,
    height var(--nav-duration) var(--nav-spring),
    padding var(--nav-duration) var(--nav-spring);
}
/* Compact state: wider button spacing absorbs the collapsed 01-05 numbers so
   horizontal shift is minimal, and switches to a clean minimalist bar */
.club-navbar[data-compact='true'] .nav-link,
:global(html[data-nav-boot-compact] .club-navbar .nav-link) {
  height: 2.125rem;
  padding: 0 1.35rem;
}
.nav-link::after {
  content: '';
  position: absolute;
  bottom: 2px;
  left: 10px;
  right: 10px;
  height: 1px;
  background: currentColor;
  transform: scaleX(0);
  transition:
    transform 240ms ease,
    bottom var(--nav-duration) var(--nav-spring),
    left var(--nav-duration) var(--nav-spring),
    right var(--nav-duration) var(--nav-spring),
    height 260ms ease,
    border-radius 260ms ease;
  transform-origin: left;
}
.club-navbar[data-compact='true'] .nav-link::after,
:global(html[data-nav-boot-compact] .club-navbar .nav-link::after) {
  bottom: 1px;
  left: 0.85rem;
  right: 0.85rem;
  height: 2px;
  border-radius: 999px;
  transform-origin: center;
}
.nav-link:hover::after,
.nav-link-active::after {
  transform: scaleX(1);
}
.nav-link-active::before {
  content: '';
  position: absolute;
  bottom: 0;
  left: calc(50% - 2px);
  width: 5px;
  height: 5px;
  transform: rotate(45deg) scale(1);
  opacity: 1;
  background: var(--nav-accent);
  transition:
    transform 320ms var(--nav-spring),
    opacity 220ms ease;
}
.club-navbar[data-compact='true'] .nav-link-active::before,
:global(html[data-nav-boot-compact] .club-navbar .nav-link-active::before) {
  transform: rotate(45deg) scale(0);
  opacity: 0;
}
.nav-divider {
  margin-left: 0.5rem;
  margin-right: 0.5rem;
  width: 1px;
  height: 1.25rem;
  flex-shrink: 0;
  background: currentColor;
  opacity: 0.2;
  transition:
    height var(--nav-duration) var(--nav-spring),
    margin-left var(--nav-duration) var(--nav-spring),
    margin-right var(--nav-duration) var(--nav-spring);
}
.club-navbar[data-compact='true'] .nav-divider,
:global(html[data-nav-boot-compact] .club-navbar .nav-divider) {
  height: 1rem;
  margin-left: -0.15rem;
  margin-right: 0.45rem;
}
.nav-icon {
  @apply inline-flex h-11 w-10 shrink-0 items-center justify-center transition-colors;
  color: var(--nav-ink);
  opacity: 0.8;
  transition:
    color 220ms ease,
    opacity 220ms ease,
    height var(--nav-duration) var(--nav-spring),
    width var(--nav-duration) var(--nav-spring);
}
.club-navbar[data-compact='true'] .nav-icon,
:global(html[data-nav-boot-compact] .club-navbar .nav-icon) {
  height: 2.125rem;
  width: 2.25rem;
}
.nav-icon:hover {
  color: var(--nav-accent);
  opacity: 1;
}
.mobile-nav-link {
  @apply flex min-h-12 items-center gap-3 border-b border-slate-200/60 px-3 text-base font-medium transition-colors dark:border-slate-700/60;
  color: var(--nav-ink);
}
.nav-link-active {
  color: var(--nav-accent);
}
.mobile-nav-link:hover {
  color: var(--nav-accent);
}
.club-nav-panel {
  background: #fbfbf8;
  border-color: #dbe4eb;
}
:global(.dark .club-nav-panel) {
  background: #101923;
  border-color: #334155;
}
/* Default state: exact original "加入我们" invitation button layout */
.club-nav-join,
.club-nav-join-mobile {
  --invitation-ink: var(--nav-ink);
  padding: 0.35rem 0.15rem;
  border-bottom: 1px solid var(--invitation-line);
  background: transparent;
}
.club-nav-join {
  gap: 0;
  min-height: 2.75rem;
  height: 2.75rem;
  margin-left: 1rem;
  transition:
    min-height var(--nav-duration) var(--nav-spring),
    height var(--nav-duration) var(--nav-spring),
    padding var(--nav-duration) var(--nav-spring),
    margin-left var(--nav-duration) var(--nav-spring),
    border-color 250ms ease;
}
.club-navbar[data-compact='true'] .club-nav-join,
:global(html[data-nav-boot-compact] .club-navbar .club-nav-join) {
  min-height: 2.125rem;
  height: 2.125rem;
  padding: 0 0.15rem;
  margin-left: 0.45rem;
}
.club-nav-join-seal-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 2rem;
  margin-right: 0.75rem;
  flex-shrink: 0;
  overflow: hidden;
  transform-origin: left center;
  transition:
    width var(--nav-duration) var(--nav-spring),
    margin-right var(--nav-duration) var(--nav-spring),
    opacity 380ms ease-out 40ms,
    transform var(--nav-duration) var(--nav-spring);
}
.club-navbar[data-compact='true'] .club-nav-join-seal-wrap,
:global(html[data-nav-boot-compact] .club-navbar .club-nav-join-seal-wrap) {
  width: 0;
  margin-right: 0;
  opacity: 0;
  transform: translateX(-6px) scale(0.68) rotate(-8deg);
  pointer-events: none;
  transition:
    width 480ms var(--nav-collapse),
    margin-right 480ms var(--nav-collapse),
    opacity 280ms ease-out,
    transform 480ms var(--nav-collapse);
}
.club-nav-join :deep(.club-invitation-arrow) {
  margin-left: 0.75rem;
  transition:
    transform 350ms cubic-bezier(0.22, 1, 0.36, 1),
    margin-left var(--nav-duration) var(--nav-spring);
}
.club-navbar[data-compact='true'] .club-nav-join :deep(.club-invitation-arrow),
:global(html[data-nav-boot-compact] .club-navbar .club-nav-join .club-invitation-arrow) {
  margin-left: 0.5rem;
}
.club-nav-join-mobile {
  transition: border-color 250ms ease;
}
.club-navbar[data-immersive='true'] :is(.club-nav-join, .club-nav-join-mobile) {
  --invitation-line: rgb(224 242 254 / 0.4);
  --invitation-accent: #edb2a5;
}
:global(.dark .club-navbar) :is(.club-nav-join, .club-nav-join-mobile) {
  --invitation-line: rgb(186 230 253 / 0.35);
  --invitation-accent: #edb2a5;
}
:is(.club-nav-join, .club-nav-join-mobile):is(:hover, :focus-visible) {
  border-bottom-color: var(--invitation-accent);
}
@media (max-width: 359px) {
  .club-wordmark-subtitle {
    letter-spacing: 0.12em;
    font-size: 7px;
  }
}
.club-navbar :is(a, button):focus-visible {
  outline: 2px solid var(--nav-accent);
  outline-offset: 3px;
}
@media (prefers-reduced-motion: reduce) {
  .club-navbar,
  .club-navbar * {
    transition-duration: 0.01ms !important;
    transition-delay: 0ms !important;
  }
}
</style>
