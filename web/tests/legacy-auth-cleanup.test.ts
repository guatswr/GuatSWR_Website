import { expect, it, vi } from 'vitest'
import { clearLegacyAuthStorage } from '../app/utils/legacy-auth-cleanup'

it('removes exactly the four archived host credentials, preserving theme and opaque BFF cookies', () => {
  const values = new Map([['token', 'old'], ['user', 'admin'], ['role', 'admin'], ['avatar', '/old'], ['theme-preference', 'dark']])
  const cookies: string[] = []
  clearLegacyAuthStorage({ removeItem: key => { values.delete(key) } }, { set cookie(value: string) { cookies.push(value) } })
  expect([...values]).toEqual([['theme-preference', 'dark']])
  expect(cookies).toEqual(['token', 'user', 'role', 'avatar'].map(key => `${key}=; Max-Age=0; Path=/; SameSite=Lax`))
  expect(cookies.join(';')).not.toContain('Domain=')
  expect(cookies.join(';')).not.toContain('guatswr-next')
})

it('continues clearing host cookies when storage is unavailable', () => {
  const cookies: string[] = []
  const removeItem = vi.fn(() => { throw new Error('disabled') })
  clearLegacyAuthStorage({ removeItem }, { set cookie(value: string) { cookies.push(value) } })
  expect(removeItem).toHaveBeenCalledTimes(4)
  expect(cookies).toHaveLength(4)
})
