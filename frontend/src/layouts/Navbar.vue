<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTheme } from '../composables/useTheme.js'

const router = useRouter()
const isMenuOpen = ref(false)
const isScrolled = ref(false)

// 使用刚才创建的 Composable
const { themeMode, isDark, toggleTheme } = useTheme()

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

onMounted(() => {
  window.addEventListener('scroll', handleScroll)
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})
</script>

<template>
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
        <!-- Logo -->
        <div class="flex items-center cursor-pointer" @click="router.push('/')">
          <span class="text-2xl font-bold text-sky-600 dark:text-sky-400">桂航绯想天</span>
        </div>
        
        <!-- Desktop Menu -->
        <div class="hidden md:flex items-center space-x-6 lg:space-x-8">
          <router-link 
            v-for="link in navLinks" 
            :key="link.name" 
            :to="link.path"
            class="text-gray-600 hover:text-sky-500 dark:text-gray-200 dark:hover:text-sky-300 transition-colors font-medium"
          >
            {{ link.name }}
          </router-link>

          <!-- 分隔线 (视觉优化) -->
          <div class="h-6 w-px bg-gray-200 dark:bg-slate-700 mx-2"></div>

          <!-- 近期日志入口 (新增 - 桌面端) -->
          <router-link 
            to="/logs" 
            class="flex items-center justify-center w-10 h-10 rounded-full border border-gray-200 hover:bg-amber-50 hover:border-amber-200 hover:scale-105 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:border-amber-900/50 transition-all duration-300"
            title="近期日志"
          >
            <span class="text-lg leading-none">📜</span>
          </router-link>

          <!-- Theme Toggle -->
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
          
          <!-- Admin Login -->
          <router-link to="/login" 
            class="group relative flex items-center justify-center w-10 h-10 rounded-full border border-gray-200 text-red-500 hover:bg-red-500 hover:text-white hover:border-red-500 hover:shadow-[0_0_15px_rgba(239,68,68,0.5)] dark:border-slate-700 dark:text-red-400 dark:hover:bg-red-500 dark:hover:text-white transition-all duration-300"
            title="博丽神社通道 (管理员登录)"
          >
            <svg class="w-6 h-6 transform transition-transform group-hover:-translate-y-0.5" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 6C2 5.44772 2.44772 5 3 5H21C21.5523 5 22 5.44772 22 6C22 6.55228 21.5523 7 21 7H18V9H17V20H19V22H5V20H7V9H6V7H3C2.44772 7 2 6.55228 2 6Z" fill-opacity="0.2" class="group-hover:fill-opacity-0 transition-all"/>
              <path fill-rule="evenodd" clip-rule="evenodd" d="M4 6H20V7H17.8L18 9H19V10.5H18V20H16V10.5H8V20H6V10.5H5V9H6.2L6.4 7H4V6ZM16 9H8V7.5H16V9ZM4 3H20V4.5H4V3Z" />
            </svg>
          </router-link>
        </div>

        <!-- Mobile Menu Icons -->
        <div class="md:hidden flex items-center gap-2">
           <!-- 近期日志入口 (移动端 - 修复样式) -->
           <router-link 
             to="/logs" 
             class="flex items-center justify-center w-10 h-10 rounded-full border border-gray-200 active:scale-95 dark:border-slate-700 dark:bg-slate-800/50 transition"
             title="近期日志"
           >
             <span class="text-lg leading-none">📜</span>
           </router-link>

          <!-- Theme Toggle (Mobile - 修复样式) -->
          <button
            type="button"
            class="flex items-center justify-center w-10 h-10 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-slate-700 dark:text-gray-200 dark:bg-slate-800/50 dark:hover:bg-slate-800 transition"
            @click="toggleTheme"
          >
            <svg v-if="isDark" class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 4.5a1 1 0 0 1 1 1V7a1 1 0 1 1-2 0V5.5a1 1 0 0 1 1-1Zm0 11a1 1 0 0 1 1 1V19a1 1 0 1 1-2 0v-2.5a1 1 0 0 1 1-1Zm7.5-3.5a1 1 0 0 1 1 1 1 1 0 0 1-1 1H18a1 1 0 1 1 0-2h1.5Zm-13.5 0a1 1 0 0 1 0 2H4.5a1 1 0 1 1 0-2H6Zm9.78-4.28a1 1 0 0 1 1.42 1.42l-1.06 1.06a1 1 0 1 1-1.42-1.42l1.06-1.06Zm-7.5 7.5a1 1 0 0 1 1.42 1.42l-1.06 1.06a1 1 0 1 1-1.42-1.42l1.06-1.06Zm7.5 1.06a1 1 0 1 1-1.42 1.42l-1.06-1.06a1 1 0 0 1 1.42-1.42l1.06 1.06ZM7.28 6.28a1 1 0 0 1 1.42 0l1.06 1.06a1 1 0 0 1-1.42 1.42L7.28 7.7a1 1 0 0 1 0-1.42ZM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" />
            </svg>
            <svg v-else class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3a.75.75 0 0 1 .7 1.04 6.5 6.5 0 0 0 8.26 8.26.75.75 0 0 1 1.04.7Z" />
            </svg>
          </button>

          <!-- Login (Mobile - 修复样式) -->
          <router-link to="/login" 
            class="flex items-center justify-center w-10 h-10 rounded-full border border-gray-200 text-red-500 dark:border-slate-700 dark:text-red-400 dark:bg-slate-800/50 transition"
          >
             <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L13 3H17V5H19V7H17V19H19V21H5V19H7V7H5V5H7V3H12M9 7V19H15V7H9M11 9H13V12H11V9Z"/></svg>
          </router-link>

          <!-- Hamburger -->
          <button @click="toggleMenu" class="ml-1 text-gray-600 dark:text-gray-200 focus:outline-none p-2 rounded-md hover:bg-gray-100 dark:hover:bg-slate-800 transition">
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path v-if="!isMenuOpen" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
              <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Mobile Dropdown -->
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
</template>