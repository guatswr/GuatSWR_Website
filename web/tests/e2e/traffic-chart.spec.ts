import { expect, test } from '@playwright/test'

test('traffic chart supports precise reads, touch pinning and interval changes', async ({ page, isMobile }, testInfo) => {
  const errors: string[] = []
  await page.addInitScript(() => localStorage.setItem('theme-preference', 'light'))
  page.on('console', message => { if (/hydration.*mismatch/i.test(message.text())) errors.push(message.text()) })
  await page.route('https://stats.guatswr.top/**', route => route.abort())
  await page.route('**/api/logs/umami?*', async route => {
    const query = new URL(route.request().url()).searchParams
    const unit = query.get('unit') || 'hour'
    const startAt = Number(query.get('startAt')), endAt = Number(query.get('endAt'))
    const step = unit === 'hour' ? 3600000 : 86400000
    const first = Math.floor((startAt + 8 * 3600000) / step) * step
    const last = Math.floor((endAt + 8 * 3600000) / step) * step
    const buckets = Array.from({ length: Math.floor((last - first) / step) + 1 }, (_, index) => {
      const value = Math.round(Math.max(0, Math.sin((index % 24 - 5) / 24 * Math.PI * 2)) * 130 + (index % 17 === 0 ? 90 : 4))
      return { x: new Date(first + index * step).toISOString(), y: value }
    })
    await route.fulfill({ json: {
      meta: { startAt, endAt, unit, timezone: 'Asia/Shanghai', envType: 'browser', limit: 5 },
      summary: { pageviews: buckets.reduce((total, row) => total + row.y, 0), visitors: 57, visits: 143, bounces: 22, totaltime: 5600 },
      series: { pageviews: buckets, visitors: buckets.map(row => ({ x: row.x, y: Math.round(row.y / 12) })) },
      top: { pages: [], environments: [] },
    } })
  })
  await page.goto('/logs?range=7d')
  const chart = page.getByTestId('traffic-chart')
  const plot = page.getByRole('slider', { name: '浏览流量时间点' })
  await page.getByLabel('趋势时间粒度').selectOption('hour')
  await expect(page).toHaveURL(/interval=hour/)
  await expect(chart).toContainText('北京时间')
  await expect(plot).toHaveAttribute('aria-valuemax', '169')
  await plot.scrollIntoViewIfNeeded()
  const before = await plot.boundingBox()
  expect(before).not.toBeNull()
  const position = { x: before!.width * .3, y: before!.height * .8 }
  if (!isMobile) {
    await page.mouse.move(before!.x + before!.width * .2, before!.y + before!.height * .8)
    await expect(page.getByTestId('traffic-tooltip')).toBeVisible()
    const initial = Number(await plot.getAttribute('aria-valuenow'))
    await page.mouse.move(before!.x + before!.width * .8, before!.y + before!.height * .8)
    await expect.poll(async () => Number(await plot.getAttribute('aria-valuenow'))).toBeGreaterThan(initial)
  }
  if (isMobile) await plot.tap({ position })
  else await plot.click({ position })
  await expect(page.getByRole('button', { name: '取消固定读数' })).toBeVisible()
  await expect(page.getByTestId('traffic-tooltip')).toBeVisible()
  const after = await plot.boundingBox()
  expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(1)
  const tooltip = await page.getByTestId('traffic-tooltip').boundingBox()
  expect(tooltip!.x).toBeGreaterThanOrEqual(after!.x - 1)
  expect(tooltip!.x + tooltip!.width).toBeLessThanOrEqual(after!.x + after!.width + 1)
  if (isMobile) {
    const touch = await page.context().newCDPSession(page)
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: after!.x + after!.width * .2, y: after!.y + after!.height * .8 }] })
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: after!.x + after!.width * .8, y: after!.y + after!.height * .8 }] })
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect.poll(async () => Number(await plot.getAttribute('aria-valuenow'))).toBeGreaterThan(100)
    await touch.detach()
  } else {
    const fixed = await plot.getAttribute('aria-valuenow')
    await page.mouse.move(after!.x + after!.width * .9, after!.y + after!.height * .8)
    await expect(plot).toHaveAttribute('aria-valuenow', fixed!)
  }
  await page.getByRole('button', { name: '取消固定读数' }).click()

  await plot.press('Home')
  await expect(plot).toHaveAttribute('aria-valuenow', '1')
  await plot.press('ArrowRight')
  await expect(plot).toHaveAttribute('aria-valuenow', '2')
  await plot.press('End')
  await expect(plot).toHaveAttribute('aria-valuenow', '169')
  await plot.press('Escape')
  await expect(page.getByTestId('traffic-tooltip')).toHaveCount(0)

  await chart.locator('.traffic-series--uv').click()
  await expect(page.getByTestId('traffic-pv-line')).toHaveCount(0)
  await chart.getByRole('button', { name: '全部', exact: true }).click()
  await expect(page.getByTestId('traffic-pv-line')).toBeVisible()
  expect(await chart.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  await chart.evaluate(element => window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - 90, behavior: 'instant' }))
  await expect(chart).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await chart.screenshot({ path: testInfo.outputPath('traffic-light.png') })
  await page.getByRole('button', { name: /切换为夜间模式/ }).click()
  await expect(chart).toHaveCSS('background-color', 'rgb(21, 33, 45)')
  await chart.evaluate(element => window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - 90, behavior: 'instant' }))
  await chart.screenshot({ path: testInfo.outputPath('traffic-dark.png') })

  await page.getByLabel('趋势时间粒度').selectOption('day')
  await expect(plot).toHaveAttribute('aria-valuemax', '8')
  await expect(page.getByLabel('趋势时间粒度')).toHaveValue('day')
  await chart.getByText('查看数据表', { exact: false }).click()
  await expect(chart.getByRole('table')).toBeVisible()
  expect(errors).toEqual([])
})
