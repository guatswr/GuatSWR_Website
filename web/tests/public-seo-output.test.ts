import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PublicActivity } from '@guatswr/shared'
import { createHead } from 'unhead/server'
import { UnheadSchemaOrg, defineArticle, useSchemaOrg } from 'nuxt-schema-org/schema'
import {
  PUBLIC_INDEX_PAGES, activitySeoNode, eventSeoNode, knownBeijingInstant,
  recentActivitiesRss, seoImageUrl, seoUrl, trustedSeoOrigin, xmlText,
} from '../shared/seo'
import { MAX_INDEX_ACTIVITIES, publicRecentActivities, publicSitemapEntries } from '../server/utils/public-index'

const origin = 'https://next.guatswr.top'
const context = { apiBase: 'http://127.0.0.1:8080' }
const activity = (id = 1): PublicActivity => ({
  id, title: '茶会', tag: '例会', date: '2026-09-20', description: '一起玩', content: '',
  cover_image: '/uploads/img/cover.webp', images: [], created_by: 'Cirno',
  created_by_avatar: null, updated_by: null, updated_by_avatar: null, created_at: '2026-09-20 12:00:00',
})
afterEach(() => vi.restoreAllMocks())

describe('trusted public metadata', () => {
  it('uses configured HTTPS origins and explicit loopback development origins', () => {
    expect(trustedSeoOrigin(`${origin}/`)).toBe(origin)
    expect(seoUrl('/activity/1', origin)).toBe(`${origin}/activity/1`)
    expect(trustedSeoOrigin('http://127.0.0.1:3100')).toBe('http://127.0.0.1:3100')
    for (const value of ['http://evil.test', 'https://u:p@evil.test', `${origin}/path`, `${origin}?x=1`, 'javascript:alert(1)']) {
      expect(() => trustedSeoOrigin(value)).toThrow()
    }
    for (const path of ['//evil.test/x', 'https://evil.test', '/\\evil.test', '/a\n']) expect(() => seoUrl(path, origin)).toThrow()
  })

  it('falls back safely for missing, external and traversal covers', () => {
    expect(seoImageUrl('/uploads/img/cover.webp', origin)).toBe(`${origin}/uploads/img/cover.webp`)
    for (const value of [null, '', 'https://evil.test/a.png', '//evil.test/a', '/uploads/../api/private', '/uploads/%2E%2E/a']) {
      expect(seoImageUrl(value, origin)).toBe(`${origin}/og-image.png`)
    }
  })

  it('keeps redirected and private routes out of the explicit sitemap catalogue', () => {
    const paths = PUBLIC_INDEX_PAGES.map(page => page.path)
    expect(paths).toContain('/events/party')
    expect(paths).not.toContain('/events')
    expect(paths.some(path => /admin|login|__revamp|api/.test(path))).toBe(false)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('accepts real Beijing instants and omits unknown or invalid authored dates', () => {
    expect(knownBeijingInstant('2026-11-11 20:00:00')).toBe('2026-11-11T20:00:00+08:00')
    expect(knownBeijingInstant('2026-11-11T20:00+08:00')).toBe('2026-11-11T20:00:00+08:00')
    expect(knownBeijingInstant('2026-11-11T12:00:00Z')).toBe('2026-11-11T12:00:00Z')
    for (const value of ['', '周六晚八点', '2026-11-11', '2026-02-30 20:00:00', '2026-13-01 20:00:00', '2026-11-11 25:00:00']) {
      expect(knownBeijingInstant(value)).toBeUndefined()
    }
  })

  it('uses creation, not the activity date, as Article publication time', () => {
    const node = activitySeoNode(activity(), origin)
    expect(node.datePublished).toBe('2026-09-20T12:00:00Z')
    expect(node.url).toBe(`${origin}/activity/1`)
    expect(node.author?.name).toBe('Cirno')
    expect(activitySeoNode({ ...activity(), created_at: 'unknown' }, origin)).not.toHaveProperty('datePublished')
  })

  it('does not invent an event start from a signup deadline or free-text schedule', () => {
    const base = { id: 101, title: 'STG', content: { deadline: '2026-11-10T20:00:00+08:00' } }
    expect(eventSeoNode(base, '/events/stg', origin)['@type']).toBe('CreativeWork')
    const node = eventSeoNode({ ...base, content: { ...base.content, time: '2026-11-11 20:00:00' } }, '/events/stg', origin)
    expect(node.startDate).toBe('2026-11-11T20:00:00+08:00')
    expect(node['@type']).toBe('Event')
    expect(node).not.toHaveProperty('endDate')
    expect(node).not.toHaveProperty('location')
    expect(node).not.toHaveProperty('qq')
  })

  it('renders hostile authored text through the installed Schema.org and head serializers without script breakout', async () => {
    const headline = '茶会</script><script>alert(1)</script>\u2028😀'
    const head = createHead()
    head.use(UnheadSchemaOrg({}, () => ({ host: `${origin}/`, url: `${origin}/activity/1` }), { minify: true }))
    useSchemaOrg(head, [defineArticle(activitySeoNode({ ...activity(), title: headline }, origin))])
    const output = await head.render()
    const html = output.headTags + output.bodyTags
    expect(html.match(/<script\b/g)).toHaveLength(1)
    expect(html.match(/<\/script>/g)).toHaveLength(1)
    expect(html).toContain('\\u003C/script>')
    const data = JSON.parse(html.match(/<script[^>]*>([\s\S]*?)<\/script>/)![1]!)
    expect(data['@graph'].find((node: { '@type': string }) => node['@type'] === 'Article').headline).toBe(headline)
  })
})

describe('complete public sitemap enumeration', () => {
  it('enumerates every projected page without its own cache or browser headers', async () => {
    const rows = Array.from({ length: 101 }, (_, i) => activity(i + 1))
    const read = vi.fn(async (_context, query) => ({
      total: rows.length, ...query, items: rows.slice((query.page - 1) * query.limit, query.page * query.limit),
    }))
    const entries = await publicSitemapEntries(context, origin, read)
    expect(read).toHaveBeenCalledTimes(2)
    expect(read.mock.calls[0]?.[0]).toMatchObject({ apiBase: context.apiBase })
    expect(entries).toHaveLength(PUBLIC_INDEX_PAGES.length + 101)
    expect(entries.at(-1)?.loc).toBe(`${origin}/activity/101`)
    expect(entries.every(entry => !('lastmod' in entry))).toBe(true)
    await publicSitemapEntries(context, origin, read)
    expect(read).toHaveBeenCalledTimes(4)
  })

  it('returns the static catalogue for an honestly empty dataset', async () => {
    const result = await publicSitemapEntries(context, origin, async (_context, query) => ({ total: 0, ...query, items: [] }))
    expect(result).toHaveLength(PUBLIC_INDEX_PAGES.length)
  })

  it('fails instead of silently truncating an over-bound sitemap', async () => {
    await expect(publicSitemapEntries(context, origin, async (_context, query) => ({ total: MAX_INDEX_ACTIVITIES + 1, ...query, items: [] })))
      .rejects.toMatchObject({ statusCode: 503 })
  })

  it('rejects inconsistent totals, duplicate ids and missing pages', async () => {
    for (const kind of ['changed', 'duplicate', 'empty'] as const) {
      const rows = Array.from({ length: 100 }, (_, i) => activity(i + 1))
      await expect(publicSitemapEntries(context, origin, async (_context, query) => ({
        total: query.page === 2 && kind === 'changed' ? 102 : 101,
        ...query,
        items: query.page === 1 ? rows : kind === 'empty' ? [] : [activity(kind === 'duplicate' ? 1 : 101)],
      }))).rejects.toMatchObject({ statusCode: 503 })
    }
  })

  it('propagates upstream failures instead of publishing a successful empty index', async () => {
    await expect(publicSitemapEntries(context, origin, async () => { throw new Error('upstream down') })).rejects.toThrow('upstream down')
  })

  it('enforces one overall deadline rather than an unbounded timeout per page', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(8001)
    const read = vi.fn()
    await expect(publicSitemapEntries(context, origin, read)).rejects.toMatchObject({ statusCode: 503 })
    expect(read).not.toHaveBeenCalled()
  })
})

describe('recent RSS output', () => {
  it('escapes XML scalars and retains legitimate emoji', () => {
    expect(xmlText('<&>"\'\u0000\ud800😀')).toBe('&lt;&amp;&gt;&quot;&apos;😀')
    expect(xmlText('\t\n\r')).toBe('\t\n\r')
  })

  it('protects literal descriptions even when an RSS reader interprets escaped HTML', () => {
    const rss = recentActivitiesRss([{ ...activity(), title: '<Tea & "ice">', description: '</description><script>alert(1)</script>' }], origin)
    expect(rss).toContain('&lt;Tea &amp; &quot;ice&quot;&gt;')
    expect(rss).not.toContain('<script>')
    expect(rss).toContain('&amp;lt;script&amp;gt;')
    expect(rss).toContain('<pubDate>Sun, 20 Sep 2026 12:00:00 GMT</pubDate>')
    expect(rss).toContain('最近 20 条公开活动记录，按活动日期排序')
    expect(rss).toContain(`<guid isPermaLink="true">${origin}/activity/1</guid>`)
  })

  it('produces a valid empty feed and omits unknown publication dates', () => {
    expect(recentActivitiesRss([], origin)).toContain('</channel></rss>')
    expect(recentActivitiesRss([{ ...activity(), created_at: 'unknown' }], origin)).not.toContain('<pubDate>')
  })

  it('requests only the explicitly declared recent window', async () => {
    const read = vi.fn(async (_context, query) => ({ total: 100, ...query, items: [activity()] }))
    expect(await publicRecentActivities(context, read)).toHaveLength(1)
    expect(read).toHaveBeenCalledWith(context, { page: 1, limit: 20 })
    await expect(publicRecentActivities(context, async (_context, query) => ({ total: 21, ...query, items: Array.from({ length: 21 }, (_, i) => activity(i + 1)) })))
      .rejects.toMatchObject({ statusCode: 503 })
  })

  it('rejects excessive metadata before XML entity expansion instead of truncating it', () => {
    expect(() => recentActivitiesRss([{ ...activity(), description: '&'.repeat(64_001) }], origin)).toThrow(RangeError)
  })
})
