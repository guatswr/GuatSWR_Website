<script setup lang="ts">
import { useUiStore } from '~/stores/ui'
import { THEME_BOOT_SCRIPT } from '~/utils/theme'

// Footer text and links remain server-rendered; defer their client setup off the first paint.
const SiteFooter = defineLazyHydrationComponent('idle', () => import('~/components/SiteFooter.vue'))

const ui = useUiStore(usePinia())
// The one shared public-config request for the whole application: it publishes
// the result into the Pinia store that the navbar, footer and pages read.
const { ready } = usePublicConfig()
await ready
useHead({ script: [{ key: 'theme-boot', innerHTML: THEME_BOOT_SCRIPT, tagPriority: 'critical' }] })
onMounted(ui.start)
onBeforeUnmount(ui.stop)
</script>

<template>
  <div class="min-h-screen flex flex-col font-sans bg-white text-gray-900 dark:bg-slate-950 dark:text-gray-100 transition-colors">
    <a href="#main-content" class="skip-link">跳到主要内容</a>
    <NuxtLoadingIndicator color="linear-gradient(90deg, #e0f2fe 0%, #7dd3fc 55%, #38bdf8 100%)" :height="3" />
    <SiteNavbar />
    <main id="main-content" tabindex="-1" class="flex-grow">
      <slot />
    </main>
    <SiteFooter />
  </div>
</template>
