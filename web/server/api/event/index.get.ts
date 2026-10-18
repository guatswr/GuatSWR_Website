import type { PublicEventsPage } from '@guatswr/shared'
import { defineEventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from '#imports'
import { parseEventTypeQuery, parsePageQuery, readEventsPage } from '../../utils/public-read'

export default defineEventHandler(async (event): Promise<PublicEventsPage> => {
  const { apiBase } = useRuntimeConfig(event)
  const query = getQuery(event)
  return readEventsPage({ apiBase }, parsePageQuery(query), parseEventTypeQuery(query))
})
