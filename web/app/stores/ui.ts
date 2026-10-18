import { defineStore } from 'pinia'
import { parseThemeMode, resolveTheme, THEME_KEY } from '~/utils/theme'
import type { ResolvedTheme, ThemeMode } from '~/utils/theme'

export const useUiStore = defineStore('ui-preferences', () => {
  const themeMode = ref<ThemeMode>('auto')
  const resolvedTheme = ref<ResolvedTheme>('light')
  let timer: ReturnType<typeof setInterval> | undefined
  let listening = false

  function refresh() {
    try { themeMode.value = parseThemeMode(localStorage.getItem(THEME_KEY)) }
    catch { themeMode.value = 'auto' }
    resolvedTheme.value = resolveTheme(themeMode.value)
    const root = document.documentElement
    root.classList.toggle('dark', resolvedTheme.value === 'dark')
    root.dataset.theme = resolvedTheme.value
    root.style.colorScheme = resolvedTheme.value
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content', resolvedTheme.value === 'dark' ? '#101923' : '#fbfbf8',
    )
  }
  function onStorage(event: StorageEvent) { if (event.key === THEME_KEY || event.key === null) refresh() }
  function toggleTheme() {
    const mode = resolvedTheme.value === 'dark' ? 'light' : 'dark'
    try { localStorage.setItem(THEME_KEY, mode) }
    catch {
      themeMode.value = mode
      resolvedTheme.value = mode
      document.documentElement.classList.toggle('dark', mode === 'dark')
      document.documentElement.dataset.theme = mode
      document.documentElement.style.colorScheme = mode
      return
    }
    refresh()
  }
  function start() {
    refresh()
    if (listening) return
    listening = true
    window.addEventListener('storage', onStorage)
    timer = setInterval(() => { if (themeMode.value === 'auto') refresh() }, 60_000)
  }
  function stop() {
    if (!listening) return
    window.removeEventListener('storage', onStorage)
    clearInterval(timer)
    timer = undefined
    listening = false
  }
  return { themeMode, resolvedTheme, toggleTheme, start, stop }
})
