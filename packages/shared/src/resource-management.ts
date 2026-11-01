import { z } from 'zod'

export const RESOURCE_UPLOAD_LIMIT = 50 * 1024 * 1024
export const resourceNameSchema = z.string().min(1).max(128).refine(value => {
  return value === value.trim() && value !== '.' && value !== '..'
    && !/[\\/]/.test(value) && ![...value].some(ch => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)
    && !/%(?:2e|2f|5c|00)/i.test(value)
}, '名称不能包含路径分隔符、相对路径或控制字符')
export const resourceAdminPathSchema = z.string().max(2048).refine(value => {
  return value.startsWith('/')
    && (value === '/' || value.slice(1).split('/').every(segment => resourceNameSchema.safeParse(segment).success))
}, '目录路径无效')
const names = z.array(resourceNameSchema).min(1).max(100).refine(value => new Set(value).size === value.length, '存在重复项目')
export const resourceMutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('mkdir'), path: resourceAdminPathSchema, name: resourceNameSchema }).strict(),
  z.object({ action: z.literal('rename'), path: resourceAdminPathSchema, name: resourceNameSchema, newName: resourceNameSchema }).strict(),
  z.object({ action: z.literal('move'), path: resourceAdminPathSchema, names, destination: resourceAdminPathSchema }).strict(),
  z.object({ action: z.literal('remove'), path: resourceAdminPathSchema, names, confirmed: z.literal(true) }).strict(),
])
export type ResourceMutation = z.infer<typeof resourceMutationSchema>
export const resourceAdminQuerySchema = z.object({ path: resourceAdminPathSchema.default('/'), page: z.coerce.number().int().min(1).max(100).default(1) }).strict()
export const resourceUploadQuerySchema = z.object({ path: resourceAdminPathSchema, name: resourceNameSchema }).strict()

export const resourceAdminItemSchema = z.object({
  name: z.string(), path: z.string(), is_dir: z.boolean(), size: z.number().nonnegative(), modified: z.string(),
  kind: z.enum(['folder', 'archive', 'game', 'audio', 'image', 'video', 'document', 'code', 'other']),
  raw_url: z.string().optional(), summary: z.string().optional(), version: z.string().optional(), badge: z.string().optional(), sha256: z.string().optional(),
})
export const resourceAdminResponseSchema = z.object({
  directory: z.object({
    path: z.string(), readme: z.string(), header: z.string(), provider: z.string(), total: z.number().nonnegative(),
    write: z.boolean(), source: z.enum(['mock', 'openlist']), items: resourceAdminItemSchema.array(),
    stats: z.object({ totalFiles: z.number(), totalFolders: z.number(), totalSize: z.number() }),
  }),
  connection: z.object({
    mode: z.enum(['demo', 'openlist']), tokenConfigured: z.boolean(), writable: z.boolean(),
    rootPath: z.string(), uploadLimitBytes: z.number(),
    reason: z.enum(['demo', 'missing_token', 'readonly', 'ready']),
  }),
})
export type ResourceAdminResponse = z.infer<typeof resourceAdminResponseSchema>
export const resourceMutationResultSchema = z.object({ action: z.enum(['mkdir', 'rename', 'move', 'remove', 'upload']), submitted: z.boolean() })
