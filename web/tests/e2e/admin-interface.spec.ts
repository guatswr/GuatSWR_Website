import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const base = Number(process.env.E2E_PORT_BASE ?? 3100)
const fixture = `http://127.0.0.1:${base + 82}`
async function login(page: Page, username = 'admin') {
  await page.goto('/login')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password', { exact: true }).fill(username === 'admin' ? 'adminpass' : 'secondpass')
  if (username === 'second') await page.getByLabel('二步密码 (可选)').fill('123456')
  await page.getByRole('button', { name: '登录系统', exact: true }).click()
  await page.getByRole('button', { name: '进入管理端', exact: true }).click()
  await expect(page.getByRole('heading', { name: '工作台', exact: true })).toBeVisible()
}
test.beforeEach(async ({ request, page }) => {
  expect((await request.post(`${fixture}/__fixture/admin`, { data: { enable: true } })).ok()).toBe(true)
  await page.addInitScript(() => { if (!localStorage.getItem('theme-preference')) localStorage.setItem('theme-preference', 'light') })
})

test('workspace navigation, theme, keyboard focus and member search work without hover', async ({ page }, info) => {
  await login(page)
  const mobile = info.project.name === 'mobile'
  if (mobile) {
    const toggle = page.getByRole('button', { name: /^(展开|收起)管理导航$/ })
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await page.getByRole('navigation', { name: '移动管理导航' }).getByRole('link', { name: '住民管理' }).focus()
    await page.keyboard.press('Escape')
    await expect(toggle).toBeFocused()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    await page.getByRole('navigation', { name: '移动管理导航' }).getByRole('link', { name: '住民管理' }).click()
    await expect(page.getByRole('navigation', { name: '移动管理导航' })).toHaveCount(0)
  } else {
    const link = page.getByRole('navigation', { name: '管理导航', exact: true }).getByRole('link', { name: '住民管理' })
    await link.focus(); await page.keyboard.press('Enter')
    await expect(link).toHaveAttribute('aria-current', 'page')
  }
  await expect(page.getByRole('main')).toBeFocused()
  await expect(page.getByTestId('admin-member-card').first()).toBeVisible()
  const card = page.getByTestId('admin-member-card').first()
  const memberName = await card.locator('h3').innerText()
  await page.getByLabel('搜索成员', { exact: true }).fill('this-member-does-not-exist-2026')
  await expect(page.getByText('没有找到匹配的成员', { exact: true })).toBeVisible()
  await page.getByLabel('搜索成员', { exact: true }).fill(memberName)
  await expect(page.getByTestId('admin-member-card')).toHaveCount(1)
  await expect(card.getByRole('button', { name: '编辑', exact: true })).toBeVisible()
  await expect(card.getByRole('button', { name: '删除', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '切换为夜间模式' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByRole('button', { name: '切换为日间模式' })).toBeVisible()
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByLabel('昵称', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: '切换为日间模式' }).click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await page.setViewportSize({ width: 320, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expect(page.getByRole('button', { name: '退出', exact: true })).toBeInViewport()
})

for (const group of [
  [{ path: '', heading: '工作台' }, { path: '/members', heading: '住民管理' }, { path: '/history', heading: '群史管理' }, { path: '/config', heading: '站点设置' }],
  [{ path: '/home-links', heading: '首页链接' }, { path: '/logs', heading: '操作日志' }, { path: '/users', heading: '账号与权限' }, { path: '/backups', heading: '备份管理' }, { path: '/profile', heading: '个人设置' }],
]) test(`modern interface has named controls and contained layout: ${group.map(page => page.heading).join(', ')}`, async ({ page }, info) => {
  test.setTimeout(90_000)
  await login(page)
  for (const entry of group) {
    await page.goto(`/admin${entry.path}`)
    await expect(page.getByRole('heading', { name: entry.heading, exact: true }).first()).toBeVisible()
    await expect(page.locator('.admin-panel, .admin-welcome').first()).toBeVisible()
    await expect(page.locator('.admin-empty[role="status"]')).toHaveCount(0)
    await page.evaluate(() => document.fonts.ready)
    for (const theme of ['light', 'dark']) {
      const themeButton = page.getByRole('button', { name: theme === 'light' ? '切换为日间模式' : '切换为夜间模式' })
      if (await themeButton.count()) await themeButton.click()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      const unnamed = await page.locator('.admin-content input, .admin-content select, .admin-content textarea').evaluateAll(elements => elements.filter(element => {
        const input = element as HTMLInputElement
        return input.getClientRects().length && !input.labels?.length && !input.getAttribute('aria-label') && !input.getAttribute('aria-labelledby')
      }).map(element => element.outerHTML))
      expect(unnamed, `${entry.path} visible controls must have an accessible name`).toEqual([])
      const escaping = await page.locator('.admin-field > input, .admin-field > textarea, .admin-field > select').evaluateAll(elements => elements.filter(element => {
        if (!element.getClientRects().length) return false
        const field = element.parentElement!.getBoundingClientRect(), control = element.getBoundingClientRect()
        return control.left < field.left - 0.1 || control.right > field.right + 0.1 || (element.tagName !== 'TEXTAREA' && control.height > 52)
      }).map(element => element.id))
      expect(escaping, `${entry.path} controls must stay within their field and keep a usable height`).toEqual([])
      await info.attach(`${entry.heading}-${theme}`, { body: await page.screenshot({ fullPage: true, animations: 'disabled' }), contentType: 'image/png' })
    }
  }
})

test('ordinary administrators see permitted navigation and cannot enter super-admin pages', async ({ page }) => {
  await login(page, 'second')
  const toggle = page.getByRole('button', { name: '展开管理导航' })
  if (await toggle.isVisible()) await toggle.click()
  await expect(page.getByRole('link', { name: '账号与权限', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: '备份管理', exact: true })).toHaveCount(0)
  expect((await page.request.get('/api/bff/admin/users')).status()).toBe(403)
  expect((await page.request.get('/api/bff/admin/backups')).status()).toBe(403)
  await page.goto('/admin/users')
  await expect(page.getByRole('heading', { name: '权限不足', exact: true })).toBeVisible()
  await expect(page.getByTestId('admin-user-card')).toHaveCount(0)
})
