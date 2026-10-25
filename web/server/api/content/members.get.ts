/**
 * `/members` display payload: the projected member list plus the
 * server-derived sort keys the page orders it by.
 *
 * Reuses the shared public read adapter and its school-query parser, so the
 * filter (including "an empty school string means no filter", as the frozen
 * backend behaves) is identical to `/api/members`. The keys exist so the
 * browser never imports a pinyin library.
 */
import type { MembersContentResponse } from '#shared/content'
import { defineEventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from '#imports'
import { parseSchoolQuery } from '../../utils/public-read'
import { readCachedMembers } from '../../utils/public-data'
import { deriveMemberSortKeys } from '../../utils/member-sort'
import { readMemberRevision } from '../../utils/member-revision'

export default defineEventHandler(async (event): Promise<MembersContentResponse> => {
  const { apiBase } = useRuntimeConfig(event)
  const revision=await readMemberRevision({apiBase})
  const members = await readCachedMembers({ apiBase }, parseSchoolQuery(getQuery(event)))
  // A concurrent newer revision can cause one harmless refresh, never tag an
  // older roster with a revision it has not yet observed.
  return { members, sortKeys: deriveMemberSortKeys(members),revision }
})
