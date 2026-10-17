import { watch } from 'vue'
import { useRoute } from 'vue-router'

export function useSeo() {
  const route = useRoute()
  const siteTitle = '桂航绯想天 | 车万同好会'
  const defaultDescription = '桂航绯想天，车万同好会交流社区，提供群活动、成员、历史与社交链接等信息。'
  const defaultOgImagePath = '/og-image.png'

  const getMergedRouteMeta = (r) => r.matched.reduce((acc, record) => ({ ...acc, ...record.meta }), {})

  const setMetaTag = (selector, attrs) => {
    let el = document.head.querySelector(selector)
    if (!el) {
      el = document.createElement('meta')
      document.head.appendChild(el)
    }
    Object.entries(attrs).forEach(([key, value]) => {
      el.setAttribute(key, value)
    })
  }

  const setCanonicalLink = (href) => {
    let link = document.head.querySelector('link[rel="canonical"]')
    if (!link) {
      link = document.createElement('link')
      link.setAttribute('rel', 'canonical')
      document.head.appendChild(link)
    }
    link.setAttribute('href', href)
  }

  const updateSeoHead = () => {
    const meta = getMergedRouteMeta(route)
    const title = meta.title ? `${meta.title} | 桂航绯想天` : siteTitle
    const description = meta.description || defaultDescription
    const robots = meta.robots || 'index,follow'
    const url = new URL(route.path, window.location.origin).toString()
    const ogImage = new URL(defaultOgImagePath, window.location.origin).toString()

    document.title = title
    setMetaTag('meta[name="description"]', { name: 'description', content: description })
    setMetaTag('meta[name="robots"]', { name: 'robots', content: robots })
    setMetaTag('meta[property="og:title"]', { property: 'og:title', content: title })
    setMetaTag('meta[property="og:description"]', { property: 'og:description', content: description })
    setMetaTag('meta[property="og:url"]', { property: 'og:url', content: url })
    setMetaTag('meta[property="og:site_name"]', { property: 'og:site_name', content: siteTitle })
    setMetaTag('meta[property="og:locale"]', { property: 'og:locale', content: 'zh_CN' })
    setMetaTag('meta[property="og:type"]', { property: 'og:type', content: 'website' })
    setMetaTag('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' })
    setMetaTag('meta[name="twitter:title"]', { name: 'twitter:title', content: title })
    setMetaTag('meta[name="twitter:description"]', { name: 'twitter:description', content: description })
    setMetaTag('meta[property="og:image"]', { property: 'og:image', content: ogImage })
    setMetaTag('meta[name="twitter:image"]', { name: 'twitter:image', content: ogImage })
    setCanonicalLink(url)
  }

  // 监听路由变化自动更新
  watch(
    () => route.fullPath,
    () => updateSeoHead(),
    { immediate: true }
  )
}
