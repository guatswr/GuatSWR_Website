import { expect, test } from '@playwright/test'
import type { Page, TestInfo } from '@playwright/test'
import { settlePublicPage } from './support/public-pages'

type Frame = { time: number, path: string, y: number, rootOpacity: number, navOpacity: number, transitions: { opacity: number, classes: string, top: number, width: number }[] }
declare global {
  interface Window {
    navigationFrames: Frame[]
    stopNavigationFrames: boolean
    navigationRoot: Element | null
  }
}

const errors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const failures: string[] = []
  errors.set(page, failures)
  page.on('pageerror', error => failures.push(error.message))
  page.on('console', message => {
    if (/hydration|Content Security Policy|non-element root node/i.test(message.text())) failures.push(message.text())
  })
})
test.afterEach(async ({ page }, info) => {
  const state = await page.evaluate(() => {
    window.stopNavigationFrames = true
    return { frames: window.navigationFrames, url: location.href, scrollY, height: document.documentElement.scrollHeight, history: history.state, html: document.querySelector('main')?.outerHTML.slice(0, 1000) }
  })
  await info.attach('final-navigation-state', { body: JSON.stringify(state, null, 2), contentType: 'application/json' })
  expect(errors.get(page)).toEqual([])
})

async function ready(page: Page, path: string) {
  await page.goto(path)
  // A local-storage write proves the toggle's real client handler is mounted;
  // SSR text alone cannot prove that a subsequent click will be SPA navigation.
  const theme = page.getByRole('button', { name: /切换为.*模式/ }).first()
  await theme.click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('theme-preference'))).toMatch(/light|dark/)
  await theme.click()
}

async function nav(page: Page, path: string, isMobile: boolean) {
  if (isMobile) await page.getByRole('button', { name: '打开导航菜单' }).click()
  await page.getByRole('navigation', { name: '主导航' }).locator(`a[href="${path}"]`).filter({ visible: true }).click()
}

async function observe(page: Page) {
  await page.evaluate(() => {
    window.navigationFrames = []
    window.stopNavigationFrames = false
    window.navigationRoot = document.querySelector('main > .club-page-stack > :first-child')
    const sample = () => {
      const root = document.querySelector('main > .club-page-stack > :first-child')
      const nav = document.querySelector('nav[aria-label="主导航"]')
      window.navigationFrames.push({
        time: performance.now(), path: location.pathname, y: scrollY,
        rootOpacity: root ? Number(getComputedStyle(root).opacity) : -1,
        navOpacity: nav ? Number(getComputedStyle(nav).opacity) : -1,
        transitions: Array.from(document.querySelectorAll('.club-page-enter-active, .club-page-leave-active')).map(node => ({ opacity: Number(getComputedStyle(node).opacity), classes: node.className, top: node.getBoundingClientRect().top, width: node.getBoundingClientRect().width })),
      })
      if (!window.stopNavigationFrames) requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
}

async function settled(page: Page) {
  await expect(page.locator('.club-page-enter-active, .club-page-leave-active')).toHaveCount(0)
  await expect(page.locator('main > .club-page-stack > :first-child')).toHaveCSS('opacity', '1')
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
}

async function frames(page: Page, info: TestInfo, name = 'navigation-frames') {
  const result = await page.evaluate(() => { window.stopNavigationFrames = true; return window.navigationFrames })
  await info.attach(name, { body: JSON.stringify(result, null, 2), contentType: 'application/json' })
  expect(result.length).toBeGreaterThan(2)
  expect(result.every(frame => frame.navOpacity === 1), 'shared navigation must stay visible').toBe(true)
  return result
}

test('public navigation fades out and in without a document reload', async ({ page }, info) => {
  await ready(page, '/social')
  await observe(page)
  await page.getByRole('link', { name: /加入同好群/ }).click()
  await expect(page.locator('#join-title')).toBeVisible()
  await settled(page)
  const samples = await frames(page, info)
  for (const phase of ['leave', 'enter']) {
    expect(samples.some(frame => frame.transitions.some(node => node.classes.includes(`club-page-${phase}-active`) && node.opacity > 0 && node.opacity < 1)), `actual intermediate opacity during ${phase}`).toBe(true)
  }
  // The recorder survives only a client navigation, not a new document.
  expect(await page.evaluate(() => document.querySelector('main > .club-page-stack > :first-child') === window.navigationRoot)).toBe(false)
})

test('nested event navigation fades only the board and preserves the category shell', async ({ page }, info) => {
  await ready(page, '/events/bounty')
  await observe(page)
  await page.locator('main a[href="/events/stg"]').filter({ visible: true }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'STG', exact: true })).toBeVisible()
  await settled(page)
  const samples = await frames(page, info)
  expect(samples.some(frame => frame.transitions.some(node => node.opacity > 0 && node.opacity < 1))).toBe(true)
  expect(samples.every(frame => frame.rootOpacity === 1), 'category shell must not fade').toBe(true)
  expect(await page.evaluate(() => document.querySelector('main > .club-page-stack > :first-child') === window.navigationRoot)).toBe(true)
})

test('home boundary keeps the departing geometry in both directions', async ({ page, isMobile }, info) => {
  await ready(page, '/')
  const original = await page.locator('main > .club-page-stack > :first-child').boundingBox()
  expect(original).not.toBeNull()
  await observe(page)
  await nav(page, '/social', isMobile)
  await expect(page.getByRole('heading', { name: '绯想天 · 外界通讯' })).toBeVisible()
  await settled(page)
  const samples = await frames(page, info)
  const leaving = samples.flatMap(frame => frame.transitions).filter(node => node.classes.includes('club-page-leave-active'))
  expect(leaving.length).toBeGreaterThan(0)
  expect(leaving.every(node => Math.abs(node.top - original!.y) <= 1 && Math.abs(node.width - original!.width) <= 1)).toBe(true)
  const social = await page.locator('main > .club-page-stack > :first-child').boundingBox()
  expect(social).not.toBeNull()
  await observe(page)
  await page.goBack()
  await expect(page.locator('main > .club-page-stack > .club-home')).toBeVisible()
  await settled(page)
  const returning = (await frames(page, info, 'return-navigation-frames')).flatMap(frame => frame.transitions).filter(node => node.classes.includes('club-page-leave-active'))
  expect(returning.length).toBeGreaterThan(0)
  expect(returning.every(node => Math.abs(node.top - social!.y) <= 1 && Math.abs(node.width - social!.width) <= 1)).toBe(true)
})

test('school query changes preserve the page and scroll without a full-page fade', async ({ page }, info) => {
  await ready(page, '/members')
  await observe(page)
  await page.locator('main a[href*="school="]').filter({ visible: true }).first().click()
  await expect(page).toHaveURL(/school=/)
  await expect(page.locator('main a[aria-current="page"][href*="school="]')).toHaveCount(1)
  await settled(page)
  const samples = await frames(page, info)
  expect(samples.every(frame => frame.rootOpacity === 1 && frame.transitions.length === 0)).toBe(true)
  expect(await page.evaluate(() => document.querySelector('main > .club-page-stack > :first-child') === window.navigationRoot)).toBe(true)
})

test('slow destination data keeps the outgoing content visible until ready', async ({ page, isMobile }, info) => {
  await ready(page, '/social')
  let release!: () => void
  let arrived!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const requested = new Promise<void>(resolve => { arrived = resolve })
  await page.route('**/api/content/members*', async route => { arrived(); await gate; await route.continue() })
  await observe(page)
  const click = nav(page, '/members', isMobile)
  try {
    await requested
    await expect(page.getByRole('heading', { name: '绯想天 · 外界通讯' })).toBeVisible()
    await expect(page.locator('main > .club-page-stack > :first-child')).toHaveCSS('opacity', '1')
    await expect(page.locator('.club-page-leave-active')).toHaveCount(0)
  }
  finally { release() }
  await click
  await expect(page.getByRole('heading', { name: '绯想天住民名录' })).toBeVisible()
  await settled(page)
  await frames(page, info)
})

test('top reset and history restoration preserve the actual reading position', async ({ page, isMobile }, info) => {
  await ready(page, '/history#history-0')
  await settlePublicPage(page)
  if (isMobile) {
    // The month rail is intentionally desktop-only. Set a real reading
    // position; do not force-click an invisible desktop control on mobile.
    await page.evaluate(() => window.scrollTo({ top: 800, behavior: 'instant' }))
  }
  else {
    await page.locator('.history-bookmark-year').last().click()
    // Save the completed position, not an intermediate smooth-scroll frame.
    await expect.poll(() => page.locator('[data-history-index="1"]').evaluate(node => Math.abs(scrollY - Math.max(0, Math.min(scrollY + node.getBoundingClientRect().top - innerHeight * 0.24, document.documentElement.scrollHeight - innerHeight))))).toBeLessThanOrEqual(1)
  }
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100)
  const saved = await page.evaluate(() => scrollY)
  await info.attach('saved-scroll', { body: JSON.stringify({ saved, state: await page.evaluate(() => history.state) }), contentType: 'application/json' })
  await observe(page)
  await nav(page, '/members', isMobile)
  await expect(page.getByRole('heading', { name: '绯想天住民名录' })).toBeVisible()
  await settled(page)
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
  const outgoingFrames = await frames(page, info, 'top-reset-frames')
  const incoming = outgoingFrames.filter(frame => frame.path === '/members' && frame.transitions.some(node => node.classes.includes('club-page-enter-active') && node.opacity > 0.2))
  expect(incoming.length).toBeGreaterThan(0)
  expect(incoming.every(frame => frame.y === 0), 'restore scroll before the new page becomes clearly visible').toBe(true)
  await observe(page)
  await page.goBack()
  await expect(page.getByRole('heading', { name: /绯想天群史/ })).toBeVisible()
  await settled(page)
  await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - saved)).toBeLessThanOrEqual(2)
  await frames(page, info)
})

test('rapid navigation cannot leave a blank or invisible destination', async ({ page, isMobile }, info) => {
  await ready(page, '/social')
  let release!: () => void
  let arrived!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const requested = new Promise<void>(resolve => { arrived = resolve })
  await page.route('**/api/content/members*', async route => { arrived(); await gate; await route.continue() })
  await observe(page)
  const firstClick = nav(page, '/members', isMobile)
  try {
    await requested
    await nav(page, '/history', isMobile)
    await expect(page).toHaveURL(/\/history$/)
    await expect(page.getByRole('heading', { name: '绯想天群史' })).toBeVisible()
  }
  finally { release() }
  await firstClick
  await settled(page)
  await expect(page).toHaveURL(/\/history$/)
  await expect(page.getByRole('heading', { name: '绯想天群史' })).toBeVisible()
  await expect(page.locator('main > .club-page-stack > *')).toHaveCount(1)
  await frames(page, info)
})

test('reduced motion removes fades while first-load SSR stays visible', async ({ page, browser, baseURL }, info) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL })
  try {
    const staticPage = await context.newPage()
    await staticPage.goto('/social')
    await expect(staticPage.getByRole('heading', { name: '绯想天 · 外界通讯' })).toBeVisible()
    await expect(staticPage.locator('main > .club-page-stack > :first-child')).toHaveCSS('opacity', '1')
  }
  finally { await context.close() }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await ready(page, '/social')
  await observe(page)
  await page.getByRole('link', { name: /加入同好群/ }).click()
  await expect(page.locator('#join-title')).toBeVisible()
  await settled(page)
  const samples = await frames(page, info)
  expect(samples.flatMap(frame => frame.transitions).some(node => node.opacity > 0 && node.opacity < 1)).toBe(false)
})
