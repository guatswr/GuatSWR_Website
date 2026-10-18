import { describe, expect, it } from 'vitest'
import { loginSchema, publicConfigSchema } from './index'

describe('frozen v1 contracts', () => {
  it('trims usernames while preserving password and optional twofa semantics', () => {
    expect(loginSchema.parse({ username: ' admin_1 ', password: ' secret ', twofa: null }))
      .toEqual({ username: 'admin_1', password: ' secret ', twofa: null })
    expect(loginSchema.safeParse({ username: 'bad user', password: 'x' }).success).toBe(false)
    expect(loginSchema.safeParse({ username: 'admin', password: 'x', twofa: '' }).success).toBe(false)
  })

  it('drops private and unknown config keys before serializing SSR data', () => {
    const config = publicConfigSchema.parse({ banner_text: '欢迎', token_version: '42', secret: 'private' })
    expect(config.banner_text).toBe('欢迎')
    expect(config.home_bg).toBe('')
    expect(config).not.toHaveProperty('token_version')
    expect(config).not.toHaveProperty('secret')
    expect(publicConfigSchema.safeParse({ home_bg: 42 }).success).toBe(false)
  })
})
