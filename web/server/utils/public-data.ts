import type {
  PublicActivitiesPage,
  PublicActivity,
  PublicEvent,
  PublicEventParticipant,
  PublicEventsPage,
  PublicHistoryEntry,
  PublicLogStat,
  PublicLogsPage,
  PublicMember,
  PublicSchoolStat,
  PublicSiteConfig,
  PublicUmamiStats,
} from '@guatswr/shared'
import {
  createPublicDataCache,
  type PublicDataCache,
  type PublicDataKind,
} from './public-cache'
import {
  readActivitiesPage,
  readActivity,
  readEvent,
  readEventParticipants,
  readEventsPage,
  readHistory,
  readLogsPage,
  readLogStats,
  readMembers,
  readPublicConfig,
  readSchoolStats,
  readUmamiStats,
  resolvePublicConfigOrigin,
  resolvePublicReadOrigin,
} from './public-read'
import { readMemberRevision,invalidateMemberRevisionCache } from './member-revision'
import type {
  PublicLogQuery,
  PublicPageQuery,
  PublicReadContext,
  PublicUmamiQuery,
} from './public-read'

/**
 * Cached composition for every pure public read.
 *
 * Routes, sitemap/RSS builders and Markdown page loaders must call these
 * wrappers rather than the raw readers, so parsed/projected content is cached
 * exactly once. No rendered HTML, CSP nonce, cookie, authorization header, IP
 * or private row is stored here: the loaders are the credential-free public
 * adapters in `public-read.ts`.
 *
 * Every wrapper validates the administrator-configured origin *before* the
 * cache lookup, so a warm cache entry can never bypass the fail-closed origin
 * check for an invalid `apiBase`.
 */

/** Process-wide cache used by the public BFF routes. */
export const publicDataCache = createPublicDataCache()

/**
 * Internal invalidation hook for successful BFF admin mutations. Each kind is
 * deliberately coarse (`activities` also clears details; `members` also clears
 * school stats; `logs` also clears stats/Umami). There is no HTTP route that
 * reaches this function.
 *
 * The frozen legacy admin writes bypass the BFF, so their changes converge
 * through the normal TTL/max-stale windows instead of this contract.
 *
 * Root integration contract: import `invalidatePublicData` from
 * `web/server/utils/public-data.ts` (this module is the single authority for
 * the public-data cache and its generations). A request that was already
 * awaiting an older fill when the mutation happened may still receive the
 * pre-mutation value; every *new* request starts in the new generation.
 */
/**
 * Every cached wrapper is `async` on purpose: the strict upstream-origin check
 * runs *before* the cache lookup (a warm entry must never hide an invalid
 * `apiBase`), and `async` turns that failure into a rejected promise instead of
 * a synchronous throw. Callers therefore observe one shape - a promise that
 * either resolves with the projected DTO or rejects with the reader's error.
 */
export const invalidatePublicData = (kinds: readonly PublicDataKind[]): void => {
  if(kinds.includes('members'))invalidateMemberRevisionCache()
  publicDataCache.invalidate(kinds)
}

export const readCachedSiteConfig = async (
  ctx: PublicReadContext,
  cache: PublicDataCache = publicDataCache,
): Promise<PublicSiteConfig> => {
  const origin = resolvePublicConfigOrigin(ctx)
  return cache.read({
    kind: 'config',
    origin,
    parameters: ['config'],
    load: () => readPublicConfig(ctx),
  })
}

export const readCachedActivitiesPage = async (
  ctx: PublicReadContext,
  query: PublicPageQuery,
  cache: PublicDataCache = publicDataCache,
): Promise<PublicActivitiesPage> => {
  const origin = resolvePublicReadOrigin(ctx)
  return cache.read({
    kind: 'activities',
    origin,
    parameters: ['list', query.page, query.limit],
    load: () => readActivitiesPage(ctx, query),
  })
}

export const readCachedActivity = async (
  ctx: PublicReadContext,
  id: number,
  cache: PublicDataCache = publicDataCache,
): Promise<PublicActivity> => {
  const origin = resolvePublicReadOrigin(ctx)
  return cache.read({
    kind: 'activities',
    origin,
    parameters: ['detail', id],
    load: () => readActivity(ctx, id),
  })
}

export const readCachedMembers = async (
  ctx: PublicReadContext,
  school?: string,
  cache: PublicDataCache = publicDataCache,
): Promise<PublicMember[]> => {
  const origin = resolvePublicReadOrigin(ctx)
  const revision=await readMemberRevision(ctx)
  return cache.read({
    kind: 'members',
    origin,
    parameters: ['list', school ?? null,revision],
    load: () => readMembers(ctx, school),
  })
}

export const readCachedSchoolStats = async (
  ctx: PublicReadContext,
  cache: PublicDataCache = publicDataCache,
): Promise<PublicSchoolStat[]> => {
  const origin = resolvePublicReadOrigin(ctx)
  const revision=await readMemberRevision(ctx)
  return cache.read({
    kind: 'members',
    origin,
    parameters: ['school-stats',revision],
    load: () => readSchoolStats(ctx),
  })
}

export const readCachedHistory = async (
  ctx: PublicReadContext,
  cache: PublicDataCache = publicDataCache,
): Promise<PublicHistoryEntry[]> => {
  const origin = resolvePublicReadOrigin(ctx)
  return cache.read({
    kind: 'history',
    origin,
    parameters: ['list'],
    load: () => readHistory(ctx),
  })
}

export const readCachedEventsPage = async (
  ctx: PublicReadContext,
  query: PublicPageQuery,
  type?: string,
  cache: PublicDataCache = publicDataCache,
): Promise<PublicEventsPage> => {
  const origin = resolvePublicReadOrigin(ctx)
  return cache.read({
    kind: 'events',
    origin,
    parameters: ['list', query.page, query.limit, type ?? null],
    load: () => readEventsPage(ctx, query, type),
  })
}

export const readCachedEvent = async (
  ctx: PublicReadContext,
  id: number,
  cache: PublicDataCache = publicDataCache,
): Promise<PublicEvent> => {
  const origin = resolvePublicReadOrigin(ctx)
  return cache.read({
    kind: 'events',
    origin,
    parameters: ['detail', id],
    load: () => readEvent(ctx, id),
  })
}

export const readCachedEventParticipants = async (
  ctx: PublicReadContext,
  id: number,
  cache: PublicDataCache = publicDataCache,
): Promise<PublicEventParticipant[]> => {
  const origin = resolvePublicReadOrigin(ctx)
  return cache.read({
    kind: 'events',
    origin,
    parameters: ['participants', id],
    load: () => readEventParticipants(ctx, id),
  })
}

export const readCachedLogsPage = async (
  ctx: PublicReadContext,
  query: PublicLogQuery,
  cache: PublicDataCache = publicDataCache,
): Promise<PublicLogsPage> => {
  const origin = resolvePublicReadOrigin(ctx)
  return cache.read({
    kind: 'logs',
    origin,
    parameters: ['list', query.page, query.limit, query.username ?? null, query.action ?? null],
    load: () => readLogsPage(ctx, query),
  })
}

export const readCachedLogStats = async (
  ctx: PublicReadContext,
  limit: number,
  cache: PublicDataCache = publicDataCache,
): Promise<PublicLogStat[]> => {
  const origin = resolvePublicReadOrigin(ctx)
  return cache.read({
    kind: 'logs',
    origin,
    parameters: ['stats', limit],
    load: () => readLogStats(ctx, limit),
  })
}

export const readCachedUmamiStats = async (
  ctx: PublicReadContext,
  query: PublicUmamiQuery,
  cache: PublicDataCache = publicDataCache,
): Promise<PublicUmamiStats> => {
  const origin = resolvePublicReadOrigin(ctx)
  return cache.read({
    kind: 'logs',
    origin,
    parameters: [
      'umami',
      query.startAt ?? null,
      query.endAt ?? null,
      query.unit,
      query.limit,
      query.envType,
    ],
    load: () => readUmamiStats(ctx, query),
  })
}
