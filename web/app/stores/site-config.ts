import { defineStore } from 'pinia'
import { defaultPublicConfig } from '@guatswr/shared/config'
import type { PublicSiteConfig } from '@guatswr/shared'

export const useSiteConfigStore = defineStore('public-site', () => {
  const config = ref<PublicSiteConfig>({ ...defaultPublicConfig })
  function replace(value: PublicSiteConfig) { config.value = value }
  return { config, replace }
})
