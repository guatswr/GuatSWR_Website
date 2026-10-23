import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { loginSchema, memberSchema, configSchema } = require('@guatswr/shared/backend-v1')
describe('wire schema baseline', () => {
  it('trims username but preserves password bytes', () => expect(loginSchema.parse({ username: ' admin ', password: ' pass ' })).toEqual({ username: 'admin', password: ' pass ' }))
  it('retains coercion/default/unknown stripping', () => expect(memberSchema.parse({ name: ' M ', role: 'R', sort_order: '2', extra: true })).toEqual({ name: 'M', role: 'R', sort_order: 2, tags: [] }))
  it('normalizes join config and rejects unsupported URLs', () => {
    expect(configSchema.parse({ key: ' qq_group_number ', value: ' 12345 ' })).toEqual({ key: 'qq_group_number', value: '12345' })
    expect(configSchema.safeParse({ key: 'qq_join_url', value: 'javascript:alert(1)' }).success).toBe(false)
  })
})
