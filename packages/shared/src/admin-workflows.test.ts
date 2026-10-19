import { describe, expect, it } from 'vitest'
import { adminEventQuerySchema, adminEventRowSchema, adminEventUpdateSchema, adminRegisterSchema, adminBanInputSchema, backupSelectorSchema, backupSettingsSchema, adminHomeLinksSchema } from './admin-workflows'

describe('protected workflow contracts', () => {
  it('projects draft metadata without IP, actor IDs or unknown DB columns', () => {
    const result = adminEventRowSchema.parse({ id: 1, type: 'STG', title: '比赛', status: 'pending', content: { future: 'kept' }, created_by: 2, created_by_name: 'admin', visitor_ip: 'private', password: 'private' })
    expect(result.created_by).toBe('admin')
    expect(result.content).toEqual({ future: 'kept' })
    expect(JSON.stringify(result)).not.toContain('private')
  })
  it('keeps status transitions explicit and rejects guest-style submission on edit', () => {
    expect(adminEventQuerySchema.parse({ status: 'pending,published' }).status).toBe('pending,published')
    expect(adminEventQuerySchema.safeParse({ status: 'pending,typo' }).success).toBe(false)
    expect(adminEventUpdateSchema.safeParse({ type: 'STG', title: '比赛', content: {}, submit: true }).success).toBe(false)
  })
  it('enforces frozen registration limits and validates IPv4/IPv6 before URL construction', () => {
    expect(adminRegisterSchema.parse({ username: ' Editor_1 ', password: 'secret123' }).username).toBe('Editor_1')
    expect(adminRegisterSchema.safeParse({ username: 'admin/x', password: 'x' }).success).toBe(false)
    for (const ip of ['198.51.100.1', '2001:db8::1']) expect(adminBanInputSchema.parse({ ip }).ip).toBe(ip)
    for (const ip of ['x/../../admin', '127.0.0.1,1.2.3.4', '1.2.3.999']) expect(adminBanInputSchema.safeParse({ ip }).success).toBe(false)
  })
  it('allows full backup files and checksums but denies paths, encoded paths and other backup types', () => {
    for (const file of ['full_20261019.tar.gz', 'full_20261019.sha256', '.gitkeep', 'archive..tar']) expect(backupSelectorSchema.parse({ file }).type).toBe('full')
    for (const file of ['../backup', '/etc/passwd', 'a\\b', '%2e%2e', 'a\r\nx', '']) expect(backupSelectorSchema.safeParse({ file }).success).toBe(false)
    expect(backupSelectorSchema.safeParse({ type: 'db', file: 'x' }).success).toBe(false)
    expect(backupSettingsSchema.parse({ enabled: true, time: '02:30', lastError: 'password=secret /private/db' }).lastError).toBe('上次备份失败，请检查服务端日志')
  })
  it('validates stored home links and drops unknown fields without reflecting script URLs', () => {
    const [link] = adminHomeLinksSchema.parse([{ title: '官网', url: 'https://example.com/', token: 'private' }])
    expect(link?.showOnHome).toBe(true)
    expect(link).not.toHaveProperty('token')
    for (const url of ['javascript:alert(1)', 'data:text/html,x', '//example.com/', 'https://'])
      expect(adminHomeLinksSchema.safeParse([{ title: 'x', url }]).success).toBe(false)
  })
})
