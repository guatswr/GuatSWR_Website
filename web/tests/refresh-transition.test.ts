import { runInNewContext } from 'node:vm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { finishRefreshEntrances, REFRESH_BOOT_SCRIPT, REFRESH_FADE_MS, REFRESH_FAIL_OPEN_MS } from '../app/utils/refresh-transition'
import type { RefreshTransition } from '../app/utils/refresh-transition'

describe('refresh boot', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  function boot(type = 'reload', reduced = false) {
    const root = { dataset: {} as Record<string, string>, classList: { toggle: vi.fn() }, style: { setProperty: vi.fn() } }
    const window: { __clubRefreshTransition?: RefreshTransition } = {}
    let pageshow: ((event: { persisted: boolean }) => void) | undefined
    const scope = {
      window, document: { documentElement: root, querySelector: () => undefined },
      performance: { getEntriesByType: () => [{ type }] },
      matchMedia: () => ({ matches: reduced }),
      localStorage: { getItem: () => 'dark' },
      setTimeout, clearTimeout,
      addEventListener: (_type: string, callback: typeof pageshow) => { pageshow = callback },
    }
    runInNewContext(REFRESH_BOOT_SCRIPT, scope)
    return { root, transition: window.__clubRefreshTransition, pageshow, rerun: () => runInNewContext(REFRESH_BOOT_SCRIPT, scope) }
  }
  it('starts only on reload and resolves the theme before the cover is painted', () => {
    for (const type of ['navigate', 'back_forward']) expect(boot(type).transition).toBeUndefined()
    expect(boot('reload', true).transition).toBeUndefined()
    const { root, transition } = boot()
    expect(transition).toBeDefined()
    expect(root.dataset).toMatchObject({ refreshPhase: 'loading', theme: 'dark' })
  })
  it('dismisses once, without restarting the fade when completion repeats', () => {
    const { root, transition } = boot()
    transition?.dismiss()
    expect(root.dataset.refreshPhase).toBe('leaving')
    vi.advanceTimersByTime(REFRESH_FADE_MS / 2)
    transition?.dismiss()
    vi.advanceTimersByTime(REFRESH_FADE_MS / 2)
    expect(root.dataset.refreshPhase).toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('fails open if application scripts never hydrate', () => {
    const { root } = boot()
    vi.advanceTimersByTime(REFRESH_FAIL_OPEN_MS)
    expect(root.dataset.refreshPhase).toBe('leaving')
    vi.advanceTimersByTime(REFRESH_FADE_MS)
    expect(root.dataset.refreshPhase).toBeUndefined()
    expect(root.dataset.refreshInitializing).toBe('true')
    expect(vi.getTimerCount()).toBe(0)
  })
  it('cannot restart after head updates execute the boot script again', () => {
    const { root, transition, rerun } = boot()
    transition?.dismiss()
    vi.advanceTimersByTime(REFRESH_FADE_MS)
    rerun()
    expect(root.dataset.refreshPhase).toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('clears a cached loading frame immediately on history restoration', () => {
    const { root, pageshow } = boot()
    pageshow?.({ persisted: true })
    expect(root.dataset.refreshPhase).toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('document entrance completion', () => {
  it('finishes document entrances and transitions while preserving loops and scroll effects', () => {
    const timeline = {} as AnimationTimeline
    const make = (source: AnimationTimeline, endTime: number, iterations = 1) => ({
      timeline: source, effect: { getComputedTiming: () => ({ endTime, iterations }) }, finish: vi.fn(),
    })
    const entrance = make(timeline, 850)
    const ambient = make(timeline, Infinity, Infinity)
    const scroll = make({} as AnimationTimeline, 1000)
    const inactive = make(timeline, 100)
    const cover = { ...make(timeline, 900), effect: { target: { nodeName: 'HTML' }, getComputedTiming: () => ({ endTime: 900, iterations: 1 }) } }
    inactive.finish.mockImplementation(() => { throw new Error('inactive') })
    expect(() => finishRefreshEntrances([entrance, ambient, scroll, inactive, cover] as unknown as Animation[], timeline)).not.toThrow()
    expect(entrance.finish).toHaveBeenCalledOnce()
    expect(ambient.finish).not.toHaveBeenCalled()
    expect(scroll.finish).not.toHaveBeenCalled()
    expect(cover.finish).not.toHaveBeenCalled()
  })
})
