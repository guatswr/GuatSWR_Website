import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Types for the deterministic fixture module. The runtime file stays plain
 * `.mjs` so `node tests/fixtures/*.mjs` can serve it without a build step.
 */

export interface FixtureImage {
  contentType: string
  body: () => Buffer
}

export interface FixtureActivityRow {
  id: number
  title: string
  tag: string
  date: string
  description: string
  content: string
  cover_image: string
  images: string
  created_at: string
  created_by: number | null
  updated_by: number | null
  status: string | null
  deleted_at: string | null
  deleted_by?: number | null
}

export interface FixtureMemberRow {
  id: number
  name: string
  role: string

  avatar: string
  school: string
  tags: string
  sort_order: number
  deleted_at: string | null
  deleted_by?: number | null
}

export interface FixtureHistoryRow {
  id: number
  date: string
  title: string
  description: string
  image: string
  sort_order: number
  deleted_at: string | null
}

export interface FixtureEventRow {
  id: number
  type: string
  title: string
  status: string
  content: Record<string, unknown>
  created_by: number
  visitor_ip: string
  created_at: string
  updated_at: string
  created_by_name: string
  created_by_avatar: string
}

export interface FixtureParticipantRow {
  id: number
  event_id: number
  user_id: number | null
  visitor_ip: string
  common_id: string
  machine_sign: string
  pilot_source: string
  qq: string
  avatar: string
  created_at: string
  updated_at: string
}

export interface FixtureLogRow {
  id: number
  username: string
  action: string
  details: string
  created_at: string
  user_id: number | null
  user_avatar: string | null
}

export interface FixtureLogStatRow {
  username: string
  count: number
  user_id: number | null
  user_avatar: string | null
}

export interface FixtureRequestRecord {
  method?: string
  path: string
  search: string
}

export declare const publicImageFixtures: Record<string, FixtureImage>
export declare const publicImageFixture: (extension: string) => FixtureImage | null
export declare const publicConfigFixture: (credentials?: boolean) => Record<string, unknown>
export declare const publicActivitiesFixture: FixtureActivityRow[]
export declare const publicMembersFixture: FixtureMemberRow[]
export declare const publicHistoryFixture: FixtureHistoryRow[]
export declare const publicEventsFixture: FixtureEventRow[]
export declare const publicEventParticipantsFixture: FixtureParticipantRow[]
export declare const publicLogsFixture: FixtureLogRow[]
export declare const publicLogStatsFixture: FixtureLogStatRow[]
export declare const publicUmamiFixture: Record<string, unknown>
export declare const UMAMI_DEFAULT_END_AT: number
export declare const UMAMI_DEFAULT_START_AT: number
export declare const publicFixtureState: {
  requests: FixtureRequestRecord[]
  credentialHeaders: Array<{ path: string, header: string }>
}
export declare const resetPublicFixtureState: () => void
export declare const handlePublicFixture: (request: IncomingMessage, response: ServerResponse) => boolean
