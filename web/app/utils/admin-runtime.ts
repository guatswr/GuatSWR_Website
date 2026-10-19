import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { ElButton, ElDialog, ElInput } from 'element-plus'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/dialog/style/css'
import 'element-plus/es/components/input/style/css'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import '~/assets/css/admin.css'
import type { NuxtApp } from '#app'
import type { UseBffSessionReturn } from '~/composables/useBffSession'
import { clearLegacyAuthStorage } from './legacy-auth-cleanup'

declare module '#app' {
  interface NuxtApp {
    _adminRuntime?: { queryClient: QueryClient }
  }
}

/** Loaded only after the private route has verified its BFF identity. */
export function installAdminRuntime(app: NuxtApp, session: UseBffSessionReturn) {
  if (app._adminRuntime) return app._adminRuntime
  const queryClient = new QueryClient({ defaultOptions: {
    queries: { retry: false, staleTime: 0, gcTime: 5 * 60_000, refetchOnWindowFocus: false },
    mutations: { retry: false },
  } })
  const unregister = session.registerPrivateCleanup(() => {
    void queryClient.cancelQueries()
    queryClient.clear()
  })
  app.vueApp.use(VueQueryPlugin, { queryClient })
  app.vueApp.component('ElButton', ElButton)
  app.vueApp.component('ElDialog', ElDialog)
  app.vueApp.component('ElInput', ElInput)
  app._adminRuntime = { queryClient }
  // Remove only legacy credentials from this origin. Theme is independent.
  // The preview origin cannot and must not modify the old site's storage.
  try { clearLegacyAuthStorage(localStorage, document) } catch { /* Storage can be disabled. */ }
  app.vueApp.onUnmount(() => {
    unregister()
    void queryClient.cancelQueries()
    queryClient.clear()
    delete app._adminRuntime
  })
  return app._adminRuntime
}
