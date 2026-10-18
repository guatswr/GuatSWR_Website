import { describe, expect, it } from 'vitest'
import { parseThemeMode, resolveTheme } from '../app/utils/theme'

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
})
