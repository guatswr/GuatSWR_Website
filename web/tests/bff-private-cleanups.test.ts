import { describe, expect, it, vi } from 'vitest'
import { createPrivateCleanupRegistry } from '../app/utils/bff-private-cleanups'

// Simulates the per-app private cache a future QueryClient owns. One client
// registers one cleanup; the registry must keep that registration across
// repeated session losses.
function createFakeQueryClient() {
  const client = {
    cachedPrivateData: 'secret-cache' as string | null,
    inFlight: 0,
    clearCalls: 0,
    clear() {
      client.clearCalls += 1
      client.cachedPrivateData = null
      client.inFlight = 0
    },
    startQuery() {
      client.inFlight += 1
      return () => {
        client.inFlight -= 1
      }
    },
  }
  return client
}

describe('private cleanup registry', () => {
  it('keeps registrations across repeated runs so one registration stays effective', () => {
    const registry = createPrivateCleanupRegistry()
    const client = createFakeQueryClient()
    registry.register(() => client.clear())
    expect(registry.size()).toBe(1)

    for (let cycle = 0; cycle < 3; cycle += 1) {
      client.cachedPrivateData = `session-${cycle}`
      expect(registry.runAll()).toBe(1)
      expect(client.cachedPrivateData).toBeNull()
    }
    expect(client.clearCalls).toBe(3)
    expect(registry.size()).toBe(1)
  })

  it('stops running a handler only after its own unsubscribe', () => {
    const registry = createPrivateCleanupRegistry()
    const first = vi.fn()
    const second = vi.fn()
    const unregisterFirst = registry.register(first)
    registry.register(second)
    expect(registry.runAll()).toBe(2)

    unregisterFirst()
    expect(registry.size()).toBe(1)
    expect(registry.runAll()).toBe(1)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(2)
  })

  it('does not loop when a handler registers or unregisters another handler', () => {
    const registry = createPrivateCleanupRegistry()
    const late = vi.fn()
    const unregisterSecond = registry.register(() => {})
    registry.register(() => {
      registry.register(late)
      unregisterSecond()
    })

    // One snapshot pass: the late handler is registered for the *next* run and
    // the unregistered one still ran this pass.
    expect(registry.runAll()).toBe(2)
    expect(late).not.toHaveBeenCalled()
    expect(registry.runAll()).toBe(2)
    expect(late).toHaveBeenCalledTimes(1)
  })

  it('isolates a throwing handler and keeps the others working', () => {
    const registry = createPrivateCleanupRegistry()
    const healthy = vi.fn()
    registry.register(() => {
      throw new Error('cache down')
    })
    registry.register(healthy)
    expect(registry.runAll()).toBe(2)
    expect(healthy).toHaveBeenCalledTimes(1)
    expect(registry.size()).toBe(2)
  })

  it('drops registrations only on explicit disposal', () => {
    const registry = createPrivateCleanupRegistry()
    const cleanup = vi.fn()
    registry.register(cleanup)
    registry.disposeAll()
    expect(registry.size()).toBe(0)
    expect(registry.runAll()).toBe(0)
    expect(cleanup).not.toHaveBeenCalled()
  })
})
