import { expect, test } from '@playwright/test'

test('keyboard navigation and Reka dialog return focus without CSP or hydration errors', async ({ page, isMobile }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto('/__revamp/layout')
  if (isMobile) {
    const trigger = page.getByRole('button', { name: '打开导航菜单' })
    await trigger.click()
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  }
  else {
    const trigger = page.locator('#desktop-activities-trigger')
    await trigger.click()
    await expect(page.getByRole('link', { name: /进行中的活动/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
  }
  const trigger = page.getByRole('button', { name: '查看社群信息' })
  if (isMobile) await trigger.click()
  else {
    await trigger.focus()
    await page.keyboard.press('Enter')
  }
  const dialog = page.getByRole('dialog', { name: '桂航绯想天' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '关闭对话框' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
  await trigger.click()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '关闭对话框' }).click()
  await expect(trigger).toBeFocused()
  expect(errors).toEqual([])
})

test('lazy dialog reports a failed download and works after reload', async ({ context, page }) => {
  await context.addInitScript(() => localStorage.setItem('theme-preference', 'light'))
  await page.goto('/__revamp/layout')
  // The mode label changes only after hydration, before any dialog intent.
  await expect(page.getByRole('button', { name: /当前日间模式/ }).first()).toBeVisible()
  const trigger = page.getByRole('button', { name: '查看社群信息' })
  await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await page.route('**/_nuxt/*.js', route => route.abort('failed'))
  await trigger.click()
  await expect(page.getByRole('alert')).toHaveText('弹窗组件加载失败，请刷新页面后重试。')
  await expect(trigger).not.toHaveAttribute('aria-busy', 'true')
  await page.unroute('**/_nuxt/*.js')
  await page.reload()
  await expect(page.getByRole('button', { name: /当前日间模式/ }).first()).toBeVisible()
  await trigger.click()
  await expect(page.getByRole('dialog', { name: '桂航绯想天' })).toBeVisible()
})
