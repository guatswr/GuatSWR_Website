/**
 * Renderable history entries for `/history`.
 *
 * Legacy rows store HTML written by the admin rich-text toolbar
 * (`frontend/src/views/admin/History.vue`), which the archived page injected
 * with `v-html`. This route reads the projected history through the shared
 * public adapter and runs each description through the server-side
 * Markdown/sanitize pipeline, so the browser receives an allowlisted native
 * tree instead of raw backend HTML.
 */
import type { HistoryContentResponse, HistoryDisplayEntry } from '#shared/content'
import { defineEventHandler } from 'h3'
import { useRuntimeConfig } from '#imports'
import { readCachedHistory } from '../../utils/public-data'
import { renderSafeMarkdown } from '../../utils/markdown'

export default defineEventHandler(async (event): Promise<HistoryContentResponse> => {
  const { apiBase } = useRuntimeConfig(event)
  const entries = await readCachedHistory({ apiBase })
  const items: HistoryDisplayEntry[] = []
  for (const entry of entries) {
    const { description, ...display } = entry
    const body = await renderSafeMarkdown(description)
    items.push({ ...display, description: body.nodes })
  }
  return { items }
})
