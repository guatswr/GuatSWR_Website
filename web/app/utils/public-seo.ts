/**
 * Unique per-page SEO values for the public pages.
 *
 * The archived site shipped one global `<head>` and patched it from the
 * activity detail page. Every migrated page now declares its own title,
 * description, canonical URL, Open Graph and Twitter fields. The deployment is
 * a preview, so every page stays `noindex, nofollow`; canonical URLs follow the
 * configured preview origin (`site.url`) rather than the request host.
 */
import { canonicalUrl } from './public-query'
import { displayImageSource } from './public-image'
import { trustedSeoOrigin } from '#shared/seo'

export const SITE_NAME = '桂航绯想天'
export const DEFAULT_OG_SITE_NAME = '桂航绯想天 | 东方Project同好会'
export const DEFAULT_DESCRIPTION = '桂航绯想天是桂林航天工业学院东方 Project 同好会，记录活动、成员与群史，欢迎校内外同好一起加入。'

export interface PublicSeoInput {
  readonly title: string
  readonly description?: string
  readonly path: string
  readonly query?: Readonly<Record<string, string | number | null | undefined>>
  readonly image?: string | null
  readonly type?: 'website' | 'article'
  readonly ogSiteName?: string
  readonly twitterCard?: 'summary' | 'summary_large_image'
}

export interface PublicSeo {
  readonly title: string
  readonly description: string
  readonly canonical: string
  readonly image: string | null
  readonly type: 'website' | 'article'
  readonly ogSiteName: string
  readonly twitterCard: 'summary' | 'summary_large_image'
}

export function buildPublicSeo(input: PublicSeoInput, siteUrl: string): PublicSeo {
  const origin = trustedSeoOrigin(siteUrl)
  const canonical = canonicalUrl(origin, input.path, input.query ?? {})
  const imagePath = displayImageSource(input.image ?? null)
  return {
    title: `${input.title} | ${SITE_NAME}`,
    description: input.description?.trim() || DEFAULT_DESCRIPTION,
    canonical,
    image: imagePath ? new URL(imagePath, origin).href : null,
    type: input.type ?? 'website',
    ogSiteName: input.ogSiteName ?? DEFAULT_OG_SITE_NAME,
    twitterCard: input.twitterCard ?? 'summary_large_image',
  }
}
