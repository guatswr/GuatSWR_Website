import type { PublicActivity } from '@guatswr/shared'
import { defineEventHandler, getRouterParam } from 'h3'
import { useRuntimeConfig } from '#imports'
import { readCachedActivity } from '../../utils/public-data'
import { parsePublicId } from '../../utils/public-read'

export default defineEventHandler(async (event): Promise<PublicActivity> => {
  const { apiBase } = useRuntimeConfig(event)
  return readCachedActivity({ apiBase }, parsePublicId(getRouterParam(event, 'id')))
})
