import type { PublicMember } from '@guatswr/shared'
import { defineEventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from '#imports'
import { parseSchoolQuery, readMembers } from '../../utils/public-read'

export default defineEventHandler(async (event): Promise<PublicMember[]> => {
  const { apiBase } = useRuntimeConfig(event)
  return readMembers({ apiBase }, parseSchoolQuery(getQuery(event)))
})
