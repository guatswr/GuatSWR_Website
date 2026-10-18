import type { PublicActivitiesPage } from '@guatswr/shared'
import { defineEventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from '#imports'
import { parsePageQuery, readActivitiesPage } from '../../utils/public-read'

/**
 * Frozen v1 `/api/activities` for public pages. `all`, `includeDeleted` and any
 * other admin filter are not part of the browser query surface.
 */
export default defineEventHandler(async (event): Promise<PublicActivitiesPage> => {
  const { apiBase } = useRuntimeConfig(event)
  return readActivitiesPage({ apiBase }, parsePageQuery(getQuery(event)))
})
