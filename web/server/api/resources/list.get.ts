import { defineEventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from '#imports'
import type { ResourceDirectoryResponse } from '../../../shared/resources'
import { listOpenListDirectory } from '../../utils/openlist'
import { renderSafeMarkdown } from '../../utils/markdown'

export default defineEventHandler(async (event): Promise<ResourceDirectoryResponse> => {
  const query = getQuery(event)
  const rawPath = Array.isArray(query.path) ? query.path[0] : query.path
  const rawPage = Array.isArray(query.page) ? query.page[0] : query.page
  const page = Math.max(1, Math.min(100, Number.parseInt(String(rawPage || '1'), 10) || 1))

  const config = useRuntimeConfig(event)
  const directory = await listOpenListDirectory(config.openlist ?? {}, typeof rawPath === 'string' ? rawPath : '/', page, 100)
  const readme = directory.readme && page === 1 ? await renderSafeMarkdown(directory.readme) : null
  return { ...directory, ...(readme ? { readmeBody: readme.nodes } : {}) }
})
