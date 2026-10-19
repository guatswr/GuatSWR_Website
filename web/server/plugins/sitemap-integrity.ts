import type { SitemapInputCtx } from '@nuxtjs/sitemap'
import { createError } from 'h3'
import { PUBLIC_INDEX_PAGES } from '../../shared/seo'

// The module generates this same hook type only when enabled. Our preview
// disables its XML route, but the guard must still typecheck in that build.
declare module 'nitropack/types' {
  interface NitroRuntimeHooks {
    'sitemap:input': (context: SitemapInputCtx) => void | Promise<void>
  }
}

/** The module must not turn a failed sole source into a successful empty XML. */
export default defineNitroPlugin(nitroApp => {
  nitroApp.hooks.hook('sitemap:input', context => {
    if (context.urls.length < PUBLIC_INDEX_PAGES.length) {
      throw createError({ statusCode: 503, statusMessage: 'Public index temporarily unavailable' })
    }
  })
})
