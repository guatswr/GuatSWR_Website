import { invalidQuery } from './errors'

const DEFAULT_LIMIT = 20
const MIN_LIMIT = 1
const MAX_LIMIT = 100
const MAX_PAGE = 100_000
const MAX_QUERY_DIGITS = 9
const MAX_TIMESTAMP_DIGITS = 15
const MAX_FILTER_LENGTH = 50
const MAX_TYPE_LENGTH = 32
const UMAMI_UNITS = new Set(['hour', 'day', 'month', 'year'])
const UMAMI_ENV_TYPES = new Set(['browser', 'os', 'device'])

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
