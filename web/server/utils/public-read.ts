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
  PublicLog,
  PublicLogStat,
  PublicLogsPage,
  PublicMember,
  PublicSchoolStat,
  PublicUmamiStats,
  SchoolStatRow,
} from '@guatswr/shared'
import { createError } from 'h3'
import { upstreamUrl } from './upstream'

/**
 * Read-only public adapters for the frozen v1 API.
 *
 * Every reader resolves one fixed upstream path on the administrator-configured
 * origin, sends only an allowlisted query built from validated browser input,
 * never forwards browser Cookie/Authorization/Origin/forwarding headers, parses
 * the frozen row shape, filters non-public rows, projects an explicit field
 * allowlist and only then serializes the exported public DTO.
 */

const DEFAULT_LIMIT = 20
const MIN_LIMIT = 1
const MAX_LIMIT = 100
const MAX_PAGE = 100_000
const MAX_QUERY_DIGITS = 9
const MAX_TIMESTAMP_DIGITS = 15
const MAX_FILTER_LENGTH = 50
const MAX_TYPE_LENGTH = 32
/** Corruption guard only: legitimate lists are preserved in full. */
const MAX_JSON_BYTES = 8 * 1024 * 1024
const UPSTREAM_TIMEOUT_MS = 8_000

const UMAMI_UNITS = new Set(['hour', 'day', 'month', 'year'])
const UMAMI_ENV_TYPES = new Set(['browser', 'os', 'device'])

/** Public readers never learn whether an unpublished id exists. */
const upstreamUnavailable = () => createError({
  statusCode: 502,
  statusMessage: 'Public data unavailable',
  message: '公开数据暂时无法加载，请稍后重试。',
})

const publicNotFound = () => createError({
  statusCode: 404,
  statusMessage: 'Not Found',
  message: '内容不存在或未公开。',
})

const invalidQuery = (message: string) => createError({
  statusCode: 400,
  statusMessage: 'Invalid query',
  message,
})

const unsupportedSignupList = () => createError({
  statusCode: 400,
  statusMessage: 'Unsupported event type',
  message: '该活动不支持公开报名名单。',
})

export interface PublicPageQuery {
  page: number
  limit: number
}

export interface PublicLogQuery extends PublicPageQuery {
  username?: string | undefined
  action?: string | undefined
}

export interface PublicUmamiQuery {
  /** Omitted keeps the frozen route's last-seven-days default; explicit 0 asks for all time. */
  startAt?: number | undefined
  endAt?: number | undefined
  unit: string
  limit: number
  envType: string
}

export type QuerySource = Record<string, unknown>

const readScalar = (query: QuerySource, key: string): string | undefined => {
  const value = query[key]
  if (value === undefined || value === null || value === '') return undefined
  if (Array.isArray(value)) throw invalidQuery(`参数 ${key} 只能传入一次`)
  if (typeof value !== 'string') throw invalidQuery(`参数 ${key} 格式不正确`)
  return value
}

const readDigits = (query: QuerySource, key: string, maxDigits: number): number | undefined => {
  const raw = readScalar(query, key)
  if (raw === undefined) return undefined
  if (!/^\d+$/.test(raw) || raw.length > maxDigits) throw invalidQuery(`参数 ${key} 必须是数字`)
  return Number(raw)
}

const readFilter = (query: QuerySource, key: string, maxLength: number): string | undefined => {
  const raw = readScalar(query, key)
  if (raw === undefined) return undefined
  const value = raw.trim()
  if (!value) return undefined
  if (value.length > maxLength || /\p{Cc}/u.test(value)) {
    throw invalidQuery(`参数 ${key} 不合法`)
  }
  return value
}

/**
 * Mirror the frozen v1 clamping (`page >= 1`, `1 <= limit <= 100`). Browser
 * filters such as `all`, `includeDeleted`, `original` and `status` are simply
 * not part of this query surface, so they can never reach the upstream read.
 */
export const parsePageQuery = (query: QuerySource): PublicPageQuery => ({
  page: Math.min(MAX_PAGE, Math.max(1, readDigits(query, 'page', MAX_QUERY_DIGITS) ?? 1)),
  limit: Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, readDigits(query, 'limit', MAX_QUERY_DIGITS) ?? DEFAULT_LIMIT)),
})

export const parseLogQuery = (query: QuerySource): PublicLogQuery => ({
  ...parsePageQuery(query),
  username: readFilter(query, 'username', MAX_FILTER_LENGTH),
  action: readFilter(query, 'action', MAX_FILTER_LENGTH),
})

export const parseSchoolQuery = (query: QuerySource): string | undefined =>
  readFilter(query, 'school', MAX_FILTER_LENGTH)

export const parseEventTypeQuery = (query: QuerySource): string | undefined =>
  readFilter(query, 'type', MAX_TYPE_LENGTH)

/** Unknown analytics units and environments fall back exactly like the frozen route. */
export const parseUmamiQuery = (query: QuerySource): PublicUmamiQuery => {
  const startAt = readDigits(query, 'startAt', MAX_TIMESTAMP_DIGITS)
  const endAt = readDigits(query, 'endAt', MAX_TIMESTAMP_DIGITS)
  if (startAt !== undefined && endAt !== undefined && startAt > endAt) {
    throw invalidQuery('参数 startAt 不能晚于 endAt')
  }
  const unit = readFilter(query, 'unit', MAX_TYPE_LENGTH)
  const envType = readFilter(query, 'envType', MAX_TYPE_LENGTH)
  return {
    // Omitted timestamps must stay omitted so the frozen route keeps computing
    // its last-seven-days window; only an explicit 0 requests the full range.
    startAt,
    endAt,
    unit: unit && UMAMI_UNITS.has(unit) ? unit : 'day',
    limit: Math.min(50, Math.max(1, readDigits(query, 'limit', MAX_QUERY_DIGITS) ?? 10)),
    envType: envType && UMAMI_ENV_TYPES.has(envType) ? envType : 'browser',
  }
}

/** Contribution ranking length, clamped like the frozen route. */
export const parseStatsLimit = (query: QuerySource): number =>
  Math.min(50, Math.max(1, readDigits(query, 'limit', MAX_QUERY_DIGITS) ?? 10))

/** Path parameters are validated before any upstream request is made. */
export const parsePublicId = (raw: string | undefined): number => {
  if (raw === undefined || !/^\d{1,15}$/.test(raw)) throw invalidQuery('资源编号不合法')
  const id = Number(raw)
  if (!Number.isSafeInteger(id) || id <= 0) throw invalidQuery('资源编号不合法')
  return id
}

export interface PublicReadContext {
  /** Administrator-configured private origin; never derived from the request. */
  apiBase: string
  /**
   * Private deadline override for tests and constrained callers. It can only
   * shorten the production deadline: absent, non-finite, non-positive or larger
   * than `UPSTREAM_TIMEOUT_MS` all fall back to the 8 s default. It is never
   * built from browser input.
   */
  timeoutMs?: number | undefined
}

/**
 * Effective upstream deadline in milliseconds. Only the private context may
 * lower it; a browser query value can never reach this function.
 */
export const resolveUpstreamTimeout = (ctx: PublicReadContext): number => {
  const injected = ctx.timeoutMs
  if (typeof injected !== 'number' || !Number.isFinite(injected)
    || injected <= 0 || injected > UPSTREAM_TIMEOUT_MS) {
    return UPSTREAM_TIMEOUT_MS
  }
  return injected
}

interface ReadOptions {
  query?: Record<string, string | number | undefined> | undefined
  /** Legacy statuses that carry public meaning for one specific route. */
  statusOverrides?: Record<number, () => Error> | undefined
}

interface UpstreamEnvelope {
  total: number
  rows: unknown[]
}

const cancelUpstreamBody = (response: Response): void => {
  // Release the upstream socket when the body is rejected unread.
  void response.body?.cancel().catch(() => {})
}

const concatChunks = (chunks: Uint8Array[]): Uint8Array => {
  let total = 0
  for (const chunk of chunks) total += chunk.byteLength
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged
}

/**
 * Read the body through the byte budget. The cap is enforced while reading (not
 * after buffering) and the upstream stream is cancelled as soon as it is
 * exceeded, so a runaway response cannot be allocated in full.
 */
const readCappedText = async (response: Response): Promise<string> => {
  const declaredLength = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BYTES) {
    cancelUpstreamBody(response)
    throw upstreamUnavailable()
  }
  const body = response.body
  if (!body) throw upstreamUnavailable()
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    let result: { done: boolean, value?: Uint8Array }
    try {
      result = await reader.read()
    }
    catch {
      throw upstreamUnavailable()
    }
    if (result.done) break
    const chunk = result.value
    if (!chunk) continue
    total += chunk.byteLength
    if (total > MAX_JSON_BYTES) {
      await reader.cancel().catch(() => {})
      throw upstreamUnavailable()
    }
    chunks.push(chunk)
  }
  return new TextDecoder().decode(concatChunks(chunks))
}

const readUpstreamJson = async (
  ctx: PublicReadContext,
  path: string,
  options: ReadOptions = {},
): Promise<unknown> => {
  let response: Response
  try {
    // The query is serialized here (native fetch has no `query` option) from the
    // validated allowlist only: no browser parameter is forwarded verbatim, and
    // a misconfigured origin resolves to the same 502 as the config route.
    const target = new URL(upstreamUrl(ctx.apiBase, path))
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value === undefined) continue
      target.searchParams.set(key, String(value))
    }
    response = await fetch(target, {
      // Only a fixed Accept header: browser credentials, cookies, Origin and
      // forwarding headers must never reach a shared public read.
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(resolveUpstreamTimeout(ctx)),
      redirect: 'error',
    })
  }
  catch {
    throw upstreamUnavailable()
  }
  // Upstream 403 means "not public"; public readers must not learn the difference.
  if (response.status === 404 || response.status === 403) {
    cancelUpstreamBody(response)
    throw publicNotFound()
  }
  if (!response.ok) {
    const override = options.statusOverrides?.[response.status]
    cancelUpstreamBody(response)
    throw override ? override() : upstreamUnavailable()
  }
  const body = await readCappedText(response)
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  }
  catch {
    throw upstreamUnavailable()
  }
  return parsed
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
 * Security and admin-only actions whose frozen descriptions embed the caller
 * IP, credential values or failing internal details (`addLog` call sites in
 * `backend/src/routes` and `backend/src/middlewares/ban.js`, for example
 * `登录成功 (IP: ${clientIp})` and `IP ${clientIp} 锁定`). Public readers get
 * fixed safe text instead; ordinary content actions keep their title/name.
 */
const PUBLIC_LOG_DETAILS: Record<string, string> = {
  LOGIN: '登录成功',
  LOGIN_LOCK: '登录尝试过多，已临时锁定',
  BAN_IP: '封禁了一个访问来源',
  UNBAN_IP: '解除了一个访问来源的封禁',
  RESET_PWD: '重置了管理员密码',
  RESET_2FA: '重置了管理员二步验证',
  REFRESH_TOKEN_VERSION: '强制刷新了登录凭证',
  UPDATE_BACKUP_SETTINGS: '更新了自动备份设置',
  DOWNLOAD_BACKUP: '下载了一次备份',
  DELETE_BACKUP: '删除了一次备份',
  AUTO_BACKUP: '执行了自动备份',
  AUTO_BACKUP_FAILED: '自动备份失败',
  DELETE_EVENT_FILE_FAIL: '清理事件文件失败',
}

/** `site_config` keys that are already public through `/api/config`. */
const PUBLIC_CONFIG_KEYS = new Set([
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
])

const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}(?:\.[A-Za-z0-9_-]+)?/g
const LABELLED_CREDENTIAL_PATTERN = /(?<![a-z0-9])(?:password|passwd|pwd|secret|token(?:_version)?|api[_-]?key|authorization|bearer|credential|jwt)\b\s*[:=]\s*\S+/gi
const LONG_TOKEN_PATTERN = /(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{40,}={0,2}(?![A-Za-z0-9+/=])|\b[0-9a-f]{32,}\b/gi
const IPV4_PATTERN = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g
const IPV6_PATTERN = /(?:[0-9a-f]{0,4}:){3,7}[0-9a-f]{0,4}(?![:0-9a-f])|(?:[0-9a-f]{0,4}:){0,3}[0-9a-f]{0,4}::(?:[0-9a-f]{0,4}:){0,3}[0-9a-f]{0,4}/gi

/**
 * Bounded defence in depth for descriptions that are retained verbatim. This is
 * deliberately *not* a claim that arbitrary text is sanitized: the primary
 * guarantee is the fixed per-action text above. Anything that still matches an
 * address or credential shape is replaced wholesale so a decoy value cannot
 * leak through a retained title.
 */
const redactLogDetails = (details: string): string => details
  .replace(JWT_PATTERN, '[redacted]')
  .replace(LABELLED_CREDENTIAL_PATTERN, '[redacted]')
  .replace(LONG_TOKEN_PATTERN, '[redacted]')
  .replace(IPV4_PATTERN, '[ip]')
  .replace(IPV6_PATTERN, '[ip]')

/** Security actions get fixed text; public config keys survive, others do not. */
const projectLogDetails = (action: string, details: string): string => {
  const fixed = PUBLIC_LOG_DETAILS[action]
  if (fixed !== undefined) return fixed
  if (action === 'UPDATE_CONFIG') {
    const separator = details.lastIndexOf(': ')
    const key = separator === -1 ? '' : details.slice(separator + 2).trim()
    return PUBLIC_CONFIG_KEYS.has(key) ? details : '修改了站点配置'
  }
  return details
}

const projectLog = (row: LogRow): PublicLog => ({
  id: row.id,
  username: row.username,
  action: row.action,
  // Frozen v1 published these verbatim, including client IPs; the public
  // contract deliberately differs (see docs/revamp/PUBLIC-DATA.md).
  details: redactLogDetails(projectLogDetails(row.action, row.details)),
  created_at: row.created_at,
  user_avatar: row.user_avatar,
})

const projectLogStat = (row: LogStatRow): PublicLogStat => ({
  username: row.username,
  count: row.count,
  user_avatar: row.user_avatar,
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
