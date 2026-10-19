/**
 * Scoped support for the public-pages E2E spec.
 *
 * Kept separate from the homepage worker's `support/public-parity.ts` so the
 * two batches do not fight over one file. Nothing here starts a server: it
 * points the archived SPA at the same isolated deterministic upstream the Nuxt
 * app already uses, serves the archived CDN icons from the pinned local files,
 * and provides the archive-vs-new device-pixel comparison.
 */
import { expect } from '@playwright/test'
import type { Locator, Page, TestInfo } from '@playwright/test'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { writeFileSync } from 'node:fs'
// `node:fs`'s `readFile` is the callback API and throws
// `The "cb" argument must be of type function` when awaited; the promise API
// lives in `node:fs/promises`.
import { readFile } from 'node:fs/promises'

/**
 * The isolated fixture origins follow the same `E2E_PORT_BASE` derivation as
 * `web/playwright.config.ts`, so a run on its own port base reaches the
 * fixture and archived SPA servers that base actually started. Hardcoding the
 * default ports made every archived comparison and upstream read fail with
 * ECONNREFUSED as soon as `E2E_PORT_BASE` moved off 3100 (the same bug the
 * sibling `public-parity.ts` / `events-parity.ts` already document).
 */
const portBase = Number(process.env.E2E_PORT_BASE ?? 3100)
export const ARCHIVE_ORIGIN = `http://127.0.0.1:${portBase + 2074}`
export const FIXTURE_ORIGIN = `http://127.0.0.1:${portBase + 81}`

/** Both pages must be compared in the club's own time zone. */
export const CLUB_TIMEZONE = 'Asia/Shanghai'

const rewrite = (rawUrl: string): string => {
  const url = new URL(rawUrl)
  return new URL(`${url.pathname}${url.search}`, FIXTURE_ORIGIN).href
}

/**
 * The archived SPA calls `/api/**` on its own origin and reads `/uploads/**`
 * from its own static root. Forward both to the isolated fixture upstream so
 * the archived page shows exactly the records the new pages show.
 */
export async function proxyArchiveRequests(page: Page): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const response = await route.fetch({ url: rewrite(route.request().url()) })
    await route.fulfill({ response })
  })
  await page.route('**/uploads/**', async (route) => {
    const response = await route.fetch({ url: rewrite(route.request().url()) })
    await route.fulfill({ response })
  })
}

/**
 * Archived CDN asset -> the pinned local file that replaces it. Mirrors
 * `web/public/icons/env/SOURCES.md` (which records the nine archived URLs that
 * answer 404 upstream and the generic mark used for them).
 */
export const ARCHIVED_ICON_FILES: Readonly<Record<string, string>> = Object.freeze({
  'googlechrome/4285f4': 'googlechrome-4285f4.svg',
  'microsoftedge/0ea5e9': 'generic-browser-64748b.svg',
  'firefox/ff7139': 'firefox-ff7139.svg',
  'safari/2563eb': 'safari-2563eb.svg',
  'opera/ff1b2d': 'opera-ff1b2d.svg',
  'brave/f97316': 'brave-f97316.svg',
  'chromium/4b5563': 'googlechrome-4285f4.svg',
  'yandexbrowser/ff0000': 'generic-browser-64748b.svg',
  'ucbrowser/ff9a00': 'generic-browser-64748b.svg',
  'qq/12b7f5': 'qq-12b7f5.svg',
  '360/00a4ff': 'generic-browser-64748b.svg',
  'internetexplorer/64748b': 'generic-browser-64748b.svg',
  'windows/1e3a8a': 'generic-desktop-64748b.svg',
  'apple/111827': 'apple-111827.svg',
  'apple/6b7280': 'apple-6b7280.svg',
  'android/22c55e': 'android-22c55e.svg',
  'linux/7c3aed': 'linux-7c3aed.svg',
  'googlechromeos/4285f4': 'googlechrome-4285f4.svg',
  'gnome/64748b': 'gnome-64748b.svg',
  'windows/64748b': 'generic-desktop-64748b.svg',
  'robotframework/0ea5e9': 'robotframework-0ea5e9.svg',
  'devices/64748b': 'generic-device-64748b.svg',
})

/**
 * Serve the archived page's icon requests from the pinned local files, so the
 * old and the new page render the same bytes with no live-network drift. The
 * new page requests nothing external at all.
 */
export async function routeArchiveIcons(page: Page): Promise<void> {
  await page.route('https://cdn.simpleicons.org/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/+/, '')
    const file = ARCHIVED_ICON_FILES[path]
    if (!file) {
      await route.abort()
      return
    }
    const bytes = await readFile(new URL(`../../../public/icons/env/${file}`, import.meta.url))
    await route.fulfill({ body: bytes, contentType: 'image/svg+xml' })
  })
}

export function trackExternalRequests(page: Page): string[] {
  const external: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (!url.startsWith('http://127.0.0.1')) external.push(url)
  })
  return external
}

/**
 * Fixture images that are laid out must be decoded before a crop is taken; a
 * hidden lazy image is skipped rather than awaited forever, and a broken one
 * resolves so the pixel comparison still reports the difference.
 */
export async function waitForVisibleImages(locator: Locator): Promise<void> {
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
          setTimeout(settle, 5_000)
        })
      }
      await image.decode().catch(() => {})
    }))
  })
}

type CaptureBytes = Awaited<ReturnType<Locator['screenshot']>>

interface DevicePixelCrop {
  readonly devicePixelRatio: number
  readonly actualRect: { x: number, y: number, width: number, height: number }
  readonly archiveRect: { x: number, y: number, width: number, height: number }
  readonly targetDevicePixels: { width: number, height: number }
  readonly excludedDevicePixels: { width: number, height: number }
  rawDevicePixels?: { width: number, height: number }
}

const round = (value: number): number => Math.round(value * 1000) / 1000

const shape = (rect: { x: number, y: number, width: number, height: number }) => ({
  x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height),
})

/**
 * An aligned locator screenshot rounds a fractional component box up to the next
 * device pixel, so it can carry one partial row/column of whatever sits outside
 * the component. The raw capture is kept and the comparison runs on a geometric
 * crop of it: floor(rect * dpr) from the top-left, i.e. every device pixel the
 * component fully covers and nothing else.
 */
async function devicePixelCrop(reference: Locator, current: Locator, name: string): Promise<DevicePixelCrop> {
  const archiveRect = await reference.boundingBox()
  const actualRect = await current.boundingBox()
  if (!archiveRect || !actualRect) throw new Error(`${name}: bounding box unavailable`)
  // Rect parity: same size on both sides, otherwise the difference is layout.
  expect(shape(actualRect).width, `${name}: width differs from the archived site`)
    .toBe(shape(archiveRect).width)
  expect(shape(actualRect).height, `${name}: height differs from the archived site`)
    .toBe(shape(archiveRect).height)
  const [archiveDpr, devicePixelRatio] = await Promise.all([
    reference.page().evaluate(() => window.devicePixelRatio),
    current.page().evaluate(() => window.devicePixelRatio),
  ])
  expect(devicePixelRatio, `${name}: device pixel ratio differs from the archived page`).toBe(archiveDpr)
  const excludedDevicePixels = {
    width: actualRect.width * devicePixelRatio - Math.floor(actualRect.width * devicePixelRatio),
    height: actualRect.height * devicePixelRatio - Math.floor(actualRect.height * devicePixelRatio),
  }
  expect(excludedDevicePixels.width, `${name}: more than one partial device pixel excluded`).toBeLessThanOrEqual(1 + Number.EPSILON)
  expect(excludedDevicePixels.height, `${name}: more than one partial device pixel excluded`).toBeLessThanOrEqual(1 + Number.EPSILON)
  return {
    devicePixelRatio,
    actualRect: shape(actualRect),
    archiveRect: shape(archiveRect),
    targetDevicePixels: {
      width: Math.floor(actualRect.width * devicePixelRatio),
      height: Math.floor(actualRect.height * devicePixelRatio),
    },
    excludedDevicePixels,
  }
}

/** Keep the uncropped capture, then cut the fully covered device pixels out. */
function cropCapture(rawBytes: CaptureBytes, crop: DevicePixelCrop, info: TestInfo, label: string) {
  const raw = PNG.sync.read(rawBytes)
  const target = crop.targetDevicePixels
  expect(raw.width, `${label}: raw capture is narrower than the device pixel crop`).toBeGreaterThanOrEqual(target.width)
  expect(raw.height, `${label}: raw capture is shorter than the device pixel crop`).toBeGreaterThanOrEqual(target.height)
  writeFileSync(info.outputPath(`${label}-raw.png`), rawBytes)
  const cropped = new PNG({ width: target.width, height: target.height })
  PNG.bitblt(raw, cropped, 0, 0, target.width, target.height, 0, 0)
  return { bytes: PNG.sync.write(cropped), rawDevicePixels: { width: raw.width, height: raw.height } }
}

/**
 * Archive-vs-new comparison: same data, same viewport, same theme, reduced
 * motion, settled images, whole-device-pixel crop, zero differing pixels. Raw,
 * archive, new and diff PNGs are written next to the report for inspection.
 */
export async function compareToArchive(
  reference: Locator,
  current: Locator,
  name: string,
  info: TestInfo,
): Promise<void> {
  const options = { animations: 'disabled' as const, caret: 'hide' as const }
  await waitForVisibleImages(reference)
  await waitForVisibleImages(current)
  await Promise.all([reference.page(), current.page()].map(async (page) => {
    await page.evaluate(() => window.scrollTo(0, 0))
  }))
  const crop = await devicePixelCrop(reference, current, name)
  const archiveCapture = cropCapture(await reference.screenshot(options), crop, info, `${name}-archive`)
  const newCapture = cropCapture(await current.screenshot(options), crop, info, `${name}-nuxt`)
  crop.rawDevicePixels = archiveCapture.rawDevicePixels
  expect(newCapture.rawDevicePixels).toEqual(archiveCapture.rawDevicePixels)

  const oldBytes = archiveCapture.bytes
  const newBytes = newCapture.bytes
  writeFileSync(info.outputPath(`${name}-archive.png`), oldBytes)
  writeFileSync(info.outputPath(`${name}-nuxt.png`), newBytes)
  const oldImage = PNG.sync.read(oldBytes)
  const newImage = PNG.sync.read(newBytes)
  expect({ width: newImage.width, height: newImage.height }).toEqual({ width: oldImage.width, height: oldImage.height })
  expect({ width: oldImage.width, height: oldImage.height }, `${name}: cropped capture differs from the device pixel target`)
    .toEqual(crop.targetDevicePixels)

  const diff = new PNG({ width: oldImage.width, height: oldImage.height })
  const pixels = pixelmatch(oldImage.data, newImage.data, diff.data, oldImage.width, oldImage.height, { threshold: 0.1 })
  writeFileSync(info.outputPath(`${name}-diff.png`), PNG.sync.write(diff))
  writeFileSync(info.outputPath(`${name}-comparison.json`), JSON.stringify({
    component: name,
    project: info.project.name,
    state: info.title,
    width: oldImage.width,
    height: oldImage.height,
    differingPixels: pixels,
    pixelmatchThreshold: 0.1,
    includeAntialias: false,
    capture: {
      devicePixelRatio: crop.devicePixelRatio,
      actualRect: crop.actualRect,
      archiveRect: crop.archiveRect,
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
  }, null, 2))
  expect(pixels, `${name}: pixels different from the archived site`).toBe(0)
}
