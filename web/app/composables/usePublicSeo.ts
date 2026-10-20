import { computed, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { defineBreadcrumb, defineOrganization, defineWebPage, defineWebSite, useSchemaOrg } from '#schema-org/app'
import { SEO_SITE_NAME, PUBLIC_INDEX_PAGES, seoImageUrl, seoUrl, trustedSeoOrigin } from '#shared/seo'
import { buildPublicSeo } from '~/utils/public-seo'
import type { PublicSeoInput } from '~/utils/public-seo'

/** One reactive metadata owner for every public content page. */
export function usePublicSeo(input: MaybeRefOrGetter<PublicSeoInput>): void {
  // Async setup can resume after its page was abandoned. A disposed component
  // must not resolve context-dependent site config or register stale metadata.
  if (getCurrentInstance()?.isUnmounted || getCurrentScope()?.active === false) return
  const site = useSiteConfig()
  const origin = trustedSeoOrigin(site.url)
  const seo = computed(() => buildPublicSeo(toValue(input), origin))
  const image = computed(() => seo.value.image || seoImageUrl(null, origin))
  useSeoMeta({
    title: () => seo.value.title,
    description: () => seo.value.description,
    ogTitle: () => seo.value.title,
    ogDescription: () => seo.value.description,
    ogUrl: () => seo.value.canonical,
    ogType: () => seo.value.type,
    ogSiteName: () => seo.value.ogSiteName,
    ogLocale: 'zh_CN',
    ogImage: image,
    twitterCard: () => seo.value.twitterCard,
    twitterTitle: () => seo.value.title,
    twitterDescription: () => seo.value.description,
    twitterImage: image,
    // Indexing remains a separately approved cutover change, even if a generic
    // site-indexable environment flag is accidentally enabled on the preview.
    robots: 'noindex, nofollow',
  })
  useHead(() => ({
    // buildPublicSeo already appends the name; do not append it a second time.
    titleTemplate: null,
    link: [
      { rel: 'canonical', href: seo.value.canonical },
      { rel: 'alternate', type: 'application/rss+xml', title: `${SEO_SITE_NAME} · 最近活动记录`, href: seoUrl('/rss.xml', origin) },
    ],
  }))

  // The maintained resolver emits a graph with each fresh SSR response. Keep
  // this runtime on the server (the module's default model); client metadata
  // above is still reactive, and crawlers receive each URL's own graph.
  if (import.meta.server) {
    useSchemaOrg(computed(() => {
      const value = toValue(input)
      const canonical = seo.value.canonical
      const crumbs = [{ name: '首页', item: seoUrl('/', origin) }]
      if (value.type === 'article') crumbs.push({ name: '社团活动记录', item: seoUrl('/activities', origin) })
      if (value.path !== '/') crumbs.push({
        name: PUBLIC_INDEX_PAGES.find(page => page.path === value.path)?.title || value.title,
        item: canonical,
      })
      return [
        defineOrganization({ '@id': `${origin}/#organization`, name: SEO_SITE_NAME, url: `${origin}/` }),
        defineWebSite({ '@id': `${origin}/#website`, name: SEO_SITE_NAME, url: `${origin}/`, inLanguage: 'zh-CN', publisher: { '@id': `${origin}/#organization` } }),
        defineWebPage({ '@id': `${canonical}#webpage`, name: seo.value.title, url: canonical, description: seo.value.description, inLanguage: 'zh-CN', isPartOf: { '@id': `${origin}/#website` } }),
        defineBreadcrumb({ '@id': `${canonical}#breadcrumb`, itemListElement: crumbs }),
      ]
    }))
  }
}
