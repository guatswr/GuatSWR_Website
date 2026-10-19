import { expect, test } from '@playwright/test'
import type { BrowserContext, Locator, Page } from '@playwright/test'
import {
  ARCHIVE_ORIGIN,
  CLUB_TIMEZONE,
  compareToArchive,
  proxyArchiveRequests,
  routeArchiveIcons,
  trackExternalRequests,
} from './support/public-pages'

/** Both pages must render from the isolated deterministic upstream. */
const FIXTURE_MEMBER_SCHOOL = '桂航'
const FIXTURE_MEMBER_OTHER = 'Taropoi'
const OTHER_SCHOOL = '桂电'

/**
 * The site footer renders "Designed by Taropoi", so an unscoped
 * `getByText('Taropoi')` matches both the member card and the footer credit
 * (a strict-mode violation). Member assertions are scoped to the page body.
 */
const memberBody = (page: Page): Locator => page.locator('main')

/** The same scoping for a raw SSR response: everything inside `<main>`. */
const mainOf = (html: string): string => {
  const start = html.indexOf('<main')
  const end = html.indexOf('</main>')
  return start === -1 || end === -1 ? html : html.slice(start, end)
}

test.describe('server-rendered public lists', () => {
  test('activities render without JavaScript and paginate with ordinary links', async ({ browser, baseURL }) => {
    // A raw context does not inherit the project's `use` options: pass the
    // base URL (and keep the scenario's viewport/device flags) explicitly.
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL })
    const page = await context.newPage()
    const response = await page.goto('/activities')
    expect(response?.status()).toBe(200)

    await expect(page.getByRole('heading', { level: 1, name: '社团活动记录' })).toBeVisible()
    const cards = page.locator('a[href^="/activity/"]')
    expect(await cards.count()).toBeGreaterThan(0)
    // Real dates, not client-computed values.
    await expect(page.locator('time').first()).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}$/)

    // One page of fixture data: the current page is a link, the unavailable
    // controls are non-focusable and marked, and page 1 is not in the URL.
    const current = page.locator('nav[aria-label="活动记录分页"] a[aria-current="page"]')
    await expect(current).toHaveText('1')
    await expect(page.locator('nav[aria-label="活动记录分页"] [aria-disabled="true"]')).toHaveCount(2)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/activities$/)
    await context.close()
  })

  test('invalid and out-of-range pages answer with real status codes', async ({ page }) => {
    expect((await page.goto('/activities?page=abc'))?.status()).toBe(400)
    expect((await page.goto('/activities?page=99'))?.status()).toBe(404)
  })

  test('members school filtering is encoded in the URL and isolated', async ({ page }) => {
    const filtered = await page.goto(`/members?school=${encodeURIComponent(FIXTURE_MEMBER_SCHOOL)}`)
    expect(filtered?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: '绯想天住民名录' })).toBeVisible()
    await expect(memberBody(page).getByText('Cirno')).toBeVisible()
    await expect(memberBody(page).getByText(FIXTURE_MEMBER_OTHER)).toHaveCount(0)
    await expect(page.locator(`a[href*="school="][aria-current="page"]`)).toHaveCount(1)

    // An explicit empty school behaves like the frozen backend: no filter.
    await page.goto('/members?school=')
    await expect(memberBody(page).getByText(FIXTURE_MEMBER_OTHER)).toBeVisible()

    await page.goto(`/members?school=${encodeURIComponent('不存在学院')}`)
    await expect(page.getByText('该区域暂未发现住民出没...')).toBeVisible()

    // The distribution chart is server-rendered, deterministic and described.
    // It must be asserted on a page that actually has members: both this page
    // and the archived one hide the chart when the filter matches nobody
    // (`v-if="parliamentData.length > 0"` in `frontend/src/views/public/Members.vue`).
    await page.goto('/members')
    const chart = page.locator('svg[role="img"]').first()
    await expect(chart).toHaveAttribute('aria-label', /共 \d+ 人/)
    await expect(chart.locator('circle').first()).toBeVisible()
  })

  test('history anchors and the month rail work before JavaScript', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL })
    const page = await context.newPage()
    const response = await page.goto('/history')
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: '绯想天群史' })).toBeVisible()
    const rail = page.locator('a[href="#history-1"]')
    await expect(rail).toHaveCount(1)
    await expect(page.locator('#history-1')).toHaveCount(1)
    // Backend HTML is sanitized on the server, not injected raw.
    await expect(page.locator('#history-0 .history-description p').first()).toBeVisible()
    expect(await page.locator('#history-0').innerHTML()).not.toContain('&lt;p&gt;')
    await context.close()
  })

  test('logs render server-side, redact internal ids and stay offline', async ({ page }) => {
    const external = trackExternalRequests(page)
    const errors: string[] = []
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    const response = await page.goto('/logs')
    expect(response?.status()).toBe(200)

    await expect(page.getByRole('heading', { level: 1, name: '日志档案' })).toBeVisible()
    await expect(page.locator('table tbody tr').first()).toBeVisible()
    // The archived row printed the internal user id; the public projection drops it.
    await expect(page.getByText('UID: Unknown').first()).toBeVisible()
    await expect(page.getByText('贡献榜')).toBeVisible()

    // Environment marks are self-hosted pinned SVGs; nothing is fetched from
    // the archived CDN origin.
    await expect(page.locator('img[src^="/icons/env/"]').first()).toBeVisible()

    // Statistics panels show measured values or an explicit unavailable state,
    // never invented zeroes.
    const summary = page.locator('section', { hasText: '站点统计' })
    const pageviews = summary.getByText('Pageviews')
    if (await pageviews.isVisible()) {
      await expect(summary.getByText('页面浏览')).toBeVisible()
    }
    else {
      await expect(summary.getByText('统计数据暂不可用')).toBeVisible()
    }

    expect(external).toEqual([])
    expect(errors.filter(message => /Content Security Policy|Refused to/i.test(message))).toEqual([])
  })
})

test.describe('activity detail', () => {
  test('renders metadata and sanitized body in the SSR response', async ({ page }) => {
    const response = await page.goto('/activity/1')
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/activity\/1$/)

    const body = page.locator('.safe-markdown')
    await expect(body).toBeVisible()
    await expect(body.locator('h2')).toHaveAttribute('id', /^md-/)
    expect(await body.innerHTML()).not.toContain('<script')
    expect(await body.locator('[onclick], [onerror], iframe, form').count()).toBe(0)

    // The single content request must not resend the raw Markdown.
    const payload = await page.evaluate(() => JSON.stringify((window as { __NUXT__?: unknown }).__NUXT__ ?? {}))
    expect(payload).not.toContain('__ignoreMap')
    expect(payload).not.toContain('## ')

    // Deterministic heading ids and rewritten in-article fragments.
    const headingIds = await body.locator('h1, h2, h3, h4, h5, h6').evaluateAll(nodes => nodes.map(node => node.id))
    for (const id of headingIds) expect(id.startsWith('md-')).toBe(true)
  })

  test('missing and non-public records answer 404', async ({ page }) => {
    expect((await page.goto('/activity/999999'))?.status()).toBe(404)
    expect((await page.goto('/activity/not-a-number'))?.status()).toBe(404)
  })

  test('an upstream failure answers 502 and leaks nothing', async ({ page }) => {
    // Reserved fixture id: the isolated upstream answers 503 with a private
    // error decoy for `/api/activities/998`.
    const response = await page.goto('/activity/998')
    expect(response?.status()).toBe(502)
    const text = await page.locator('body').innerText()
    expect(text).not.toContain('decoy')
    expect(text).not.toContain('503')
    expect(text).not.toMatch(/SQL|sqlite|stack/i)
  })

  test('gallery lightbox is a native modal dialog with focus return and inert background', async ({ page }) => {
    await page.goto('/activity/1')
    const galleryTrigger = page.locator('a[aria-label^="查看大图"]').first()
    await expect(galleryTrigger).toBeVisible()
    await expect(galleryTrigger).toHaveAttribute('href', /^\/uploads\//)

    await galleryTrigger.focus()
    await galleryTrigger.click()
    const dialog = page.getByRole('dialog', { name: '图片预览' })
    await expect(dialog).toBeVisible()
    // Top-layer modality, not a hand-rolled overlay.
    expect(await page.evaluate(() => Boolean(document.querySelector('dialog.public-lightbox')?.matches(':modal')))).toBe(true)
    // The rest of the document is inert: programmatic focus cannot leave the modal.
    const backgroundInert = await page.evaluate(() => {
      const link = document.querySelector<HTMLElement>('nav a')
      link?.focus()
      return document.activeElement === link
    })
    expect(backgroundInert).toBe(false)

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(galleryTrigger).toBeFocused()
  })
})

test.describe('markdown rendering contract', () => {
  test('nested prose typography is applied and no client parser is shipped', async ({ page }) => {
    const scripts: string[] = []
    page.on('request', (request) => {
      if (request.resourceType() === 'script') scripts.push(request.url())
    })
    await page.goto('/activity/1')
    await expect(page.locator('.safe-markdown h2').first()).toBeVisible()

    const typography = await page.evaluate(() => {
      const wrapper = document.querySelector('.safe-markdown')
      const heading = wrapper?.querySelector('h2')
      const paragraph = wrapper?.querySelector('p')
      const style = (node: Element | null | undefined) => (node ? getComputedStyle(node) : null)
      return {
        base: style(wrapper)?.fontSize ?? '',
        heading: style(heading)?.fontSize ?? '',
        headingMargin: style(heading)?.marginTop ?? '',
        paragraphMargin: style(paragraph)?.marginBottom ?? '',
      }
    })
    // 1.05rem base on desktop, 1rem under the mobile breakpoint; the nested
    // rules must track it (this is what a missing `:deep()` would break).
    const base = typography.base === '16px' ? 16 : 16.8
    // The browser reports the computed length, so the expectation is rounded:
    // `16.8 * 1.5` is 25.200000000000003 in binary floating point but "25.2px"
    // in the DOM.
    const px = (value: number): string => `${Math.round(value * 1000) / 1000}px`
    expect(typography.base).toBe(`${base}px`)
    expect(typography.heading).toBe(px(base * 1.5))
    expect(typography.headingMargin).toBe(px(base * 1.5 * 1.5))
    expect(typography.paragraphMargin).toBe(px(base * 1.2))

    for (const url of scripts) {
      expect(url).not.toMatch(/mdc|md-editor|shiki|remark|rehype|unified|element-plus/i)
    }
  })
})


test.describe('filter and page reactivity', () => {
  test('member school navigation updates the body and the canonical URL', async ({ page }) => {
    await page.goto('/members')
    const canonical = page.locator('link[rel="canonical"]')
    const ogUrl = page.locator('meta[property="og:url"]')
    await expect(canonical).toHaveAttribute('href', /\/members$/)
    await expect(memberBody(page).getByText(FIXTURE_MEMBER_OTHER)).toBeVisible()

    // filtered -> all -> other, all as client-side navigations.
    await page.locator('a[href*="school="]').filter({ hasText: FIXTURE_MEMBER_SCHOOL }).first().click()
    await expect(page).toHaveURL(new RegExp(`school=${encodeURIComponent(FIXTURE_MEMBER_SCHOOL)}`))
    await expect(memberBody(page).getByText('Cirno')).toBeVisible()
    await expect(memberBody(page).getByText(FIXTURE_MEMBER_OTHER)).toHaveCount(0)
    await expect(canonical).toHaveAttribute('href', /\/members\?school=/)
    await expect(ogUrl).toHaveAttribute('content', /\/members\?school=/)

    await page.locator('a[href="/members"]').first().click()
    await expect(canonical).toHaveAttribute('href', /\/members$/)
    await expect(memberBody(page).getByText(FIXTURE_MEMBER_OTHER)).toBeVisible()

    await page.locator('a[href*="school="]').filter({ hasText: OTHER_SCHOOL }).first().click()
    await expect(page).toHaveURL(new RegExp(`school=${encodeURIComponent(OTHER_SCHOOL)}`))
    await expect(memberBody(page).getByText(FIXTURE_MEMBER_OTHER)).toBeVisible()
    await expect(memberBody(page).getByText('Cirno')).toHaveCount(0)
    await expect(canonical).toHaveAttribute('href', new RegExp(`school=${encodeURIComponent(OTHER_SCHOOL)}`))
  })

  test('page and range navigation update the body and the canonical URL', async ({ page }) => {
    const canonical = page.locator('link[rel="canonical"]')
    await page.goto('/logs')
    await expect(canonical).toHaveAttribute('href', /\/logs\?/)
    const firstRange = await page.locator('link[rel="canonical"]').getAttribute('href')

    // Client-side query navigation must refresh both the body and the metadata.
    await page.locator('a[href*="range=30d"]').first().click()
    await expect(page).toHaveURL(/range=30d/)
    await expect(canonical).toHaveAttribute('href', /range=30d/)
    expect(await canonical.getAttribute('href')).not.toBe(firstRange)

    // Page 2 is server-rendered with its own canonical and its own body state.
    await page.goto('/logs?page=2')
    await expect(canonical).toHaveAttribute('href', /page=2/)
    await expect(page.getByText('没有找到相关记录')).toBeVisible()
    await expect(page.locator('table')).toHaveCount(0)
  })

  test('SSR query isolation: filters are reflected in markup and canonical', async ({ request }) => {
    const filtered = await (await request.get(`/members?school=${encodeURIComponent(FIXTURE_MEMBER_SCHOOL)}`)).text()
    expect(filtered).toContain('Cirno')
    // The layout footer credits "Designed by Taropoi", so the member check runs
    // against the page body rather than the whole document.
    expect(mainOf(filtered)).not.toContain(FIXTURE_MEMBER_OTHER)
    expect(filtered).toContain(`school=${encodeURIComponent(FIXTURE_MEMBER_SCHOOL)}`)

    const all = await (await request.get('/members')).text()
    expect(mainOf(all)).toContain(FIXTURE_MEMBER_OTHER)
    expect(all).toContain('rel="canonical" href="https://next.guatswr.top/members"')

    const ranged = await (await request.get('/logs?range=30d')).text()
    expect(ranged).toContain('range=30d')

    const firstPage = await (await request.get('/activities')).text()
    expect(firstPage).toContain('rel="canonical" href="https://next.guatswr.top/activities"')
  })
})

test.describe('code block copy', () => {
  test('reports the real outcome for a denied clipboard and for a working one', async ({ page }) => {
    await page.goto('/activity/1')
    const block = page.locator('.md-code').first()
    if (await block.count() === 0) {
      // The deterministic fixture activity has no fenced block yet (requested
      // from worker D); the unit suite covers the same outcomes directly.
      test.skip(true, 'fixture activity content has no fenced code block')
    }
    const button = block.getByRole('button', { name: /复制/ })
    const status = block.getByRole('status')

    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error('denied')) },
      })
      document.execCommand = () => false
    })
    await button.click()
    await expect(status).toHaveText('复制失败，请手动选择代码')
    await expect(button).toHaveText('复制失败')

    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.resolve() },
      })
    })
    await button.click()
    await expect(status).toHaveText('代码已复制到剪贴板')
    await expect(button).toHaveText('已复制')
  })
})

interface ParityRegion {
  readonly name: string
  readonly archive: string
  readonly current: string
  /** Elements the archived page hides below `lg` (e.g. the month rail). */
  readonly desktopOnly?: boolean
}

interface ParityTarget {
  readonly path: string
  readonly wait: string
  readonly regions: readonly ParityRegion[]
}

/**
 * Every migrated public page, with the regions compared against the archived
 * SPA. Both sides read the same deterministic fixture upstream, the same theme
 * preference and the same reduced-motion setting; each region is cropped to its
 * whole covered device pixels and must match with zero differing pixels.
 */
const PARITY_TARGETS: readonly ParityTarget[] = Object.freeze([
  {
    path: '/activities',
    wait: '社团活动记录',
    regions: [{ name: 'grid', archive: 'main .grid', current: 'main .grid' }],
  },
  {
    path: '/activity/1',
    wait: '活动剪影',
    regions: [
      { name: 'article', archive: 'main div.relative.z-10', current: 'main div.relative.z-10' },
      { name: 'prose', archive: 'main .md-editor-preview', current: 'main .safe-markdown' },
    ],
  },
  {
    path: '/history',
    wait: '绯想天群史',
    regions: [
      { name: 'timeline', archive: 'main .space-y-12', current: 'main .space-y-12' },
      { name: 'month-rail', archive: 'main .fixed.right-6', current: 'main .fixed.right-6', desktopOnly: true },
    ],
  },
  {
    path: '/members',
    wait: '绯想天住民名录',
    regions: [
      { name: 'chart', archive: 'main .parliament-chart-container', current: 'main .parliament-chart-container' },
      { name: 'grid', archive: 'main .grid.grid-cols-1', current: 'main .grid.grid-cols-1' },
    ],
  },
  {
    path: '/logs',
    wait: '日志档案',
    regions: [
      { name: 'statistics', archive: 'main section', current: 'main section' },
      { name: 'table', archive: 'main table', current: 'main table' },
    ],
  },
])

test.describe('visual parity with the archived site', () => {
  // The archived members chart subtitle is the browser's local date, so both
  // sides are pinned to the club's own zone.
  test.use({ timezoneId: CLUB_TIMEZONE })

  const themes = ['light', 'dark'] as const

  const openArchive = async (context: BrowserContext, theme: string): Promise<Page> => {
    await context.addInitScript(mode => localStorage.setItem('theme-preference', mode), theme)
    const archive = await context.newPage()
    await proxyArchiveRequests(archive)
    await routeArchiveIcons(archive)
    await archive.emulateMedia({ reducedMotion: 'reduce' })
    return archive
  }

  for (const theme of themes) {
    for (const target of PARITY_TARGETS) {
      test(`${target.path} matches the archive (${theme})`, async ({ context, page, isMobile }, info) => {
        const archive = await openArchive(context, theme)
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await archive.goto(`${ARCHIVE_ORIGIN}${target.path}`)
        await page.goto(target.path)
        await expect(archive.getByText(target.wait).first()).toBeVisible({ timeout: 20_000 })
        await expect(page.getByText(target.wait).first()).toBeVisible()

        for (const region of target.regions) {
          if (region.desktopOnly && isMobile) continue
          await compareToArchive(
            archive.locator(region.archive).first(),
            page.locator(region.current).first(),
            `${target.path.replace(/\W+/g, '-').replace(/^-|-$/g, '')}-${region.name}-${theme}`,
            info,
          )
        }

        // Numeric geometry, independent of pixels: the seat layout is a pure
        // function of the same fixture counts.
        if (target.path === '/members') {
          expect(await page.locator('svg circle').count())
            .toBe(await archive.locator('svg circle').count())
        }
        await archive.close()
      })
    }
  }
})
