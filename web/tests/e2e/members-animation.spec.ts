import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { MembersContentResponse } from '../../shared/content'

async function openLongMembers(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const response = await page.request.get('/api/content/members')
  expect(response.ok()).toBe(true)
  const source = (await response.json() as MembersContentResponse).members[0]!
  const members = Array.from({ length: 40 }, (_, index) => ({
    ...source, id: 100 + index, name: `成员动画 ${String(index + 1).padStart(2, '0')}`,
  }))
  const sortKeys = Object.fromEntries(members.map(member => [String(member.id), { category: 0, key: member.name }]))
  await page.route(url => url.pathname === '/api/content/members', route => route.fulfill({ json: { members, sortKeys } }))
  await page.goto('/history')
  // Navigate from the mounted navbar: the idle-hydrated footer can still be an
  // ordinary SSR anchor, bypassing this browser-only long-roster fixture.
  const navbar = page.getByRole('navigation', { name: '主导航' })
  await expect(navbar).toHaveAttribute('data-native-progress', 'true')
  const menu = navbar.getByRole('button', { name: '打开导航菜单' })
  if (await menu.isVisible()) await menu.click()
  await navbar.getByRole('link', { name: '成员', exact: true }).click()
  await expect(page.locator('.member-dossier')).toHaveCount(40)
  await expect(page.locator('.club-page-enter-active, .club-page-leave-active')).toHaveCount(0)
  await page.mouse.move(0, 0)
}

test('member card exits reverse with scrolling and keep grid and hover stable', async ({ page, isMobile }) => {
  await openLongMembers(page)
  const entry = page.locator('.member-dossier-entry').filter({ has: page.getByRole('heading', { name: '成员动画 01', exact: true }) })
  const card = entry.locator('.member-dossier')
  await expect.poll(() => entry.evaluate(node => node.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0)
  await expect(card).toHaveCSS('animation-name', 'club-section-exit')
  const layout = await entry.evaluate(node => {
    const rect = node.getBoundingClientRect()
    return { top: scrollY + rect.top, height: (node as HTMLElement).offsetHeight, width: (node as HTMLElement).offsetWidth }
  })
  const scrollToFraction = (fraction: number) => page.evaluate(({ top, height, fraction }) => {
    window.scrollTo({ top: top + height * fraction, behavior: 'instant' })
  }, { ...layout, fraction })
  const opacity = () => card.evaluate(node => Number(getComputedStyle(node).opacity))
  await scrollToFraction(0.25)
  await expect.poll(opacity).toBe(1)
  await scrollToFraction(0.55)
  await expect.poll(opacity).toBeCloseTo(0.64, 1)
  await scrollToFraction(0.85)
  await expect.poll(opacity).toBeCloseTo(0.28, 2)
  // A later grid row must keep its own timeline and remain fully readable.
  const later = page.locator('.member-dossier-entry').filter({ has: page.getByRole('heading', { name: '成员动画 09', exact: true }) })
  await expect(later.locator('.member-dossier')).toHaveCSS('opacity', '1')
  await scrollToFraction(-1)
  await expect.poll(opacity).toBe(1)
  expect(await entry.evaluate(node => ({ width: (node as HTMLElement).offsetWidth, height: (node as HTMLElement).offsetHeight }))).toEqual({ width: layout.width, height: layout.height })
  if (!isMobile) {
    await card.hover()
    await expect(card).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, -3)')
    await page.mouse.move(0, 0)
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await scrollToFraction(0.85)
  await expect(entry).toHaveCSS('animation-name', 'none')
  await expect(card).toHaveCSS('animation-name', 'none')
  await expect(card).toHaveCSS('opacity', '1')
  await expect(card).toHaveCSS('translate', 'none')
  await expect(card).toHaveCSS('scale', 'none')
})

test('member seats fade independently and preserve school filtering', async ({ page }) => {
  await openLongMembers(page)
  const chart = page.locator('.member-seats')
  const surface = chart.locator('.parliament-chart-container')
  const filters = page.getByRole('navigation', { name: '按院校筛选住民' })
  const layout = await chart.evaluate(node => {
    const rect = node.getBoundingClientRect()
    return { top: scrollY + rect.top, height: (node as HTMLElement).offsetHeight }
  })
  const scrollToFraction = (fraction: number) => page.evaluate(({ top, height, fraction }) => {
    window.scrollTo({ top: top + height * fraction, behavior: 'instant' })
  }, { ...layout, fraction })
  const opacity = () => surface.evaluate(node => Number(getComputedStyle(node).opacity))
  await scrollToFraction(0.25)
  await expect.poll(opacity).toBe(1)
  await scrollToFraction(0.55)
  await expect.poll(opacity).toBeCloseTo(0.64, 1)
  await expect(filters).toHaveCSS('opacity', '1')
  await scrollToFraction(0.85)
  await expect.poll(opacity).toBeCloseTo(0.28, 2)
  await expect(surface).toHaveCSS('scale', 'none')
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await expect.poll(opacity).toBe(1)
  expect(await chart.evaluate(node => (node as HTMLElement).offsetHeight)).toBe(layout.height)
  const seat = surface.locator('circle.seat-dot').filter({ hasText: '桂电' })
  const seatCount = await surface.locator('circle.seat-dot').count()
  await expect(seat).toHaveCount(1)
  await seat.click()
  await expect(page).toHaveURL(new RegExp(`school=${encodeURIComponent('桂电')}`))
  await expect(seat).toHaveClass(/is-highlighted/)
  await expect(surface.locator('circle.is-dimmed')).toHaveCount(seatCount - 1)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await scrollToFraction(0.85)
  await expect(surface).toHaveCSS('animation-name', 'none')
  await expect(surface).toHaveCSS('opacity', '1')
  await expect(surface).toHaveCSS('translate', 'none')
})

test('school filter cards fade near the navbar and keep hover, selection and keyboard focus usable', async ({ page, isMobile }) => {
  await openLongMembers(page)
  const filters = page.getByRole('navigation', { name: '按院校筛选住民' })
  const entry = filters.locator('.member-filter-entry').filter({ hasText: '桂电' })
  const tab = entry.getByRole('link')
  await expect(tab).toHaveCount(1)
  const layout = await entry.evaluate(node => {
    const rect = node.getBoundingClientRect()
    return {
      top: scrollY + rect.top, height: (node as HTMLElement).offsetHeight,
      inset: parseFloat(getComputedStyle(node).getPropertyValue('view-timeline-inset')),
    }
  })
  const scrollToFraction = (fraction: number) => page.evaluate(({ top, height, inset, fraction }) => {
    window.scrollTo({ top: top - inset + height * fraction, behavior: 'instant' })
  }, { ...layout, fraction })
  const opacity = () => tab.evaluate(node => Number(getComputedStyle(node).opacity))
  await scrollToFraction(0.25)
  await expect.poll(opacity).toBe(1)
  await scrollToFraction(0.55)
  await expect.poll(opacity).toBeCloseTo(0.64, 1)
  await scrollToFraction(0.85)
  await expect.poll(opacity).toBeCloseTo(0.28, 2)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await expect.poll(opacity).toBe(1)
  if (!isMobile) {
    await tab.hover()
    await expect(tab).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, -2)')
  }
  await tab.click()
  await expect(page).toHaveURL(new RegExp(`school=${encodeURIComponent('桂电')}`))
  await expect(tab).toHaveAttribute('aria-current', 'page')
  await page.mouse.move(0, 0)
  await scrollToFraction(0.85)
  await expect.poll(opacity).toBeCloseTo(0.28, 2)
  await page.keyboard.press('Tab')
  await tab.evaluate(node => (node as HTMLElement).focus({ preventScroll: true }))
  await expect(tab).toHaveCSS('opacity', '1')
  await expect(tab).toHaveCSS('translate', 'none')
  await tab.evaluate(node => (node as HTMLElement).blur())
  await expect.poll(opacity).toBeCloseTo(0.28, 2)
  expect(await entry.evaluate(node => (node as HTMLElement).offsetHeight)).toBe(layout.height)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(tab).toHaveCSS('animation-name', 'none')
  await expect(tab).toHaveCSS('opacity', '1')
  await expect(tab).toHaveCSS('translate', 'none')
})

test('continuous downward scrolling through members exits never jumps back', async ({ page, isMobile }) => {
  await openLongMembers(page)
  await page.waitForLoadState('networkidle')
  const frames: number[] = []
  // Sample on the animation clock, rather than only after scrollTo settles.
  await page.exposeFunction('recordMembersScroll', (y: number) => frames.push(y))
  await page.evaluate(() => {
    const state = window as typeof window & { sampleMembersScroll: boolean, recordMembersScroll(y: number): Promise<void> }
    state.sampleMembersScroll = true
    const tick = () => {
      if (!state.sampleMembersScroll) return
      void state.recordMembersScroll(window.scrollY)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const session = await page.context().newCDPSession(page)
  try {
    if (isMobile) {
      for (let gesture = 0; gesture < 3; gesture++) {
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 190, y: 650 }] })
        for (let step = 1; step <= 10; step++) {
          await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 190, y: 650 - step * 45 }] })
          await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
        }
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      }
    } else {
      await session.send('Input.synthesizeScrollGesture', { x: 900, y: 600, yDistance: -1400, speed: 450, gestureSourceType: 'mouse' })
    }
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300)
    await page.evaluate(() => new Promise<void>(resolve => {
      const start = performance.now()
      const settle = (now: number) => now - start > 500 ? resolve() : requestAnimationFrame(settle)
      requestAnimationFrame(settle)
    }))
  } finally {
    await page.evaluate(() => { (window as typeof window & { sampleMembersScroll: boolean }).sampleMembersScroll = false })
    await session.detach()
  }
  expect(frames.length).toBeGreaterThan(20)
  expect(frames.slice(1).filter((y, index) => y < frames[index]! - 1)).toEqual([])
})
