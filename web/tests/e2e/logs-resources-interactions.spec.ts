import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('theme-preference', 'light'))
  await page.route('https://stats.guatswr.top/**', route => route.abort())
})

test('statistics filters retain the chart, scroll position and last good results', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('console', message => { if (/hydration.*mismatch/i.test(message.text())) errors.push(message.text()) })
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  let failRegion = true
  await page.route('**/api/logs/umami?*', async route => {
    const q = new URL(route.request().url()).searchParams
    const type = q.get('envType') ?? 'browser'
    if (type === 'os') await held
    if (type === 'region' && failRegion) return route.fulfill({ status: 503, json: { message: 'synthetic outage' } })
    await route.fulfill({ json: {
      meta: { startAt: Number(q.get('startAt')), endAt: Number(q.get('endAt')), unit: q.get('unit') || 'hour', timezone: 'Asia/Shanghai', envType: type, limit: 5 },
      summary: { pageviews: 100, visitors: 10, visits: 12, bounces: 2, totaltime: 100 },
      series: { pageviews: [], visitors: [] },
      top: { pages: [], environments: [{ x: type === 'os' ? 'Windows' : 'CN-GX', y: 3 }] },
      ...(type === 'region' ? { location: { total: 10, located: 3, unknown: 7 } } : {}),
    } })
  })
  try {
    await page.goto('/logs?page=2')
    await expect(page.getByText('CHRONICLE OF GENSOKYO', { exact: false })).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: '日志页快捷导航' }).getByRole('link', { name: '站点统计' })).toBeVisible()
    const statistics = page.locator('#site-statistics')
    const chart = page.getByTestId('traffic-chart')
    await expect(chart).toHaveCSS('opacity', '1')
    const plot = page.getByRole('slider', { name: '浏览流量时间点' })
    await plot.press('End')
    await plot.press('Enter')
    const readout = await plot.getAttribute('aria-valuetext')
    await chart.evaluate(element => { Object.assign(window, { retainedStatisticsChart: element }) })
    const audience = page.getByLabel('访客画像', { exact: true })
    const osLink = audience.getByRole('link', { name: '操作系统', exact: true })
    await osLink.scrollIntoViewIfNeeded()
    const scrollBefore = await page.evaluate(() => window.scrollY)
    await osLink.click()
    await expect(statistics).toHaveAttribute('aria-busy', 'true')
    expect(await chart.evaluate(element => element === (window as typeof window & { retainedStatisticsChart: Element }).retainedStatisticsChart)).toBe(true)
    await expect(chart).toHaveCSS('opacity', '1')
    await expect(page.getByText('正在获取站点数据...', { exact: true })).toHaveCount(0)
    expect(Math.abs(await page.evaluate(() => window.scrollY) - scrollBefore)).toBeLessThanOrEqual(2)
    release()
    await expect(audience.getByTestId('audience-value').filter({ hasText: /^Windows$/ })).toBeVisible()
    await expect(page).toHaveURL(/page=2/)
    await expect(plot).toHaveAttribute('aria-valuetext', readout!)
    expect(await chart.evaluate(element => element === (window as typeof window & { retainedStatisticsChart: Element }).retainedStatisticsChart)).toBe(true)
    await audience.getByRole('link', { name: '省份分布', exact: true }).click()
    await expect(statistics.getByRole('button', { name: '重试', exact: true })).toBeVisible()
    await expect(audience.getByTestId('audience-value').filter({ hasText: /^Windows$/ })).toBeVisible()
    await expect(chart).toBeVisible()
    failRegion = false
    await statistics.getByRole('button', { name: '重试', exact: true }).click()
    await expect(audience.getByText('广西壮族自治区', { exact: true })).toBeVisible()
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await page.screenshot({ path: testInfo.outputPath('logs-first-screen.png') })
    expect(errors).toEqual([])
  } finally { release() }
})

test('resource animations preserve sorting, native dialog focus and tree navigation', async ({ page, isMobile }, testInfo) => {
  const folder = '/非想天则联机专区'
  await page.goto('/resources?path=' + encodeURIComponent(folder))
  const result = await page.request.get('/api/resources/list?path=' + encodeURIComponent(folder))
  const directory = await result.json()
  const file = directory.items.find((item: { is_dir: boolean }) => !item.is_dir)
  expect(file).toBeTruthy()
  const gridButton = page.getByRole('button', { name: '网格视图', exact: true })
  await gridButton.click()
  const grid = page.getByRole('list', { name: '目录文件网格' })
  await expect(grid).toBeVisible()
  const card = grid.getByRole('listitem').filter({ hasText: file.name })
  await expect(card).toHaveCount(1)
  await card.locator('.resources-card-main').press('Enter')
  const dialog = page.getByRole('dialog', { name: file.name })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: file.name, exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(card.locator('.resources-card-main')).toBeFocused()
  await card.locator('.resources-card-main').press('Enter')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '关闭文件详情' }).click()
  await expect(dialog).not.toBeVisible()
  await page.getByRole('button', { name: '列表视图', exact: true }).click()
  const table = page.getByRole('table', { name: '目录文件清单' })
  await expect(table).toBeVisible()
  await table.getByRole('button', { name: /^名称/ }).click()
  await expect(table.locator('th').first()).toHaveAttribute('aria-sort', 'descending')
  if (isMobile) {
    await page.getByRole('button', { name: '目录', exact: true }).click()
    await expect(page.getByRole('complementary', { name: '目录导航' })).toBeVisible()
    await page.getByRole('button', { name: '目录', exact: true }).click()
    await expect(page.getByRole('complementary', { name: '目录导航' })).not.toBeVisible()
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.screenshot({ path: testInfo.outputPath('resources-first-screen.png') })
  expect(await page.locator('.resources-stage').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
})

test('reduced motion keeps both pages fully visible without entrance or dialog transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/logs')
  await expect(page.locator('.logs-header-layout')).toHaveCSS('animation-name', 'none')
  await expect(page.getByRole('heading', { level: 2, name: '站点统计', exact: true })).toBeVisible()
  await page.goto('/resources')
  await expect(page.locator('.resources-header')).toHaveCSS('animation-name', 'none')
  await expect(page.locator('.resources-entry').first()).toHaveCSS('animation-name', 'none')
  await expect(page.locator('.resources-drawer')).toHaveCSS('transition-duration', '0s')
  await expect(page.getByRole('table', { name: '目录文件清单' })).toBeVisible()
})
