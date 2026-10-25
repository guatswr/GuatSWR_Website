import { z } from 'zod'

/**
 * Admin/protected API contracts mirrored from the frozen backend
 * (the archived controllers, `routes/admin.js`, `routes/activities.js`,
 * `routes/members.js`, `routes/history.js`, `routes/config.js`, `routes/logs.js`,
 * `routes/auth.js`). Legacy wire contracts now live in backend-v1.ts;
 * BFF-specific bounds stay here. Response projections are explicit allowlists
 * so raw DB rows and private fields never leave the BFF.
 */

/* ------------------------------------------------------------- request rows */

export const activityInputSchema = z.object({
  title: z.string().trim().min(1, '标题不能为空').max(200),
  tag: z.string().trim().min(1, '标签不能为空').max(50),
  date: z.string().trim().min(1, '日期不能为空').max(50),
  description: z.string().max(2000).optional().nullable(),
  // The frozen backend has no content cap. The BFF bounds it so a single
  // article stays within the streamed body limit; existing articles are far
  // below this.
  content: z.string().max(2_000_000).optional().nullable(),
  cover_image: z.string().max(500).optional().nullable(),
  images: z.array(z.string().max(500)).optional(),
})

export type ActivityInput = z.infer<typeof activityInputSchema>

export const memberInputSchema = z.object({
  name: z.string().trim().min(1, '姓名不能为空').max(50),
  role: z.string().trim().min(1, '角色不能为空').max(50),
  avatar: z.string().max(500).optional().nullable(),
  school: z.string().max(50).optional().nullable(),
  tags: z.array(z.string().trim().max(30)).optional().default([]),
  sort_order: z.coerce.number().int().optional().default(0),
})

export type MemberInput = z.infer<typeof memberInputSchema>

export const historyInputSchema = z.object({
  date: z.string().trim().min(1, '日期不能为空').max(50),
  title: z.string().trim().min(1, '标题不能为空').max(200),
  description: z.string().max(2000).optional().nullable(),
  image: z.string().max(500).optional().nullable(),
  sort_order: z.coerce.number().int().optional().default(0),
})

export type HistoryInput = z.infer<typeof historyInputSchema>

/** Only configuration keys the archived admin UI actually edits. */
export const ADMIN_CONFIG_KEYS = [
  'home_bg',
  'join_bg',
  'banner_text',
  'badge_image',
  'mascot_image',
  'qq_qr_image',
  'qq_group_number',
  'qq_join_url',
  'join_question',
  'home_links',
] as const

export const adminConfigKeySchema = z.enum(ADMIN_CONFIG_KEYS)

export type AdminConfigKey = z.infer<typeof adminConfigKeySchema>

const TRIMMED_CONFIG_KEYS: readonly string[] = ['qq_group_number', 'qq_join_url', 'join_question']

// Mirrors backend-v1.ts configuration semantics, restricted to the
// admin-editable key allowlist.
export const adminConfigWriteSchema = z.object({
  key: adminConfigKeySchema,
  value: z.string().max(5000).optional().default(''),
}).superRefine(({ key, value }, ctx) => {
  const text = value.trim()
  const invalid = (message: string) => ctx.addIssue({ code: 'custom', path: ['value'], message })
  if (key === 'qq_group_number' && text && !/^\d{5,12}$/.test(text)) {
    invalid('QQ群号须为 5 至 12 位数字，或留空')
  }
  if (key === 'join_question' && text.length > 200) {
    invalid('入群问题不能超过 200 字')
  }
  if (key === 'qq_join_url' && text) {
    try {
      const url = new URL(text)
      if (text.length > 1000 || !/^https?:\/\//i.test(text) || !['http:', 'https:'].includes(url.protocol)) {
        invalid('入群链接仅支持完整的 http:// 或 https:// 地址，且不能超过 1000 字')
      }
    }
    catch {
      invalid('请输入有效的 http:// 或 https:// 入群链接')
    }
  }
}).transform(data => TRIMMED_CONFIG_KEYS.includes(data.key) ? { ...data, value: data.value.trim() } : data)

export type AdminConfigWrite = z.input<typeof adminConfigWriteSchema>

export const resetPasswordSchema = z.object({
  password: z.string().min(6, '密码至少 6 位').max(100),
})

// Also consumed as the backend-v1.ts profile wire schema.
export const profileInputSchema = z.object({
  password: z.preprocess(
    value => (value === '' ? undefined : value),
    z.string().min(6, '密码至少 6 位').max(100).optional(),
  ),
  avatar: z.string().max(500).optional(),
  twofa_password: z.preprocess(
    value => (value === '' ? undefined : value),
    z.string().min(4, '二步密码至少 4 位').max(50).optional().nullable(),
  ),
  twofa_enabled: z.boolean().optional(),
})

export type ProfileInput = z.infer<typeof profileInputSchema>

/* ------------------------------------------------------------ query guards */

// Query flags are parsed from the raw string by the route and passed here as
// booleans; `z.coerce.boolean()` is deliberately avoided because "false"/"0"
// would coerce to true.
const booleanFlag = z.union([z.boolean(), z.literal('1'), z.literal('true'), z.literal('0'), z.literal('false')])
  .transform(value => value === true || value === '1' || value === 'true')

const pageNumber = z.coerce.number().int().min(1).max(1_000_000).default(1)
const limitNumber = z.coerce.number().int().min(1).max(100).default(20)

export const activityListQuerySchema = z.object({
  page: pageNumber,
  limit: limitNumber,
  includeDeleted: booleanFlag.default(false),
})

export const memberListQuerySchema = z.object({
  includeDeleted: booleanFlag.default(false),
  original: booleanFlag.default(false),
  school: z.string().trim().max(50).optional(),
})

export const historyListQuerySchema = z.object({
  includeDeleted: booleanFlag.default(false),
})

export const auditLogQuerySchema = z.object({
  page: pageNumber,
  limit: limitNumber,
  username: z.string().trim().max(50).optional(),
  action: z.string().trim().max(50).optional(),
})

/* ------------------------------------------------------------- projections */

// The activity/member/history row projections are `admin*`-prefixed because
// `public.ts` already exports same-named (and semantically different) public
// projections; two `export *` re-exports of the same name would be an
// ambiguous star export and would silently remove both from the package.

const stringOrEmpty = z.string().optional().nullable().transform(value => value ?? '')
const stringOrNull = z.string().optional().nullable().transform(value => value ?? null)
const numberOrZero = z.number().optional().nullable().transform(value => (typeof value === 'number' ? value : 0))

const imagesSchema = z.union([z.array(z.string()), z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string')
    if (typeof value !== 'string' || value.length === 0) return []
    try {
      const parsed: unknown = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []
    }
    catch {
      return []
    }
  })

export const adminActivityRowSchema = z.object({
  id: z.number().int().positive(),
  title: stringOrEmpty,
  tag: stringOrEmpty,
  date: stringOrEmpty,
  description: stringOrEmpty,
  content: stringOrEmpty,
  cover_image: stringOrEmpty,
  images: imagesSchema,
  status: stringOrEmpty.transform(value => value === 'draft' ? 'draft' as const : 'published' as const),
  deleted_at: stringOrNull,
  created_at: stringOrNull,
})

export type AdminActivity = z.infer<typeof adminActivityRowSchema>

export const adminMemberRowSchema = z.object({
  id: z.number().int().positive(),
  name: stringOrEmpty,
  role: stringOrEmpty,
  avatar: stringOrEmpty,
  school: stringOrEmpty,
  tags: imagesSchema,
  sort_order: numberOrZero,
  deleted_at: stringOrNull,
  qq:z.string().nullable().optional(),
  profile_status:z.enum(['complete','pending']).optional(),
  sync_managed:numberOrZero.optional(), sync_hidden:numberOrZero.optional(),sync_protected:numberOrZero.optional(),
  follow_group_name:numberOrZero.optional(),follow_group_avatar:numberOrZero.optional(),
})

export type AdminMember = z.infer<typeof adminMemberRowSchema>

export const adminHistoryRowSchema = z.object({
  id: z.number().int().positive(),
  date: stringOrEmpty,
  title: stringOrEmpty,
  description: stringOrEmpty,
  image: stringOrEmpty,
  sort_order: numberOrZero,
  deleted_at: stringOrNull,
})

export type AdminHistory = z.infer<typeof adminHistoryRowSchema>

export const auditLogRowSchema = z.object({
  id: z.number().int().positive(),
  username: stringOrEmpty,
  action: stringOrEmpty,
  details: stringOrEmpty,
  created_at: stringOrEmpty,
})

export type AdminAuditLog = z.infer<typeof auditLogRowSchema>

export const adminUserRowSchema = z.object({
  id: z.number().int().positive(),
  username: z.string().min(1).max(50),
  role: z.enum(['admin', 'super_admin']),
  avatar: stringOrNull,
  twofa_enabled: z.union([z.boolean(), z.literal(0), z.literal(1)])
    .optional()
    .transform(value => value === true || value === 1),
})

export type AdminUser = z.infer<typeof adminUserRowSchema>

export const adminConfigSchema = z.object({
  home_bg: stringOrEmpty,
  join_bg: stringOrEmpty,
  banner_text: stringOrEmpty,
  badge_image: stringOrEmpty,
  mascot_image: stringOrEmpty,
  qq_qr_image: stringOrEmpty,
  qq_group_number: stringOrEmpty,
  qq_join_url: stringOrEmpty,
  join_question: stringOrEmpty,
  home_links: stringOrEmpty,
})

export type AdminConfig = z.infer<typeof adminConfigSchema>

export const activityListResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().optional(),
  items: z.array(adminActivityRowSchema),
})

export const auditLogListResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  logs: z.array(auditLogRowSchema),
})
