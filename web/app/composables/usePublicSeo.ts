import { computed } from 'vue'
import { absoluteLocalUrl } from '~/utils/public-url'

/** The archived `composables/useSeo.js` copy and defaults. */
export const SITE_NAME = '桂航绯想天'
export const SITE_TITLE = '桂航绯想天 | 东方Project同好会'
export const DEFAULT_DESCRIPTION =
  '桂航绯想天是桂林航天工业学院东方 Project 同好会，记录活动、成员与群史，欢迎校内外同好一起加入。'
const DEFAULT_OG_IMAGE = '/og-image.png'

export interface PublicSeoOptions {
  /** Page title only; `nuxt-seo-utils` appends the separator and site name. */
  title: string
  path: string
  description?: string
  /** Local cover path; anything that is not a same-origin path is rejected. */
  image?: string
}

/**
 * Preview deployments stay `noindex`; the canonical follows the configured
 * preview origin and never carries an arbitrary tracking query.
 */
export function usePublicSeo(options: PublicSeoOptions): void {
  const site = useSiteConfig()
  const description = options.description || DEFAULT_DESCRIPTION
  const canonical = computed(() => absoluteLocalUrl(options.path, site.url))
  const image = computed(
    () =>
      absoluteLocalUrl(options.image, site.url) ||
      absoluteLocalUrl(DEFAULT_OG_IMAGE, site.url)
  )

  useSeoMeta({
    title: options.title,
    description,
    robots: 'noindex, nofollow',
    ogTitle: options.title,
    ogDescription: description,
    ogUrl: canonical,
    ogType: 'website',
    ogSiteName: SITE_TITLE,
    ogLocale: 'zh_CN',
    ogImage: image,
    twitterCard: 'summary_large_image',
    twitterTitle: options.title,
    twitterDescription: description,
    twitterImage: image
  })
  useHead({ link: [{ rel: 'canonical', href: canonical }] })
}
