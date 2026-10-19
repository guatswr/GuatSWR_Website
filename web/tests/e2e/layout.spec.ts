import { expect, test } from '@playwright/test'
import type { Locator, TestInfo } from '@playwright/test'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { writeFileSync } from 'node:fs'
import { ARCHIVE_ORIGIN, UPSTREAM_ORIGIN } from './support/public-parity'

// Fixture images that are laid out must be loaded and decoded before a crop is
// taken; a hidden lazy image is skipped rather than awaited forever, and a
// broken one resolves so the pixel comparison still reports the difference.
async function waitForVisibleImages(locator: Locator) {
  await locator.locator('img').evaluateAll(async (nodes) => {
    const visible = nodes.map(node => node as HTMLImageElement).filter((image) => {
      const rect = image.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0 && getComputedStyle(image).visibility !== 'hidden'
    })
    await Promise.all(visible.map(async (image) => {
      if (!image.complete) {
        await new Promise<void>((resolve) => {
          const settle = () => resolve()
          image.addEventListener('load', settle, { once: true })
          image.addEventListener('error', settle, { once: true })
          setTimeout(settle, 5000)
        })
      }
      await image.decode().catch(() => {})
    }))
  })
}

type CaptureBytes = Awaited<ReturnType<Locator['screenshot']>>

type DevicePixelCrop = {
  devicePixelRatio: number
  actualRect: { x: number, y: number, width: number, height: number }
  targetDevicePixels: { width: number, height: number }
  excludedDevicePixels: { width: number, height: number }
  rawDevicePixels?: { width: number, height: number }
}

// An aligned locator screenshot rounds a fractional component box up to the
// next device pixel, so it can carry one partial row/column of whatever page
// content sits outside the component. The raw capture is kept and the
// comparison runs on a geometric crop of it: floor(rect * dpr) taken from the
// top-left, i.e. every device pixel the component fully covers and nothing
// else. Cropping the image rather than clipping the page keeps all of that
// area; a page clip would additionally quantise to whole CSS pixels.
async function footerDevicePixelCrop(reference: Locator, current: Locator): Promise<DevicePixelCrop> {
  const archiveRect = await reference.boundingBox()
  const actualRect = await current.boundingBox()
  if (!archiveRect || !actualRect) throw new Error('footer bounding box unavailable')
  const round = (value: number) => Math.round(value * 1000) / 1000
  const shape = (rect: { x: number, y: number, width: number, height: number }) => ({
    x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height),
  })
  // Same aligned origin and size on both sides: a different box is a layout
  // difference, not a capture artefact.
  expect(shape(actualRect), 'footer bounds differ from the archived site').toEqual(shape(archiveRect))
  expect(shape(actualRect).x).toBe(0)
  expect(shape(actualRect).y).toBe(0)
  const [archiveDpr, devicePixelRatio] = await Promise.all([
    reference.page().evaluate(() => window.devicePixelRatio),
    current.page().evaluate(() => window.devicePixelRatio),
  ])
  expect(devicePixelRatio, 'device pixel ratio differs from the archived page').toBe(archiveDpr)
  // Unrounded geometry: the crop keeps whole device pixels, so at most one
  // fractional device pixel per axis stays outside the comparison.
  const excludedDevicePixels = {
    width: actualRect.width * devicePixelRatio - Math.floor(actualRect.width * devicePixelRatio),
    height: actualRect.height * devicePixelRatio - Math.floor(actualRect.height * devicePixelRatio),
  }
  expect(excludedDevicePixels.width).toBeGreaterThanOrEqual(0)
  expect(excludedDevicePixels.height).toBeGreaterThanOrEqual(0)
  expect(excludedDevicePixels.width).toBeLessThanOrEqual(1 + Number.EPSILON)
  expect(excludedDevicePixels.height).toBeLessThanOrEqual(1 + Number.EPSILON)
  return {
    devicePixelRatio,
    actualRect: shape(actualRect),
    targetDevicePixels: {
      width: Math.floor(actualRect.width * devicePixelRatio),
      height: Math.floor(actualRect.height * devicePixelRatio),
    },
    excludedDevicePixels,
  }
}

// Keep the uncropped capture beside the cropped one so the excluded border can
// be inspected, then cut the fully covered device pixels out of it.
function cropCapture(rawBytes: CaptureBytes, crop: DevicePixelCrop, info: TestInfo, label: string) {
  const raw = PNG.sync.read(rawBytes)
  const target = crop.targetDevicePixels
  expect(raw.width, `${label}: raw capture is narrower than the device pixel crop`).toBeGreaterThanOrEqual(target.width)
  expect(raw.height, `${label}: raw capture is shorter than the device pixel crop`).toBeGreaterThanOrEqual(target.height)
  writeFileSync(info.outputPath(`${label}-raw.png`), rawBytes)
  const cropped = new PNG({ width: target.width, height: target.height })
  // PNG.sync.read returns a plain object, so use the static form.
  PNG.bitblt(raw, cropped, 0, 0, target.width, target.height, 0, 0)
  return { bytes: PNG.sync.write(cropped), rawDevicePixels: { width: raw.width, height: raw.height } }
}

async function compareToArchive(reference: Locator, current: Locator, name: string, info: TestInfo) {
  const options = { animations: 'disabled' as const, caret: 'hide' as const }
  await waitForVisibleImages(reference)
  await waitForVisibleImages(current)
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
  let crop: DevicePixelCrop | undefined
  if (name === 'footer') {
    // Both pages start at the same scroll origin so the aligned component and
    // its capture share one coordinate space.
    await Promise.all([reference.page(), current.page()].map(async (page) => { await page.evaluate(() => window.scrollTo(0, 0)) }))
    crop = await footerDevicePixelCrop(reference, current)
  }
  let oldBytes = await reference.screenshot(options)
  let newBytes = await current.screenshot(options)
  if (crop) {
    const archiveCapture = cropCapture(oldBytes, crop, info, `${name}-archive`)
    const nuxtCapture = cropCapture(newBytes, crop, info, `${name}-nuxt`)
    oldBytes = archiveCapture.bytes
    newBytes = nuxtCapture.bytes
    crop.rawDevicePixels = archiveCapture.rawDevicePixels
    expect(nuxtCapture.rawDevicePixels).toEqual(archiveCapture.rawDevicePixels)
  }
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
  if (crop) {
    // The compared image is exactly the fully covered device pixels.
    expect({ width: oldImage.width, height: oldImage.height }, 'cropped capture differs from the device pixel target')
      .toEqual(crop.targetDevicePixels)
  }
  const diff = new PNG({ width: oldImage.width, height: oldImage.height })
  const pixels = pixelmatch(oldImage.data, newImage.data, diff.data, oldImage.width, oldImage.height, { threshold: 0.1 })
  writeFileSync(info.outputPath(`${name}-diff.png`), PNG.sync.write(diff))
  writeFileSync(info.outputPath(`${name}-comparison.json`), JSON.stringify({
    component: name, project: info.project.name, state: info.title,
    width: oldImage.width, height: oldImage.height, differingPixels: pixels,
    pixelmatchThreshold: 0.1, includeAntialias: false,
    ...(crop ? {
      capture: {
        devicePixelRatio: crop.devicePixelRatio,
        actualRect: crop.actualRect,
        rawDevicePixels: crop.rawDevicePixels,
        croppedDevicePixels: { width: oldImage.width, height: oldImage.height },
        targetDevicePixels: crop.targetDevicePixels,
        excludedDevicePixels: crop.excludedDevicePixels,
        excludedCssPixels: {
          width: crop.excludedDevicePixels.width / crop.devicePixelRatio,
          height: crop.excludedDevicePixels.height / crop.devicePixelRatio,
        },
        source: 'geometric whole-device-pixel crop of the aligned locator screenshot; uncropped capture kept as <name>-raw.png',
      },
    } : {}),
  }, null, 2))
  // Same browser, same data, same viewport: unexpected layout/colour changes fail.
  expect(pixels, `${name}: pixels different from the archived site`).toBe(0)
}

// Typography parity for the small numeric labels in the mobile menu. The crop
// comparison above only reports "some pixels differ"; this records the actual
// computed style and geometry of every label so a regression names the cause
// (for example an inherited line-height that changed with the Tailwind major).
// It returns the measurements instead of asserting, so the JSON is on disk
// before the zero-pixel comparison can abort the test.
async function captureNumericLabelMetrics(reference: Locator, current: Locator, info: TestInfo) {
  const read = (container: Locator) => container.locator('.nav-number').evaluateAll(nodes => nodes.map((node) => {
    const element = node as HTMLElement
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    const parentRect = element.parentElement?.getBoundingClientRect() ?? rect
    const round = (value: number) => Math.round(value * 1000) / 1000
    return {
      text: element.textContent?.trim() ?? '',
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      width: round(rect.width),
      height: round(rect.height),
      // Offsets are relative to the label's own parent so the numbers stay
      // meaningful if the two pages scroll differently; the crop comparison
      // covers absolute placement.
      offsetX: round(rect.x - parentRect.x),
      offsetY: round(rect.y - parentRect.y),
    }
  }))
  const [archive, nuxt] = await Promise.all([read(reference), read(current)])
  // Written beside the screenshots so the uploaded failure artifact carries
  // the measurements, not just a diff image.
  writeFileSync(info.outputPath('nav-number-metrics.json'), JSON.stringify({
    component: 'nav-number', project: info.project.name, state: info.title, archive, nuxt,
  }, null, 2))
  return { archive, nuxt }
}

for (const theme of ['light', 'dark'] as const) {
  test(`navigation and footer match archived ${theme} layout`, async ({ context, page, request, isMobile }, info) => {
    await context.addInitScript(mode => localStorage.setItem('theme-preference', mode), theme)
    const config = await (await request.get('/api/config')).json()
    const archive = await context.newPage()
    await archive.route('**/api/**', route => route.fulfill({ json: config }))
    // The archived page now receives the same config, which points at
    // /uploads/**. Its static server has no uploads tree, so the same exact
    // paths are relayed from the deterministic isolated fixture origin instead
    // of 404ing into a different brand fallback.
    await archive.route('**/uploads/**', async (route) => {
      const { pathname } = new URL(route.request().url())
      await route.fulfill({ response: await request.get(`${UPSTREAM_ORIGIN}${pathname}`) })
    })
    await archive.emulateMedia({ reducedMotion: 'reduce' })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await archive.goto(`${ARCHIVE_ORIGIN}/join`)
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
      const numericLabels = await captureNumericLabelMetrics(archive.locator('#mobile-navigation'), page.locator('#mobile-navigation'), info)
      await compareToArchive(archive.getByRole('navigation', { name: '主导航' }), page.getByRole('navigation', { name: '主导航' }), 'mobile-menu', info)
      expect(numericLabels.nuxt, 'mobile numeric label typography differs from the archived site').toEqual(numericLabels.archive)
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
