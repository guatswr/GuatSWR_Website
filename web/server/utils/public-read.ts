import { upstreamUnavailable, publicNotFound } from '../lib/public-read/errors'
import { cancelUpstreamBody, readCappedText, readUpstreamJson, resolveUpstreamTimeout } from '../lib/public-read/transport'
import type { PublicReadContext } from '../lib/public-read/transport'
import { projectLog, projectLogStat } from '../lib/public-read/log-projection'
import type { PublicPageQuery, PublicLogQuery, PublicUmamiQuery } from '../lib/public-read/query'

import {
  PUBLIC_EVENT_STATUSES,
  activityDetailRowSchema,
  activityRowSchema,
  eventParticipantRowSchema,
  eventRowSchema,
  historyRowSchema,
  logRowSchema,
  logStatRowSchema,
  memberRowSchema,
  publicActivitiesPageSchema,
  publicActivitySchema,
  publicConfigSchema,
  publicEventParticipantsSchema,
  publicEventSchema,
  publicEventsPageSchema,
  publicHistorySchema,
  publicLogStatsSchema,
  publicLogsPageSchema,
  publicMembersSchema,
  publicSchoolStatsSchema,
  publicUmamiStatsSchema,
  schoolStatRowSchema,
} from '@guatswr/shared'
import type {
  ActivityDetailRow,
  ActivityRow,
  EventParticipantRow,
  EventRow,
  HistoryRow,
  LogRow,
  LogStatRow,
  MemberRow,
  PublicActivitiesPage,
  PublicActivity,
  PublicEvent,
  PublicEventContent,
  PublicEventParticipant,
  PublicEventsPage,
  PublicHistoryEntry,
  PublicLogStat,
  PublicLogsPage,
  PublicMember,
  PublicSchoolStat,
  PublicSiteConfig,
  PublicUmamiStats,
  SchoolStatRow,
} from '@guatswr/shared'
import { createError } from 'h3'
import { assertUpstreamOrigin, upstreamUrl } from './upstream'

// Stable public facade: callers and existing contract tests keep these imports.
export * from '../lib/public-read/query'
export { resolveUpstreamTimeout } from '../lib/public-read/transport'
export type { PublicReadContext } from '../lib/public-read/transport'
export { MAX_PUBLIC_LOG_DETAILS_LENGTH, PUBLIC_LOG_DETAILS_OMITTED } from '../lib/public-read/log-projection'

/**
 * Read-only public adapters for the frozen v1 API.
 *
 * Every reader resolves one fixed upstream path on the administrator-configured
 * origin, sends only an allowlisted query built from validated browser input,
 * never forwards browser Cookie/Authorization/Origin/forwarding headers, parses
 * the frozen row shape, filters non-public rows, projects an explicit field
 * allowlist and only then serializes the exported public DTO.
 */

const unsupportedSignupList = () => createError({
  statusCode: 400,
  statusMessage: 'Unsupported event type',
  message: '该活动不支持公开报名名单。',
})

interface UpstreamEnvelope {
  total: number
  rows: unknown[]
}

const readRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw upstreamUnavailable()
  return value as Record<string, unknown>
}

const readTotal = (record: Record<string, unknown>): number => {
  const total = record.total
  if (typeof total !== 'number' || !Number.isInteger(total) || total < 0) throw upstreamUnavailable()
  return total
}

/** `{ total, items }` and `{ total, logs }` envelopes from the frozen v1 routes. */
const readEnvelope = (payload: unknown, key: 'items' | 'logs'): UpstreamEnvelope => {
  const record = readRecord(payload)
  const total = readTotal(record)
  const rows = record[key]
  if (!Array.isArray(rows)) throw upstreamUnavailable()
  return { total, rows }
}

/** Raw array responses: `/api/members`, `/api/members/stats/schools`, `/api/history`. */
const readRows = (payload: unknown): unknown[] => {
  if (!Array.isArray(payload)) throw upstreamUnavailable()
  return payload
}

// Row parsing stays explicit per frozen shape: a malformed row is an upstream
// contract violation (502) and is never partially serialized.
const parseActivityRow = (row: unknown): ActivityRow => {
  const parsed = activityRowSchema.safeParse(row)
  if (!parsed.success) throw upstreamUnavailable()
  return parsed.data
}

const parseActivityDetailRow = (row: unknown): ActivityDetailRow => {
  const parsed = activityDetailRowSchema.safeParse(row)
  if (!parsed.success) throw upstreamUnavailable()
  return parsed.data
}

const parseMemberRow = (row: unknown): MemberRow => {
  const parsed = memberRowSchema.safeParse(row)
  if (!parsed.success) throw upstreamUnavailable()
  return parsed.data
}

const parseSchoolStatRow = (row: unknown): SchoolStatRow => {
  const parsed = schoolStatRowSchema.safeParse(row)
  if (!parsed.success) throw upstreamUnavailable()
  return parsed.data
}

const parseHistoryRow = (row: unknown): HistoryRow => {
  const parsed = historyRowSchema.safeParse(row)
  if (!parsed.success) throw upstreamUnavailable()
  return parsed.data
}

const parseEventRow = (row: unknown): EventRow => {
  const parsed = eventRowSchema.safeParse(row)
  if (!parsed.success) throw upstreamUnavailable()
  return parsed.data
}

const parseParticipantRow = (row: unknown): EventParticipantRow => {
  const parsed = eventParticipantRowSchema.safeParse(row)
  if (!parsed.success) throw upstreamUnavailable()
  return parsed.data
}

const parseLogRow = (row: unknown): LogRow => {
  const parsed = logRowSchema.safeParse(row)
  if (!parsed.success) throw upstreamUnavailable()
  return parsed.data
}

const parseLogStatRow = (row: unknown): LogStatRow => {
  const parsed = logStatRowSchema.safeParse(row)
  if (!parsed.success) throw upstreamUnavailable()
  return parsed.data
}

// ---------------------------------------------------------------------------
// Field projections: only these fields may ever reach the browser.
// ---------------------------------------------------------------------------

interface PublicAuthorProjection {
  created_by: string | null
  created_by_avatar: string | null
  updated_by: string | null
  updated_by_avatar: string | null
}

const anonymousAuthor: PublicAuthorProjection = {
  created_by: null,
  created_by_avatar: null,
  updated_by: null,
  updated_by_avatar: null,
}

/** Mirrors the archived list predicate: published or legacy-null, never deleted. */
const isPublicActivityRow = (row: ActivityRow): boolean =>
  row.deleted_at === null && (row.status === null || row.status === 'published')

const projectActivity = (
  row: ActivityRow,
  author: PublicAuthorProjection,
  content: string,
): PublicActivity => ({
  id: row.id,
  title: row.title,
  tag: row.tag,
  date: row.date,
  description: row.description,
  // Metadata lists never carry raw Markdown; only the detail reader does.
  content,
  cover_image: row.cover_image,
  images: row.images,
  created_by: author.created_by,
  created_by_avatar: author.created_by_avatar,
  updated_by: author.updated_by,
  updated_by_avatar: author.updated_by_avatar,
  created_at: row.created_at,
})

const projectMember = (row: MemberRow): PublicMember => ({
  id: row.id,
  name: row.name,
  role: row.role,
  bio: row.bio,
  avatar: row.avatar,
  avatar_thumb: row.avatar_thumb,
  avatar_original: row.avatar_original,
  school: row.school,
  tags: row.tags,
  sort_order: row.sort_order,
})

const projectSchoolStat = (row: SchoolStatRow): PublicSchoolStat => ({
  school: row.school,
  count: row.count,
})

const projectHistoryEntry = (row: HistoryRow): PublicHistoryEntry => ({
  id: row.id,
  date: row.date,
  title: row.title,
  description: row.description,
  image: row.image,
  sort_order: row.sort_order,
})

const asContentRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

const contentText = (content: Record<string, unknown>, key: string): string => {
  const value = content[key]
  return typeof value === 'string' ? value : ''
}

/**
 * Person blocks keep the author-supplied display id, avatar and goal. Their
 * `qq` values are dropped: no archived public card renders them.
 */
const contentPerson = (value: unknown): PublicEventContent['initiator'] => {
  const source = asContentRecord(value)
  if (Object.keys(source).length === 0) return null
  return {
    id: contentText(source, 'id'),
    avatar: contentText(source, 'avatar'),
    goal: contentText(source, 'goal'),
  }
}

const contentResults = (value: unknown): PublicEventContent['results'] => {
  if (!Array.isArray(value)) return []
  return value.map((entry) => {
    const row = asContentRecord(entry)
    const rank = row.rank
    return {
      rank: typeof rank === 'number' || typeof rank === 'string' ? rank : null,
      id: contentText(row, 'id'),
      player_id: contentText(row, 'player_id'),
      avatar: contentText(row, 'avatar'),
    }
  })
}

const projectEventContent = (value: unknown): PublicEventContent => {
  const content = asContentRecord(value)
  return {
    copy: contentText(content, 'copy'),
    cover: contentText(content, 'cover'),
    cover_image: contentText(content, 'cover_image'),
    image: contentText(content, 'image'),
    proof_image: contentText(content, 'proof_image'),
    time: contentText(content, 'time'),
    deadline: contentText(content, 'deadline'),
    end_time: contentText(content, 'end_time'),
    rules: contentText(content, 'rules'),
    prizes: contentText(content, 'prizes'),
    notes: contentText(content, 'notes'),
    location: contentText(content, 'location'),
    gather_type: contentText(content, 'gather_type'),
    challenge: contentText(content, 'challenge'),
    requirements: contentText(content, 'requirements'),
    reward: contentText(content, 'reward'),
    limit: contentText(content, 'limit'),
    penalty: contentText(content, 'penalty'),
    result: contentText(content, 'result'),
    results_updated_at: contentText(content, 'results_updated_at'),
    initiator: contentPerson(content.initiator),
    a: contentPerson(content.a),
    b: contentPerson(content.b),
    completion: contentPerson(content.completion),
    results: contentResults(content.results),
  }
}

type PublicEventStatus = PublicEvent['status']

const publicEventStatus = (status: string): PublicEventStatus | null =>
  (PUBLIC_EVENT_STATUSES as readonly string[]).includes(status) ? status as PublicEventStatus : null

const projectEvent = (row: EventRow, status: PublicEventStatus): PublicEvent => ({
  id: row.id,
  type: row.type,
  title: row.title,
  status,
  content: projectEventContent(row.content),
  created_by: row.created_by_name,
  created_by_avatar: row.created_by_avatar,
  created_at: row.created_at,
  updated_at: row.updated_at,
})

const projectParticipant = (row: EventParticipantRow): PublicEventParticipant => ({
  id: row.id,
  common_id: row.common_id,
  qq: row.qq,
  avatar: row.avatar,
  pilot_source: row.pilot_source,
  machine_sign: row.machine_sign,
  created_at: row.created_at,
})

/**
 * Raw point arrays are handed to `umamiPointSchema`, which flattens nested
 * `{ value }` metrics and strips unknown keys. A malformed metric object is a
 * contract violation rather than a silently guessed zero.
 */
const umamiPoints = (value: unknown): unknown[] => Array.isArray(value) ? value : []

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

const configUnavailable = () => createError({
  statusCode: 502,
  statusMessage: 'Site configuration unavailable',
})

/**
 * Validate the administrator-configured origin before any cache lookup, so a
 * warm cache entry can never bypass the fail-closed origin check (credentials,
 * path, query, fragment, non-HTTP are all rejected). Returns the normalized
 * origin used as the cache key; the loader validates again on a cache miss.
 * The error is the same 502 a cache miss would produce.
 */
export const resolvePublicReadOrigin = (ctx: PublicReadContext): string => {
  try {
    return assertUpstreamOrigin(ctx.apiBase).origin
  }
  catch {
    throw upstreamUnavailable()
  }
}

/** Same fail-closed origin check with the configuration route's 502 shape. */
export const resolvePublicConfigOrigin = (ctx: PublicReadContext): string => {
  try {
    return assertUpstreamOrigin(ctx.apiBase).origin
  }
  catch {
    throw configUnavailable()
  }
}

/**
 * Projected site configuration through the same credential-free upstream
 * boundary as every other public read. Valid payloads keep their exact public
 * DTO; every upstream, transport or shape failure maps to the frozen route's
 * 502 with no internal detail.
 */
export const readPublicConfig = async (ctx: PublicReadContext): Promise<PublicSiteConfig> => {
  let response: Response
  try {
    response = await fetch(upstreamUrl(ctx.apiBase, '/api/config'), {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(resolveUpstreamTimeout(ctx)),
      redirect: 'error',
    })
  }
  catch {
    throw configUnavailable()
  }
  if (!response.ok) {
    cancelUpstreamBody(response)
    throw configUnavailable()
  }
  let payload: unknown
  try {
    payload = JSON.parse(await readCappedText(response))
  }
  catch {
    throw configUnavailable()
  }
  const parsed = publicConfigSchema.safeParse(payload)
  if (!parsed.success) throw configUnavailable()
  return parsed.data
}

export const readActivitiesPage = async (
  ctx: PublicReadContext,
  query: PublicPageQuery,
): Promise<PublicActivitiesPage> => {
  const payload = await readUpstreamJson(ctx, '/api/activities', {
    query: { page: query.page, limit: query.limit },
  })
  const { total, rows } = readEnvelope(payload, 'items')
  const parsed = publicActivitiesPageSchema.safeParse({
    total,
    page: query.page,
    limit: query.limit,
    items: rows
      .map(parseActivityRow)
      .filter(isPublicActivityRow)
      .map(row => projectActivity(row, anonymousAuthor, '')),
  })
  if (!parsed.success) throw upstreamUnavailable()
  return parsed.data
}

export const readActivity = async (ctx: PublicReadContext, id: number): Promise<PublicActivity> => {
  const payload = await readUpstreamJson(ctx, `/api/activities/${id}`)
  const row = parseActivityDetailRow(payload)
  if (!isPublicActivityRow(row)) throw publicNotFound()
  const parsed = publicActivitySchema.safeParse(projectActivity(row, {
    created_by: row.created_by_name,
    created_by_avatar: row.created_by_avatar,
    updated_by: row.updated_by_name,
    updated_by_avatar: row.updated_by_avatar,
  }, row.content))
  if (!parsed.success) throw upstreamUnavailable()
  return parsed.data
}

export const readMembers = async (
  ctx: PublicReadContext,
  school?: string,
): Promise<PublicMember[]> => {
  const payload = await readUpstreamJson(ctx, '/api/members', {
    query: school === undefined ? undefined : { school },
  })
  const parsed = publicMembersSchema.safeParse(
    readRows(payload).map(parseMemberRow).map(projectMember),
  )
  if (!parsed.success) throw upstreamUnavailable()
  return parsed.data
}

export const readSchoolStats = async (ctx: PublicReadContext): Promise<PublicSchoolStat[]> => {
  const payload = await readUpstreamJson(ctx, '/api/members/stats/schools')
  const parsed = publicSchoolStatsSchema.safeParse(
    readRows(payload).map(parseSchoolStatRow).map(projectSchoolStat),
  )
  if (!parsed.success) throw upstreamUnavailable()
  return parsed.data
}

export const readHistory = async (ctx: PublicReadContext): Promise<PublicHistoryEntry[]> => {
  const payload = await readUpstreamJson(ctx, '/api/history')
  const parsed = publicHistorySchema.safeParse(
    readRows(payload)
      .map(parseHistoryRow)
      .filter(row => row.deleted_at === null)
      .map(projectHistoryEntry),
  )
  if (!parsed.success) throw upstreamUnavailable()
  return parsed.data
}

export const readEventsPage = async (
  ctx: PublicReadContext,
  query: PublicPageQuery,
  type?: string,
): Promise<PublicEventsPage> => {
  const upstreamQuery: Record<string, string | number> = { page: query.page, limit: query.limit }
  if (type !== undefined) upstreamQuery.type = type
  const payload = await readUpstreamJson(ctx, '/api/event', { query: upstreamQuery })
  const { total, rows } = readEnvelope(payload, 'items')
  const items: PublicEvent[] = []
  for (const row of rows.map(parseEventRow)) {
    const status = publicEventStatus(row.status)
    if (status === null) continue
    items.push(projectEvent(row, status))
  }
  const parsed = publicEventsPageSchema.safeParse({ total, page: query.page, limit: query.limit, items })
  if (!parsed.success) throw upstreamUnavailable()
  return parsed.data
}

export const readEvent = async (ctx: PublicReadContext, id: number): Promise<PublicEvent> => {
  const payload = await readUpstreamJson(ctx, `/api/event/${id}`)
  const row = parseEventRow(payload)
  const status = publicEventStatus(row.status)
  if (status === null) throw publicNotFound()
  const parsed = publicEventSchema.safeParse(projectEvent(row, status))
  if (!parsed.success) throw upstreamUnavailable()
  return parsed.data
}

export const readEventParticipants = async (
  ctx: PublicReadContext,
  id: number,
): Promise<PublicEventParticipant[]> => {
  const payload = await readUpstreamJson(ctx, `/api/event/${id}/participants/public`, {
    // Upstream answers 400 for event types that never supported signups.
    statusOverrides: { 400: unsupportedSignupList },
  })
  const rows = readRecord(payload).items
  if (!Array.isArray(rows)) throw upstreamUnavailable()
  const parsed = publicEventParticipantsSchema.safeParse({
    items: rows.map(parseParticipantRow).map(projectParticipant),
  })
  if (!parsed.success) throw upstreamUnavailable()
  return parsed.data.items
}

export const readLogsPage = async (
  ctx: PublicReadContext,
  query: PublicLogQuery,
): Promise<PublicLogsPage> => {
  const upstreamQuery: Record<string, string | number> = { page: query.page, limit: query.limit }
  if (query.username !== undefined) upstreamQuery.username = query.username
  if (query.action !== undefined) upstreamQuery.action = query.action
  const payload = await readUpstreamJson(ctx, '/api/logs', { query: upstreamQuery })
  const { total, rows } = readEnvelope(payload, 'logs')
  const parsed = publicLogsPageSchema.safeParse({ total, logs: rows.map(parseLogRow).map(projectLog) })
  if (!parsed.success) throw upstreamUnavailable()
  return parsed.data
}

export const readLogStats = async (
  ctx: PublicReadContext,
  limit: number,
): Promise<PublicLogStat[]> => {
  const payload = await readUpstreamJson(ctx, '/api/logs/stats', { query: { limit } })
  const rows = readRecord(payload).stats
  if (!Array.isArray(rows)) throw upstreamUnavailable()
  const parsed = publicLogStatsSchema.safeParse({
    stats: rows.map(parseLogStatRow).map(projectLogStat),
  })
  if (!parsed.success) throw upstreamUnavailable()
  return parsed.data.stats
}

export const readUmamiStats = async (
  ctx: PublicReadContext,
  query: PublicUmamiQuery,
): Promise<PublicUmamiStats> => {
  const upstreamQuery: Record<string, string | number> = {
    unit: query.unit,
    limit: query.limit,
    envType: query.envType,
  }
  // Omitted timestamps stay omitted so the frozen route keeps its own
  // last-seven-days default; explicit 0 still requests the full range.
  if (query.startAt !== undefined) upstreamQuery.startAt = query.startAt
  if (query.endAt !== undefined) upstreamQuery.endAt = query.endAt
  const payload = await readUpstreamJson(ctx, '/api/logs/umami', { query: upstreamQuery })

  // The frozen route always rebuilds this envelope; missing sections degrade to
  // the documented no-data zeroes (`stats || {}`), while malformed metric
  // objects are rejected by the contract schema instead of guessed.
  const source = readRecord(payload)
  const summary = asContentRecord(source.summary)
  const series = asContentRecord(source.series)
  const top = asContentRecord(source.top)
  const meta = asContentRecord(source.meta)
  const parsed = publicUmamiStatsSchema.safeParse({
    meta: {
      startAt: meta.startAt,
      endAt: meta.endAt,
      unit: query.unit,
      limit: query.limit,
      envType: query.envType,
    },
    summary: {
      pageviews: summary.pageviews,
      visitors: summary.visitors,
      visits: summary.visits,
      bounces: summary.bounces,
      totaltime: summary.totaltime,
    },
    series: {
      pageviews: umamiPoints(series.pageviews),
      visitors: umamiPoints(series.visitors),
    },
    top: {
      pages: umamiPoints(top.pages),
      environments: umamiPoints(top.environments),
    },
  })
  if (!parsed.success) throw upstreamUnavailable()
  return parsed.data
}
