import type { PublicHistoryEntry } from '@guatswr/shared'
import { defineEventHandler } from 'h3'
import { useRuntimeConfig } from '#imports'
import { readCachedHistory } from '../utils/public-data'

export default defineEventHandler(async (event): Promise<PublicHistoryEntry[]> => {
  const { apiBase } = useRuntimeConfig(event)
  return readCachedHistory({ apiBase })
})
