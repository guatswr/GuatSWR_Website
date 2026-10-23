import { describe, expect, it } from 'vitest'
import { activityInputSchema, adminConfigWriteSchema, memberInputSchema } from './admin.js'
import { activitySchema, backendV1Error, configSchema, loginSchema, memberSchema, registerSchema } from './backend-v1.js'

describe('backend v1 wire boundaries', () => {
  it('preserves legacy content and custom configuration without broadening BFF inputs', () => {
    const activity = { title: 'title', tag: 'tag', date: 'date', content: 'x'.repeat(2_000_001) }
    expect(activitySchema.safeParse(activity).success).toBe(true)
    expect(activityInputSchema.safeParse(activity).success).toBe(false)
    expect(configSchema.parse({ key: 'historical_custom_key' })).toEqual({ key: 'historical_custom_key', value: '' })
    expect(adminConfigWriteSchema.safeParse({ key: 'historical_custom_key' }).success).toBe(false)
  })
  it('preserves archived integer coercion independently of safe-integer BFF guards', () => {
    const member = { name: 'test', role: 'member', sort_order: '9007199254740992' }
    expect(memberSchema.parse(member).sort_order).toBe(9007199254740992)
    expect(memberInputSchema.safeParse(member).success).toBe(false)
  })
  it('applies compatibility errors per parse without changing global Zod behavior', () => {
    const input = { username: 1, password: 'test' }
    const native = loginSchema.safeParse(input)
    const legacy = loginSchema.safeParse(input, { error: backendV1Error })
    expect(native.success).toBe(false)
    expect(legacy.success).toBe(false)
    if (!native.success && !legacy.success) {
      expect(legacy.error.issues[0]?.message).toBe('Expected string, received number')
      expect(loginSchema.safeParse(input).error?.issues[0]?.message).toBe(native.error.issues[0]?.message)
    }
  })
  it('keeps role and revocation fields outside registration wire input', () => {
    expect(registerSchema.parse({ username: 'test', password: 'password', role: 'super_admin', token_version: 999 }))
      .toEqual({ username: 'test', password: 'password' })
  })
})
