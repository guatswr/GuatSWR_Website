import { describe, expect, it } from 'vitest'
import {
  ADMIN_CONFIG_KEYS,
  activityInputSchema,
  activityListQuerySchema,
  adminActivityRowSchema,
  adminConfigSchema,
  adminConfigWriteSchema,
  adminUserRowSchema,
  auditLogQuerySchema,
  auditLogRowSchema,
  historyInputSchema,
  memberInputSchema,
  adminMemberRowSchema,
  profileInputSchema,
  resetPasswordSchema,
} from './admin'

describe('admin request schemas mirror the frozen backend', () => {
  it('validates and normalizes activity input', () => {
    const parsed = activityInputSchema.parse({
      title: '  夏日祭  ',
      tag: '活动',
      date: '2026-08-01',
      description: null,
      content: '# 内容',
      cover_image: '/uploads/a.webp',
      images: ['/uploads/b.webp'],
    })
    expect(parsed.title).toBe('夏日祭')
    expect(parsed.images).toEqual(['/uploads/b.webp'])
    expect(activityInputSchema.safeParse({ title: '', tag: 'x', date: 'x' }).success).toBe(false)
    expect(activityInputSchema.safeParse({ title: 'x', tag: '', date: 'x' }).success).toBe(false)
    expect(activityInputSchema.safeParse({ title: 'x', tag: 'y', date: 'z', content: 'x'.repeat(2_000_001) }).success).toBe(false)
  })

  it('validates member and history input with backend defaults', () => {
    const member = memberInputSchema.parse({ name: ' 琪露诺 ', role: '看板娘' })
    expect(member).toMatchObject({ name: '琪露诺', tags: [], sort_order: 0 })
    expect(memberInputSchema.safeParse({ name: '', role: 'x' }).success).toBe(false)
    const history = historyInputSchema.parse({ date: '2020-01-01', title: ' 起点 ' })
    expect(history).toMatchObject({ title: '起点', sort_order: 0 })
    expect(historyInputSchema.safeParse({ date: '', title: 'x' }).success).toBe(false)
    expect(resetPasswordSchema.safeParse({ password: '12345' }).success).toBe(false)
    expect(resetPasswordSchema.safeParse({ password: '123456' }).success).toBe(true)
  })

  it('restricts configuration writes to the admin-editable keys', () => {
    expect(ADMIN_CONFIG_KEYS).toHaveLength(10)
    expect(adminConfigWriteSchema.parse({ key: 'qq_join_url', value: '  https://qm.qq.com/x  ' }).value)
      .toBe('https://qm.qq.com/x')
    expect(adminConfigWriteSchema.safeParse({ key: 'token_version', value: '1' }).success).toBe(false)
    expect(adminConfigWriteSchema.safeParse({ key: 'backup_enabled', value: '1' }).success).toBe(false)
    expect(adminConfigWriteSchema.safeParse({ key: 'qq_group_number', value: '123' }).success).toBe(false)
    expect(adminConfigWriteSchema.safeParse({ key: 'qq_group_number', value: '' }).success).toBe(true)
    expect(adminConfigWriteSchema.safeParse({ key: 'join_question', value: 'x'.repeat(201) }).success).toBe(false)
    expect(adminConfigWriteSchema.safeParse({ key: 'qq_join_url', value: 'javascript:alert(1)' }).success).toBe(false)
  })

  it('mirrors the profile schema, including blank-field preprocessing', () => {
    expect(profileInputSchema.parse({ password: '', avatar: '/uploads/a.webp', twofa_password: '', twofa_enabled: false }))
      .toEqual({ password: undefined, avatar: '/uploads/a.webp', twofa_password: undefined, twofa_enabled: false })
    expect(profileInputSchema.safeParse({ password: '12345' }).success).toBe(false)
    expect(profileInputSchema.safeParse({ twofa_password: '123' }).success).toBe(false)
  })

  it('parses query guards without coercing "false" to true', () => {
    expect(activityListQuerySchema.parse({})).toEqual({ page: 1, limit: 20, includeDeleted: false })
    expect(activityListQuerySchema.parse({ includeDeleted: '1', page: '3', limit: '50' }))
      .toEqual({ page: 3, limit: 50, includeDeleted: true })
    expect(activityListQuerySchema.safeParse({ includeDeleted: 'yes' }).success).toBe(false)
    expect(auditLogQuerySchema.parse({ limit: '50' }).limit).toBe(50)
    expect(auditLogQuerySchema.safeParse({ limit: '5000' }).success).toBe(false)
    expect(auditLogQuerySchema.safeParse({ page: '0' }).success).toBe(false)
  })
})

describe('admin response projections strip private and unknown fields', () => {
  it('projects activity rows without leaking internals', () => {
    const projected = adminActivityRowSchema.parse({
      id: 3,
      title: '活动',
      tag: 'tag',
      date: '2026-01-01',
      description: null,
      content: null,
      cover_image: null,
      images: '["/uploads/a.webp"]',
      status: 'draft',
      deleted_at: null,
      created_at: '2026-01-01T00:00:00+08:00',
      created_by: 1,
      updated_by: 2,
      deleted_by: 3,
      password: 'private-hash',
      token_version: 9,
    })
    expect(projected.images).toEqual(['/uploads/a.webp'])
    expect(projected.status).toBe('draft')
    expect(projected).not.toHaveProperty('deleted_by')
    expect(projected).not.toHaveProperty('password')
    expect(JSON.stringify(projected)).not.toContain('private-hash')
  })

  it('projects members, logs and users with the SQLite 0/1 flags normalized', () => {
    const member = adminMemberRowSchema.parse({ id: 1, name: 'a', role: 'b', bio: null, avatar: null, school: null, tags: '["x","x"]', sort_order: 2, deleted_at: null, deleted_by: 4 })
    expect(member.tags).toEqual(['x', 'x'])
    expect(member).not.toHaveProperty('deleted_by')

    const log = auditLogRowSchema.parse({ id: 5, username: 'admin', action: 'LOGIN', details: 'IP 1.2.3.4', created_at: '2026-01-01T00:00:00+08:00', token: 'jwt' })
    expect(log).not.toHaveProperty('token')

    expect(adminUserRowSchema.parse({ id: 1, username: 'admin', role: 'super_admin', avatar: null, twofa_enabled: 1, password: 'x' }).twofa_enabled).toBe(true)
    expect(adminUserRowSchema.parse({ id: 1, username: 'admin', role: 'admin', avatar: null, twofa_enabled: 0 }).twofa_enabled).toBe(false)
    expect(adminUserRowSchema.safeParse({ id: 1, username: 'admin', role: 'user' }).success).toBe(false)
  })

  it('projects only the admin-editable configuration keys', () => {
    const config = adminConfigSchema.parse({
      home_bg: '/uploads/home.webp',
      banner_text: '欢迎',
      token_version: '42',
      backup_enabled: '1',
      backup_last_error: 'secret path',
      unknown_key: 'x',
    })
    expect(config.home_bg).toBe('/uploads/home.webp')
    expect(config.banner_text).toBe('欢迎')
    expect(config.join_bg).toBe('')
    expect(config).not.toHaveProperty('token_version')
    expect(config).not.toHaveProperty('backup_enabled')
    expect(JSON.stringify(config)).not.toContain('secret path')
  })
})
