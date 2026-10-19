import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOGIN_BACKGROUNDS, pickLoginBackground } from '../app/utils/login-background'

describe('login background selection', () => {
  it('maps seeded randomness onto the archived image list deterministically', () => {
    expect(LOGIN_BACKGROUNDS).toEqual(['/login-bg/1.jpg', '/login-bg/2.jpg', '/login-bg/3.jpg'])
    expect(pickLoginBackground(LOGIN_BACKGROUNDS, () => 0)).toBe('/login-bg/1.jpg')
    expect(pickLoginBackground(LOGIN_BACKGROUNDS, () => 0.34)).toBe('/login-bg/2.jpg')
    expect(pickLoginBackground(LOGIN_BACKGROUNDS, () => 0.999)).toBe('/login-bg/3.jpg')
    // Out-of-range or non-finite randomness must stay inside the list.
    expect(pickLoginBackground(LOGIN_BACKGROUNDS, () => 1)).toBe('/login-bg/3.jpg')
    expect(pickLoginBackground(LOGIN_BACKGROUNDS, () => -5)).toBe('/login-bg/1.jpg')
    expect(pickLoginBackground(LOGIN_BACKGROUNDS, () => Number.NaN)).toBe('/login-bg/1.jpg')
  })

  it('returns no background for an empty list instead of inventing one', () => {
    expect(pickLoginBackground([], () => 0.5)).toBe('')
  })

  it('keeps the copied public assets byte-identical to the archived originals', () => {
    for (const index of [1, 2, 3]) {
      const served = readFileSync(fileURLToPath(new URL(`../public/login-bg/${index}.jpg`, import.meta.url)))
      const archived = readFileSync(fileURLToPath(new URL(`../../frontend/src/bg/login/${index}.jpg`, import.meta.url)))
      expect(served.byteLength, `login-bg/${index}.jpg size`).toBe(archived.byteLength)
      expect(served.equals(archived), `login-bg/${index}.jpg bytes`).toBe(true)
    }
  })
})
