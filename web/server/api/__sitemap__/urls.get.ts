import { defineEventHandler } from 'h3'
import { useRuntimeConfig } from '#imports'
import { publicSitemapEntries } from '../../utils/public-index'
import { getSiteConfig } from '#site-config/server'

/** Sole URL source for the maintained sitemap module; no browser credentials. */
export default defineEventHandler(async event => {
  const { apiBase } = useRuntimeConfig(event)
  return publicSitemapEntries({ apiBase }, getSiteConfig(event).url)
})
