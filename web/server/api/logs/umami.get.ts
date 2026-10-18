import type { PublicUmamiStats } from '@guatswr/shared'
import { defineEventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from '#imports'
import { parseUmamiQuery, readUmamiStats } from '../../utils/public-read'

export default defineEventHandler(async (event): Promise<PublicUmamiStats> => {
  const { apiBase } = useRuntimeConfig(event)
  return readUmamiStats({ apiBase }, parseUmamiQuery(getQuery(event)))
})
