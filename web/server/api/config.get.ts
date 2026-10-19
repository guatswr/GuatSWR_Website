import type { PublicSiteConfig } from '@guatswr/shared'
import { defineEventHandler } from 'h3'
import { useRuntimeConfig } from '#imports'
import { readCachedSiteConfig } from '../utils/public-data'

/**
 * Public site configuration. The projection stays in the credential-free
 * public read adapter; only the projected DTO is retained in the server-side
 * data SWR cache. The browser response itself remains `no-store` through the
 * `/api/**` route rule.
 */
export default defineEventHandler(async (event): Promise<PublicSiteConfig> => {
  const { apiBase } = useRuntimeConfig(event)
  return readCachedSiteConfig({ apiBase })
})
