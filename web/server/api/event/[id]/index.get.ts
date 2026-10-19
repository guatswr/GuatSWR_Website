import type { PublicEvent } from '@guatswr/shared'
import { defineEventHandler, getRouterParam } from 'h3'
import { useRuntimeConfig } from '#imports'
import { readCachedEvent } from '../../../utils/public-data'
import { parsePublicId } from '../../../utils/public-read'

export default defineEventHandler(async (event): Promise<PublicEvent> => {
  const { apiBase } = useRuntimeConfig(event)
  return readCachedEvent({ apiBase }, parsePublicId(getRouterParam(event, 'id')))
})
