import { expect, test } from '@playwright/test'
import { REFRESH_BOOT_SCRIPT, REFRESH_FAIL_OPEN_MS } from '../../app/utils/refresh-transition'

declare global {
  interface Window { refreshPhases: string[], lateRefreshFrames: number[], stopLateRefreshFrames: boolean }
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.addInitScript(() => {
    if (!localStorage.getItem('theme-preference')) localStorage.setItem('theme-preference', 'dark')
    window.refreshPhases = []
    new MutationObserver(records => {
      for (const record of records) if (record.target === document.documentElement) {
        window.refreshPhases.push(document.documentElement.dataset.refreshPhase ?? 'ready')
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-refresh-phase'] })
  })
})

test('SSR and client-rendered pages serve exactly the current boot script with a fresh CSP nonce', async ({ request }) => {
  const nonces = new Set<string>()
  for (const path of ['/', '/login', '/admin']) {
    const response = await request.get(path)
    expect(response.ok()).toBe(true)
    const html = await response.text()
    const scripts = [...html.matchAll(/<script\b([^>]*data-refresh-boot[^>]*)>([\s\S]*?)<\/script>/g)]
    expect(scripts).toHaveLength(1)
    expect(scripts[0]?.[2]).toBe(REFRESH_BOOT_SCRIPT)
    const nonce = scripts[0]?.[1].match(/\bnonce="([^"]+)"/)?.[1]
    expect(nonce).toBeTruthy()
    expect(response.headers()['content-security-policy']).toContain(`'nonce-${nonce}'`)
    nonces.add(nonce!)
  }
  expect(nonces.size).toBe(3)
})

for (const path of ['/', '/activities', '/activity/3', '/events', '/events/stg', '/members', '/history', '/social', '/join', '/login']) {
  test(`reloads ${path} with one interlude and no second entrance`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (/hydration.*mismatch|Content Security Policy/i.test(message.text())) errors.push(message.text()) })
    await page.goto(path)
    await expect(page.locator('html')).not.toHaveAttribute('data-refresh-phase')
    await page.reload()
    await expect(page.locator('html')).not.toHaveAttribute('data-refresh-phase', { timeout: 6500 })
    await expect(page.locator('h1').first()).toBeVisible()
    expect(await page.evaluate(() => window.refreshPhases)).toEqual(['loading', 'leaving', 'ready'])
    // A single refresh must not start the SPA route interlude as well.
    await expect(page.locator('.route-interlude')).toHaveCSS('opacity', '0')
    expect(await page.evaluate(() => document.getAnimations().filter(animation => {
      const effect = animation.effect as KeyframeEffect | null
      if (!(effect?.target instanceof Element)) return false
      const rect = effect.target.getBoundingClientRect()
      const timing = effect.getComputedTiming()
      // Deferred content below the fold may still prepare its scroll entrance.
      return rect.top < innerHeight && rect.bottom > 0 && animation.timeline === document.timeline && Number.isFinite(timing.endTime) && animation.playState === 'running'
    }).map(animation => ({
      name: 'animationName' in animation ? String(animation.animationName) : 'transitionProperty' in animation ? String(animation.transitionProperty) : 'web-animation',
      target: ((animation.effect as KeyframeEffect).target as Element)?.className,
    })))).toEqual([])
    expect(errors).toEqual([])
  })
}

test('restores a scrolled reload without hiding the already visible second section', async ({ page }) => {
  await page.goto('/')
  const intro = page.locator('.interests-intro')
  await expect(page.locator('.club-banner')).toHaveAttribute('data-scroll-ready', 'true')
  await intro.evaluate(el => window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - innerHeight * 0.4, behavior: 'instant' }))
  const saved = await page.evaluate(() => scrollY)
  await page.reload()
  await expect(page.locator('html')).not.toHaveAttribute('data-refresh-phase', { timeout: 6500 })
  await expect.poll(() => page.evaluate(value => Math.abs(scrollY - value), saved)).toBeLessThanOrEqual(2)
  await expect(intro).toHaveCSS('opacity', '1')
  await expect(intro).toHaveAttribute('data-reveal', 'visible')
})

test('keeps light reloads stable and cannot replay after a repeated head script', async ({ page }, info) => {
  const errors: string[] = []
  page.on('console', message => { if (/Content Security Policy/i.test(message.text())) errors.push(message.text()) })
  await page.goto('/social')
  await page.evaluate(() => localStorage.setItem('theme-preference', 'light'))
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/_nuxt/*.js', async route => { await gate; await route.continue() })
  try {
    await page.reload({ waitUntil: 'commit' })
    await expect(page.locator('html')).toHaveAttribute('data-refresh-phase', 'loading')
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement, '::before').backgroundColor)).toBe('rgb(251, 251, 248)')
    await page.screenshot({ path: info.outputPath('refresh-light.png') })
  } finally { release() }
  await page.waitForLoadState('load')
  await expect(page.locator('html')).not.toHaveAttribute('data-refresh-phase', { timeout: 6500 })
  await page.evaluate(() => {
    const original = [...document.scripts].find(script => script.textContent?.includes('window.__clubRefreshTransition'))
    if (!original) throw new Error('Refresh boot script missing')
    const repeated = document.createElement('script')
    repeated.nonce = original.nonce
    repeated.textContent = original.textContent + ';Object.assign(window,{refreshRepeatExecuted:true})'
    document.head.append(repeated)
  })
  expect(await page.evaluate(() => (window as typeof window & { refreshRepeatExecuted: boolean }).refreshRepeatExecuted)).toBe(true)
  expect(await page.evaluate(() => window.refreshPhases)).toEqual(['loading', 'leaving', 'ready'])
  await expect(page.locator('html')).not.toHaveAttribute('data-refresh-phase')
  expect(errors).toEqual([])
})

test('reload cover dismisses before a slow hero image finishes loading', async ({ page }) => {
  await page.goto('/')
  let release!: () => void
  const imageReady = new Promise<void>(resolve => { release = resolve })
  await page.route('**/uploads/fixture.webp', async route => { await imageReady; await route.continue() })
  try {
    await page.reload({ waitUntil: 'commit' })
    await expect.poll(() => page.evaluate(() => (window.refreshPhases ?? []).includes('loading'))).toBe(true)
    await expect(page.locator('html')).not.toHaveAttribute('data-refresh-phase', { timeout: 1100 })
    await expect(page.getByRole('heading', { level: 1, name: '桂航绯想天', exact: true })).toBeVisible()
    expect(await page.locator('.club-banner-background img.pi-full').evaluate(image => (image as HTMLImageElement).complete)).toBe(false)
  } finally { release() }
  await page.waitForLoadState('load')
  await expect(page.locator('.club-banner-background')).toHaveAttribute('data-image-state', 'ready')
  expect(await page.evaluate(() => window.refreshPhases)).toEqual(['loading', 'leaving', 'ready'])
})

test('the CSS cover can expire independently of a delayed JavaScript watchdog', async ({ page }) => {
  await page.addInitScript(deadline => {
    const schedule = window.setTimeout.bind(window)
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
      schedule(handler, timeout === deadline ? deadline + 3000 : timeout, ...args)) as typeof window.setTimeout
  }, REFRESH_FAIL_OPEN_MS)
  await page.goto('/social')
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/_nuxt/*.js', async route => { await gate; await route.continue() })
  try {
    await page.reload({ waitUntil: 'commit' })
    await expect(page.locator('html')).toHaveAttribute('data-refresh-phase', 'loading')
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement, '::before').opacity), { timeout: 1300, intervals: [25, 50, 100] }).toBe('0')
    expect(await page.evaluate(() => getComputedStyle(document.documentElement, '::before').pointerEvents)).toBe('none')
    // The JS watchdog has not fired, yet the document is already uncovered.
    await expect(page.locator('html')).toHaveAttribute('data-refresh-phase', 'loading')
  } finally { release() }
  await page.waitForLoadState('load')
  await expect(page.locator('html')).not.toHaveAttribute('data-refresh-phase', { timeout: 6500 })
})

test('late hydration after the fallback cannot hide already painted archive content', async ({ page }) => {
  await page.goto('/activities')
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/_nuxt/*.js', async route => { await gate; await route.continue() })
  try {
    await page.reload({ waitUntil: 'commit' })
    await expect(page.locator('html')).toHaveAttribute('data-refresh-phase', 'loading')
    await expect(page.locator('html')).not.toHaveAttribute('data-refresh-phase', { timeout: 6500 })
    await expect(page.locator('.activities-featured')).toHaveCSS('opacity', '1')
    await page.evaluate(() => {
      window.lateRefreshFrames = []
      window.stopLateRefreshFrames = false
      const sample = () => {
        const featured = document.querySelector('.activities-featured')
        if (featured) window.lateRefreshFrames.push(Number(getComputedStyle(featured).opacity))
        if (!window.stopLateRefreshFrames) requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
  } finally { release() }
  await page.waitForLoadState('load')
  await expect(page.locator('.activities-stage')).toHaveClass(/is-entered/)
  await expect(page.locator('html')).not.toHaveAttribute('data-refresh-initializing')
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  const frames = await page.evaluate(() => { window.stopLateRefreshFrames = true; return window.lateRefreshFrames })
  expect(frames.length).toBeGreaterThan(0)
  expect(frames.every(opacity => opacity > 0.99), 'late hydration must not replay an entrance over readable SSR content').toBe(true)
  expect(await page.evaluate(() => window.refreshPhases)).toEqual(['loading', 'leaving', 'ready'])
})

test('paints the reload cover before delayed hydration and fails open with scripts blocked', async ({ page }, info) => {
  await page.goto('/')
  await page.route('**/_nuxt/*.js', route => route.abort())
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('html')).toHaveAttribute('data-refresh-phase', 'loading')
  expect(await page.evaluate(() => getComputedStyle(document.documentElement, '::before').opacity)).toBe('1')
  expect(await page.evaluate(() => getComputedStyle(document.documentElement, '::after').content)).toContain('少女祈祷中')
  await page.screenshot({ path: info.outputPath('refresh-before-hydration.png') })
  await expect(page.locator('html')).not.toHaveAttribute('data-refresh-phase', { timeout: 6500 })
  await expect(page.getByRole('heading', { level: 1, name: '桂航绯想天', exact: true })).toBeVisible()
})

test('reduced motion reloads without a cover or animated fade', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/social')
  await page.reload()
  await expect(page.locator('h1')).toBeVisible()
  expect(await page.evaluate(() => window.refreshPhases)).toEqual([])
})

test('client-only admin reloads also dismiss the interlude after authentication', async ({ page, request }) => {
  const fixture = `http://127.0.0.1:${Number(process.env.E2E_PORT_BASE ?? 3100) + 82}`
  expect((await request.post(`${fixture}/__fixture/admin`, { data: { enable: true } })).ok()).toBe(true)
  await page.goto('/login')
  await page.getByLabel('Username').fill('admin')
  await page.getByLabel('Password', { exact: true }).fill('adminpass')
  await page.getByRole('button', { name: '登录系统', exact: true }).click()
  await page.getByRole('button', { name: '进入管理端', exact: true }).click()
  await expect(page.getByTestId('admin-shell')).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('admin-shell')).toBeVisible()
  await expect(page.locator('html')).not.toHaveAttribute('data-refresh-phase', { timeout: 6500 })
  expect(await page.evaluate(() => window.refreshPhases)).toEqual(['loading', 'leaving', 'ready'])
})
