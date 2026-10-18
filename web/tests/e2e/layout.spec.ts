import { expect, test } from '@playwright/test'
import type { Locator, TestInfo } from '@playwright/test'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { writeFileSync } from 'node:fs'

async function compareToArchive(reference: Locator, current: Locator, name: string, info: TestInfo) {
  const options = { animations: 'disabled' as const, caret: 'hide' as const }
  const oldStyle = await reference.getAttribute('style')
  const newStyle = await current.getAttribute('style')
  if (name === 'footer') {
    // Different page heights can place a crop at fractional device-pixel
    // origins. Align both isolated components to the same origin first.
    for (const element of [reference, current]) {
      await element.evaluate((node) => {
        Object.assign((node as HTMLElement).style, { position: 'fixed', top: '0', left: '0', width: '100%', zIndex: '9999' })
      })
    }
  }
  const oldBytes = await reference.screenshot(options)
  const newBytes = await current.screenshot(options)
  for (const [element, style] of [[reference, oldStyle], [current, newStyle]] as const) {
    await element.evaluate((node, saved) => {
      if (saved === null) node.removeAttribute('style')
      else node.setAttribute('style', saved)
    }, style)
  }
  writeFileSync(info.outputPath(`${name}-archive.png`), oldBytes)
  writeFileSync(info.outputPath(`${name}-nuxt.png`), newBytes)
  const oldImage = PNG.sync.read(oldBytes)
  const newImage = PNG.sync.read(newBytes)
  expect({ width: newImage.width, height: newImage.height }).toEqual({ width: oldImage.width, height: oldImage.height })
  const diff = new PNG({ width: oldImage.width, height: oldImage.height })
  const pixels = pixelmatch(oldImage.data, newImage.data, diff.data, oldImage.width, oldImage.height, { threshold: 0.1 })
  writeFileSync(info.outputPath(`${name}-diff.png`), PNG.sync.write(diff))
  writeFileSync(info.outputPath(`${name}-comparison.json`), JSON.stringify({
    component: name, project: info.project.name, state: info.title,
    width: oldImage.width, height: oldImage.height, differingPixels: pixels,
    pixelmatchThreshold: 0.1, includeAntialias: false,
  }, null, 2))
  // Same browser, same data, same viewport: unexpected layout/colour changes fail.
  expect(pixels, `${name}: pixels different from the archived site`).toBe(0)
}

for (const theme of ['light', 'dark'] as const) {
  test(`navigation and footer match archived ${theme} layout`, async ({ context, page, request, isMobile }, info) => {
    await context.addInitScript(mode => localStorage.setItem('theme-preference', mode), theme)
    const config = await (await request.get('/api/config')).json()
    const archive = await context.newPage()
    await archive.route('**/api/**', route => route.fulfill({ json: config }))
    await archive.emulateMedia({ reducedMotion: 'reduce' })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await archive.goto('http://127.0.0.1:5174/join')
    await page.goto('/__revamp/layout')
    await expect(archive.locator('.route-progress__bar')).toHaveCSS('opacity', '0', { timeout: 12_000 })
    await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await expect(archive.locator('html')).toHaveAttribute('data-theme', theme)
    await expect(page.getByRole('button', { name: theme === 'dark' ? /当前夜间模式/ : /当前日间模式/ }).first()).toBeVisible()
    await compareToArchive(archive.getByRole('navigation', { name: '主导航' }), page.getByRole('navigation', { name: '主导航' }), 'navbar', info)
    await compareToArchive(archive.getByRole('contentinfo'), page.getByRole('contentinfo'), 'footer', info)
    if (isMobile) {
      await archive.getByRole('button', { name: '打开导航菜单' }).click()
      await page.getByRole('button', { name: '打开导航菜单' }).click()
      await compareToArchive(archive.getByRole('navigation', { name: '主导航' }), page.getByRole('navigation', { name: '主导航' }), 'mobile-menu', info)
    }
    await archive.close()
  })
}

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
