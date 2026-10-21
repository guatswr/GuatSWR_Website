import { expect, test } from '@playwright/test'
import { auditAccessibility, collectAccessibility } from './support/accessibility-audit'

test('visible navigation and interest labels remain available to speech and screen-reader users', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: '主导航' }).getByRole('link', {
    name: '桂航绯想天 GUAT TOUHOU FANS CLUB 首页', exact: true,
  })).toBeVisible()
  await expect(page.getByRole('link', { name: /东方 STG 再来一把，就这一把/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /音乐与现场 一首歌，连接幻想乡/ })).toBeVisible()
})

for (const theme of ['light', 'dark'] as const) {
  test(`approved filters and log control; expanded panel diagnostic (${theme})`, async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(value => localStorage.setItem('theme-preference', value), theme)
    await page.goto('/members')
    for (const school of ['桂航', '桂电']) {
      await page.locator('main a[href*="school="]').filter({ hasText: school }).first().click()
      const selected = page.locator('main a[aria-current="page"]')
      await expect(selected).toContainText(school)
      await expect(selected).toHaveClass(/is-selected/)
      await auditAccessibility(page, info, `school-${school}`)
    }
    await page.goto('/logs')
    await page.mouse.move(0, 0)
    const rules = page.getByRole('button', { name: /^(如何计算贡献？|收起算法说明)$/ })
    await expect(rules).toHaveCSS('color', theme === 'dark' ? 'rgb(165, 180, 252)' : 'rgb(79, 70, 229)')
    await rules.click()
    await expect(page.getByText('贡献值计算规则', { exact: true })).toBeVisible()
    if (theme === 'dark') {
      // Outside the bounded visual approval: collect all findings without
      // declaring this panel WCAG-compliant or weakening the closed-state gate.
      await collectAccessibility(page, info, 'UNACCEPTED-expanded-dark-log-rules')
      info.annotations.push({ type: 'open-accessibility-debt', description: 'Expanded dark log rules contrast needs its own visual decision; checklist #80 stays open.' })
    }
    else await auditAccessibility(page, info, 'expanded-log-rules')
    await info.attach('expanded-log-rules', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
    const canHover = await page.evaluate(() => matchMedia('(hover: hover)').matches)
    if (canHover) {
      await rules.hover()
      await expect(rules).toHaveCSS('color', 'rgb(67, 56, 202)')
      if (theme === 'light') await auditAccessibility(page, info, 'hovered-log-rules')
      else await collectAccessibility(page, info, 'UNACCEPTED-hovered-dark-log-rules')
    }
    else await expect(rules).toHaveCSS('color', theme === 'dark' ? 'rgb(165, 180, 252)' : 'rgb(79, 70, 229)')
    // Default-label correction must preserve the archived hover interaction.
    // This checks the original white foreground, not a WCAG hover-pass claim.
    if (theme === 'light' && canHover) {
      await page.mouse.move(0, 0)
      await page.goto('/events/stg')
      const signup = page.getByRole('button', { name: '我要参加' }).first()
      await expect(signup).toHaveCSS('color', 'rgb(3, 105, 161)')
      await signup.hover()
      await expect(signup).toHaveCSS('color', 'rgb(255, 255, 255)')
    }
  })

  test(`history bookmark links retain keyboard navigation and active states (${theme})`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(value => localStorage.setItem('theme-preference', value), theme)
    await page.goto('/history')
    const bookmark = page.locator('.history-bookmark')
    await expect(bookmark).toBeVisible()
    const monthLinks = bookmark.locator('.history-bookmark-month')
    await expect(monthLinks.first()).toBeVisible()
    await monthLinks.first().focus()
    await expect(monthLinks.first()).toHaveCSS('outline-style', 'solid')
    await page.keyboard.press('Enter')
    await expect(monthLinks.first()).toHaveAttribute('aria-current', 'true')
    await info.attach('history-bookmark-target', { body: await page.screenshot(), contentType: 'image/png' })
  })
}

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
