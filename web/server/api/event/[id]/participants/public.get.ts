import type { PublicEventParticipant } from '@guatswr/shared'
import { defineEventHandler, getRouterParam } from 'h3'
import { useRuntimeConfig } from '#imports'
import { readCachedEventParticipants } from '../../../../utils/public-data'
import { parsePublicId } from '../../../../utils/public-read'

export default defineEventHandler(async (event): Promise<PublicEventParticipant[]> => {
  const { apiBase } = useRuntimeConfig(event)
  return readCachedEventParticipants({ apiBase }, parsePublicId(getRouterParam(event, 'id')))
})
