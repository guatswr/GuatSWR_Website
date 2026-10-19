import type { PublicUmamiStats } from '@guatswr/shared'
import { defineEventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from '#imports'
import { readCachedUmamiStats } from '../../utils/public-data'
import { parseUmamiQuery } from '../../utils/public-read'

export default defineEventHandler(async (event): Promise<PublicUmamiStats> => {
  const { apiBase } = useRuntimeConfig(event)
  return readCachedUmamiStats({ apiBase }, parseUmamiQuery(getQuery(event)))
})
