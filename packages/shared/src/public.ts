import { z } from 'zod'

/**
 * Public read contracts for the frozen v1 API (`backend/src/routes`).
 *
 * `*Row` schemas describe what the archived Express backend actually returns:
 * nullable text columns, JSON-stringified lists and joined author columns.
 * `public*` schemas describe what the BFF is allowed to serialize into SSR HTML
 * and browser responses. Filtering, projection and redaction live in
 * `web/server/utils/public-read.ts`, so this module only freezes the shapes both
 * sides must agree on.
 */

/** Positive database identifier. Internal author/visitor ids are never projected. */
const publicIdSchema = z.number().int().positive()

/** Legacy text columns may be null or absent; public readers see an empty string. */
const publicTextSchema = z.string().nullish().transform(value => value ?? '')

/** Author display values stay null when the legacy join matched no user row. */
const publicAuthorSchema = z.string().nullish().transform(value => value ?? null)

/** Moderation columns are parsed only so the BFF can filter; they are never projected. */
const internalTextSchema = z.string().nullish().transform(value => value ?? null)

/** Counts and orderings arrive from SQLite as integers. */
const publicIntegerSchema = z.number().int().nullish().transform(value => value ?? 0)

/**
 * Metrics forwarded from Umami. The official stats API returns flat numbers,
 * stringly-typed numbers and nested `{ value, prev }` objects depending on the
 * endpoint/version; `null` and an absent key are the documented no-data shapes.
 * Valid nested values are flattened, non-finite values degrade to 0, and a
 * missing key becomes 0 exactly like the frozen UI's `Number(...) || 0`.
 */
const forwardedScalarSchema = z.union([z.number(), z.string(), z.null(), z.undefined()])

const forwardedNumberSchema = z.union([
  forwardedScalarSchema,
  z.object({ value: forwardedScalarSchema }),
]).transform((value) => {
  const flattened = typeof value === 'object' && value !== null ? value.value : value
  const parsed = typeof flattened === 'string' ? Number(flattened) : flattened
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : 0
}).default(0)

const parseJsonList = (value: string): unknown => {
  try {
    return JSON.parse(value)
  }
  catch {
    return []
  }
}

/**
 * `images`/`tags` are JSON strings in legacy rows and already-parsed arrays at
 * the API edge. Malformed *data* degrades to an empty list exactly like the
 * archived `normalizeImages`/`parseTags` helpers; legitimate long lists are
 * preserved in full and bounded only by the response byte budget.
 */
const publicStringListSchema = z.unknown().transform((value): string[] => {
  const source = typeof value === 'string' ? parseJsonList(value) : value
  if (!Array.isArray(source)) return []
  return source.filter((item): item is string => typeof item === 'string' && item.length > 0)
})

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

export const activityRowSchema = z.object({
  id: publicIdSchema,
  title: publicTextSchema,
  tag: publicTextSchema,
  date: publicTextSchema,
  description: publicTextSchema,
  content: publicTextSchema,
  cover_image: publicTextSchema,
  images: publicStringListSchema,
  created_at: publicTextSchema,
  status: internalTextSchema,
  deleted_at: internalTextSchema,
})

/** `GET /api/activities/:id` also joins the public author display columns. */
export const activityDetailRowSchema = activityRowSchema.extend({
  created_by_name: publicAuthorSchema,
  created_by_avatar: publicAuthorSchema,
  updated_by_name: publicAuthorSchema,
  updated_by_avatar: publicAuthorSchema,
})

export const publicActivitySchema = z.object({
  id: publicIdSchema,
  title: z.string(),
  tag: z.string(),
  date: z.string(),
  description: z.string(),
  content: z.string(),
  cover_image: z.string(),
  images: z.array(z.string()),
  created_by: publicAuthorSchema,
  created_by_avatar: publicAuthorSchema,
  updated_by: publicAuthorSchema,
  updated_by_avatar: publicAuthorSchema,
  created_at: z.string(),
})

export const publicActivitiesPageSchema = z.object({
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  items: z.array(publicActivitySchema),
})

export type ActivityRow = z.infer<typeof activityRowSchema>
export type ActivityDetailRow = z.infer<typeof activityDetailRowSchema>
export type PublicActivity = z.infer<typeof publicActivitySchema>
export type PublicActivitiesPage = z.infer<typeof publicActivitiesPageSchema>

// ---------------------------------------------------------------------------
// Members and school distribution
// ---------------------------------------------------------------------------

export const memberRowSchema = z.object({
  id: publicIdSchema,
  name: publicTextSchema,
  role: publicTextSchema,

  avatar: publicTextSchema,
  avatar_thumb: publicTextSchema,
  avatar_original: publicTextSchema,
  school: publicTextSchema,
  tags: publicStringListSchema,
  sort_order: publicIntegerSchema,
  deleted_at: internalTextSchema,
})

export const publicMemberSchema = z.object({
  id: publicIdSchema,
  name: z.string(),
  role: z.string(),

  avatar: z.string(),
  avatar_thumb: z.string(),
  avatar_original: z.string(),
  school: z.string(),
  tags: z.array(z.string()),
  sort_order: z.number().int(),
})

export const publicMembersSchema = z.array(publicMemberSchema)

export const schoolStatRowSchema = z.object({
  school: publicTextSchema,
  count: publicIntegerSchema,
})

export const publicSchoolStatSchema = z.object({
  school: z.string(),
  count: z.number().int().nonnegative(),
})

export const publicSchoolStatsSchema = z.array(publicSchoolStatSchema)

export type MemberRow = z.infer<typeof memberRowSchema>
export type PublicMember = z.infer<typeof publicMemberSchema>
export type SchoolStatRow = z.infer<typeof schoolStatRowSchema>
export type PublicSchoolStat = z.infer<typeof publicSchoolStatSchema>

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export const historyRowSchema = z.object({
  id: publicIdSchema,
  date: publicTextSchema,
  title: publicTextSchema,
  description: publicTextSchema,
  image: publicTextSchema,
  sort_order: publicIntegerSchema,
  deleted_at: internalTextSchema,
})

export const publicHistoryEntrySchema = z.object({
  id: publicIdSchema,
  date: z.string(),
  title: z.string(),
  description: z.string(),
  image: z.string(),
  sort_order: z.number().int(),
})

export const publicHistorySchema = z.array(publicHistoryEntrySchema)

export type HistoryRow = z.infer<typeof historyRowSchema>
export type PublicHistoryEntry = z.infer<typeof publicHistoryEntrySchema>

// ---------------------------------------------------------------------------
// Events (public statuses only; visitor_ip and internal author ids are dropped)
// ---------------------------------------------------------------------------

export const PUBLIC_EVENT_STATUSES = ['published', 'ongoing', 'ended', 'settled'] as const

export const publicEventStatusSchema = z.enum(PUBLIC_EVENT_STATUSES)

export const eventRowSchema = z.object({
  id: publicIdSchema,
  type: publicTextSchema,
  title: publicTextSchema,
  status: publicTextSchema,
  content: z.unknown(),
  created_at: publicTextSchema,
  updated_at: publicTextSchema,
  created_by_name: publicAuthorSchema,
  created_by_avatar: publicAuthorSchema,
})

export const eventParticipantRowSchema = z.object({
  id: publicIdSchema,
  common_id: publicTextSchema,
  qq: publicTextSchema,
  avatar: publicTextSchema,
  pilot_source: publicTextSchema,
  machine_sign: publicTextSchema,
  created_at: publicTextSchema,
})

/** Public signup cards keep `qq` because the archived list renders it. */
export const publicEventParticipantSchema = z.object({
  id: publicIdSchema,
  common_id: z.string(),
  qq: z.string(),
  avatar: z.string(),
  pilot_source: z.string(),
  machine_sign: z.string(),
  created_at: z.string(),
})

export const publicEventParticipantsSchema = z.object({
  items: z.array(publicEventParticipantSchema),
})

/**
 * Supported nested content fields, mirroring `EventCard.vue` and
 * `eventFormModel.js`. Author-supplied `qq` values inside `initiator`/`a`/`b`
 * are not projected because no archived public view renders them.
 */
export const publicEventPersonSchema = z.object({
  id: z.string(),
  avatar: z.string(),
  goal: z.string(),
})

export const publicEventResultSchema = z.object({
  rank: z.union([z.number(), z.string()]).nullable(),
  id: z.string(),
  player_id: z.string(),
  avatar: z.string(),
})

export const publicEventContentSchema = z.object({
  copy: z.string(),
  cover: z.string(),
  cover_image: z.string(),
  image: z.string(),
  proof_image: z.string(),
  time: z.string(),
  deadline: z.string(),
  end_time: z.string(),
  rules: z.string(),
  prizes: z.string(),
  notes: z.string(),
  location: z.string(),
  gather_type: z.string(),
  challenge: z.string(),
  requirements: z.string(),
  reward: z.string(),
  limit: z.string(),
  penalty: z.string(),
  result: z.string(),
  results_updated_at: z.string(),
  initiator: publicEventPersonSchema.nullable(),
  a: publicEventPersonSchema.nullable(),
  b: publicEventPersonSchema.nullable(),
  completion: publicEventPersonSchema.nullable(),
  results: z.array(publicEventResultSchema),
})

export const publicEventSchema = z.object({
  id: publicIdSchema,
  type: z.string(),
  title: z.string(),
  status: publicEventStatusSchema,
  content: publicEventContentSchema,
  created_by: publicAuthorSchema,
  created_by_avatar: publicAuthorSchema,
  created_at: z.string(),
  updated_at: z.string(),
})

export const publicEventsPageSchema = z.object({
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  items: z.array(publicEventSchema),
})

export type EventRow = z.infer<typeof eventRowSchema>
export type EventParticipantRow = z.infer<typeof eventParticipantRowSchema>
export type PublicEvent = z.infer<typeof publicEventSchema>
export type PublicEventsPage = z.infer<typeof publicEventsPageSchema>
export type PublicEventContent = z.infer<typeof publicEventContentSchema>
export type PublicEventParticipant = z.infer<typeof publicEventParticipantSchema>

// ---------------------------------------------------------------------------
// Audit logs and Umami statistics
// ---------------------------------------------------------------------------

export const logRowSchema = z.object({
  id: publicIdSchema,
  username: publicTextSchema,
  action: publicTextSchema,
  details: publicTextSchema,
  created_at: publicTextSchema,
  user_avatar: publicAuthorSchema,
})

/** `user_id` from the archived `attachUserMeta` join is deliberately dropped. */
export const publicLogSchema = z.object({
  id: publicIdSchema,
  username: z.string(),
  action: z.string(),
  details: z.string(),
  created_at: z.string(),
  user_avatar: publicAuthorSchema,
})

export const publicLogsPageSchema = z.object({
  total: z.number().int().nonnegative(),
  logs: z.array(publicLogSchema),
})

export const logStatRowSchema = z.object({
  username: publicTextSchema,
  count: publicIntegerSchema,
  user_avatar: publicAuthorSchema,
})

export const publicLogStatSchema = z.object({
  username: z.string(),
  count: z.number().int().nonnegative(),
  user_avatar: publicAuthorSchema,
})

export const publicLogStatsSchema = z.object({
  stats: z.array(publicLogStatSchema),
})

export const umamiPointSchema = z.object({
  x: z.union([z.string(), z.number(), z.null(), z.undefined()])
    .transform(value => value ?? '')
    .default(''),
  y: forwardedNumberSchema,
})

export const publicUmamiMetaSchema = z.object({
  startAt: forwardedNumberSchema,
  endAt: forwardedNumberSchema,
  unit: publicTextSchema,
  limit: forwardedNumberSchema,
  envType: publicTextSchema,
})

export const publicUmamiSummarySchema = z.object({
  pageviews: forwardedNumberSchema,
  visitors: forwardedNumberSchema,
  visits: forwardedNumberSchema,
  bounces: forwardedNumberSchema,
  totaltime: forwardedNumberSchema,
})

export const publicUmamiStatsSchema = z.object({
  meta: publicUmamiMetaSchema,
  summary: publicUmamiSummarySchema,
  series: z.object({
    pageviews: z.array(umamiPointSchema),
    visitors: z.array(umamiPointSchema),
  }),
  top: z.object({
    pages: z.array(umamiPointSchema),
    environments: z.array(umamiPointSchema),
  }),
})

export type LogRow = z.infer<typeof logRowSchema>
export type LogStatRow = z.infer<typeof logStatRowSchema>
export type PublicLog = z.infer<typeof publicLogSchema>
export type PublicLogsPage = z.infer<typeof publicLogsPageSchema>
export type PublicLogStat = z.infer<typeof publicLogStatSchema>
export type PublicUmamiStats = z.infer<typeof publicUmamiStatsSchema>
