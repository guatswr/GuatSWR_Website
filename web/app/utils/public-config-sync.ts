import { getCurrentScope, onScopeDispose, watch } from 'vue'
import type { Ref } from 'vue'
import type { PublicSiteConfig } from '@guatswr/shared'

/** The store slice the public config is published into. */
export interface PublicConfigSink {
  replace(value: PublicSiteConfig): void
}

/**
 * Publishes the shared public-config request into the Pinia store.
 *
 * It must run synchronously inside `setup`: the watcher then belongs to the
 * invoking component's effect scope and is disposed together with it. Creating
 * the watcher after an `await` leaves it outside that scope, where it outlives
 * navigation and keeps firing on every later response.
 *
 * `flush: 'sync'` makes the store current before the render that follows the
 * request, on the server and during hydration alike.
 */
export function bindPublicConfig(
  source: Ref<PublicSiteConfig | undefined>,
  sink: PublicConfigSink
): void {
  watch(
    source,
    (value) => {
      if (value) sink.replace(value)
    },
    { immediate: true, flush: 'sync' }
  )
}

/**
 * Memoizes one state per key and releases it together with the effect scope that
 * created it.
 *
 * Without the release, a disposed creator (for example the public layout being
 * replaced by an admin layout and then restored) leaves a dead entry behind: the
 * next caller reuses state whose request→store watcher has already stopped, so a
 * refresh updates `request.data` while the store stays stale. The identity guard
 * keeps a newer owner's entry intact if disposal is somehow re-entrant.
 */
export function acquireScopedState<Key extends object, State extends object>(
  registry: WeakMap<Key, State>,
  key: Key,
  create: () => State
): State {
  const existing = registry.get(key)
  if (existing) return existing
  const state = create()
  registry.set(key, state)
  const scope = getCurrentScope()
  if (scope) {
    onScopeDispose(() => {
      if (registry.get(key) === state) registry.delete(key)
    })
  }
  return state
}
