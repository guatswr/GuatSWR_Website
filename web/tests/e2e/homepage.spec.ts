import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { configFixture, settleImages, upstreamActivitiesPage } from './support/public-parity'

async function openNavLink(page: Page, isMobile: boolean, name: string): Promise<void> {
  if (isMobile) await page.getByRole('button', { name: '打开导航菜单' }).click()
  // The same destination is legitimately rendered by the primary navigation, the
  // footer and the wordmark (whose accessible name merely *contains* "首页").
  // Scope to the primary navigation and match the name exactly, so the helper
  // selects the one link it means instead of three.
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name, exact: true })
    .click()
}

test.describe('homepage', () => {
  test('uses one lightweight ambient animation on compact or touch devices', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/')
    const lightweight = await page.evaluate(() => matchMedia('(max-width: 767px), (hover: none) and (pointer: coarse)').matches)
    for (const selector of ['.misty-lake', '.backdrop-about', '.backdrop-archive', '.backdrop-community']) {
      const backdrop = page.locator(selector)
      await backdrop.scrollIntoViewIfNeeded()
      await expect(backdrop).toHaveAttribute('data-scene-active', 'true')
      if (lightweight) {
        await expect.poll(() => backdrop.evaluate(el => el.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length)).toBe(1)
        const properties = await backdrop.evaluate(el => [...new Set(el.getAnimations({ subtree: true })
          .flatMap(animation => animation.effect instanceof KeyframeEffect ? animation.effect.getKeyframes() : [])
          .flatMap(frame => Object.keys(frame).filter(key => !['offset', 'computedOffset', 'easing', 'composite'].includes(key))))])
        expect(properties).toEqual(['transform'])
        await expect(backdrop.locator('svg')).toHaveCSS('display', 'none')
      }
      else {
        expect(await backdrop.evaluate(el => el.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length)).toBeGreaterThan(1)
        await expect(backdrop.locator('svg')).not.toHaveCSS('display', 'none')
      }
    }
  })

  test('warms ambient backgrounds before entry and pauses them when inactive', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/')
    const backdrop = page.locator('.backdrop-about')
    await expect(backdrop).toHaveAttribute('data-scene-active', 'false')
    await page.evaluate(() => {
      const about = document.querySelector('.home-about')!
      window.scrollTo({ top: about.getBoundingClientRect().top + window.scrollY - window.innerHeight - 80, behavior: 'instant' })
    })
    await expect(backdrop).toHaveAttribute('data-scene-active', 'true')
    expect(await backdrop.evaluate(el => el.getBoundingClientRect().top)).toBeGreaterThan(await page.evaluate(() => window.innerHeight))
    await page.locator('.home-about').scrollIntoViewIfNeeded()
    const before = await backdrop.evaluate(el => ({
      transform: getComputedStyle(el.querySelector('.backdrop-wash')!, '::before').transform,
      top: el.parentElement!.getBoundingClientRect().top + window.scrollY,
    }))
    const after = await backdrop.evaluate(async el => {
      for (let frame = 0; frame < 12; frame++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      return {
        transform: getComputedStyle(el.querySelector('.backdrop-wash')!, '::before').transform,
        top: el.parentElement!.getBoundingClientRect().top + window.scrollY,
      }
    })
    expect(after.transform).not.toBe(before.transform)
    expect(Math.abs(after.top - before.top)).toBeLessThan(1)
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await expect(backdrop).toHaveAttribute('data-scene-active', 'false')
    expect(await backdrop.evaluate(el => el.getAnimations({ subtree: true }).every(animation => animation.playState === 'paused'))).toBe(true)
    await page.locator('.home-about').scrollIntoViewIfNeeded()
    await expect(backdrop).toHaveAttribute('data-scene-active', 'true')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(backdrop).toHaveAttribute('data-scene-active', 'false')
    await expect.poll(() => backdrop.evaluate(el => el.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length)).toBe(0)
  })

  test('does not recenter the mobile hero when the gesture area changes', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Safe-area overrides require Chromium CDP')
    await page.setViewportSize({ width: 390, height: 720 })
    const session = await page.context().newCDPSession(page)
    await session.send('Emulation.setSafeAreaInsetsOverride', { insets: { bottom: 0, bottomMax: 32 } })
    await page.goto('/')
    await expect(page.locator('.club-banner-background')).toHaveAttribute('data-image-state', 'ready')
    await page.evaluate(() => window.scrollTo({ top: 120, behavior: 'instant' }))
    const positions = []
    for (const bottom of [0, 32, 0, 32, 0]) {
      await session.send('Emulation.setSafeAreaInsetsOverride', { insets: { bottom, bottomMax: 32 } })
      positions.push(await page.evaluate(async () => {
        await document.fonts.ready
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        const hero = document.querySelector('.club-banner')!
        const intro = document.querySelector('.club-banner-intro')!
        const image = document.querySelector('.club-banner-background img.pi-full')!
        return {
          height: hero.getBoundingClientRect().height,
          intro: intro.getBoundingClientRect().top + window.scrollY,
          scroll: window.scrollY,
          imageGap: hero.getBoundingClientRect().bottom - image.getBoundingClientRect().bottom,
        }
      }))
    }
    for (const key of ['height', 'intro', 'scroll'] as const) {
      const values = positions.map(position => position[key])
      expect(Math.max(...values) - Math.min(...values)).toBeLessThan(1)
    }
    expect(positions.every(position => position.imageGap < 1)).toBe(true)
  })

  test('opts into edge-to-edge and keeps the browser surface dark in day mode', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('theme-preference', 'light'))
    await page.goto('/')
    await expect(page.locator('.club-banner-background')).toHaveAttribute('data-image-state', 'ready')
    await expect(page.locator('meta[name="viewport"]')).toHaveCount(1)
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/)
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1)
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0f172a')
    await expect(page.locator('html')).toHaveAttribute('data-page-surface', 'hero')
    await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(15, 23, 42)')
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(15, 23, 42)')
  })

  test('is readable and shows a real hero image with JavaScript disabled', async ({
    browser,
    request
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()
    const config = configFixture()
    // The same raw v1 page the archive renders and the new BFF projects.
    const activities = await upstreamActivitiesPage(request)
    await page.goto('/')

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('桂航绯想天')
    await expect(page.getByText(String(config.banner_text))).toBeVisible()
    // Deferred client hydration must never defer the public body or navigation HTML.
    await expect(page.getByRole('heading', { name: '总有一种热爱，与你同频' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /因东方相识，.*让同好成为朋友/ })).toBeVisible()
    await expect(page.getByRole('contentinfo').getByRole('link', { name: '群史', exact: true })).toHaveAttribute('href', '/history')
    await expect(page.getByRole('contentinfo').getByRole('link', { name: '管理入口', exact: true })).toHaveAttribute('href', '/login')
    expect(activities.items.length).toBeGreaterThan(0)
    for (const activity of activities.items) {
      await expect(
        page.getByRole('heading', { level: 3, name: activity.title })
      ).toBeVisible()
    }

    const hero = page.locator('.club-banner-background img')
    await expect(hero).toHaveAttribute('src', String(config.home_bg))
    await expect(hero).toHaveAttribute('loading', 'eager')
    await expect(hero).toHaveAttribute('fetchpriority', 'high')
    await expect(hero).toHaveAttribute('decoding', 'async')
    // Not merely present: painted, opaque and readable by assistive technology.
    expect(await hero.evaluate((element) => getComputedStyle(element).opacity)).toBe('1')
    expect(await hero.getAttribute('aria-hidden')).toBeNull()
    expect(await hero.getAttribute('alt')).toBeTruthy()
    await expect
      .poll(() => hero.evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0)
    // No managed placeholder exists without a working client loader.
    await expect(page.locator('.pi-placeholder')).toHaveCount(0)
    await expect(page.locator('.club-banner-background')).toHaveAttribute(
      'data-image-managed',
      'false'
    )

    // Lazy sources stay in the HTML, readable by crawlers, but defer to native lazy loading.
    const lazy = page.locator('section[aria-labelledby="archive-title"] img.pi-full').first()
    await expect(lazy).toHaveAttribute('loading', 'lazy')
    expect(await lazy.getAttribute('src')).toBeTruthy()

    await context.close()
  })

  test('keeps the eager hero visible with scripts blocked and stylesheets intact', async ({
    page
  }) => {
    const blocked: string[] = []
    const abortedStylesheets: string[] = []
    await page.route('**/_nuxt/**', (route) => {
      const url = route.request().url()
      if (url.endsWith('.js')) {
        blocked.push(url)
        return route.abort()
      }
      return route.continue()
    })
    page.on('requestfailed', (request) => {
      if (request.url().endsWith('.css')) abortedStylesheets.push(request.url())
    })

    await page.goto('/')
    // Only the hydration scripts were blocked, never the stylesheet.
    expect(blocked.length).toBeGreaterThan(0)
    expect(blocked.every((url) => url.endsWith('.js'))).toBe(true)
    expect(abortedStylesheets).toEqual([])
    expect(await page.evaluate(() => document.styleSheets.length)).toBeGreaterThan(0)
    // A utility rule from the shared stylesheet still applies, so the image is
    // not simply visible because styling went missing.
    expect(
      await page
        .locator('.club-banner-background')
        .evaluate((element) => getComputedStyle(element).position)
    ).toBe('absolute')

    const hero = page.locator('.club-banner-background img')
    expect(await hero.evaluate((element) => getComputedStyle(element).opacity)).toBe('1')
    expect(await hero.getAttribute('aria-hidden')).toBeNull()
    await expect
      .poll(() => hero.evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0)
    await expect(page.locator('.pi-placeholder')).toHaveCount(0)
    await expect(page.locator('.club-banner-background')).toHaveAttribute(
      'data-image-managed',
      'false'
    )
  })

  test('never hides an already painted hero when hydration is delayed', async ({ page }) => {
    await page.route('**/_nuxt/**', async (route) => {
      if (!route.request().url().endsWith('.js')) return route.continue()
      await new Promise((resolve) => setTimeout(resolve, 2500))
      return route.continue()
    })
    await page.goto('/')
    const wrapper = page.locator('.club-banner-background')
    const hero = wrapper.locator('img')
    await expect
      .poll(() => hero.evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0)
    // Give the delayed hydration a chance to run, then require it left the image alone.
    await page.waitForTimeout(3500)
    await expect(wrapper).toHaveAttribute('data-image-managed', 'false')
    await expect(wrapper).toHaveAttribute('data-image-state', /ready|idle/)
    expect(await hero.evaluate((element) => getComputedStyle(element).opacity)).toBe('1')
  })

  test('fetches the hero image exactly once and keeps its source stable', async ({
    page,
    isMobile
  }) => {
    const heroPath = String(configFixture().home_bg)
    const heroRequests: string[] = []
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === heroPath) heroRequests.push(request.url())
    })

    await page.goto('/')
    await expect.poll(() => heroRequests.length).toBeGreaterThan(0)
    await settleImages(page)
    // One request: the loader adopts the rendered element instead of probing again.
    expect(heroRequests).toHaveLength(1)

    await openNavLink(page, isMobile, '社群链接')
    await expect(page.getByRole('heading', { level: 1, name: '绯想天 · 外界通讯', exact: true })).toBeVisible()
    await openNavLink(page, isMobile, '首页')
    const hero = page.locator('.club-banner-background img')
    await expect(hero).toHaveAttribute('src', heroPath)
    await expect
      .poll(() => hero.evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0)
    expect(await hero.getAttribute('src')).toBe(heroPath)
  })

  test('hydrates without errors and never refetches the shared data', async ({ page }) => {
    const errors: string[] = []
    const requests: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('request', (request) => {
      const url = request.url()
      if (url.includes('/api/')) requests.push(new URL(url).pathname)
    })

    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('桂航绯想天')
    await settleImages(page)
    // The server rendered both requests; hydration must not issue a second one.
    expect(requests.filter((path) => path === '/api/config')).toHaveLength(0)
    expect(requests.filter((path) => path === '/api/activities')).toHaveLength(0)

    // Zero managed images is valid: a hero painted from the server HTML stays
    // unmanaged. Every managed image settles, and every rendered image is visible.
    const managed = page.locator('.progressive-image[data-image-managed="true"]')
    for (let index = 0; index < (await managed.count()); index++) {
      await expect(managed.nth(index)).toHaveAttribute(
        'data-image-state',
        /ready|empty|error/
      )
    }
    const images = page.locator('img.pi-full')
    expect(await images.count()).toBeGreaterThan(0)
    for (let index = 0; index < (await images.count()); index++) {
      const image = images.nth(index)
      expect(await image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0)
      expect(await image.evaluate((element) => getComputedStyle(element).opacity)).not.toBe('0')
    }
    expect(errors).toEqual([])
  })

  test('falls back to the original when the archived thumbnail is missing', async ({ page }) => {
    // Archived covers live in nested upload directories, so the thumbnail glob
    // needs `**` for the directories: a single `*` cannot cross a `/` and the
    // pattern silently matched nothing, leaving the thumbnail present.
    await page.route('**/uploads/**/*-thumb.webp', (route) =>
      route.fulfill({ status: 404, body: 'missing' })
    )
    await page.goto('/')
    const card = page
      .locator('section[aria-labelledby="archive-title"] .progressive-image')
      .first()
    await expect(card).toHaveAttribute('data-image-state', 'ready', { timeout: 25_000 })
    const source = await card.locator('img.pi-full').getAttribute('src')
    expect(source).toBeTruthy()
    expect(source).not.toContain('-thumb.webp')
  })

  test('reports a permanently broken image and stops after bounded retries', async ({ page }) => {
    const failed: string[] = []
    const heroPath = String(configFixture().home_bg)
    await page.route('**/uploads/**', (route) => {
      failed.push(new URL(route.request().url()).pathname)
      return route.fulfill({ status: 404, body: 'missing' })
    })
    await page.goto('/')
    const wrapper = page.locator('.club-banner-background')
    await expect(wrapper).toHaveAttribute('data-image-state', 'error', { timeout: 30_000 })
    await expect(page.locator('.pi-message').first()).toHaveText('图片暂未加载')
    // One initial attempt plus at most three bounded retries.
    expect(failed.filter((path) => path === heroPath).length).toBeLessThanOrEqual(4)
    // The failed element is not left covering the placeholder.
    expect(
      await wrapper.locator('img.pi-full').evaluate((element) => getComputedStyle(element).opacity)
    ).toBe('0')
  })

  test('nine clicks freeze the page and native scrolling thaws it', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/')
    const toy = page.getByRole('button', { name: '点击群头像，让小⑨喊 BAKA' })
    for (let click = 0; click < 9; click++) await toy.click()

    const freeze = page.getByTestId('cirno-freeze')
    await expect(freeze).toBeVisible()
    await expect(freeze).toHaveAttribute('data-phase', 'frozen')
    // The frozen layer makes the mounted application inert.
    await expect(page.locator('#__nuxt')).toHaveAttribute('inert', '')

    await page.evaluate(() => window.scrollTo(0, 600))
    await expect(freeze).toHaveCount(0, { timeout: 15_000 })
    await expect(page.locator('#__nuxt')).not.toHaveAttribute('inert', '')

    // A second freeze (nine more clicks) can be dismissed with Escape.
    for (let click = 0; click < 9; click++) await toy.click()
    await expect(freeze).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(freeze).toHaveCount(0, { timeout: 15_000 })
    expect(errors).toEqual([])
  })

  test('reduced motion keeps the freeze static and dismisses it quickly', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    const toy = page.getByRole('button', { name: '点击群头像，让小⑨喊 BAKA' })
    for (let click = 0; click < 9; click++) await toy.click()
    const freeze = page.getByTestId('cirno-freeze')
    await expect(freeze).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(freeze).toHaveCount(0, { timeout: 4_000 })
  })

  test('keeps the archived archive retry state and recovers', async ({ page, isMobile }) => {
    await page.goto('/social')
    await page.route('**/api/activities*', (route) =>
      route.fulfill({ status: 502, json: { message: 'unavailable' } })
    )
    await openNavLink(page, isMobile, '首页')
    await expect(page.getByText('回忆暂时没有加载出来。')).toBeVisible()
    await page.unroute('**/api/activities*')
    await page.getByRole('button', { name: '重新加载' }).click()
    await expect(
      page.locator('section[aria-labelledby="archive-title"] a[href^="/activity/"]').first()
    ).toBeVisible()
  })

  test('publishes a share image that actually resolves to an image', async ({ request }) => {
    const html = await (await request.get('/')).text()
    const ogImage = html.match(/property="og:image" content="([^"]+)"/)?.[1]
    const twitterImage = html.match(/name="twitter:image" content="([^"]+)"/)?.[1]
    expect(ogImage).toBeTruthy()
    expect(twitterImage).toBe(ogImage)
    const url = new URL(String(ogImage))
    expect(url.origin).toBe('https://next.guatswr.top')
    // Fetch the published path from the preview server that produced the tag.
    const image = await request.get(url.pathname)
    expect(image.status()).toBe(200)
    expect(image.headers()['content-type']).toMatch(/^image\//)
    // The archived default cover is still shipped for pages without a cover.
    const fallback = await request.get('/og-image.png')
    expect(fallback.status()).toBe(200)
    expect(fallback.headers()['content-type']).toContain('image/png')
  })
})
