import { publicConfigSchema } from '@guatswr/shared'
import type { PublicSiteConfig } from '@guatswr/shared'

export default defineEventHandler(async (event): Promise<PublicSiteConfig> => {
  const { apiBase } = useRuntimeConfig(event)
  try {
    // Never forward browser Cookie/Authorization to a cacheable public API.
    const data: unknown = await $fetch<unknown>(upstreamUrl(apiBase, '/api/config'), {
      timeout: 8_000,
      retry: 0,
      redirect: 'error',
    })
    return publicConfigSchema.parse(data)
  }
  catch {
    throw createError({ statusCode: 502, statusMessage: 'Site configuration unavailable' })
  }
})
