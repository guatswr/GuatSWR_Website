import { z } from 'zod'
import { eventPayloadSchema } from './events.js'

export const ADMIN_EVENT_STATUSES = ['draft', 'pending', 'published', 'ongoing', 'ended', 'settled', 'rejected', 'deleted'] as const
export const adminEventStatusSchema = z.enum(ADMIN_EVENT_STATUSES)
export const adminEventInputSchema = eventPayloadSchema.extend({ status: adminEventStatusSchema.optional().default('published') })
export const adminEventUpdateSchema = eventPayloadSchema.extend({ submit: z.literal(false).optional().default(false) })
export const adminEventQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  type: z.string().trim().max(50).optional(),
  status: z.string().max(100).optional().superRefine((value, ctx) => {
    if (value && value.split(',').some(status => !adminEventStatusSchema.safeParse(status).success))
      ctx.addIssue({ code: 'custom', message: '无效活动状态' })
  }),
})

const text = z.string().nullish().transform(value => value ?? '')
export const adminEventRowSchema = z.object({
  id: z.number().int().positive(), type: text, title: text, status: adminEventStatusSchema,
  content: z.record(z.string(), z.unknown()).nullish().transform(value => value ?? {}),
  created_by: z.union([z.string(), z.number()]).nullish(),
  created_by_name: text, created_by_avatar: text, created_at: text, updated_at: text,
}).transform(row => ({
  id: row.id, type: row.type, title: row.title, status: row.status, content: row.content,
  created_by: row.created_by_name || (typeof row.created_by === 'string' ? row.created_by : 'Visitor'),
  created_by_avatar: row.created_by_avatar, created_at: row.created_at, updated_at: row.updated_at,
}))
export type AdminEvent = z.infer<typeof adminEventRowSchema>
export const adminEventPageSchema = z.object({ total: z.number().int().nonnegative(), page: z.number().int().positive(), limit: z.number().int().positive(), items: z.array(adminEventRowSchema) })
export const adminEventParticipantSchema = z.object({ id: z.number().int().positive(), common_id: text, qq: text, avatar: text, machine_sign: text, pilot_source: text, created_at: text })
export type AdminEventParticipant = z.infer<typeof adminEventParticipantSchema>
export const adminEventResultsSchema = z.object({ results: z.array(z.object({ rank: z.number().int().min(1).max(1000), id: z.string().max(120), avatar: z.string().max(500) })).max(1000) })
export const adminEventSettlementSchema = z.object({ payload: z.record(z.string(), z.unknown()), status: adminEventStatusSchema.optional().default('settled') })

export const adminRegisterSchema = z.object({ username: z.string().trim().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/), password: z.string().min(6).max(100) })
export const adminBanInputSchema = z.object({ ip: z.union([z.ipv4(), z.ipv6()]), reason: z.string().trim().max(2000).default(''), minutes: z.coerce.number().int().min(0).max(52_560_000).default(0) })
export const adminBanRowSchema = z.object({ ip: z.union([z.ipv4(), z.ipv6()]), reason: text, created_by: text, created_at: z.union([z.string(), z.number()]).nullish(), expires_at: z.union([z.string(), z.number()]).nullish() })
export type AdminBan = z.infer<typeof adminBanRowSchema>
export const backupFileSchema = z.string().min(1).max(200).regex(/^[A-Za-z0-9._-]+$/).refine(value => value !== '.' && value !== '..', '无效备份文件名')
export const backupSelectorSchema = z.object({ type: z.literal('full').optional().default('full'), file: backupFileSchema })
export const backupSettingsInputSchema = z.object({ enabled: z.boolean(), time: z.string().trim().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/).transform(value => value || '02:30') })
export const backupSettingsSchema = z.object({ enabled: z.boolean(), time: z.string(), lastRun: text, lastError: text }).transform(row => ({ ...row, lastError: row.lastError ? '上次备份失败，请检查服务端日志' : '' }))
export const backupRowSchema = z.object({ name: backupFileSchema, type: z.literal('full'), size: z.number().nonnegative().safe(), mtime: z.number().nonnegative() })
export type AdminBackup = z.infer<typeof backupRowSchema>
export type BackupSettings = z.infer<typeof backupSettingsSchema>

export const adminHomeLinkSchema = z.object({
  title: z.string().trim().min(1).max(200), subtitle: z.string().max(200).default(''), extra: z.string().max(500).default(''),
  url: z.url().refine(value => /^https?:\/\//i.test(value), '请输入 http:// 或 https:// 链接'),
  iconText: z.string().max(30).default(''), iconUrl: z.string().max(500).default(''),
  iconBg: z.string().max(100).default('#000000'), iconColor: z.string().max(100).default('#ffffff'),
  textColor: z.string().max(100).default('#666666'), textColorAuto: z.boolean().default(false),
  cardBg: z.string().max(100).default('#ffffff'), cardBgAuto: z.boolean().default(false), showOnHome: z.boolean().default(true),
})
export type AdminHomeLink = z.infer<typeof adminHomeLinkSchema>
export const adminHomeLinksSchema = z.array(adminHomeLinkSchema).max(50)
