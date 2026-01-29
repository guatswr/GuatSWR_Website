import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getThemeMode, getResolvedTheme, setThemeMode } from '../utils/theme.js'

// 使用单例模式或外部状态，确保不同组件引用时状态同步
// 这里简单起见，我们把核心状态放在函数外，或者让每个组件初始化自己的监听
const themeMode = ref(getThemeMode())
const resolvedTheme = ref(getResolvedTheme())

export function useTheme() {
  const isDark = computed(() => resolvedTheme.value === 'dark')
  let themeSyncTimer = null

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

  // 初始化监听器
  const initThemeListener = () => {
    refreshThemeState()
    window.addEventListener('storage', handleStorage)
    
    // 自动模式下的定时检查
    themeSyncTimer = setInterval(() => {
      if (themeMode.value === 'auto') {
        refreshThemeState()
      }
    }, 60000)
  }

  // 清理
  const cleanupThemeListener = () => {
    window.removeEventListener('storage', handleStorage)
    if (themeSyncTimer) {
      clearInterval(themeSyncTimer)
      themeSyncTimer = null
    }
  }

  // 自动在组件挂载/卸载时处理（如果需要在 App.vue 以外使用，这很有用）
  onMounted(() => {
    // 只有第一次挂载或者没有初始化时才执行，这里为了简单，
    // 我们假设主要由 App.vue 调用 init，其他组件只调用状态
  })

  return {
    themeMode,
    isDark,
    toggleTheme,
    initThemeListener,
    cleanupThemeListener
  }
}