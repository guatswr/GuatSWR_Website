import { defineEventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from '#imports'
import type { ResourceSearchResponse } from '../../../shared/resources'
import { searchOpenListResources } from '../../utils/openlist'

export default defineEventHandler(async (event): Promise<ResourceSearchResponse> => {
  const query = getQuery(event)
  const rawKeywords = Array.isArray(query.q) ? query.q[0] : query.q
  const rawPath = Array.isArray(query.path) ? query.path[0] : query.path
  const rawPage = Array.isArray(query.page) ? query.page[0] : query.page
  const page = Math.max(1, Math.min(100, Number.parseInt(String(rawPage || '1'), 10) || 1))

  const config = useRuntimeConfig(event)
  return searchOpenListResources(
    config.openlist ?? {},
    typeof rawKeywords === 'string' ? rawKeywords : '',
    typeof rawPath === 'string' ? rawPath : '/',
    page,
  )
})
