import { computed } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { defaultPublicConfig } from '@guatswr/shared/config'
import type { PublicSiteConfig } from '@guatswr/shared'
import { useSiteConfigStore } from '~/stores/site-config'
import { acquireScopedState, bindPublicConfig } from '~/utils/public-config-sync'
import { parseHomeLinks } from '~/utils/site-config'
import type { SocialLink } from '~/utils/site-config'

/**
 * One key for the layout and every page: a single SSR request, one payload
 * entry, and no second request during hydration.
 */
const PUBLIC_CONFIG_KEY = 'public-site-config'

/** Exact archived message (`stores/siteConfig.js`). */
export const PUBLIC_CONFIG_ERROR = '暂时无法加载社团信息，请稍后重试。'

export interface PublicConfigState {
  config: ComputedRef<PublicSiteConfig>
  socialLinks: ComputedRef<SocialLink[]>
  pending: Ref<boolean>
  error: ComputedRef<string>
  /** Resolves once the shared request has settled; await it before deriving SEO. */
  ready: Promise<unknown>
  /** Retry keeps the same key, so the layout and the page see the same result. */
  retry: () => Promise<void>
}

/** Per Nuxt application, so a request never leaks across SSR renders. */
const states = new WeakMap<object, PublicConfigState>()

/**
 * Synchronous by design: the returned refs, the store binding and the request
 * promise all exist before `setup` returns, and `await ready` happens in the
 * caller. Every later caller in the same application reuses the same state, and
 * the entry is released with the effect scope that created it, so a replaced
 * layout reacquires a state whose watcher is still live.
 */
export function usePublicConfig(): PublicConfigState {
  return acquireScopedState(states, useNuxtApp(), createPublicConfigState)
}

function createPublicConfigState(): PublicConfigState {
  const site = useSiteConfigStore(usePinia())
  const request = useFetch<PublicSiteConfig>('/api/config', {
    key: PUBLIC_CONFIG_KEY,
    default: () => ({ ...defaultPublicConfig })
  })
  bindPublicConfig(request.data, site)

  const config = computed(() => site.config)
  return {
    config,
    socialLinks: computed(() => parseHomeLinks(config.value.home_links)),
    pending: request.pending,
    error: computed(() => (request.error.value ? PUBLIC_CONFIG_ERROR : '')),
    ready: request.then(() => undefined),
    retry: async (): Promise<void> => {
      await request.refresh()
    }
  }
}
