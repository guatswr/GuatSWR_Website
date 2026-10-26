export type ThemeMode = 'auto' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'
export const THEME_KEY = 'theme-preference'

export function browserThemeColor(theme: ResolvedTheme, path: string): string {
  return path === '/' ? '#0f172a' : theme === 'dark' ? '#101923' : '#fbfbf8'
}

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
// Modern Beijing time is UTC+08:00. The boot script handles the current clock
// only (not historical dates); avoid initializing ICU on the render-blocking
// path. The general date-taking resolver above retains IANA historical rules.
export const THEME_BOOT_SCRIPT = `(()=>{let m='auto';try{m=localStorage.getItem('theme-preference')||'auto'}catch{}const h=new Date(Date.now()+28800000).getUTCHours();const d=m==='dark'||(m!=='light'&&(h>=19||h<8));const r=document.documentElement;r.classList.toggle('dark',d);r.dataset.theme=d?'dark':'light';r.style.colorScheme=d?'dark':'light';document.querySelector('meta[name="theme-color"]')?.setAttribute('content',r.dataset.pageSurface==='hero'?'#0f172a':d?'#101923':'#fbfbf8')})()`
