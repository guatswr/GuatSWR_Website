import { describe, expect, it } from 'vitest'
import {
  authRoleSchema,
  isAdminRole,
  isSuperAdminRole,
  loginResponseSchema,
  loginSchema,
  projectSafeUser,
  safeUserSchema,
  upstreamMeSchema,
} from './auth'

describe('frozen login contract', () => {
  it('trims the username and preserves password and second-password bytes', () => {
    expect(loginSchema.parse({ username: ' admin_1 ', password: ' secret ', twofa: ' 12 34 ' }))
      .toEqual({ username: 'admin_1', password: ' secret ', twofa: ' 12 34 ' })
  })

  it('accepts an absent or null second password', () => {
    expect(loginSchema.parse({ username: 'admin', password: 'x' })).toEqual({ username: 'admin', password: 'x' })
    expect(loginSchema.parse({ username: 'admin', password: 'x', twofa: null }).twofa).toBeNull()
  })

  it.each([
    ['bad user', 'x'],
    ['', 'x'],
    ['a'.repeat(51), 'x'],
    ['admin', ''],
    ['admin', 'x'.repeat(101)],
  ])('rejects invalid credentials (%s)', (username, password) => {
    expect(loginSchema.safeParse({ username, password }).success).toBe(false)
  })

  it('rejects a too-short second password instead of treating it as TOTP', () => {
    expect(loginSchema.safeParse({ username: 'admin', password: 'x', twofa: '123' }).success).toBe(false)
  })

  it('drops unknown fields before they reach the upstream login call', () => {
    const parsed = loginSchema.parse({ username: 'admin', password: 'x', role: 'super_admin', id: 1 })
    expect(parsed).toEqual({ username: 'admin', password: 'x' })
  })
})

describe('roles fail closed', () => {
  it('accepts only the two frozen backend roles', () => {
    expect(authRoleSchema.options).toEqual(['admin', 'super_admin'])
    expect(authRoleSchema.safeParse('super_admin').success).toBe(true)
    expect(authRoleSchema.safeParse('user').success).toBe(false)
    expect(authRoleSchema.safeParse('ADMIN').success).toBe(false)
    expect(authRoleSchema.safeParse(undefined).success).toBe(false)
  })

  it('maps roles onto admin and super-admin authority', () => {
    expect(isAdminRole('admin')).toBe(true)
    expect(isAdminRole('super_admin')).toBe(true)
    expect(isSuperAdminRole('admin')).toBe(false)
    expect(isSuperAdminRole('super_admin')).toBe(true)
  })
})

describe('upstream /me projection', () => {
  it('normalizes the SQLite 0/1 second-password flag and null avatar', () => {
    const me = upstreamMeSchema.parse({ id: 3, username: 'admin', role: 'admin', avatar: null, twofa_enabled: 0 })
    expect(me.twofa_enabled).toBe(false)
    expect(upstreamMeSchema.parse({ ...me, twofa_enabled: 1 }).twofa_enabled).toBe(true)
    expect(upstreamMeSchema.parse({ ...me, twofa_enabled: true }).twofa_enabled).toBe(true)
    expect(projectSafeUser(me)).toEqual({ id: 3, username: 'admin', role: 'admin', avatar: null })
  })

  it('drops private or unexpected upstream fields from the safe user', () => {
    const safe = projectSafeUser(upstreamMeSchema.parse({
      id: 1,
      username: 'root',
      role: 'super_admin',
      avatar: '/uploads/a.webp',
      twofa_enabled: 1,
      password: '$2a$10$secret',
      twofa_secret: 'private',
      token_version: 7,
    }))
    expect(safe).toEqual({ id: 1, username: 'root', role: 'super_admin', avatar: '/uploads/a.webp' })
    expect(JSON.stringify(safe)).not.toContain('secret')
    expect(JSON.stringify(safe)).not.toContain('token_version')
  })

  it.each([
    { id: 0, username: 'admin', role: 'admin' },
    { id: 1, username: '', role: 'admin' },
    { id: 1, username: 'admin', role: 'user' },
    { id: 1, username: 'admin', role: 'admin', avatar: 'x'.repeat(501) },
    { id: 1.5, username: 'admin', role: 'admin' },
    { id: 1, username: 'admin', role: 'admin', twofa_enabled: 2 },
  ])('rejects malformed /me rows (%j)', (row) => {
    expect(upstreamMeSchema.safeParse(row).success).toBe(false)
  })

  it('rejects a malformed or oversized safe user payload', () => {
    expect(safeUserSchema.safeParse({ id: 1, username: 'admin', role: 'admin' }).success).toBe(false)
    expect(safeUserSchema.safeParse({ id: 1, username: 'admin', role: 'admin', avatar: null }).success).toBe(true)
  })
})

describe('frozen login response', () => {
  it('requires the upstream token but never projects it into a safe user', () => {
    const response = loginResponseSchema.parse({ token: 'a.b.c', username: 'admin', role: 'admin', avatar: null, id: 2 })
    expect(response.token).toBe('a.b.c')
    expect(projectSafeUser(response)).toEqual({ id: 2, username: 'admin', role: 'admin', avatar: null })
  })

  it.each([
    { token: '', username: 'admin', role: 'admin', id: 1 },
    { token: 'a'.repeat(4097), username: 'admin', role: 'admin', id: 1 },
    { token: 'a.b.c', username: 'admin', role: 'user', id: 1 },
    { token: 'a.b.c', username: 'admin', role: 'admin' },
  ])('rejects malformed login responses (%j)', (row) => {
    expect(loginResponseSchema.safeParse(row).success).toBe(false)
  })
})
