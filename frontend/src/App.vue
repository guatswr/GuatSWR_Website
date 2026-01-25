<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { getThemeMode, getResolvedTheme, setThemeMode } from './utils/theme'

const isMenuOpen = ref(false)
const isScrolled = ref(false)
const footerRef = ref(null)
const router = useRouter()
const themeMode = ref(getThemeMode())
const resolvedTheme = ref(getResolvedTheme())
const isDark = computed(() => resolvedTheme.value === 'dark')
const isRouteLoading = ref(false)
const routeProgress = ref(0)
const progressTotal = ref(0)
const progressDone = ref(0)
const hasRealProgress = ref(false)
const isProgressDebug = ref(false)

const navLinks = [
  { name: '首页', path: '/' },
  { name: '近期群活', path: '/activities' },
  { name: '绯想天住民', path: '/members' },
  { name: '绯想天群史', path: '/history' },
  { name: '博丽大结界', path: '/social' },
]

const toggleMenu = () => {
  isMenuOpen.value = !isMenuOpen.value
}

const handleScroll = () => {
  isScrolled.value = window.scrollY > 20
}

const setFooterHeightVar = () => {
  if (!footerRef.value) return
  const h = footerRef.value.offsetHeight || 0
  document.documentElement.style.setProperty('--footer-h', `${h}px`)
}

let footerObserver = null
let themeSyncTimer = null
let progressTimer = null
let finishTimer = null
let idleFinishTimer = null
let hardFinishTimer = null
let imageObserver = null
let imageObserverStopTimer = null
let pendingResources = 0
let removeBeforeHook = null
let removeAfterHook = null
let removeErrorHook = null

const easeOutFast = (t) => 1 - Math.pow(1 - t, 3)

const debugLog = (...args) => {
  if (!isProgressDebug.value) return
  console.debug('[route-progress]', ...args)
}

const updateProgressFromReal = () => {
  if (!hasRealProgress.value || progressTotal.value === 0) return
  const ratio = Math.min(1, progressDone.value / progressTotal.value)
  const eased = easeOutFast(ratio)
  const target = Math.round(12 + eased * 82)
  if (target > routeProgress.value) {
    routeProgress.value = target
  }
  if (ratio >= 1) {
    finishRouteProgress()
  }
}

const handleResourceStart = () => {
  if (!isRouteLoading.value) return
  pendingResources += 1
  progressTotal.value += 1
  hasRealProgress.value = true
  debugLog('resource start', { pending: pendingResources, total: progressTotal.value, done: progressDone.value })
  updateProgressFromReal()
}

const handleResourceDone = () => {
  if (!isRouteLoading.value) return
  if (pendingResources > 0) pendingResources -= 1
  progressDone.value += 1
  debugLog('resource done', { pending: pendingResources, total: progressTotal.value, done: progressDone.value })
  updateProgressFromReal()
  if (pendingResources === 0) {
    if (idleFinishTimer) clearTimeout(idleFinishTimer)
    idleFinishTimer = setTimeout(() => {
      finishRouteProgress()
    }, 200)
  }
}

const trackImagesInView = () => {
  const main = document.querySelector('main')
  if (!main) return
  const imgs = Array.from(main.querySelectorAll('img'))
  if (imgs.length) debugLog('scan images', { count: imgs.length })
  imgs.forEach((img) => {
    if (img.dataset.progressTracked === '1') return
    img.dataset.progressTracked = '1'
    if (img.complete) {
      if (img.naturalWidth > 0) return
      return
    }
    handleResourceStart()
    let finished = false
    let timeoutId = null
    const done = () => {
      if (finished) return
      finished = true
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      img.removeEventListener('load', done)
      img.removeEventListener('error', done)
      handleResourceDone()
    }
    img.addEventListener('load', done, { once: true })
    img.addEventListener('error', done, { once: true })
    timeoutId = setTimeout(done, 6000)
  })
}

const startRouteProgress = () => {
  if (finishTimer) {
    clearTimeout(finishTimer)
    finishTimer = null
  }
  if (idleFinishTimer) {
    clearTimeout(idleFinishTimer)
    idleFinishTimer = null
  }
  if (hardFinishTimer) {
    clearTimeout(hardFinishTimer)
    hardFinishTimer = null
  }
  if (progressTimer) {
    clearInterval(progressTimer)
  }
  isRouteLoading.value = true
  routeProgress.value = 8
  progressTotal.value = 0
  progressDone.value = 0
  hasRealProgress.value = false
  pendingResources = 0
  debugLog('start route progress')
  hardFinishTimer = setTimeout(() => {
    finishRouteProgress()
  }, 8000)
  progressTimer = setInterval(() => {
    if (hasRealProgress.value) return
    if (routeProgress.value < 60) {
      const next = routeProgress.value + Math.max(1, (60 - routeProgress.value) / 8)
      routeProgress.value = Math.min(60, Math.round(next))
    }
  }, 180)
}

const finishRouteProgress = () => {
  if (progressTimer) {
    clearInterval(progressTimer)
    progressTimer = null
  }
  if (idleFinishTimer) {
    clearTimeout(idleFinishTimer)
    idleFinishTimer = null
  }
  if (hardFinishTimer) {
    clearTimeout(hardFinishTimer)
    hardFinishTimer = null
  }
  if (imageObserver) {
    imageObserver.disconnect()
    imageObserver = null
  }
  if (imageObserverStopTimer) {
    clearTimeout(imageObserverStopTimer)
    imageObserverStopTimer = null
  }
  debugLog('finish route progress', { total: progressTotal.value, done: progressDone.value })
  routeProgress.value = 100
  if (finishTimer) {
    clearTimeout(finishTimer)
  }
  finishTimer = setTimeout(() => {
    isRouteLoading.value = false
    routeProgress.value = 0
  }, 280)
}

removeBeforeHook = router.beforeEach(() => {
  startRouteProgress()
  return true
})

removeAfterHook = router.afterEach(async () => {
  await nextTick()
  trackImagesInView()
  const main = document.querySelector('main')
  if (main) {
    if (imageObserver) imageObserver.disconnect()
    imageObserver = new MutationObserver(() => trackImagesInView())
    imageObserver.observe(main, { childList: true, subtree: true })
    if (imageObserverStopTimer) clearTimeout(imageObserverStopTimer)
    imageObserverStopTimer = setTimeout(() => {
      if (imageObserver) {
        imageObserver.disconnect()
        imageObserver = null
      }
    }, 1500)
  }
  idleFinishTimer = setTimeout(() => {
    if (!hasRealProgress.value || progressTotal.value === 0) {
      finishRouteProgress()
    }
  }, 300)
})

removeErrorHook = router.onError(() => {
  finishRouteProgress()
})

/**
 * 移除 index.html 中的原生预加载层 (仅在首次进入网站时触发)
 * 确保新用户第一次进入时不会看到白屏，且在 Vue 挂载后该层能被销毁
 */
const removePreLoader = () => {
  const loader = document.getElementById('pre-loading-screen')
  if (loader) {
    loader.style.opacity = '0'
    setTimeout(() => {
      const existingLoader = document.getElementById('pre-loading-screen')
      if (existingLoader) existingLoader.remove()
    }, 400)
  }
}

const refreshThemeState = () => {
  themeMode.value = getThemeMode()
  resolvedTheme.value = getResolvedTheme()
}

const toggleTheme = () => {
  const nextMode = isDark.value ? 'light' : 'dark'
  setThemeMode(nextMode)
  refreshThemeState()
}

const handleStorage = (event) => {
  if (event.key === 'theme-preference') {
    refreshThemeState()
  }
}

const handleRequestStart = () => handleResourceStart()
const handleRequestEnd = () => handleResourceDone()

onMounted(() => {
  isProgressDebug.value = localStorage.getItem('route-progress-debug') === '1'
  window.__setRouteProgressDebug = (value) => {
    const next = value === undefined ? !isProgressDebug.value : Boolean(value)
    isProgressDebug.value = next
    localStorage.setItem('route-progress-debug', next ? '1' : '0')
    console.debug('[route-progress] debug', next ? 'enabled' : 'disabled')
  }
  window.addEventListener('scroll', handleScroll)
  setFooterHeightVar()
  if (window.ResizeObserver && footerRef.value) {
    footerObserver = new ResizeObserver(() => setFooterHeightVar())
    footerObserver.observe(footerRef.value)
  } else {
    window.addEventListener('resize', setFooterHeightVar)
  }
  // 仅处理 index.html 的首屏预加载层移除
  removePreLoader()

  refreshThemeState()
  window.addEventListener('storage', handleStorage)
  window.addEventListener('route-progress:request-start', handleRequestStart)
  window.addEventListener('route-progress:request-end', handleRequestEnd)
  themeSyncTimer = setInterval(() => {
    if (themeMode.value === 'auto') {
      refreshThemeState()
    }
  }, 60000)
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
  window.removeEventListener('resize', setFooterHeightVar)
  if (footerObserver) {
    footerObserver.disconnect()
    footerObserver = null
  }
  window.removeEventListener('storage', handleStorage)
  window.removeEventListener('route-progress:request-start', handleRequestStart)
  window.removeEventListener('route-progress:request-end', handleRequestEnd)
  if (themeSyncTimer) {
    clearInterval(themeSyncTimer)
    themeSyncTimer = null
  }
  if (progressTimer) {
    clearInterval(progressTimer)
    progressTimer = null
  }
  if (idleFinishTimer) {
    clearTimeout(idleFinishTimer)
    idleFinishTimer = null
  }
  if (hardFinishTimer) {
    clearTimeout(hardFinishTimer)
    hardFinishTimer = null
  }
  if (imageObserver) {
    imageObserver.disconnect()
    imageObserver = null
  }
  if (imageObserverStopTimer) {
    clearTimeout(imageObserverStopTimer)
    imageObserverStopTimer = null
  }
  if (finishTimer) {
    clearTimeout(finishTimer)
    finishTimer = null
  }
  if (removeBeforeHook) {
    removeBeforeHook()
    removeBeforeHook = null
  }
  if (removeAfterHook) {
    removeAfterHook()
    removeAfterHook = null
  }
  if (removeErrorHook) {
    removeErrorHook()
    removeErrorHook = null
  }
})
</script>

<template>
  <div class="min-h-screen flex flex-col font-sans bg-white text-gray-900 dark:bg-slate-950 dark:text-gray-100 transition-colors">

    <!-- 页面切换进度条（类似 GitHub） -->
    <div class="route-progress" aria-hidden="true">
      <div
        class="route-progress__bar"
        :style="{ width: `${routeProgress}%`, opacity: isRouteLoading ? 1 : 0 }"
      ></div>
    </div>
    
    <!-- 全局加载层已移除，改为由各页面组件自行控制局部加载状态 -->

    <!-- 导航栏 -->
    <nav 
      class="fixed w-full z-50 transition-all duration-300 border-b border-transparent"
      :class="[
        isScrolled 
          ? 'bg-white/80 backdrop-blur-md shadow-sm supports-[backdrop-filter]:bg-white/60 dark:bg-slate-900/80 dark:supports-[backdrop-filter]:bg-slate-900/60' 
          : 'bg-white shadow-md dark:bg-slate-950 dark:shadow-black/40'
      ]"
    >
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between h-16">
          <div class="flex items-center cursor-pointer" @click="router.push('/')">
            <span class="text-2xl font-bold text-sky-600 dark:text-sky-400">桂航绯想天</span>
          </div>
          
          <div class="hidden md:flex items-center space-x-8">
            <router-link 
              v-for="link in navLinks" 
              :key="link.name" 
              :to="link.path"
              class="text-gray-600 hover:text-sky-500 dark:text-gray-200 dark:hover:text-sky-300 transition-colors font-medium"
            >
              {{ link.name }}
            </router-link>

            <button
              type="button"
              class="flex items-center justify-center w-10 h-10 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-slate-700 dark:text-gray-200 dark:hover:bg-slate-800 transition"
              :title="themeMode === 'auto' ? `当前自动：${isDark ? '夜间' : '日间'}` : `当前：${isDark ? '夜间' : '日间'}`"
              aria-label="切换夜间/日间模式"
              @click="toggleTheme"
            >
              <svg v-if="isDark" class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 4.5a1 1 0 0 1 1 1V7a1 1 0 1 1-2 0V5.5a1 1 0 0 1 1-1Zm0 11a1 1 0 0 1 1 1V19a1 1 0 1 1-2 0v-2.5a1 1 0 0 1 1-1Zm7.5-3.5a1 1 0 0 1 1 1 1 1 0 0 1-1 1H18a1 1 0 1 1 0-2h1.5Zm-13.5 0a1 1 0 0 1 0 2H4.5a1 1 0 1 1 0-2H6Zm9.78-4.28a1 1 0 0 1 1.42 1.42l-1.06 1.06a1 1 0 1 1-1.42-1.42l1.06-1.06Zm-7.5 7.5a1 1 0 0 1 1.42 1.42l-1.06 1.06a1 1 0 1 1-1.42-1.42l1.06-1.06Zm7.5 1.06a1 1 0 1 1-1.42 1.42l-1.06-1.06a1 1 0 0 1 1.42-1.42l1.06 1.06ZM7.28 6.28a1 1 0 0 1 1.42 0l1.06 1.06a1 1 0 0 1-1.42 1.42L7.28 7.7a1 1 0 0 1 0-1.42ZM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" />
              </svg>
              <svg v-else class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3a.75.75 0 0 1 .7 1.04 6.5 6.5 0 0 0 8.26 8.26.75.75 0 0 1 1.04.7Z" />
              </svg>
            </button>
            
            <router-link to="/login" 
              class="group relative flex items-center justify-center w-10 h-10 rounded-full border border-red-200 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white hover:border-red-500 hover:shadow-[0_0_15px_rgba(239,68,68,0.5)] dark:border-red-900/60 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-500 transition-all duration-300"
              title="博丽神社通道 (管理员登录)"
            >
              <svg class="w-6 h-6 transform transition-transform group-hover:-translate-y-0.5" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 6C2 5.44772 2.44772 5 3 5H21C21.5523 5 22 5.44772 22 6C22 6.55228 21.5523 7 21 7H18V9H17V20H19V22H5V20H7V9H6V7H3C2.44772 7 2 6.55228 2 6Z" fill-opacity="0.2" class="group-hover:fill-opacity-0 transition-all"/>
                <path fill-rule="evenodd" clip-rule="evenodd" d="M4 6H20V7H17.8L18 9H19V10.5H18V20H16V10.5H8V20H6V10.5H5V9H6.2L6.4 7H4V6ZM16 9H8V7.5H16V9ZM4 3H20V4.5H4V3Z" />
              </svg>
            </router-link>
          </div>

          <div class="md:hidden flex items-center gap-4">
            <button
              type="button"
              class="text-gray-600 hover:text-sky-500 dark:text-gray-200 dark:hover:text-sky-300 transition"
              :title="themeMode === 'auto' ? `当前自动：${isDark ? '夜间' : '日间'}` : `当前：${isDark ? '夜间' : '日间'}`"
              aria-label="切换夜间/日间模式"
              @click="toggleTheme"
            >
              <svg v-if="isDark" class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 4.5a1 1 0 0 1 1 1V7a1 1 0 1 1-2 0V5.5a1 1 0 0 1 1-1Zm0 11a1 1 0 0 1 1 1V19a1 1 0 1 1-2 0v-2.5a1 1 0 0 1 1-1Zm7.5-3.5a1 1 0 0 1 1 1 1 1 0 0 1-1 1H18a1 1 0 1 1 0-2h1.5Zm-13.5 0a1 1 0 0 1 0 2H4.5a1 1 0 1 1 0-2H6Zm9.78-4.28a1 1 0 0 1 1.42 1.42l-1.06 1.06a1 1 0 1 1-1.42-1.42l1.06-1.06Zm-7.5 7.5a1 1 0 0 1 1.42 1.42l-1.06 1.06a1 1 0 1 1-1.42-1.42l1.06-1.06Zm7.5 1.06a1 1 0 1 1-1.42 1.42l-1.06-1.06a1 1 0 0 1 1.42-1.42l1.06 1.06ZM7.28 6.28a1 1 0 0 1 1.42 0l1.06 1.06a1 1 0 0 1-1.42 1.42L7.28 7.7a1 1 0 0 1 0-1.42ZM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" />
              </svg>
              <svg v-else class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3a.75.75 0 0 1 .7 1.04 6.5 6.5 0 0 0 8.26 8.26.75.75 0 0 1 1.04.7Z" />
              </svg>
            </button>

            <router-link to="/login" class="text-red-400 hover:text-red-600 transition">
               <svg class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L13 3H17V5H19V7H17V19H19V21H5V19H7V7H5V5H7V3H12M9 7V19H15V7H9M11 9H13V12H11V9Z"/></svg>
            </router-link>

            <button @click="toggleMenu" class="text-gray-600 dark:text-gray-200 focus:outline-none">
              <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path v-if="!isMenuOpen" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
                <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div v-if="isMenuOpen" class="md:hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-gray-100 dark:border-slate-800">
        <div class="px-2 pt-2 pb-3 space-y-1">
          <router-link 
            v-for="link in navLinks" 
            :key="link.name" 
            :to="link.path"
            class="block px-3 py-2 text-base font-medium text-gray-700 hover:text-sky-500 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-slate-800 rounded-md"
            @click="isMenuOpen = false"
          >
            {{ link.name }}
          </router-link>
          <router-link to="/login" 
            class="block px-3 py-2 text-base font-medium text-red-500 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/30 rounded-md border-t border-gray-100 dark:border-slate-800 mt-2"
            @click="isMenuOpen = false"
          >
            博丽神社 (管理员入口)
          </router-link>
        </div>
      </div>
    </nav>

    <!-- 页面内容 -->
    <main class="flex-grow pt-16">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <!-- 页脚 -->
    <footer ref="footerRef" class="bg-gray-800 text-white dark:bg-slate-950 dark:text-gray-200 py-8">
      <div class="max-w-7xl mx-auto px-4 text-center">
        <p class="text-sm">© 2026 桂航绯想天同好会. All rights reserved.</p>
        <router-link to="/logs" class="block text-xs text-blue-300 hover:text-blue-200 dark:text-blue-300 mt-2">近期日志入口</router-link>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">Designed by Taropoi</p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* 全局变量默认值 */
:global(:root) {
  --footer-h: 0px;
}

/* 页面切换动画 */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.route-progress {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  z-index: 70;
  pointer-events: none;
}

.route-progress__bar {
  height: 100%;
  width: 0;
  background: linear-gradient(90deg, #e0f2fe 0%, #7dd3fc 55%, #38bdf8 100%);
  box-shadow: 0 0 6px rgba(56, 189, 248, 0.35);
  transition: width 0.2s ease, opacity 0.25s ease;
}

:global(.dark) :deep(.route-progress__bar) {
  background: linear-gradient(90deg, #0b2a3c 0%, #1e3a8a 45%, #38bdf8 100%);
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.5);
}
</style>
