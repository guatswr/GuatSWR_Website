/**
 * Apply the shared public SEO payload to the current page.
 *
 * The input is a getter so page/filter state stays reactive: a client-side
 * navigation from `?school=桂航` to `?school=` (or from page 1 to page 2) must
 * update the canonical URL and the description, not freeze whatever was
 * selected when the component was set up.
 *
 * This is intentionally a thin Nuxt-composable wrapper (not a project-wide SEO
 * service): the UI worker's `usePublicSeo` can absorb it at integration if that
 * helper lands first.
 */
import { computed, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { buildPublicSeo } from '~/utils/public-seo'
import type { PublicSeoInput } from '~/utils/public-seo'

export function usePublicPageSeo(input: MaybeRefOrGetter<PublicSeoInput>): void {
  const site = useSiteConfig()
  const seo = computed(() => buildPublicSeo(toValue(input), site.url))

  useSeoMeta({
    title: () => seo.value.title,
    description: () => seo.value.description,
    ogTitle: () => seo.value.title,
    ogDescription: () => seo.value.description,
    ogUrl: () => seo.value.canonical,
    ogType: () => seo.value.type,
    ogSiteName: () => seo.value.ogSiteName,
    ogLocale: 'zh_CN',
    ogImage: () => seo.value.image ?? undefined,
    twitterCard: () => seo.value.twitterCard,
    twitterTitle: () => seo.value.title,
    twitterDescription: () => seo.value.description,
    twitterImage: () => seo.value.image ?? undefined,
    // Preview deployment: never indexable, on every page.
    robots: 'noindex, nofollow',
  })

  useHead(() => ({
    link: [{ rel: 'canonical', href: seo.value.canonical }],
  }))
}
