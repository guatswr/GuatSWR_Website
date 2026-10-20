import { expect, test } from '@playwright/test'

test('visible navigation and interest labels remain available to speech and screen-reader users', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: '主导航' }).getByRole('link', {
    name: '桂航绯想天 GUAT TOUHOU FANS CLUB 首页', exact: true,
  })).toBeVisible()
  await expect(page.getByRole('link', { name: /东方 STG 再来一把，就这一把/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /音乐与现场 一首歌，连接幻想乡/ })).toBeVisible()
})

test('keyboard Tab reaches code and log scroll regions with a visible focus indicator', async ({ page }, info) => {
  // Both desktop and mobile projects exercise a genuinely overflowing viewport.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/activity/991')
  const copy = page.getByRole('button', { name: '复制 mermaid 代码' }).first()
  await copy.focus()
  await page.keyboard.press('Tab')
  const source = page.getByRole('group', { name: 'Mermaid 图表源码（可横向滚动）' }).first()
  await expect(source).toBeFocused()
  await expect(source).toHaveCSS('outline-style', 'solid')
  await expect.poll(() => source.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => source.evaluate(node => node.scrollLeft)).toBeGreaterThan(0)
  await info.attach('keyboard-source-focus', { body: await page.screenshot(), contentType: 'image/png' })
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: '显示图表', exact: true }).first()).toBeFocused()

  await page.goto('/logs')
  await page.getByRole('button', { name: '搜索', exact: true }).focus()
  await page.keyboard.press('Tab')
  const table = page.getByRole('region', { name: '操作日志表格（可横向滚动）' })
  await expect(table).toBeFocused()
  await expect(table).toHaveCSS('outline-style', 'solid')
  await expect.poll(() => table.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => table.evaluate(node => node.scrollLeft)).toBeGreaterThan(0)
  await info.attach('keyboard-table-focus', { body: await page.screenshot(), contentType: 'image/png' })
})
