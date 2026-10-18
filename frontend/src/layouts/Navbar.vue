<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme } from '../composables/useTheme.js'
import { useSiteConfigStore } from '../stores/siteConfig'
import ClubAvatar from '../components/ClubAvatar.vue'
import ClubIcon from '../components/ClubIcon.vue'

const site = useSiteConfigStore()

const route = useRoute()
const navRef = ref(null)
const desktopActivityButton = ref(null)
const mobileActivityButton = ref(null)
const mobileMenuButton = ref(null)
const isMenuOpen = ref(false)
const isActivitiesOpen = ref(false)
const isMobileActivitiesOpen = ref(false)
const isScrolled = ref(false)
const readingProgress = ref(0)
const isImmersive = computed(
  () => route.path === '/' && !isScrolled.value && !isMenuOpen.value
)
let desktopQuery

const { themeMode, isDark, toggleTheme } = useTheme()
const themeLabel = computed(() => {
  const current = `${themeMode.value === 'auto' ? '自动 · ' : ''}${isDark.value ? '夜间' : '日间'}`
  return `当前${current}模式，切换为${isDark.value ? '日间' : '夜间'}模式`
})
const activityLinks = [
  {
    name: '进行中的活动',
    path: '/events',
    desc: '联机、挑战与线下相聚',
    tag: '异变进行时'
  },
  {
    name: '往期活动回顾',
    path: '/activities',
    desc: '照片、记录与共同的回忆',
    tag: '记忆碎片'
  }
]
const navLinks = [
  { name: '成员', path: '/members', title: '绯想天住民', number: '03' },
  { name: '群史', path: '/history', title: '绯想天群史', number: '04' },
  { name: '社群链接', path: '/social', title: '博丽大结界', number: '05' }
]
const isActivityRoute = computed(
  () =>
    route.path === '/activities' ||
    route.path.startsWith('/activity/') ||
    route.path === '/events' ||
    route.path.startsWith('/events/')
)

const closeMenus = () => {
  isMenuOpen.value = false
  isActivitiesOpen.value = false
  isMobileActivitiesOpen.value = false
}
const toggleMenu = () => {
  const nextOpen = !isMenuOpen.value
  closeMenus()
  isMenuOpen.value = nextOpen
}
const handleEscape = (event) => {
  if (event.key !== 'Escape') return
  if (isActivitiesOpen.value) {
    isActivitiesOpen.value = false
    desktopActivityButton.value?.focus()
  } else if (isMobileActivitiesOpen.value && isMenuOpen.value) {
    isMobileActivitiesOpen.value = false
    mobileActivityButton.value?.focus()
  } else if (isMenuOpen.value) {
    closeMenus()
    mobileMenuButton.value?.focus()
  } else {
    return
  }
  event.preventDefault()
}
const handleOutside = (event) => {
  if (navRef.value && !navRef.value.contains(event.target)) closeMenus()
}
const handleActivityFocusOut = (event) => {
  if (!event.currentTarget.contains(event.relatedTarget))
    isActivitiesOpen.value = false
}
const handleScroll = () => {
  const threshold =
    route.path === '/' ? Math.max(64, window.innerHeight * 0.6) : 16
  isScrolled.value = window.scrollY > threshold
  const scrollable = document.documentElement.scrollHeight - window.innerHeight
  readingProgress.value =
    scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0
}
watch(
  () => route.fullPath,
  () => {
    closeMenus()
    window.requestAnimationFrame(handleScroll)
  }
)

onMounted(() => {
  handleScroll()
  desktopQuery = window.matchMedia('(min-width: 1024px)')
  desktopQuery.addEventListener('change', closeMenus)
  window.addEventListener('scroll', handleScroll, { passive: true })
  window.addEventListener('resize', handleScroll, { passive: true })
  document.addEventListener('pointerdown', handleOutside)
  document.addEventListener('focusin', handleOutside)
  document.addEventListener('keydown', handleEscape)
})
onUnmounted(() => {
  desktopQuery?.removeEventListener('change', closeMenus)
  window.removeEventListener('scroll', handleScroll)
  window.removeEventListener('resize', handleScroll)
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
    :style="{ '--reading-progress': readingProgress }"
  >
    <div class="club-container">
      <div class="flex h-16 items-center justify-between gap-3">
        <RouterLink
          to="/"
          class="club-wordmark flex min-h-11 shrink-0 items-center gap-2.5"
          aria-label="桂航绯想天同好会首页"
          @click="closeMenus"
        >
          <ClubAvatar
            :src="site.config.badge_image"
            class="hidden h-9 w-9 lg:block"
          />
          <span class="flex flex-col gap-0.5">
            <span
              class="club-display whitespace-nowrap font-serif text-lg font-bold tracking-wider"
              >桂航绯想天</span
            >
            <span
              class="club-wordmark-subtitle text-[8px] font-medium tracking-[.22em]"
              >GUAT TOUHOU FANS CLUB</span
            >
          </span>
        </RouterLink>

        <div class="hidden items-center gap-1 lg:flex">
          <RouterLink
            to="/"
            class="nav-link"
            exact-active-class="nav-link-active"
            @click="closeMenus"
            ><span class="nav-number" aria-hidden="true">01</span
            >首页</RouterLink
          >
          <div class="relative" @focusout="handleActivityFocusOut">
            <button
              id="desktop-activities-trigger"
              ref="desktopActivityButton"
              type="button"
              class="nav-link gap-1.5"
              :class="
                isActivityRoute || isActivitiesOpen ? 'nav-link-active' : ''
              "
              :aria-expanded="isActivitiesOpen"
              aria-controls="desktop-activities-panel"
              @click="isActivitiesOpen = !isActivitiesOpen"
            >
              <span class="nav-number" aria-hidden="true">02</span>活动
              <svg
                class="h-3.5 w-3.5 transition-transform duration-200"
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
                :inert="isActivitiesOpen ? undefined : ''"
                id="desktop-activities-panel"
                role="group"
                aria-labelledby="desktop-activities-trigger"
                class="club-nav-panel absolute left-0 top-full mt-2 w-72 border p-2 shadow-lg"
              >
                <RouterLink
                  v-for="link in activityLinks"
                  :key="link.path"
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
                </RouterLink>
              </div>
            </Transition>
          </div>
          <RouterLink
            v-for="link in navLinks"
            :key="link.path"
            :to="link.path"
            :title="link.title"
            class="nav-link"
            active-class="nav-link-active"
            @click="closeMenus"
            ><span class="nav-number" aria-hidden="true">{{ link.number }}</span
            >{{ link.name }}</RouterLink
          >
          <div
            class="mx-2 h-5 w-px bg-current opacity-20"
            aria-hidden="true"
          ></div>
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
          <RouterLink
            to="/join"
            class="club-invitation club-nav-join ml-4 whitespace-nowrap"
            @click="closeMenus"
            ><span class="club-invitation-seal" aria-hidden="true">入社</span>
            <span class="club-invitation-label">加入我们</span>
            <ClubIcon name="arrow" class="club-invitation-arrow"
          /></RouterLink>
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
        :inert="isMenuOpen ? undefined : ''"
        id="mobile-navigation"
        class="club-nav-panel max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain border-t px-4 pb-5 pt-3 lg:hidden"
      >
        <div class="mx-auto max-w-7xl space-y-1">
          <RouterLink
            to="/"
            class="mobile-nav-link"
            exact-active-class="nav-link-active"
            @click="closeMenus"
            ><span class="nav-number" aria-hidden="true">01</span
            >首页</RouterLink
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
              :inert="isMobileActivitiesOpen ? undefined : ''"
              id="mobile-activities-panel"
              role="group"
              aria-labelledby="mobile-activities-trigger"
              class="ml-4 space-y-1 border-l border-sky-100 pl-3 dark:border-slate-800"
            >
              <RouterLink
                v-for="link in activityLinks"
                :key="link.path"
                :to="link.path"
                class="mobile-nav-link flex-wrap gap-x-2 text-sm"
                active-class="nav-link-active"
                @click="closeMenus"
                >{{ link.name
                }}<span
                  class="text-xs font-normal text-slate-500 dark:text-slate-400"
                  >{{ link.tag }}</span
                ></RouterLink
              >
            </div>
          </Transition>
          <RouterLink
            v-for="link in navLinks"
            :key="link.path"
            :to="link.path"
            :title="link.title"
            class="mobile-nav-link"
            active-class="nav-link-active"
            @click="closeMenus"
            ><span class="nav-number" aria-hidden="true">{{ link.number }}</span
            >{{ link.name }}</RouterLink
          >
          <div
            class="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800"
          >
            <RouterLink
              to="/logs"
              class="mobile-nav-link justify-center text-sm"
              @click="closeMenus"
              >站点日志</RouterLink
            >
            <RouterLink
              to="/login"
              class="mobile-nav-link justify-center text-sm"
              @click="closeMenus"
              >管理员登录</RouterLink
            >
          </div>
          <RouterLink
            to="/join"
            class="club-invitation club-nav-join mt-3 flex w-full min-h-12"
            @click="closeMenus"
            ><span class="club-invitation-seal" aria-hidden="true">入社</span>
            <span class="club-invitation-label">加入桂航绯想天</span>
            <ClubIcon name="arrow" class="club-invitation-arrow"
          /></RouterLink>
        </div>
      </div>
    </Transition>
  </nav>
</template>

<style scoped>
.club-navbar {
  --nav-ink: #334155;
  --nav-accent: #0369a1;
  color: var(--nav-ink);
  background: rgb(251 251 248 / 0.96);
  border-bottom: 1px solid rgb(148 163 184 / 0.22);
  backdrop-filter: blur(14px);
  transition:
    background-color 250ms ease,
    color 250ms ease,
    border-color 250ms ease;
}
:global(.dark .club-navbar) {
  --nav-ink: #e2e8f0;
  --nav-accent: #bae6fd;
  background: rgb(16 25 35 / 0.96);
}
.club-navbar[data-immersive='true'] {
  --nav-ink: #f1f5f9;
  --nav-accent: #bae6fd;
  background: transparent;
  border-color: rgb(255 255 255 / 0.22);
  backdrop-filter: none;
}
.club-navbar::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 1px;
  background: var(--nav-accent);
  transform: scaleX(var(--reading-progress, 0));
  transform-origin: left;
  pointer-events: none;
}
.club-wordmark {
  color: var(--nav-ink);
}
.club-wordmark-subtitle {
  opacity: 0.65;
}
.nav-number {
  font-family: ui-monospace, monospace;
  font-size: 9px;
  font-weight: 400;
  opacity: 0.55;
}
.nav-link {
  @apply relative inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap px-2.5 text-sm font-medium;
  color: var(--nav-ink);
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
  transition: transform 220ms ease;
  transform-origin: left;
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
  transform: rotate(45deg);
  background: var(--nav-accent);
}
.nav-icon {
  @apply inline-flex h-11 w-10 shrink-0 items-center justify-center transition-colors;
  color: var(--nav-ink);
  opacity: 0.8;
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
.club-nav-join {
  --invitation-ink: var(--nav-ink);
  padding: 0.35rem 0.15rem;
  border-bottom: 1px solid var(--invitation-line);
  background: transparent;
  transition: border-color 250ms ease;
}
.club-navbar[data-immersive='true'] .club-nav-join {
  --invitation-line: rgb(224 242 254 / 0.4);
  --invitation-accent: #edb2a5;
}
:global(.dark .club-navbar .club-nav-join) {
  --invitation-line: rgb(186 230 253 / 0.35);
  --invitation-accent: #edb2a5;
}
.club-nav-join:is(:hover, :focus-visible) {
  border-bottom-color: var(--invitation-accent);
}
@media (max-width: 359px) {
  .club-wordmark-subtitle {
    letter-spacing: 0.12em;
    font-size: 7px;
  }
  .club-wordmark {
    gap: 0.5rem;
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
  }
}
</style>
