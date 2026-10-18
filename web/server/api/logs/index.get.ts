import type { PublicLogsPage } from '@guatswr/shared'
import { defineEventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from '#imports'
import { parseLogQuery, readLogsPage } from '../../utils/public-read'

export default defineEventHandler(async (event): Promise<PublicLogsPage> => {
  const { apiBase } = useRuntimeConfig(event)
  return readLogsPage({ apiBase }, parseLogQuery(getQuery(event)))
})
