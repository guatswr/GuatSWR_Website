import type { PublicActivity } from '@guatswr/shared'
import { defineEventHandler, getRouterParam } from 'h3'
import { useRuntimeConfig } from '#imports'
import { parsePublicId, readActivity } from '../../utils/public-read'

export default defineEventHandler(async (event): Promise<PublicActivity> => {
  const { apiBase } = useRuntimeConfig(event)
  return readActivity({ apiBase }, parsePublicId(getRouterParam(event, 'id')))
})
