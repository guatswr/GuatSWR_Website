import { expect, test } from '@playwright/test'

test('members hydration preserves scrolling started before application scripts load', async ({ page }) => {
  let releaseScripts!: () => void
  const scriptsReady = new Promise<void>(resolve => { releaseScripts = resolve })
  await page.route('**/_nuxt/*.js', async route => {
    await scriptsReady
    await route.continue()
  })
  try {
    await page.goto('/members', { waitUntil: 'commit' })
    await expect(page.getByRole('heading', { name: '绯想天住民名录', exact: true })).toBeVisible()
    await page.evaluate(() => window.scrollTo({ top: 160, behavior: 'instant' }))
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(160)
    releaseScripts()
    await expect(page.getByRole('navigation', { name: '主导航' })).toHaveAttribute('data-native-progress', 'true')
    await page.waitForLoadState('networkidle')
    expect(await page.evaluate(() => window.scrollY)).toBe(160)
  } finally { releaseScripts() }
})

test('members navigation still resets new pages and restores browser history', async ({ page }) => {
  await page.goto('/history')
  const navbar = page.getByRole('navigation', { name: '主导航' })
  await expect(navbar).toHaveAttribute('data-native-progress', 'true')
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => window.scrollTo({ top: 160, behavior: 'instant' }))
  const menu = navbar.getByRole('button', { name: '打开导航菜单' })
  if (await menu.isVisible()) await menu.click()
  await navbar.getByRole('link', { name: '成员', exact: true }).click()
  await expect(page).toHaveURL(/\/members$/)
  await expect(page.locator('.club-page-enter-active, .club-page-leave-active')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await page.evaluate(() => window.scrollTo({ top: 120, behavior: 'instant' }))
  await page.goBack()
  await expect(page).toHaveURL(/\/history$/)
  await expect(page.locator('.club-page-enter-active, .club-page-leave-active')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(160)
})
