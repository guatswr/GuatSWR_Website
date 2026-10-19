/**
 * Renderable activity content for `/activity/:id`.
 *
 * The archived page fetched `/api/activities/:id` and handed `content` to a
 * browser Markdown editor's preview component. This route reads the same
 * projected record through the shared public adapter (one upstream read, no
 * browser credentials, no internal HTTP hop) and returns display metadata plus
 * a sanitized native node tree. Raw Markdown is not duplicated in the response.
 */
import type { ActivityContentResponse, ActivityDisplay } from '#shared/content'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { useRuntimeConfig } from '#imports'
import { readCachedActivity } from '../../../utils/public-data'
import { renderSafeMarkdown } from '../../../utils/markdown'

/** Malformed, missing and non-public ids are all a plain 404. */
const ACTIVITY_ID = /^[1-9][0-9]{0,14}$/

export default defineEventHandler(async (event): Promise<ActivityContentResponse> => {
  const raw = getRouterParam(event, 'id') ?? ''
  if (!ACTIVITY_ID.test(raw)) {
    throw createError({ statusCode: 404, statusMessage: 'Activity not found' })
  }
  const { apiBase } = useRuntimeConfig(event)
  // `readCachedActivity` raises 404 for a non-public row and 502 for an upstream
  // failure; both are passed through unchanged.
  const activity = await readCachedActivity({ apiBase }, Number(raw))
  const { content, ...display } = activity
  const body = await renderSafeMarkdown(content)
  return {
    activity: display satisfies ActivityDisplay,
    body: body.nodes,
    headings: body.headings,
  }
})
