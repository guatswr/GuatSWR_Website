<script setup lang="ts">
import { defaultPublicConfig } from '@guatswr/shared/config'
import { useSiteConfigStore } from '~/stores/site-config'
import { useUiStore } from '~/stores/ui'
import { THEME_BOOT_SCRIPT } from '~/utils/theme'

const route = useRoute()
const site = useSiteConfigStore(usePinia())
const ui = useUiStore(usePinia())
const { data } = await useFetch('/api/config', { key: 'public-site-config', default: () => ({ ...defaultPublicConfig }) })
site.replace(data.value)
useHead({ script: [{ key: 'theme-boot', innerHTML: THEME_BOOT_SCRIPT, tagPriority: 'critical' }] })
onMounted(ui.start)
onBeforeUnmount(ui.stop)
</script>

<template>
  <div class="min-h-screen flex flex-col font-sans bg-white text-gray-900 dark:bg-slate-950 dark:text-gray-100 transition-colors">
    <a href="#main-content" class="skip-link">跳到主要内容</a>
    <NuxtLoadingIndicator color="linear-gradient(90deg, #e0f2fe 0%, #7dd3fc 55%, #38bdf8 100%)" :height="3" />
    <SiteNavbar />
    <main id="main-content" tabindex="-1" class="flex-grow" :class="{ 'pt-16': route.path !== '/' }">
      <slot />
    </main>
    <SiteFooter />
  </div>
</template>
