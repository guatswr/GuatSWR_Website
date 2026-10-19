import { describe, expect, it } from 'vitest'
import { effectScope, ref } from 'vue'
import type { Ref } from 'vue'
import { acquireScopedState, bindPublicConfig } from '../app/utils/public-config-sync'
import {
  normalizedGroupNumber,
  parseHomeLinks,
  safeHttpUrl
} from '../app/utils/site-config'
import { formatArchiveDate, formatClubDate } from '../app/utils/club-date'
import { absoluteLocalUrl, safeLocalPath } from '../app/utils/public-url'

const config = (overrides: Record<string, unknown> = {}) => ({
  home_bg: '',
  join_bg: '',
  banner_text: '',
  badge_image: '',
  mascot_image: '',
  qq_qr_image: '',
  qq_group_number: '',
  qq_join_url: '',
  join_question: '你是怎么入坑东方的？',
  home_links: '',
  ...overrides
})

describe('public config store binding', () => {
  it('publishes the current value immediately and follows later updates synchronously', () => {
    const source = ref<ReturnType<typeof config> | undefined>(config({ banner_text: 'first' }))
    const seen: string[] = []
    const sink = { replace: (value: ReturnType<typeof config>) => seen.push(value.banner_text) }
    const scope = effectScope()
    scope.run(() => bindPublicConfig(source, sink))
    expect(seen).toEqual(['first'])
    source.value = config({ banner_text: 'second' })
    // Sync flush: the store is current before the next render.
    expect(seen).toEqual(['first', 'second'])
    scope.stop()
  })

  it('belongs to the invoking effect scope and stops with it', () => {
    const source = ref<ReturnType<typeof config> | undefined>(config({ banner_text: 'first' }))
    const seen: string[] = []
    const sink = { replace: (value: ReturnType<typeof config>) => seen.push(value.banner_text) }
    const scope = effectScope()
    scope.run(() => bindPublicConfig(source, sink))
    expect(seen).toEqual(['first'])
    scope.stop()
    source.value = config({ banner_text: 'after-dispose' })
    // An out-of-scope watcher would keep firing here and leak across navigation.
    expect(seen).toEqual(['first'])
  })

  it('ignores a missing response', () => {
    const source = ref<ReturnType<typeof config> | undefined>(undefined)
    const seen: string[] = []
    const scope = effectScope()
    scope.run(() => bindPublicConfig(source, { replace: (value) => seen.push(value.banner_text) }))
    expect(seen).toEqual([])
    source.value = config({ banner_text: 'loaded' })
    expect(seen).toEqual(['loaded'])
    scope.stop()
  })
})

interface ScopedState {
  source: Ref<ReturnType<typeof config> | undefined>
  values: string[]
}

/** One memo entry behaves like `usePublicConfig`: request ref + store binding. */
function scopedState(): ScopedState {
  const source = ref<ReturnType<typeof config> | undefined>(config({ banner_text: 'first' }))
  const values: string[] = []
  bindPublicConfig(source, { replace: (value) => values.push(value.banner_text) })
  return { source, values }
}

describe('scoped state lifetime', () => {
  it('reuses the same entry while the creating scope is alive', () => {
    const registry = new WeakMap<object, ScopedState>()
    const app = {}
    const layout = effectScope()
    const first = layout.run(() => acquireScopedState(registry, app, scopedState))
    const again = layout.run(() => acquireScopedState(registry, app, scopedState))
    expect(again).toBe(first)
    layout.stop()
  })

  it('reacquires a live entry after the creating scope is disposed', () => {
    const registry = new WeakMap<object, ScopedState>()
    const app = {}
    const publicLayout = effectScope()
    const first = publicLayout.run(() => acquireScopedState(registry, app, scopedState))
    expect(first?.values).toEqual(['first'])

    // A layout change disposes the scope that installed the store binding.
    publicLayout.stop()

    const nextLayout = effectScope()
    const second = nextLayout.run(() => acquireScopedState(registry, app, scopedState))
    expect(second).toBeDefined()
    expect(second).not.toBe(first)
    expect(second?.values).toEqual(['first'])

    // A refresh (the shared request resolving again) must reach the store.
    second!.source.value = config({ banner_text: 'refreshed' })
    expect(second?.values).toEqual(['first', 'refreshed'])

    // The disposed entry must not keep a detached watcher that still fires.
    first!.source.value = config({ banner_text: 'stale' })
    expect(first?.values).toEqual(['first'])
    nextLayout.stop()
  })

  it('drops the entry when its scope is disposed and creates a fresh one each time', () => {
    const registry = new WeakMap<object, ScopedState>()
    const app = {}
    const states = [effectScope(), effectScope(), effectScope()].map((scope) => {
      const state = scope.run(() => acquireScopedState(registry, app, scopedState))
      scope.stop()
      return state
    })
    expect(new Set(states).size).toBe(3)
  })

  it('never shares one entry between two applications (SSR request isolation)', () => {
    const registry = new WeakMap<object, ScopedState>()
    const requestA = {}
    const requestB = {}
    const first = acquireScopedState(registry, requestA, scopedState)
    const second = acquireScopedState(registry, requestB, scopedState)
    expect(second).not.toBe(first)
    first.source.value = config({ banner_text: 'only-a' })
    expect(first.values).toEqual(['first', 'only-a'])
    expect(second.values).toEqual(['first'])
  })
})

describe('archived social link filtering', () => {
  it('accepts only explicit http(s) outbound links', () => {
    expect(safeHttpUrl('https://space.bilibili.com/444257435')).toBe(
      'https://space.bilibili.com/444257435'
    )
    expect(safeHttpUrl('  https://example.com/path  ')).toBe('https://example.com/path')
    for (const value of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      '//evil.example/path',
      '/uploads/local.webp',
      'ftp://example.com',
      '',
      null,
      undefined,
      42
    ])
      expect(safeHttpUrl(value)).toBe('')
  })

  it('keeps the archived default accounts when the config is empty or invalid', () => {
    const links = parseHomeLinks('')
    expect(links.map((link) => link.title)).toEqual([
      'Bilibili 官方账号',
      'QQ 直播频道'
    ])
    expect(links.every((link) => link.url.startsWith('https://'))).toBe(true)
    expect(parseHomeLinks('{not json').length).toBe(2)
    expect(parseHomeLinks('{"nested":true}').length).toBe(2)
  })

  it('projects configured links, drops unsafe ones and keeps the home filter flag', () => {
    const links = parseHomeLinks(
      JSON.stringify([
        {
          title: 'Steam',
          url: 'https://steam.example/group',
          subtitle: '外部社群',
          iconText: 'S',
          showOnHome: false
        },
        { title: 'Unsafe', url: 'javascript:alert(1)' },
        { title: 'No url' },
        ['array-entry'],
        null
      ])
    )
    expect(links.length).toBe(1)
    expect(links[0]).toMatchObject({
      title: 'Steam',
      url: 'https://steam.example/group',
      subtitle: '外部社群',
      iconText: 'S',
      showOnHome: false
    })
    // Arbitrary configured fields never reach the rendered component.
    expect(Object.keys(links[0] ?? {}).sort()).toEqual(
      ['iconText', 'showOnHome', 'subtitle', 'title', 'url'].sort()
    )
  })

  it('only accepts a plain 5 to 12 digit QQ group number', () => {
    expect(normalizedGroupNumber('123456789')).toBe('123456789')
    expect(normalizedGroupNumber('1234')).toBe('')
    expect(normalizedGroupNumber('1234567890123')).toBe('')
    expect(normalizedGroupNumber('12345abc')).toBe('')
    expect(normalizedGroupNumber(123456)).toBe('')
  })
})

describe('archived club date rules', () => {
  it('parses Beijing-local values independently of the host timezone', () => {
    expect(formatClubDate('2026-10-18', { year: true })).toBe('2026年10月18日')
    expect(formatClubDate('2026-10-18T23:30', { year: true })).toBe('2026年10月18日')
    expect(formatClubDate('2026-10-18T23:30:00Z', { year: true })).toBe('2026年10月19日')
    expect(formatClubDate('2026-10-18T23:30:00+08:00', { year: true })).toBe(
      '2026年10月18日'
    )
  })

  it('keeps free-form legacy text rather than inventing a date', () => {
    expect(formatClubDate('某年某月')).toBe('时间待确认')
    expect(formatClubDate('某年某月', { fallback: '某年某月' })).toBe('某年某月')
    expect(formatClubDate('')).toBe('时间待确认')
  })

  it('uses the stored value as the archive-card fallback', () => {
    expect(formatArchiveDate('2025-04-05')).toBe('2025年4月5日')
    expect(formatArchiveDate('unknown')).toBe('unknown')
    expect(formatArchiveDate('')).toBe('')
  })
})

describe('crawler metadata URLs', () => {
  it('accepts only plain same-origin paths', () => {
    expect(safeLocalPath('/uploads/fixture.webp')).toBe('/uploads/fixture.webp')
    expect(safeLocalPath('/og-image.png?v=1')).toBe('/og-image.png?v=1')
    for (const value of [
      '//evil.example/x.png',
      'https://evil.example/x.png',
      '/uploads/../secret',
      '/uploads/%2e%2e/secret',
      '/uploads\\secret',
      '/uploads/\u0000.png',
      'uploads/x.png',
      ''
    ])
      expect(safeLocalPath(value)).toBe('')
  })

  it('resolves the configured preview origin and rejects foreign values', () => {
    expect(absoluteLocalUrl('/uploads/fixture.webp', 'https://next.guatswr.top')).toBe(
      'https://next.guatswr.top/uploads/fixture.webp'
    )
    expect(absoluteLocalUrl('/og-image.png', 'https://next.guatswr.top')).toBe(
      'https://next.guatswr.top/og-image.png'
    )
    expect(absoluteLocalUrl('https://evil.example/x.png', 'https://next.guatswr.top')).toBe('')
    expect(absoluteLocalUrl('/og-image.png', '')).toBe('')
  })
})
