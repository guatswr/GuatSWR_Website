import type { PublicSchoolStat } from '@guatswr/shared'
import { defineEventHandler } from 'h3'
import { useRuntimeConfig } from '#imports'
import { readSchoolStats } from '../../../utils/public-read'

export default defineEventHandler(async (event): Promise<PublicSchoolStat[]> => {
  const { apiBase } = useRuntimeConfig(event)
  return readSchoolStats({ apiBase })
})
