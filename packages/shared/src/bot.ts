import { z } from 'zod'

export const botScopes = ['query:read', 'subscriptions:write', 'identity:write', 'signup:write', 'signup:read', 'review:read', 'review:write', 'deliveries:read', 'deliveries:retry', 'members:sync', 'deliveries:ack'] as const
export const botEventNames = ['activity.published', 'history.updated', 'member.added', 'event.pending', 'event.published', 'event.updated', 'event.approved', 'event.rejected', 'event.status', 'event.deleted', 'event.settled', 'event.result_set', 'event.signup', 'event.signup_cancelled', 'reminder.deadline', 'reminder.start'] as const
export const botQqSchema = z.string().regex(/^\d{5,12}$/)
export const botCredentialSchema = z.object({
  name: z.string().trim().min(1).max(80), scopes: z.array(z.enum(botScopes)).min(1).max(botScopes.length),
  groups: z.array(botQqSchema).max(100).default([]),
}).strict()
export const botSubscriptionSchema = z.object({
  group_id: botQqSchema, event: z.enum(botEventNames), event_id: z.number().int().positive().optional(),
  lead_minutes: z.number().int().min(1).max(10080).default(60),
}).strict()
export const botLinkSchema = z.object({ code: z.string().regex(/^[a-f0-9]{32}$/), qq: botQqSchema }).strict()
export const botSignupSchema = z.object({
  qq: botQqSchema, common_id: z.string().trim().min(1).max(100),
  avatar: z.string().regex(/^\/uploads\//).max(500),
  machine_sign: z.string().max(200).default(''), pilot_source: z.string().max(200).default(''),
}).strict()
export const botReviewSchema = z.object({
  qq: botQqSchema, action: z.enum(['approve', 'reject']), reason: z.string().trim().min(1).max(500),
}).strict()

export const memberSyncQqSchema = z.string().regex(/^[1-9]\d{4,11}$/)
export const memberSyncSettingsSchema = z.object({
  enabled:z.boolean(), credential_id:z.string().uuid().nullable(),
  groups:z.array(memberSyncQqSchema).max(20).refine(items=>new Set(items).size===items.length),
  interval_minutes:z.number().int().min(30).max(10080).default(360),
  admin_user_ids:z.array(z.number().int().positive()).max(20).refine(items=>new Set(items).size===items.length),
}).strict().refine(value=>!value.enabled || Boolean(value.credential_id && value.groups.length && value.admin_user_ids.length))
export const memberSyncEntrySchema = z.object({
  qq:memberSyncQqSchema,group_card:z.string().trim().max(50).default(''),nickname:z.string().trim().max(50).default(''),
  group_role:z.enum(['member','admin','owner']).default('member'),
}).strict()
export const memberSyncBatchSchema = z.object({members:z.array(memberSyncEntrySchema).max(500)}).strict()
export const memberSyncCompleteSchema = z.object({batch_count:z.number().int().min(1).max(100),member_count:z.number().int().min(0).max(10000),complete:z.literal(true)}).strict()
export const memberSyncApplySchema = z.object({reason:z.string().trim().min(1).max(500),allow_large_drop:z.boolean().default(false),allow_unlinked:z.boolean().default(false)}).strict()
export const memberSyncProfileSchema = z.object({
  qq:memberSyncQqSchema.nullable(),follow_group_name:z.boolean(),follow_group_avatar:z.boolean(),
  sync_protected:z.boolean(),complete:z.boolean(),
}).strict()
export const botReceiptSchema = z.object({status:z.enum(['sent','failed']),error_code:z.enum(['unavailable','not_friend','rate_limited','unknown']).optional()}).strict()
export const memberSyncSettingsResponseSchema=z.object({revision:z.number().int().nonnegative(),settings:memberSyncSettingsSchema})
export const memberSyncSummarySchema=z.object({count:z.number().int().nonnegative(),new_count:z.number().int().nonnegative(),unlinked_count:z.number().int().nonnegative(),created:z.number().int().optional(),status:z.enum(['preview','blocked','succeeded']).optional()})
export const memberSyncJobSchema=z.object({
  id:z.string().uuid(),group_id:memberSyncQqSchema,credential_id:z.string().uuid(),config_revision:z.number().int(),generation:z.number().int(),
  status:z.enum(['queued','collecting','preview','blocked','applying','succeeded','failed','expired']),created_at:z.number().int(),expires_at:z.number().int(),
  batch_count:z.number().int().nullable(),member_count:z.number().int().nullable(),
  summary:z.preprocess(value=>{if(typeof value!=='string')return value;try{return JSON.parse(value)}catch{return null}},memberSyncSummarySchema.nullable()),
  error_code:z.string().nullable(),
  preview:z.object({page:z.number().int().positive(),total:z.number().int().nonnegative(),has_more:z.boolean(),items:z.array(z.object({qq:memberSyncQqSchema,group_card:z.string(),nickname:z.string(),matched_member_id:z.number().int().positive().nullable(),website_name:z.string().nullable()}))}).optional(),
})
export const memberSyncProfileTaskSchema=z.object({id:z.number().int().positive(),qq:memberSyncQqSchema.nullable(),name:z.string(),profile_status:z.enum(['pending','complete']),created_at:z.number().int(),notification_status:z.string().nullable().optional(),message_status:z.string().nullable().optional()})
