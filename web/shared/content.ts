/**
 * Display contracts for the server-rendered content endpoints the public pages
 * use. Metadata comes from the frozen public read adapters (`/api/activities`,
 * `/api/history`); the renderable body is produced here, on the server, so the
 * browser never parses Markdown or sanitizes HTML.
 */
import type { PublicActivity, PublicHistoryEntry, PublicMember } from '@guatswr/shared'
import type { MarkdownHeading, SafeMarkdownNode } from './markdown'

/** Raw Markdown is deliberately absent: the body below replaces it. */
export type ActivityDisplay = Omit<PublicActivity, 'content'>

/** `GET /api/content/activity/:id` */
export interface ActivityContentResponse {
  readonly activity: ActivityDisplay
  readonly body: readonly SafeMarkdownNode[]
  readonly headings: readonly MarkdownHeading[]
}

export interface HistoryDisplayEntry extends Omit<PublicHistoryEntry, 'description'> {
  /** Legacy rows store HTML from the admin editor; rendered sanitized. */
  readonly description: readonly SafeMarkdownNode[]
}

/** `GET /api/content/history` */
export interface HistoryContentResponse {
  readonly items: readonly HistoryDisplayEntry[]
}

/**
 * Server-derived member ordering. The browser only consumes these keys (see
 * `server/utils/member-sort.ts`), so no pinyin library is needed on the client.
 */
export interface MemberSortKey {
  /** 0 = Latin, 1 = Han, 2 = anything else (archived `getSortKey`). */
  readonly category: 0 | 1 | 2
  readonly key: string
}

/** `GET /api/content/members` */
export interface MembersContentResponse {
  readonly members: readonly PublicMember[]
  /** Keyed by member id, as it appears in the projection. */
  readonly sortKeys: Readonly<Record<string, MemberSortKey>>
}

/** Archived `/activities` page size (`limit = 12`). */
export const ACTIVITIES_PAGE_SIZE = 12

/** Archived `/logs` page sizes; the default matches the archived `limit = 20`. */
export const LOGS_PAGE_SIZE = 20
export const LOGS_PAGE_SIZES: readonly number[] = Object.freeze([20, 50, 100])
