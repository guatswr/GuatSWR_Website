import { expect, test } from '@playwright/test'

test('real-page navigation menus close with Escape and return focus', async ({ page, isMobile }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto('/activities')
  // Theme activation proves hydration before exercising the navigation.
  await page.getByRole('button', { name: /当前.*模式，切换为/ }).click()
  if (isMobile) {
    const trigger = page.getByRole('button', { name: /^(打开|关闭)导航菜单$/ })
    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  }
  else {
    const trigger = page.locator('#desktop-activities-trigger')
    await trigger.focus()
    await page.keyboard.press('Enter')
    const destination = page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: /活动中心/ })
    await expect(destination).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  }
  expect(errors).toEqual([])
})
