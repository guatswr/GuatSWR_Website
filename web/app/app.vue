<script setup lang="ts">
import { useUiStore } from '~/stores/ui'
import { browserThemeColor } from '~/utils/theme'

const route = useRoute()
const ui = useUiStore(usePinia())
const pageTransition = usePublicPageTransition()
const config = useRuntimeConfig()

const isPublicPage = computed(() => {
  const path = route.path
  return path !== '/login' && !path.startsWith('/admin')
})

const shouldInjectUmami = computed(() => {
  const url = config.public.umamiScriptUrl
  const id = config.public.umamiWebsiteId
  return Boolean(isPublicPage.value && url && id)
})

// Keep browser-owned surfaces in sync with the route as well as the theme.
// The homepage artwork is dark even when the rest of the site is in day mode.
useHead(() => ({
  htmlAttrs: { 'data-page-surface': route.path === '/' ? 'hero' : 'page' },
  meta: [{ name: 'theme-color', content: browserThemeColor(ui.resolvedTheme, route.path) }],
  script: shouldInjectUmami.value
    ? [
        {
          src: String(config.public.umamiScriptUrl),
          defer: true,
          'data-website-id': String(config.public.umamiWebsiteId),
          'data-performance': 'true',
        },
      ]
    : [],
}))
</script>

<template>
  <NuxtRouteAnnouncer />
  <NuxtLayout>
    <NuxtPage :transition="route.meta.layout === 'admin' || route.path === '/login' ? false : pageTransition" />
  </NuxtLayout>
</template>
