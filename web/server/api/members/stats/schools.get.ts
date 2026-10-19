import type { PublicSchoolStat } from '@guatswr/shared'
import { defineEventHandler } from 'h3'
import { useRuntimeConfig } from '#imports'
import { readCachedSchoolStats } from '../../../utils/public-data'

export default defineEventHandler(async (event): Promise<PublicSchoolStat[]> => {
  const { apiBase } = useRuntimeConfig(event)
  return readCachedSchoolStats({ apiBase })
})
