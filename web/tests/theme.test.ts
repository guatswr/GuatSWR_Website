import { describe, expect, it } from 'vitest'
import { runInNewContext } from 'node:vm'
import { browserThemeColor, parseThemeMode, resolveTheme, THEME_BOOT_SCRIPT } from '../app/utils/theme'

describe('archived Beijing theme schedule', () => {
  it.each([
    ['2026-10-17T23:59:59Z', 'dark'],
    ['2026-10-18T00:00:00Z', 'light'],
    ['2026-10-18T10:59:59Z', 'light'],
    ['2026-10-18T11:00:00Z', 'dark'],
  ] as const)('resolves the 08:00 and 19:00 boundaries independently of host timezone (%s)', (date, expected) => {
    expect(resolveTheme('auto', new Date(date))).toBe(expected)
  })
  it('preserves explicit preferences and treats unknown storage as automatic', () => {
    expect(parseThemeMode('system')).toBe('auto')
    expect(resolveTheme('light', new Date('2026-10-18T11:00:00Z'))).toBe('light')
    expect(resolveTheme('dark', new Date('2026-10-18T00:00:00Z'))).toBe('dark')
  })
  it.each([
    '2026-10-17T23:59:59Z', '2026-10-18T00:00:00Z',
    '2026-10-18T10:59:59Z', '2026-10-18T11:00:00Z',
  ])('boots the same theme before hydration at the Beijing boundary %s', date => {
    for (const mode of ['auto', 'light', 'dark', 'system', 'storage-failed']) {
      let dark = false
      const root = { classList: { toggle: (_name: string, value: boolean) => { dark = value } }, dataset: {} as Record<string, string>, style: {} as Record<string, string> }
      class Clock extends Date { static override now() { return Date.parse(date) } }
      runInNewContext(THEME_BOOT_SCRIPT, {
        Date: Clock,
        document: { documentElement: root, querySelector: () => null },
        localStorage: { getItem: () => {
          if (mode === 'storage-failed') throw new Error('storage unavailable')
          return mode
        } },
      })
      const expected = resolveTheme(parseThemeMode(mode), new Date(date))
      expect(root.dataset.theme).toBe(expected)
      expect(root.style.colorScheme).toBe(expected)
      expect(dark).toBe(expected === 'dark')
    }
  })
  it.each([
    ['light', '/', '#0f172a'],
    ['dark', '/', '#0f172a'],
    ['light', '/social', '#fbfbf8'],
    ['dark', '/social', '#101923'],
  ] as const)('uses the page surface for browser chrome (%s, %s)', (theme, path, expected) => {
    expect(browserThemeColor(theme, path)).toBe(expected)
  })
  it('keeps the homepage gesture-area color dark before hydration in day mode', () => {
    let color = '#38bdf8'
    const root = { classList: { toggle: () => {} }, dataset: { pageSurface: 'hero' }, style: {} }
    runInNewContext(THEME_BOOT_SCRIPT, {
      Date,
      document: {
        documentElement: root,
        querySelector: () => ({ setAttribute: (_name: string, value: string) => { color = value } }),
      },
      localStorage: { getItem: () => 'light' },
    })
    expect(color).toBe('#0f172a')
  })
})
