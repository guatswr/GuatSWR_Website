import { z } from 'zod'
import { loginSchema } from './auth.js'
import { profileInputSchema, resetPasswordSchema } from './admin.js'
export { loginSchema, resetPasswordSchema }
export const profileSchema = profileInputSchema

// Backend v1 wire inputs preserve archived behavior. BFF/form schemas may be
// narrower (for example their content cap and public configuration allowlist).
const integer = () => z.preprocess(value => Number(value), z.number().refine(Number.isInteger, { error: 'Expected integer, received float' }))
export const registerSchema = z.object({
  username: loginSchema.shape.username,
  password: z.string().min(6, '密码至少 6 位').max(100),
})
export const activitySchema = z.object({
  title: z.string().trim().min(1, '标题不能为空').max(200),
  tag: z.string().trim().min(1, '标签不能为空').max(50),
  date: z.string().trim().min(1, '日期不能为空').max(50),
  description: z.string().max(2000).optional().nullable(),
  content: z.string().optional().nullable(),
  cover_image: z.string().max(500).optional().nullable(),
  images: z.array(z.string().max(500)).optional(),
})
export const memberSchema = z.object({
  name: z.string().trim().min(1, '姓名不能为空').max(50),
  role: z.string().trim().min(1, '角色不能为空').max(50),
  avatar: z.string().max(500).optional().nullable(),
  school: z.string().max(50).optional().nullable(),
  tags: z.array(z.string().trim().max(30)).optional().default([]),
  sort_order: integer().optional().default(0),
})
export const historySchema = z.object({
  date: z.string().trim().min(1, '日期不能为空').max(50),
  title: z.string().trim().min(1, '标题不能为空').max(200),
  description: z.string().max(2000).optional().nullable(),
  image: z.string().max(500).optional().nullable(),
  sort_order: integer().optional().default(0),
})
export const configSchema = z.object({
  key: z.string().trim().min(1, '配置键不能为空').max(100),
  value: z.string().max(5000).optional().default(''),
}).superRefine(({ key, value }, context) => {
  const text = value.trim()
  const invalid = (message: string) => context.addIssue({ code: 'custom', path: ['value'], message })
  if (key === 'qq_group_number' && text && !/^\d{5,12}$/.test(text)) invalid('QQ群号须为 5 至 12 位数字，或留空')
  if (key === 'join_question' && text.length > 200) invalid('入群问题不能超过 200 字')
  if (key === 'qq_join_url' && text) {
    try {
      const url = new URL(text)
      if (text.length > 1000 || !/^https?:\/\//i.test(text) || !['http:', 'https:'].includes(url.protocol)) invalid('入群链接仅支持完整的 http:// 或 https:// 地址，且不能超过 1000 字')
    }
    catch { invalid('请输入有效的 http:// 或 https:// 入群链接') }
  }
}).transform(data => ['qq_group_number', 'qq_join_url', 'join_question'].includes(data.key) ? { ...data, value: data.value.trim() } : data)

export const activityNotifySchema = z.object({
  id: integer(), title: z.string().trim().min(1).max(200), tag: z.string().trim().min(1).max(50), date: z.string().trim().min(1).max(50),
  description: z.string().max(2000).optional().nullable(), cover_image: z.string().max(500).optional().nullable(),
})
export const historyNotifySchema = z.object({
  id: integer(), date: z.string().trim().min(1).max(50), title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional().nullable(), image: z.string().max(500).optional().nullable(),
  sort_order: integer().optional().default(0), action: z.enum(['create', 'update', 'delete']).optional().default('update'),
})
export const memberNotifySchema = z.object({
  id: integer(), name: z.string().trim().min(1).max(50), role: z.string().trim().min(1).max(50),
  school: z.string().max(50).optional().nullable(), avatar: z.string().max(500).optional().nullable(),
})

const receivedType = (value: unknown): string => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value === 'number' && Number.isNaN(value) ? 'nan' : typeof value
// Per-parse only: no global Zod configuration affects BFF or form consumers.
export const backendV1Error: z.core.$ZodErrorMap = issue => {
  if (issue.code === 'invalid_type') {
    if (issue.input === undefined) return 'Required'
    if (issue.expected === 'number' && typeof issue.input === 'number' && !Number.isNaN(issue.input) && !Number.isFinite(issue.input)) return 'Expected integer, received float'
    return `Expected ${issue.expected}, received ${receivedType(issue.input)}`
  }
  if (issue.code === 'too_small' && issue.origin === 'string') return `String must contain at least ${issue.minimum} character(s)`
  if (issue.code === 'too_big' && issue.origin === 'string') return `String must contain at most ${issue.maximum} character(s)`
  if (issue.code === 'invalid_value') {
    const options = issue.values.map(value => typeof value === 'string' ? `'${value}'` : String(value)).join(' | ')
    const type = receivedType(issue.input)
    if (type === 'undefined') return 'Required'
    if (type !== 'string') return `Expected ${options}, received ${type}`
    return `Invalid enum value. Expected ${options}, received '${String(issue.input)}'`
  }
  return undefined
}

export type BackendV1ActivityInput = z.input<typeof activitySchema>
export type BackendV1Activity = z.output<typeof activitySchema>
export type BackendV1MemberInput = z.input<typeof memberSchema>
export type BackendV1Member = z.output<typeof memberSchema>
export type BackendV1HistoryInput = z.input<typeof historySchema>
export type BackendV1History = z.output<typeof historySchema>
export type BackendV1ConfigInput = z.input<typeof configSchema>
export type BackendV1Config = z.output<typeof configSchema>
