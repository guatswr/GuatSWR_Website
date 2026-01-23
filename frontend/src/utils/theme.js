const THEME_KEY = 'theme-preference'
const AUTO_INTERVAL_MS = 60 * 1000

let autoTimer = null

const getBeijingHour = () => {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Asia/Shanghai'
    })
    const hour = Number(formatter.format(new Date()))
    return Number.isNaN(hour) ? new Date().getHours() : hour
  } catch (error) {
    return new Date().getHours()
  }
}

const isNightHour = (hour) => hour >= 19 || hour < 8

const resolveTheme = (mode) => {
  if (mode === 'dark' || mode === 'light') return mode
  const hour = getBeijingHour()
  return isNightHour(hour) ? 'dark' : 'light'
}

const applyTheme = (theme) => {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.dataset.theme = theme
}

const startAutoTimer = () => {
  if (autoTimer) return
  autoTimer = setInterval(() => {
    applyTheme(resolveTheme('auto'))
  }, AUTO_INTERVAL_MS)
}

const stopAutoTimer = () => {
  if (!autoTimer) return
  clearInterval(autoTimer)
  autoTimer = null
}

const getThemeMode = () => {
  if (typeof localStorage === 'undefined') return 'auto'
  return localStorage.getItem(THEME_KEY) || 'auto'
}

const setThemeMode = (mode) => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(THEME_KEY, mode)
  }
  applyTheme(resolveTheme(mode))
  if (mode === 'auto') {
    startAutoTimer()
  } else {
    stopAutoTimer()
  }
}

const getResolvedTheme = () => resolveTheme(getThemeMode())

const initTheme = () => {
  const stored = getThemeMode()
  if (stored === 'auto') {
    startAutoTimer()
  }
  applyTheme(resolveTheme(stored))
}

export {
  getThemeMode,
  getResolvedTheme,
  setThemeMode,
  initTheme
}
