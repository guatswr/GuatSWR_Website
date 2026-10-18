import type { PublicHistoryEntry } from '@guatswr/shared'
import { defineEventHandler } from 'h3'
import { useRuntimeConfig } from '#imports'
import { readHistory } from '../utils/public-read'

export default defineEventHandler(async (event): Promise<PublicHistoryEntry[]> => {
  const { apiBase } = useRuntimeConfig(event)
  return readHistory({ apiBase })
})
