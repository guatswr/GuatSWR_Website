import type { PublicLogStat } from '@guatswr/shared'
import { defineEventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from '#imports'
import { parseStatsLimit, readLogStats } from '../../utils/public-read'

export default defineEventHandler(async (event): Promise<PublicLogStat[]> => {
  const { apiBase } = useRuntimeConfig(event)
  return readLogStats({ apiBase }, parseStatsLimit(getQuery(event)))
})
