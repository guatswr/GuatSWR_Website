import type { PublicEventsPage } from '@guatswr/shared'
import { defineEventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from '#imports'
import { readCachedEventsPage } from '../../utils/public-data'
import { parseEventTypeQuery, parsePageQuery } from '../../utils/public-read'

export default defineEventHandler(async (event): Promise<PublicEventsPage> => {
  const { apiBase } = useRuntimeConfig(event)
  const query = getQuery(event)
  return readCachedEventsPage({ apiBase }, parsePageQuery(query), parseEventTypeQuery(query))
})
