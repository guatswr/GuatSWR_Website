import type { PublicLogStat } from '@guatswr/shared'
import { defineEventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from '#imports'
import { readCachedLogStats } from '../../utils/public-data'
import { parseStatsLimit } from '../../utils/public-read'

export default defineEventHandler(async (event): Promise<PublicLogStat[]> => {
  const { apiBase } = useRuntimeConfig(event)
  return readCachedLogStats({ apiBase }, parseStatsLimit(getQuery(event)))
})
