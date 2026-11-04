import { createError, defineEventHandler } from 'h3'
import { useRuntimeConfig } from '#imports'
import type { PublicServersResponse } from '../../shared/servers'
import { readPublicServersSnapshot } from '../utils/komari'

export default defineEventHandler(async (event): Promise<PublicServersResponse> => {
  const config = useRuntimeConfig(event)
  try {
    return await readPublicServersSnapshot(config.komari ?? {})
  }
  catch {
    throw createError({
      statusCode: 502,
      statusMessage: 'Server monitoring upstream unavailable',
    })
  }
})
