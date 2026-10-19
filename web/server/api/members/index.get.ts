import type { PublicMember } from '@guatswr/shared'
import { defineEventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from '#imports'
import { readCachedMembers } from '../../utils/public-data'
import { parseSchoolQuery } from '../../utils/public-read'

export default defineEventHandler(async (event): Promise<PublicMember[]> => {
  const { apiBase } = useRuntimeConfig(event)
  return readCachedMembers({ apiBase }, parseSchoolQuery(getQuery(event)))
})
