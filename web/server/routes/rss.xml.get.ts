import { createError, defineEventHandler, setHeader } from 'h3'
import { useRuntimeConfig } from '#imports'
import { getSiteConfig } from '#site-config/server'
import { recentActivitiesRss } from '../../shared/seo'
import { publicRecentActivities } from '../utils/public-index'

export default defineEventHandler(async event => {
  const { apiBase } = useRuntimeConfig(event)
  const activities = await publicRecentActivities({ apiBase })
  setHeader(event, 'Content-Type', 'application/rss+xml; charset=utf-8')
  // Cache only DTOs; no independently stale feed survives an admin invalidation.
  setHeader(event, 'Cache-Control', 'no-store')
  try {
    return recentActivitiesRss(activities, getSiteConfig(event).url)
  } catch (error) {
    if (error instanceof RangeError) throw createError({ statusCode: 503, statusMessage: 'Public feed temporarily unavailable' })
    throw error
  }
})
