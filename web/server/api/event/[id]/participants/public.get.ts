import type { PublicEventParticipant } from '@guatswr/shared'
import { defineEventHandler, getRouterParam } from 'h3'
import { useRuntimeConfig } from '#imports'
import { parsePublicId, readEventParticipants } from '../../../../utils/public-read'

export default defineEventHandler(async (event): Promise<PublicEventParticipant[]> => {
  const { apiBase } = useRuntimeConfig(event)
  return readEventParticipants({ apiBase }, parsePublicId(getRouterParam(event, 'id')))
})
