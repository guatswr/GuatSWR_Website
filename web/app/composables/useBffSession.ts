import type { ShallowRef } from 'vue'
import type { LoginInput, SafeUser } from '@guatswr/shared'
import type { BffCsrfFacade, BffMutationFacadeOptions, BffSessionSnapshot, BffSessionStatus } from '~/utils/bff-session-core'
import { createBffSessionCore } from '~/utils/bff-session-core'
import { createPrivateCleanupRegistry } from '~/utils/bff-private-cleanups'
import type { BffAuthPath } from '~/utils/bff-client'

/**
 * Per-Nuxt-application BFF session state.
 *
 * The controller instance lives on the Nuxt app (never a module-global user or
 * query cache), so an SSR request and every browser app instance stay isolated.
 * Nothing is fetched until `refresh`, `login`, `logout` or `mutate` is called
 * explicitly: public routes do not trigger a private request just by rendering.
 *
 * Registered private-cleanup handlers are **lifetime registrations**: they stay
 * registered until their own unsubscribe function is called (or the app
 * unmounts), and a session loss only clears the private data they manage. This
 * keeps a per-app QueryClient's single registration effective across repeated
 * expiry/logout/login cycles. Callbacks are invoked from a snapshot of the set,
 * so a callback that registers or unregisters another one cannot loop forever.
 */

export interface BffSessionAppState {
  core: ReturnType<typeof createBffSessionCore>
  snapshot: ShallowRef<BffSessionSnapshot>
  cleanups: ReturnType<typeof createPrivateCleanupRegistry>
  dispose: () => void
}

declare module '#app' {
  interface NuxtApp {
    _bffAuth?: BffSessionAppState
  }
}

export interface UseBffSessionReturn {
  state: ShallowRef<BffSessionSnapshot>
  status: ComputedRef<BffSessionStatus>
  user: ComputedRef<SafeUser | null>
  isAuthenticated: ComputedRef<boolean>
  isSuperAdmin: ComputedRef<boolean>
  refresh: () => Promise<BffSessionSnapshot>
  login: (input: LoginInput) => Promise<BffSessionSnapshot>
  logout: () => Promise<void>
  mutate: (path: BffAuthPath, body: unknown) => Promise<unknown>
  /**
   * Memory-only CSRF facade for future closed guest/admin transports. It never
   * exposes a URL: the transport asks for a header value and owns its own
   * allowlisted path.
   */
  csrf: BffCsrfFacade
  /**
   * CSRF-protected mutation helper for closed transports: one bounded retry
   * only when the transport reports an explicit pre-write CSRF rejection.
   */
  performMutation: <T>(options: BffMutationFacadeOptions<T>) => Promise<T>
  registerPrivateCleanup: (cleanup: () => void) => () => void
  clearPrivateState: () => void
  currentRevision: () => number
}

function initialSnapshot(): BffSessionSnapshot {
  return {
    status: 'unknown',
    user: null,
    twofaEnabled: false,
    expiresAt: null,
    submitting: false,
    lastErrorCode: null,
  }
}

function getBffSessionAppState(): BffSessionAppState {
  const nuxtApp = useNuxtApp()
  if (nuxtApp._bffAuth) return nuxtApp._bffAuth

  const snapshot = shallowRef<BffSessionSnapshot>(initialSnapshot())
  const cleanups = createPrivateCleanupRegistry()
  const core = createBffSessionCore({
    // Lifetime registrations: run every handler but keep them registered so a
    // single QueryClient registration survives repeated expiry/logout/login.
    onSessionLost: () => {
      cleanups.runAll()
    },
  })
  const unsubscribe = core.subscribe((next) => {
    snapshot.value = next
  })
  snapshot.value = core.getSnapshot()

  const appState: BffSessionAppState = {
    core,
    snapshot,
    cleanups,
    dispose() {
      unsubscribe()
      core.dispose()
      cleanups.disposeAll()
    },
  }
  nuxtApp._bffAuth = appState
  if (import.meta.client) {
    // A late response after the app is gone must not update a dead app. Nuxt has
    // no app-unmount hook, so this uses Vue's own app-level teardown hook.
    nuxtApp.vueApp.onUnmount(() => {
      appState.dispose()
      delete nuxtApp._bffAuth
    })
  }
  return appState
}

export function useBffSession(): UseBffSessionReturn {
  const appState = getBffSessionAppState()
  const { core, snapshot, cleanups } = appState

  return {
    state: snapshot,
    status: computed(() => snapshot.value.status),
    user: computed(() => snapshot.value.user),
    isAuthenticated: computed(() => snapshot.value.status === 'authenticated' && snapshot.value.user !== null),
    isSuperAdmin: computed(() => snapshot.value.user?.role === 'super_admin'),
    async refresh() {
      // Private fetches never run during SSR; the admin route is client-side.
      if (!import.meta.client) return snapshot.value
      return core.refresh()
    },
    async login(input) {
      if (!import.meta.client) return snapshot.value
      return core.login(input)
    },
    async logout() {
      if (!import.meta.client) return
      await core.logout()
    },
    async mutate(path, body) {
      if (!import.meta.client) throw new Error('BFF mutations are client-side only')
      return core.mutate(path, body)
    },
    csrf: {
      token: () => core.csrf.token(),
      ensure: () => core.csrf.ensure(),
      invalidate: () => core.csrf.invalidate(),
    },
    async performMutation(options) {
      if (!import.meta.client) throw new Error('BFF mutations are client-side only')
      return core.performMutation(options)
    },
    registerPrivateCleanup(cleanup) {
      return cleanups.register(cleanup)
    },
    clearPrivateState() {
      core.clearPrivateState()
    },
    currentRevision: () => core.currentRevision(),
  }
}
