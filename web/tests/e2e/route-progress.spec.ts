import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

type ProgressFrame = { at: number, opacity: number, scale: number, visiblePageEntry: boolean }
declare global {
  interface Window {
    routeProgressFrames: ProgressFrame[]
    stopRouteProgressFrames: boolean
    routeProgressRoot: Element | null
  }
}
const failures = new WeakMap<Page, string[]>()
test.beforeEach(async ({ context, page }) => {
  await context.addInitScript(() => localStorage.setItem('theme-preference', 'light'))
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const errors: string[] = []
  failures.set(page, errors)
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (/Content Security Policy|hydration/i.test(message.text())) errors.push(message.text())
  })
})
test.afterEach(async ({ page }, info) => {
  const frames = await page.evaluate(() => { window.stopRouteProgressFrames = true; return window.routeProgressFrames ?? [] })
  await info.attach('progress-frames', { body: JSON.stringify(frames, null, 2), contentType: 'application/json' })
  expect(failures.get(page)).toEqual([])
})

const bar = (page: Page) => page.getByTestId('route-progress')
const scale = (page: Page) => bar(page).evaluate(node => new DOMMatrixReadOnly(getComputedStyle(node).transform).a)

async function ready(page: Page, path = '/social') {
  await page.goto(path)
  const toggle = page.getByRole('button', { name: /切换为.*模式/ }).first()
  await toggle.click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await toggle.click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await expect(bar(page)).toHaveCSS('opacity', '0')
}

async function nav(page: Page, path: string, isMobile: boolean) {
  if (isMobile) await page.getByRole('button', { name: '打开导航菜单' }).click()
  await page.getByRole('navigation', { name: '主导航' }).locator(`a[href="${path}"]`).filter({ visible: true }).click()
}

async function observe(page: Page) {
  await page.evaluate(() => {
    window.routeProgressFrames = []
    window.stopRouteProgressFrames = false
    window.routeProgressRoot = document.querySelector('main > .club-page-stack > :first-child')
    const sample = () => {
      const node = document.querySelector('[data-testid="route-progress"]')!
      const style = getComputedStyle(node)
      window.routeProgressFrames.push({
        at: performance.now(), opacity: Number(style.opacity), scale: new DOMMatrixReadOnly(style.transform).a,
        visiblePageEntry: Array.from(document.querySelectorAll('.club-page-enter-active')).some(node => Number(getComputedStyle(node).opacity) > 0.2),
      })
      if (!window.stopRouteProgressFrames) requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
}

function deferred() {
  let release!: () => void
  const promise = new Promise<void>(resolve => { release = resolve })
  return { promise, release }
}

test('cached fast navigation shows one bar throughout the visible page transition', async ({ page }) => {
  await ready(page)
  const join = () => page.getByRole('link', { name: /加入同好群/ }).click()
  await join()
  await expect(page.locator('#join-title')).toBeVisible()
  await expect(bar(page)).toHaveCSS('opacity', '0')
  await page.goBack()
  await expect(page.getByRole('heading', { name: '绯想天 · 外界通讯' })).toBeVisible()
  await expect(bar(page)).toHaveCSS('opacity', '0')
  await observe(page)
  await join()
  await expect(page.locator('#join-title')).toBeVisible()
  await expect(bar(page)).toHaveCSS('opacity', '0')
  const samples = await page.evaluate(() => window.routeProgressFrames)
  expect(samples.some(frame => frame.opacity > 0.5 && frame.scale > 0)).toBe(true)
  const entering = samples.filter(frame => frame.visiblePageEntry)
  expect(entering.length).toBeGreaterThan(0)
  expect(entering.every(frame => frame.opacity > 0.9), 'keep feedback visible while the new page fades in').toBe(true)
  await expect(bar(page)).toHaveCount(1)
  await expect(page.locator('.nuxt-loading-indicator')).toHaveCount(0)
})

for (const theme of ['light', 'dark'] as const) {
  test(`slow data retains bounded progress and the archived ${theme} appearance`, async ({ page, isMobile }, info) => {
    await ready(page)
    if (theme === 'dark') {
      await page.getByRole('button', { name: /切换为夜间模式/ }).first().click()
      await expect(page.locator('html')).toHaveClass(/dark/)
    }
    const response = deferred()
    const request = deferred()
    await page.route('**/api/content/members*', async route => { request.release(); await response.promise; await route.continue() })
    await observe(page)
    const click = nav(page, '/members', isMobile)
    try {
      await request.promise
      await expect(bar(page)).toHaveCSS('opacity', '1')
      // Hold beyond the native indicator's former 500ms completion timer. A
      // stale finish must not hide feedback while this page still needs data.
      await page.waitForTimeout(900)
      await expect(bar(page)).toHaveCSS('opacity', '1')
      expect(await scale(page)).toBeGreaterThan(0.1)
      expect(await scale(page)).toBeLessThan(0.94)
      await expect(bar(page)).toHaveCSS('height', '3px')
      await expect(bar(page)).toHaveCSS('pointer-events', 'none')
      await expect(bar(page)).toHaveAttribute('aria-hidden', 'true')
      const background = await bar(page).evaluate(node => getComputedStyle(node).backgroundImage)
      expect(background).toContain(theme === 'dark' ? 'rgb(11, 42, 60)' : 'rgb(224, 242, 254)')
      expect(background).toContain('rgb(56, 189, 248)')
      await page.screenshot({ path: info.outputPath(`progress-${theme}.png`), clip: { x: 0, y: 0, width: page.viewportSize()!.width, height: 64 } })
    }
    finally { response.release() }
    await click
    await expect(page.getByRole('heading', { name: '绯想天住民名录' })).toBeVisible()
    await expect(bar(page)).toHaveCSS('opacity', '0')
    expect((await page.evaluate(() => window.routeProgressFrames)).some(frame => frame.scale > 0.99)).toBe(true)
  })
}

test('late cancelled data cannot hide progress for the newer destination', async ({ page, isMobile }) => {
  await ready(page)
  const members = deferred()
  const history = deferred()
  const membersRequested = deferred()
  const historyRequested = deferred()
  await page.route('**/api/content/members*', async route => { membersRequested.release(); await members.promise; await route.continue() })
  await page.route('**/api/content/history*', async route => { historyRequested.release(); await history.promise; await route.continue() })
  await observe(page)
  const firstClick = nav(page, '/members', isMobile)
  try {
    await membersRequested.promise
    const nextClick = nav(page, '/history', isMobile)
    await historyRequested.promise
    members.release()
    await firstClick
    await nextClick
    await page.waitForTimeout(900) // Deliberate stale-finish observation window.
    await expect(bar(page)).toHaveCSS('opacity', '1')
    expect(await scale(page)).toBeLessThan(0.94)
  }
  finally { members.release(); history.release() }
  await expect(page.getByRole('heading', { name: '绯想天群史' })).toBeVisible()
  await expect(bar(page)).toHaveCSS('opacity', '0')
  await expect(page).toHaveURL(/\/history$/)
  await expect(page).toHaveTitle(/绯想天群史/)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://next.guatswr.top/history')
})

test('nested categories also show progress and complete without a second bar', async ({ page }) => {
  await ready(page, '/events/bounty')
  await observe(page)
  await page.locator('main a[href="/events/stg"]').filter({ visible: true }).click()
  await expect(page.getByRole('heading', { name: 'STG', exact: true })).toBeVisible()
  await expect(bar(page)).toHaveCSS('opacity', '0')
  expect((await page.evaluate(() => window.routeProgressFrames)).some(frame => frame.opacity > 0.5 && frame.scale > 0)).toBe(true)
  await expect(bar(page)).toHaveCount(1)
  await expect(page.locator('.nuxt-loading-indicator')).toHaveCount(0)
})

test('canonical trailing-slash navigation cannot leave a bar waiting for a nonexistent page transition', async ({ page, isMobile }) => {
  await ready(page, '/social/')
  await observe(page)
  await nav(page, '/social', isMobile)
  // Vue Router treats this as a duplicate navigation and retains the URL,
  // rather than replacing its spelling. No new page or progress is expected.
  await expect(page).toHaveURL(/\/social\/$/)
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await expect(bar(page)).toHaveCSS('opacity', '0')
  expect(await scale(page)).toBe(0)
  expect(await page.evaluate(() => document.querySelector('main > .club-page-stack > :first-child') === window.routeProgressRoot)).toBe(true)
})

test('failed destination data still settles the indicator', async ({ page, isMobile }) => {
  await ready(page)
  await page.route('**/api/content/members*', route => route.fulfill({ status: 502, json: { message: 'fixture upstream failure' } }))
  await nav(page, '/members', isMobile)
  await expect(page.getByText('后端连接异常，请联系管理员', { exact: true })).toBeVisible()
  await expect(bar(page)).toHaveCSS('opacity', '0')
})

test('reduced motion keeps waiting progress static and removes easing', async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await ready(page)
  const response = deferred()
  const request = deferred()
  await page.route('**/api/content/members*', async route => { request.release(); await response.promise; await route.continue() })
  const click = nav(page, '/members', isMobile)
  try {
    await request.promise
    await expect(bar(page)).toHaveCSS('opacity', '1')
    await expect.poll(() => scale(page)).toBeCloseTo(0.12, 3)
    await page.waitForTimeout(500) // Verify it stays still while genuinely pending.
    expect(await scale(page)).toBeCloseTo(0.12, 3)
    await expect(bar(page)).toHaveCSS('transition-duration', '0s')
  }
  finally { response.release() }
  await click
  await expect(page.getByRole('heading', { name: '绯想天住民名录' })).toBeVisible()
  await expect(bar(page)).toHaveCSS('opacity', '0')
})
