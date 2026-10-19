import { createError } from 'h3'
import type { PublicActivitiesPage, PublicActivity } from '@guatswr/shared'
import { PUBLIC_INDEX_PAGES, seoUrl } from '../../shared/seo'
import { readCachedActivitiesPage } from './public-data'
import type { PublicReadContext } from './public-read'

export const MAX_INDEX_ACTIVITIES = 5_000
const PAGE_SIZE = 100
type PageReader = (context: PublicReadContext, query: { page: number, limit: number }) => Promise<PublicActivitiesPage>
const unavailable = () => createError({ statusCode: 503, statusMessage: 'Public index temporarily unavailable' })

/**
 * No second cache: every page comes from the same projected-data cache as the
 * UI. Never silently truncate a sitemap, or publish an apparently complete one
 * when the frozen upstream changes pagination halfway through enumeration.
 */
export async function publicSitemapEntries(context: PublicReadContext, origin: string, read: PageReader = readCachedActivitiesPage) {
  const start = Date.now()
  // Keep only ids across pages: retaining whole articles here would multiply
  // the upstream byte cap by the page count, despite the bounded data cache.
  const ids: number[] = []
  let total = 0
  for (let page = 1; page === 1 || ids.length < total; page++) {
    const remaining = 8_000 - (Date.now() - start)
    if (remaining <= 0) throw unavailable()
    const result = await read({ ...context, timeoutMs: remaining }, { page, limit: PAGE_SIZE })
    if (page === 1) total = result.total
    if (total > MAX_INDEX_ACTIVITIES || result.total !== total || result.items.length > PAGE_SIZE
      || (result.items.length === 0 && ids.length < total)) throw unavailable()
    ids.push(...result.items.map(record => record.id))
    if (ids.length > total) throw unavailable()
  }
  if (new Set(ids).size !== total) throw unavailable()
  return [
    ...PUBLIC_INDEX_PAGES.map(page => ({ loc: seoUrl(page.path, origin) })),
    // The frozen DTO has no modification time; omit lastmod rather than
    // mislabelling its creation timestamp or activity date as modification.
    ...ids.map(id => ({ loc: seoUrl(`/activity/${id}`, origin) })),
  ]
}

export async function publicRecentActivities(context: PublicReadContext, read: PageReader = readCachedActivitiesPage): Promise<PublicActivity[]> {
  const result = await read(context, { page: 1, limit: 20 })
  if (result.items.length > 20) throw unavailable()
  return result.items
}
