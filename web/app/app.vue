<script setup lang="ts">
import { useUiStore } from '~/stores/ui'
import { browserThemeColor } from '~/utils/theme'

const route = useRoute()
const ui = useUiStore(usePinia())
const pageTransition = usePublicPageTransition()

// Keep browser-owned surfaces in sync with the route as well as the theme.
// The homepage artwork is dark even when the rest of the site is in day mode.
useHead(() => ({
  htmlAttrs: { 'data-page-surface': route.path === '/' ? 'hero' : 'page' },
  meta: [{ name: 'theme-color', content: browserThemeColor(ui.resolvedTheme, route.path) }],
}))
</script>

<template>
  <NuxtRouteAnnouncer />
  <NuxtLayout>
    <NuxtPage :transition="route.meta.layout === 'admin' ? false : pageTransition" />
  </NuxtLayout>
</template>
