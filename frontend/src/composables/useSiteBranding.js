import { onMounted, watch } from 'vue'
import { useSiteConfigStore } from '../stores/siteConfig'
import { getThumbUrl } from '../utils/imageUrl'

// The bundled avatar gives the first paint/offline state the same identity.
// A configured replacement is adopted only after its image has loaded.
export function useSiteBranding() {
  const site = useSiteConfigStore()
  watch(
    () => site.config.badge_image,
    (source, _, onCleanup) => {
      const currentIcon = document.head.querySelector('link[rel="icon"]')
      if (currentIcon) {
        currentIcon.href = '/brand/favicon-64.png'
        currentIcon.type = 'image/png'
      }
      if (!source) return
      const image = new Image()
      let usedOriginal = false
      image.onload = () => {
        const icon = document.head.querySelector('link[rel="icon"]')
        if (icon) {
          icon.removeAttribute('type')
          icon.removeAttribute('sizes')
          icon.href = image.src
        }
      }
      image.onerror = () => {
        if (!usedOriginal && image.getAttribute('src') !== source) {
          usedOriginal = true
          image.src = source
        }
      }
      image.src = getThumbUrl(source)
      onCleanup(() => {
        image.onload = null
        image.onerror = null
      })
    },
    { immediate: true }
  )
  onMounted(() => {
    void site.load()
  })
}
