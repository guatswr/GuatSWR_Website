import type { PublicEvent } from '@guatswr/shared'
import { defineEventHandler, getRouterParam } from 'h3'
import { useRuntimeConfig } from '#imports'
import { parsePublicId, readEvent } from '../../../utils/public-read'

export default defineEventHandler(async (event): Promise<PublicEvent> => {
  const { apiBase } = useRuntimeConfig(event)
  return readEvent({ apiBase }, parsePublicId(getRouterParam(event, 'id')))
})
