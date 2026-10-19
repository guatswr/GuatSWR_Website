/**
 * Lifetime registry for per-app private-state cleanup handlers.
 *
 * A handler stays registered until its own unsubscribe function runs or the app
 * disposes the registry. A session loss runs every handler from a snapshot of
 * the current registrations and then **keeps them**, so a per-app QueryClient
 * that registers once keeps clearing cached private data on every later expiry,
 * logout or user change. Iterating a snapshot also means a handler that
 * registers (or unregisters) another handler cannot extend the current pass or
 * create an infinite cycle.
 */
export interface PrivateCleanupRegistry {
  register: (cleanup: () => void) => () => void
  /** Runs every currently registered handler; returns how many ran. */
  runAll: () => number
  /** Drops all registrations (app teardown only). */
  disposeAll: () => void
  size: () => number
}

export function createPrivateCleanupRegistry(): PrivateCleanupRegistry {
  const handlers = new Set<() => void>()
  return {
    register(cleanup) {
      handlers.add(cleanup)
      return () => {
        handlers.delete(cleanup)
      }
    },
    runAll() {
      let ran = 0
      for (const cleanup of [...handlers]) {
        ran += 1
        try {
          cleanup()
        }
        catch {
          // One broken private-cache cleanup must not block the rest.
        }
      }
      return ran
    },
    disposeAll() {
      handlers.clear()
    },
    size() {
      return handlers.size
    },
  }
}
