export type ThemeMode = 'auto' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'
export const THEME_KEY = 'theme-preference'

export function parseThemeMode(value: unknown): ThemeMode {
  return value === 'light' || value === 'dark' ? value : 'auto'
}

export function resolveTheme(mode: ThemeMode, date = new Date()): ResolvedTheme {
  if (mode !== 'auto') return mode
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', hour12: false, timeZone: 'Asia/Shanghai',
  }).format(date)) % 24
  return hour >= 19 || hour < 8 ? 'dark' : 'light'
}

// Stateless cached HTML; read only a UI preference in the browser before paint.
// Keep the 19:00–08:00 Beijing automatic schedule used by the archived site.
export const THEME_BOOT_SCRIPT = `(()=>{let m='auto';try{m=localStorage.getItem('theme-preference')||'auto'}catch{}const h=Number(new Intl.DateTimeFormat('en-US',{hour:'numeric',hour12:false,timeZone:'Asia/Shanghai'}).format(new Date()))%24;const d=m==='dark'||(m!=='light'&&(h>=19||h<8));const r=document.documentElement;r.classList.toggle('dark',d);r.dataset.theme=d?'dark':'light';r.style.colorScheme=d?'dark':'light'})()`
