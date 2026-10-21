/**
 * Focused unit/contract tests for the migrated public pages.
 *
 * These are pure: no Nuxt runtime, no network, no browser. They cover the
 * sanitizer's security and completeness guarantees, URL hardening, the
 * archived pagination/sort/chart algorithms and the deterministic date rules
 * that keep SSR and hydration identical.
 */
import { describe, expect, it } from 'vitest'
import {
  plainTextAst,
  safeImageSrc,
  safeLinkHref,
  sanitizeMarkdownAst,
  isSafeMarkdownTag,
} from '../shared/markdown'
import type { RawMarkdownNode, SafeMarkdownElement, SafeMarkdownNode } from '../shared/markdown'
import {
  PUBLIC_QUERY_KEYS,
  buildPublicPath,
  canonicalUrl,
  parsePageParam,
  parsePageSizeParam,
  pickQuery,
} from '../app/utils/public-query'
import { pageItems, totalPageCount } from '../app/utils/public-pagination'
import {
  buildMemberFilterTabs,
  buildParliamentData,
  compareMemberNames,
  formatMemberOrdinal,
  getMemberTags,
  getSchoolColor,
  getSchoolDarkColor,
  memberInitialLetter,
  sortMembersByKeys,
} from '../app/utils/members'
import type { MemberSortKey } from '../shared/content'
import { parliamentSeats, parliamentTotal } from '../app/utils/parliament'
import { historyAnchor, monthItems, monthKey, monthRailHeight } from '../app/utils/history'
import {
  actionStyleClass,
  averageDuration,
  bounceRate,
  buildLogChart,
  buildPoints,
  buildSmoothPath,
  chartMaximum,
  environmentIconUrl,
  formatAction,
  formatChartDate,
  formatDuration,
  formatLogTime,
  formatNumber,
  logRangeWindow,
  pageTitle,
  topEntryPath,
} from '../app/utils/logs'
import { displayImageSource, displayThumbSource } from '../app/utils/public-image'
import { buildPublicSeo } from '../app/utils/public-seo'
import { beijingDateString, formatBeijingDateTime } from '../app/utils/beijing-time'

const element = (
  tag: string,
  props: Record<string, unknown> = {},
  children: RawMarkdownNode[] = [],
): RawMarkdownNode => ({ type: 'element', tag, props, children })

const text = (value: string): RawMarkdownNode => ({ type: 'text', value })

const asElements = (nodes: readonly SafeMarkdownNode[]): SafeMarkdownElement[] =>
  nodes.filter((node): node is SafeMarkdownElement => node.type === 'element')

const flattenText = (nodes: readonly SafeMarkdownNode[]): string => nodes
  .map(node => (node.type === 'text' ? node.value : flattenText(node.children)))
  .join('')

const findElements = (nodes: readonly SafeMarkdownNode[], tag: string): SafeMarkdownElement[] =>
  nodes.flatMap(node => (node.type === 'text'
    ? []
    : [...(node.tag === tag ? [node] : []), ...findElements(node.children, tag)]))

describe('markdown sanitizer: dangerous content', () => {
  it('drops active-content subtrees instead of turning their payload into article text', () => {
    const result = sanitizeMarkdownAst([
      element('p', {}, [text('before')]),
      element('script', {}, [text('alert(1)')]),
      element('style', {}, [text('body{display:none}')]),
      element('iframe', { src: 'https://evil.test' }),
      element('svg', { onload: 'x()' }, [element('circle')]),
      element('form', {}, [element('input', { type: 'text' })]),
      element('p', {}, [text('after')]),
    ])

    expect(result.complete).toBe(true)
    expect(asElements(result.nodes).map(node => node.tag)).toEqual(['p', 'p'])
    expect(flattenText(result.nodes)).toBe('beforeafter')
    for (const tag of ['script', 'style', 'iframe', 'svg', 'form', 'input', 'circle']) {
      expect(findElements(result.nodes, tag)).toEqual([])
    }
  })

  it('unwraps custom components and never keeps their bindings', () => {
    const result = sanitizeMarkdownAst([
      element('alert', { type: 'warning' }, [element('p', {}, [text('body')])]),
      element('icon', { name: 'mdi:x', style: 'color:red', onClick: 'steal()' }, [text('label')]),
      element('component', { is: 'AdminPanel', ':role': 'admin' }, [text('nope')]),
    ])

    const nodes = asElements(result.nodes)
    expect(nodes.every(node => isSafeMarkdownTag(node.tag))).toBe(true)
    expect(flattenText(result.nodes)).toBe('bodylabelnope')
    const serialized = JSON.stringify(result.nodes)
    expect(serialized).not.toContain('onClick')
    expect(serialized).not.toContain('AdminPanel')
    expect(serialized).not.toContain('mdi:x')
  })

  it('never leaks parser-only props such as the raw fenced source', () => {
    const result = sanitizeMarkdownAst([
      element('pre', {
        className: ['language-html'],
        code: '<script>alert(1)</script>\n',
        language: 'html',
        meta: '',
      }, [
        element('code', { __ignoreMap: '' }, [text('<script>alert(1)</script>\n')]),
      ]),
    ])

    const [pre] = asElements(result.nodes)
    expect(pre?.tag).toBe('pre')
    expect(pre?.props).toEqual({ class: 'language-html' })
    // Fenced code stays text: it is a text node, escaped by the renderer.
    expect(flattenText(result.nodes)).toBe('<script>alert(1)</script>\n')
    expect(JSON.stringify(result.nodes)).not.toContain('__ignoreMap')
  })

  it('keeps only narrow colour tokens and only inside code blocks', () => {
    const result = sanitizeMarkdownAst([
      element('pre', {}, [
        element('code', {}, [
          element('span', {
            style: 'color:#ff0000;position:fixed;background-image:url(https://evil.test/x);--shiki-dark:#fff',
          }, [text('const a = 1')]),
        ]),
      ]),
      element('p', {}, [
        element('span', { style: 'color:red;position:absolute' }, [text('inline')]),
      ]),
    ])

    const [span] = findElements(result.nodes, 'span')
    expect(span?.props.style).toBe('color: #ff0000; --shiki-dark: #fff')
    expect(JSON.stringify(result.nodes)).not.toContain('url(')
    expect(JSON.stringify(result.nodes)).not.toContain('position')
    const inline = findElements(result.nodes, 'p')[0]
    expect(JSON.stringify(inline)).not.toContain('style')
  })
})

describe('markdown sanitizer: links, images and URLs', () => {
  it('rejects hostile link protocols, authority tricks and credentials', () => {
    const hostile = [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      '%6a%61vascript:alert(1)',
      'jav&#x61;script:alert(1)',
      '//evil.test/path',
      '/\\evil.test/path',
      '\\/evil.test',
      'https://user:pass@evil.test/',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
    ]
    for (const href of hostile) {
      expect(safeLinkHref(href), href).toBeNull()
    }
  })

  it('keeps ordinary links and returns the original text, not a decoded form', () => {
    expect(safeLinkHref('/activity/2')).toBe('/activity/2')
    expect(safeLinkHref('/uploads/a%2Fb.pdf')).toBe('/uploads/a%2Fb.pdf')
    expect(safeLinkHref('https://example.com/a?b=1&c=2')).toBe('https://example.com/a?b=1&c=2')
    expect(safeLinkHref('#md-heading')).toBe('#md-heading')
    expect(safeLinkHref('  /activity/3  ')).toBe('/activity/3')
    expect(safeLinkHref('')).toBeNull()
  })

  it('adds safe rel/target for external links only', () => {
    const result = sanitizeMarkdownAst([
      element('p', {}, [
        element('a', { href: 'https://example.com/x' }, [text('out')]),
        element('a', { href: '/members' }, [text('in')]),
      ]),
    ])
    const [external, internal] = findElements(result.nodes, 'a')
    expect(external?.props).toMatchObject({ target: '_blank', rel: 'noopener noreferrer nofollow' })
    expect(internal?.props.target).toBeUndefined()
    expect(internal?.props.rel).toBeUndefined()
  })

  it('renders same-origin images only, normalizing legacy absolute upload URLs', () => {
    expect(safeImageSrc('/uploads/img/a.png')).toBe('/uploads/img/a.png')
    expect(safeImageSrc('https://old.example/uploads/img/a.png')).toBe('/uploads/img/a.png')
    expect(safeImageSrc('https://cdn.example/a.png')).toBeNull()
    expect(safeImageSrc('/\\evil.test/a.png')).toBeNull()
    expect(safeImageSrc('/uploads/../../etc/passwd')).toBeNull()
    expect(safeImageSrc('javascript:alert(1)')).toBeNull()
    expect(safeImageSrc('data:image/svg+xml,<svg onload=alert(1)>')).toBeNull()

    expect(displayImageSource('https://cdn.example/a.png')).toBeNull()
    expect(displayThumbSource('/uploads/img/a.png')).toBe('/uploads/img/a-thumb.webp')
    expect(displayThumbSource('/uploads/img/a.svg')).toBe('/uploads/img/a.svg')
    expect(displayThumbSource('https://cdn.example/a.png')).toBeNull()

    // A displayable image keeps its element and attributes through the AST
    // sanitizer; only the un-displayable ones are dropped with the element.
    const kept = sanitizeMarkdownAst([element('img', { src: '/uploads/img/a.png', alt: 'cover' })])
    expect(findElements(kept.nodes, 'img')[0]?.props)
      .toMatchObject({ src: '/uploads/img/a.png', alt: 'cover', loading: 'lazy', decoding: 'async' })
  })

  it('drops images and links whose sources are unsafe', () => {
    const result = sanitizeMarkdownAst([
      element('p', {}, [
        element('img', { src: 'https://cdn.example/a.png', alt: 'remote' }),
        element('a', { href: 'javascript:alert(1)' }, [text('bad')]),
      ]),
    ])
    expect(findElements(result.nodes, 'img')).toEqual([])
    const [link] = findElements(result.nodes, 'a')
    expect(link?.props.href).toBeUndefined()
    expect(flattenText(result.nodes)).toBe('bad')
  })
})

describe('markdown sanitizer: headings, fragments and completeness', () => {
  it('generates deterministic, clobber-resistant ids and dedupes duplicates', () => {
    const tree = [
      element('h2', { id: '标题一' }, [text('标题一')]),
      element('h2', { id: '标题一-1' }, [text('标题一')]),
      element('h1', { id: 'location' }, [text('location')]),
    ]
    const first = sanitizeMarkdownAst(tree)
    const second = sanitizeMarkdownAst(tree)
    expect(first.headings).toEqual(second.headings)
    expect(first.headings.map(heading => heading.id)).toEqual(['md-标题一', 'md-标题一-1', 'md-location'])
    for (const heading of first.headings) expect(heading.id.startsWith('md-')).toBe(true)
    expect(findElements(first.nodes, 'h2')[1]?.props.id).toBe('md-标题一-1')
  })

  it('rewrites in-article fragments to the regenerated heading ids', () => {
    const result = sanitizeMarkdownAst([
      element('p', {}, [
        element('a', { href: '#标题一' }, [text('one')]),
        element('a', { href: '#%E6%A0%87%E9%A2%98%E4%B8%80' }, [text('encoded')]),
        element('a', { href: '#标题一-1' }, [text('second')]),
        element('a', { href: '#not-a-heading' }, [text('dangling')]),
      ]),
      element('h2', { id: '标题一' }, [text('标题一')]),
      element('h2', { id: '标题一-1' }, [text('标题一')]),
    ])
    expect(findElements(result.nodes, 'a').map(node => node.props.href)).toEqual([
      '#md-标题一',
      '#md-标题一',
      '#md-标题一-1',
      '#not-a-heading',
    ])
  })

  it('keeps the article tail and reports completeness', () => {
    const tree = [
      element('h2', {}, [text('intro')]),
      element('p', {}, [text('body')]),
      element('p', {}, [text('SENTINEL-END')]),
    ]
    const result = sanitizeMarkdownAst(tree)
    expect(result.complete).toBe(true)
    expect(flattenText(result.nodes)).toContain('SENTINEL-END')

    const oversized = Array.from({ length: 9_000 }, (_value, index) =>
      element('p', {}, [text(`paragraph-${index}`)]))
    const truncated = sanitizeMarkdownAst(oversized)
    expect(truncated.complete).toBe(false)
    // The caller then re-renders the *whole* article as escaped plain text.
    const fallback = plainTextAst('SENTINEL-END')
    expect(fallback[0]?.type).toBe('element')
    expect(flattenText(fallback)).toBe('SENTINEL-END')
  })

  it('keeps GFM task checkboxes inert and drops every other input', () => {
    const result = sanitizeMarkdownAst([
      element('ul', {}, [
        element('li', { className: ['task-list-item'] }, [
          element('input', { type: 'checkbox', checked: true, disabled: false, name: 'x', onchange: 'steal()' }),
          element('p', {}, [text('done')]),
        ]),
        element('li', { className: ['task-list-item'] }, [
          element('input', { type: 'checkbox', checked: false }),
          element('p', {}, [text('todo')]),
        ]),
      ]),
      element('form', { action: 'https://evil.test' }, [
        element('input', { type: 'text', value: 'x' }),
        element('button', {}, [text('go')]),
      ]),
      element('p', {}, [element('input', { type: 'submit' })]),
    ])

    const inputs = findElements(result.nodes, 'input')
    expect(inputs).toHaveLength(2)
    expect(inputs[0]?.props).toEqual({ type: 'checkbox', disabled: true, checked: true })
    expect(inputs[1]?.props).toEqual({ type: 'checkbox', disabled: true })
    expect(findElements(result.nodes, 'li')[0]?.props.class).toBe('task-list-item')
    expect(flattenText(result.nodes)).toBe('donetodo')
    const serialized = JSON.stringify(result.nodes)
    expect(serialized).not.toContain('onchange')
    expect(serialized).not.toContain('evil.test')
    expect(findElements(result.nodes, 'form')).toEqual([])
    expect(findElements(result.nodes, 'button')).toEqual([])
  })

  it('exposes the same tag allowlist to the browser renderer', () => {
    expect(isSafeMarkdownTag('p')).toBe(true)
    expect(isSafeMarkdownTag('a')).toBe(true)
    expect(isSafeMarkdownTag('UiDialog')).toBe(false)
    expect(isSafeMarkdownTag('script')).toBe(false)
    expect(isSafeMarkdownTag('iframe')).toBe(false)
    // `input` is deliberately outside the generic allowlist: the browser
    // renderer admits exactly one inert checkbox shape through its own closed
    // branch (`safeTaskCheckboxProps`) *before* this check (P4 defence in
    // depth), so a generic `input` must not be allowlisted here.
    expect(isSafeMarkdownTag('input')).toBe(false)
  })
})

describe('pagination and query', () => {
  it('reproduces the archived page sequence', () => {
    expect(pageItems(1, 1)).toEqual([1])
    expect(pageItems(2, 1)).toEqual([1, 2])
    expect(pageItems(3, 2)).toEqual([1, 2, 3])
    expect(pageItems(10, 5)).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 10])
    expect(pageItems(10, 1)).toEqual([1, 2, 3, 4, 'ellipsis', 10])
    expect(pageItems(10, 10)).toEqual([1, 'ellipsis', 7, 8, 9, 10])
    expect(totalPageCount(0, 12)).toBe(1)
    expect(totalPageCount(25, 12)).toBe(3)
  })

  it('accepts only real page values', () => {
    expect(parsePageParam(undefined)).toBe(1)
    expect(parsePageParam('')).toBe(1)
    expect(parsePageParam('2')).toBe(2)
    expect(parsePageParam('02')).toBe(2)
    for (const invalid of ['0', '-1', '1.5', 'abc', '1e3', ' ', 'page=2']) {
      expect(parsePageParam(invalid), invalid).toBeNull()
    }
    // Repeated parameters use the first value, as the archived page did.
    expect(parsePageParam(['2', '3'])).toBe(2)
    expect(parsePageSizeParam('50', [20, 50, 100], 20)).toBe(50)
    expect(parsePageSizeParam('37', [20, 50, 100], 20)).toBe(20)
  })

  it('drops empty values and tracking parameters from built URLs', () => {
    expect(buildPublicPath('/activities', { page: 2 })).toBe('/activities?page=2')
    expect(buildPublicPath('/activities', { page: 1 })).toBe('/activities?page=1')
    expect(buildPublicPath('/members', { school: '', page: undefined })).toBe('/members')
    expect(buildPublicPath('/members', { school: '桂航' })).toBe('/members?school=%E6%A1%82%E8%88%AA')
    expect(pickQuery({ school: '桂航', utm_source: 'x', page: ['3'] }, ['school', 'page']))
      .toEqual({ school: '桂航', page: '3' })
    expect(canonicalUrl('https://next.guatswr.top', '/logs', { page: 2 }))
      .toBe('https://next.guatswr.top/logs?page=2')
    // A canonical URL is built from the owned-key allowlist only.
    expect(canonicalUrl('https://next.guatswr.top', '/members', { school: '桂航', utm_source: 'x', gclid: 'y' }))
      .toBe('https://next.guatswr.top/members?school=%E6%A1%82%E8%88%AA')
    expect(PUBLIC_QUERY_KEYS).toContain('school')
  })
})

describe('members', () => {
  const members = [
    { id: 1, name: 'Cirno' },
    { id: 2, name: '阿离' },
    { id: 3, name: '④' },
    { id: 4, name: 'Taropoi' },
  ]
  // Shape produced by `server/utils/member-sort.ts`; the client only sorts.
  const serverKeys: Readonly<Record<string, MemberSortKey>> = {
    '1': { category: 0, key: 'cirno' },
    '2': { category: 1, key: 'a' },
    '3': { category: 2, key: '④' },
    '4': { category: 0, key: 'taropoi' },
  }

  it('sorts Latin names, then Han names, then everything else', () => {
    const sorted = sortMembersByKeys(members, serverKeys)
    expect(sorted.map(member => member.name)).toEqual(['Cirno', 'Taropoi', '阿离', '④'])
  })

  it('ignores sort keys inherited from a prototype', () => {
    const inherited = Object.create({ '1': { category: 0, key: 'a' } }) as Record<string, MemberSortKey>
    const sorted = sortMembersByKeys(members, inherited)
    // Nothing is inherited: every member falls into the "other" category and
    // keeps its original order.
    expect(sorted.map(member => member.id)).toEqual([1, 2, 3, 4])
  })

  it('is stable for equal keys and last for a missing key', () => {
    const equal: Readonly<Record<string, MemberSortKey>> = {
      '1': { category: 1, key: 'm' },
      '2': { category: 1, key: 'm' },
      '3': { category: 1, key: 'm' },
    }
    expect(sortMembersByKeys(members, equal).map(member => member.id)).toEqual([1, 2, 3, 4])
    expect(compareMemberNames({ category: 0, key: 'a' }, { category: 1, key: 'a' })).toBeLessThan(0)
  })

  it('builds the archived tabs and distribution groups', () => {
    const stats = [
      { school: '桂电', count: 2 },
      { school: '桂航', count: 3 },
      { school: '未知学院', count: 1 },
      { school: '', count: 1 },
    ]
    const tabs = buildMemberFilterTabs(stats)
    expect(tabs[0]).toEqual({ label: '全部', value: '', count: 7, color: '#38bdf8' })
    expect(tabs.find(tab => tab.value === '桂航')?.count).toBe(3)
    expect(tabs.find(tab => tab.value === 'bot')?.count).toBe(0)

    const groups = buildParliamentData(stats)
    expect(groups.map(group => group.label)).toEqual(['桂航', '桂电', '未知学院'])
    expect(groups[2]?.color).toBe('#9ca3af')
    expect(buildParliamentData([])).toEqual([])
    expect(getSchoolColor('桂航')).toBe('#2B65EC')
    expect(getSchoolColor('其他')).toBe('#9ca3af')
    expect(getSchoolDarkColor('桂电')).toBe('#818cf8')
    expect(getSchoolDarkColor('联外')).toBe('#f87171')
    expect(getSchoolDarkColor('其他')).toBe('#cbd5e1')
    expect(getMemberTags([' STG ', '', '  '])).toEqual(['STG'])
  })

  it('derives initial letters and zero-padded ordinals for editorial dossier badges', () => {
    expect(memberInitialLetter(1, serverKeys)).toBe('C')
    expect(memberInitialLetter(2, serverKeys)).toBe('A')
    expect(memberInitialLetter(3, serverKeys)).toBe('#')
    expect(memberInitialLetter(99, serverKeys)).toBe('#')
    expect(formatMemberOrdinal(0)).toBe('01')
    expect(formatMemberOrdinal(8)).toBe('09')
    expect(formatMemberOrdinal(14)).toBe('15')
  })
})

describe('parliament chart geometry', () => {
  const groups = [
    { label: '桂航', value: 12, color: '#2B65EC' },
    { label: '桂电', value: 5, color: '#002060' },
  ]

  it('places exactly one seat per member, deterministically', () => {
    const first = parliamentSeats(groups)
    const second = parliamentSeats(groups)
    expect(first).toHaveLength(17)
    expect(first).toEqual(second)
    expect(parliamentTotal(groups)).toBe(17)
    expect(parliamentSeats([])).toEqual([])
  })

  it('fills seats from the outside in and keeps colours grouped', () => {
    const seats = parliamentSeats(groups)
    const radii = seats.map(seat => seat.r)
    expect(Math.min(...radii)).toBeGreaterThanOrEqual(4)
    expect(Math.max(...radii)).toBeLessThanOrEqual(16)
    // Sorted left to right, the first 12 seats are the first group.
    expect(seats.slice(0, 12).every(seat => seat.color === '#2B65EC')).toBe(true)
    expect(seats.slice(12).every(seat => seat.color === '#002060')).toBe(true)
    for (const seat of seats) {
      expect(Number.isFinite(seat.x)).toBe(true)
      expect(Number.isFinite(seat.y)).toBe(true)
    }
  })

  it('guarantees non-overlapping clearance across adjacent rings even at 139 seats', () => {
    const dense = parliamentSeats([
      { label: '桂航', value: 63, color: '#2B65EC' },
      { label: '联外', value: 33, color: '#800000' },
      { label: '桂电', value: 16, color: '#002060' },
      { label: 'bot', value: 10, color: '#424242' },
      { label: '其他', value: 17, color: '#9ca3af' },
    ])
    expect(dense).toHaveLength(139)
    for (let i = 0; i < dense.length; i += 1) {
      const a = dense[i]!
      for (let j = i + 1; j < dense.length; j += 1) {
        const b = dense[j]!
        const distance = Math.hypot(a.x - b.x, a.y - b.y)
        // Even with a 1.03x highlight scale and 1.5px stroke, circles must keep a positive gap.
        expect(distance).toBeGreaterThan((a.r + b.r) * 1.15)
      }
    }
  })
})

describe('history timeline', () => {
  it('parses the archived month keys', () => {
    expect(monthKey('2026-04-11')).toBe('2026-04')
    expect(monthKey('2026年4月11日')).toBe('2026-04')
    expect(monthKey('2025/09/01')).toBe('2025-09')
    expect(monthKey('2025.1.2')).toBe('2025-01')
    expect(monthKey('')).toBe('')
    expect(monthKey(null)).toBe('')
  })

  it('lists one rail dot per month, pointing at the first entry', () => {
    const entries = [
      { date: '2026-04-11' },
      { date: '2026-04-20' },
      { date: '2025-09-01' },
    ]
    expect(monthItems(entries)).toEqual([
      { month: '2026-04', index: 0 },
      { month: '2025-09', index: 2 },
    ])
    expect(monthRailHeight(0)).toBe(0)
    expect(monthRailHeight(1)).toBe(58)
    expect(monthRailHeight(4)).toBe(4 * 44 + 3 * 4 + 14)
    expect(historyAnchor(3)).toBe('history-3')
  })
})

describe('logs helpers', () => {
  it('renders legacy wall-clock values unchanged and ISO instants in Beijing time', () => {
    expect(formatLogTime('2026-10-01 20:00:00')).toBe('2026年10月1日 20:00')
    expect(formatLogTime('2026-10-01T20:00:00+08:00')).toBe('2026年10月1日 20:00')
    expect(formatLogTime('2026-10-01T12:00:00Z')).toBe('2026年10月1日 20:00')
    expect(formatLogTime('2026-01-02T20:00:00Z')).toBe('2026年1月3日 04:00')
    expect(formatLogTime('')).toBe('-')
    expect(formatLogTime('not a date')).toBe('-')
  })

  it('formats the Beijing date used by the members chart subtitle', () => {
    expect(beijingDateString(new Date('2026-10-01T16:30:00Z'))).toBe('2026-10-02')
    expect(formatBeijingDateTime(new Date('2026-10-01T16:30:00Z'))).toBe('2026年10月2日 00:30')
  })

  it('keeps the archived number, duration and label formatting', () => {
    expect(formatNumber(999)).toBe('999')
    expect(formatNumber(1280)).toBe('1.3K')
    expect(formatNumber(2_400_000)).toBe('2.4M')
    expect(formatDuration(45)).toBe('45s')
    expect(formatDuration(125)).toBe('2m 5s')
    expect(bounceRate({ visitors: 412, bounces: 96 })).toBe('23%')
    expect(bounceRate({ visitors: 0, bounces: 3 })).toBe('0%')
    expect(averageDuration({ visitors: 412, totaltime: 41200 })).toBe('1m 40s')
    expect(averageDuration(null)).toBe('0s')
    expect(formatAction('UPDATE_ACTIVITY')).toBe('UPDATE ACTIVITY')
    expect(actionStyleClass('DELETE_MEMBER')).toContain('text-red-600')
    expect(actionStyleClass('CREATE_MEMBER')).toContain('text-emerald-600')
    expect(actionStyleClass('WHATEVER')).toContain('text-gray-600')
    expect(pageTitle('/activities')).toBe('记忆碎片')
    expect(pageTitle('/activity/2')).toBe('活动详情')
    expect(pageTitle('')).toBe('未知页面')
    expect(formatChartDate('2026-04')).toBe('2026年4月')
    expect(formatChartDate('2026-04-11')).toBe('2026年4月11日')
    // Untrusted Umami paths must not resolve inherited object members.
    for (const hostile of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(pageTitle(hostile), hostile).toBe(hostile)
    }
    expect(topEntryPath({ x: '/a' })).toBe('/a')
    expect(topEntryPath({ url: '/b' })).toBe('/b')
    expect(topEntryPath(undefined)).toBe('')
  })

  it('derives the archived Umami windows', () => {
    const now = 1_760_000_000_000
    expect(logRangeWindow('7d', now)).toMatchObject({ startAt: now - 7 * 86_400_000, endAt: now, unit: 'day', label: '近7天' })
    expect(logRangeWindow('1y', now).unit).toBe('month')
    expect(logRangeWindow('all', now).startAt).toBe(0)
    expect(logRangeWindow('unknown', now).label).toBe('近7天')
  })

  it('builds dense 30-day and 1-year axes with UTC bucket keys', () => {
    const pageviews = [{ x: '2026-10-01', y: 180 }, { x: '2026-10-02', y: 220 }]
    const visitors = [{ x: '2026-10-01', y: 60 }, { x: '2026-10-02', y: 75 }]
    const endAt = Date.parse('2026-10-02T00:00:00Z')

    const raw = buildLogChart({ rangeKey: '7d', endAt, pageviews, visitors })
    expect(raw).toHaveLength(2)
    expect(raw[0]).toEqual({ date: '2026-10-01', pageviews: 180, visitors: 60 })

    const monthly = buildLogChart({ rangeKey: '30d', endAt, pageviews, visitors })
    expect(monthly[0]?.date).toBe('2026-10-01')
    expect(monthly.at(-1)?.date).toBe('2026-10-02')
    expect(monthly).toHaveLength(2)

    const yearly = buildLogChart({ rangeKey: '1y', endAt, pageviews, visitors })
    expect(yearly[0]?.date).toBe('2026-10')
    expect(yearly.at(-1)?.date).toBe('2026-10')

    const empty = buildLogChart({ rangeKey: '30d', endAt, pageviews: [], visitors: [] })
    expect(empty.every(point => point.pageviews === 0 && point.visitors === 0)).toBe(true)
  })

  it('produces deterministic chart paths', () => {
    const data = [
      { date: '2026-10-01', pageviews: 10, visitors: 4 },
      { date: '2026-10-02', pageviews: 30, visitors: 8 },
      { date: '2026-10-03', pageviews: 20, visitors: 6 },
    ]
    const maximum = chartMaximum(data)
    expect(maximum).toBe(30)
    const points = buildPoints(data.map(item => item.pageviews), maximum)
    expect(points).toHaveLength(3)
    expect(points[0]?.x).toBe(22)
    expect(points.at(-1)?.x).toBe(578)
    const path = buildSmoothPath(points)
    expect(path.startsWith('M 22 ')).toBe(true)
    expect(path).toBe(buildSmoothPath(buildPoints(data.map(item => item.pageviews), maximum)))
    expect(buildSmoothPath([])).toBe('')
    expect(buildSmoothPath([{ x: 1, y: 2, value: 3 }])).toBe('M 1 2')
  })

  it('uses self-hosted pinned icons and never an external origin', () => {
    expect(environmentIconUrl('Chrome', 'browser')).toBe('/icons/env/googlechrome-4285f4.svg')
    expect(environmentIconUrl('Firefox', 'browser')).toBe('/icons/env/firefox-ff7139.svg')
    expect(environmentIconUrl('Windows 11', 'os')).toBe('/icons/env/generic-desktop-64748b.svg')
    // The archived device table has no `android` keyword (`deviceIconList` in
    // `frontend/src/views/public/Logs.vue`), so a device row saying "Android"
    // takes the device fallback; `android` is an *os* keyword and keeps its
    // real mark there.
    expect(environmentIconUrl('Android', 'device')).toBe('/icons/env/generic-device-64748b.svg')
    expect(environmentIconUrl('Android', 'os')).toBe('/icons/env/android-22c55e.svg')
    // Archived CDN slugs that no longer exist resolve to the documented fallback.
    expect(environmentIconUrl('Edge', 'browser')).toBe('/icons/env/generic-browser-64748b.svg')
    expect(environmentIconUrl('Unknown', 'browser')).toBe('/icons/env/generic-browser-64748b.svg')
    expect(environmentIconUrl('Unknown', 'os')).toBe('/icons/env/gnome-64748b.svg')
    expect(environmentIconUrl('', 'device')).toBe('/icons/env/generic-device-64748b.svg')
    for (const type of ['browser', 'os', 'device']) {
      expect(environmentIconUrl('Chrome', type)).toMatch(/^\/icons\/env\/[a-z0-9.-]+\.svg$/)
    }
    // A hostile dimension falls back to the device mark instead of resolving
    // an inherited member of the icon tables.
    for (const type of ['constructor', 'toString', '__proto__']) {
      expect(environmentIconUrl('Chrome', type), type).toBe('/icons/env/generic-device-64748b.svg')
    }
  })

  it('builds dense 30-day and 1-year axes with UTC bucket keys', () => {
    const pageviews = [{ x: '2026-10-01', y: 180 }, { x: '2026-10-02', y: 220 }]
    const visitors = [{ x: '2026-10-01', y: 60 }, { x: '2026-10-02', y: 75 }]
    const endAt = Date.parse('2026-10-02T00:00:00Z')

    const raw = buildLogChart({ rangeKey: '7d', endAt, pageviews, visitors })
    expect(raw).toHaveLength(2)
    expect(raw[0]).toEqual({ date: '2026-10-01', pageviews: 180, visitors: 60 })

    const monthly = buildLogChart({ rangeKey: '30d', endAt, pageviews, visitors })
    expect(monthly[0]?.date).toBe('2026-10-01')
    expect(monthly.at(-1)?.date).toBe('2026-10-02')
    expect(monthly).toHaveLength(2)

    const yearly = buildLogChart({ rangeKey: '1y', endAt, pageviews, visitors })
    expect(yearly[0]?.date).toBe('2026-10')
    expect(yearly.at(-1)?.date).toBe('2026-10')

    const empty = buildLogChart({ rangeKey: '30d', endAt, pageviews: [], visitors: [] })
    expect(empty.every(point => point.pageviews === 0 && point.visitors === 0)).toBe(true)
  })

  it('produces deterministic chart paths', () => {
    const data = [
      { date: '2026-10-01', pageviews: 10, visitors: 4 },
      { date: '2026-10-02', pageviews: 30, visitors: 8 },
      { date: '2026-10-03', pageviews: 20, visitors: 6 },
    ]
    const maximum = chartMaximum(data)
    expect(maximum).toBe(30)
    const points = buildPoints(data.map(item => item.pageviews), maximum)
    expect(points).toHaveLength(3)
    expect(points[0]?.x).toBe(22)
    expect(points.at(-1)?.x).toBe(578)
    const path = buildSmoothPath(points)
    expect(path.startsWith('M 22 ')).toBe(true)
    expect(path).toBe(buildSmoothPath(buildPoints(data.map(item => item.pageviews), maximum)))
    expect(buildSmoothPath([])).toBe('')
    expect(buildSmoothPath([{ x: 1, y: 2, value: 3 }])).toBe('M 1 2')
  })

  it('never emits an external environment icon under the self-only image policy', () => {
    // The archived page pointed these rows at `cdn.simpleicons.org`; the
    // deployment CSP is `img-src 'self' data:`, so every icon must be a
    // same-origin `/icons/env/*.svg` path (or, if none existed, `null`) -
    // never a remote origin, and never an unresolved/empty value.
    for (const type of ['browser', 'os', 'device', 'constructor']) {
      for (const value of ['Chrome', 'Windows 11', 'Android', '', 'Unknown']) {
        expect(environmentIconUrl(value, type), `${value}/${type}`)
          .toMatch(/^\/icons\/env\/[a-z0-9.-]+\.svg$/)
      }
    }
  })
})

describe('public SEO', () => {
  it('uses the configured origin, keeps pages noindex and only real images', () => {
    const seo = buildPublicSeo({
      title: '社团活动记录',
      description: '  一场聚会，一段故事。  ',
      path: '/activities',
      query: { page: 2, utm_source: 'x' },
      image: '/uploads/img/a.png',
    }, 'https://next.guatswr.top')

    expect(seo.title).toBe('社团活动记录 | 桂航绯想天')
    expect(seo.description).toBe('一场聚会，一段故事。')
    expect(seo.canonical).toBe('https://next.guatswr.top/activities?page=2')
    expect(seo.image).toBe('https://next.guatswr.top/uploads/img/a.png')

    const remote = buildPublicSeo({ title: 'x', path: '/logs', image: 'https://cdn.example/a.png' }, 'https://next.guatswr.top')
    expect(remote.image).toBeNull()
    expect(remote.canonical).toBe('https://next.guatswr.top/logs')
  })
})
