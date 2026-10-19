import { expect } from '@playwright/test'
import type { APIRequestContext, Locator, Page, Route, TestInfo } from '@playwright/test'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { writeFileSync } from 'node:fs'
// Shared deterministic dataset owned by the public-data worker: raw v1 rows plus
// the isolated v1 server handler. Types come from the sibling `public-data.d.mts`
// declaration, so nothing here re-implements visibility filtering or fixtures.
import * as publicData from '../../fixtures/public-data.mjs'

/**
 * The isolated fixture origins follow the same `E2E_PORT_BASE` derivation as
 * `web/playwright.config.ts`, so a run on its own port base reaches the fixture
 * and app servers that base actually started. Hardcoding the default ports made
 * every archived comparison and upstream read fail with ECONNREFUSED as soon as
 * `E2E_PORT_BASE` moved off 3100.
 */
const portBase = Number(process.env.E2E_PORT_BASE ?? 3100)
export const ARCHIVE_ORIGIN = `http://127.0.0.1:${portBase + 2074}`
export const UPSTREAM_ORIGIN = `http://127.0.0.1:${portBase + 81}`

export interface ActivityItem {
  id: number
  title: string
  tag?: string
  date: string
  description?: string
  cover_image: string
}

export interface ActivitiesPage {
  total: number
  page: number
  limit: number
  items: ActivityItem[]
}

/** The public config allowlist the isolated upstream serves without credentials. */
export function configFixture(): Record<string, unknown> {
  return publicData.publicConfigFixture()
}

/** The exact v1 page the archive renders and the new BFF projects. */
export async function upstreamActivitiesPage(
  request: APIRequestContext,
  query = 'page=1&limit=3'
): Promise<ActivitiesPage> {
  const response = await request.get(`${UPSTREAM_ORIGIN}/api/activities?${query}`)
  if (!response.ok())
    throw new Error(`upstream activities fixture responded ${response.status()}`)
  return (await response.json()) as ActivitiesPage
}

/**
 * Serves the archived app's public reads and uploads from the isolated upstream,
 * so both sites render the same raw v1 response instead of a copied fixture.
 */
export async function useUpstreamFixtures(page: Page): Promise<void> {
  const proxy = (withQuery: boolean) => async (route: Route) => {
    const url = new URL(route.request().url())
    const target = `${UPSTREAM_ORIGIN}${url.pathname}${withQuery ? url.search : ''}`
    await route.fulfill({ response: await route.fetch({ url: target }) })
  }
  await page.route('**/api/**', proxy(true))
  await page.route('**/uploads/**', proxy(false))
}

/** Scrolls the whole page so native lazy images and reveal observers settle. */
export async function settleImages(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = Math.max(300, Math.floor(window.innerHeight * 0.8))
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    }
    window.scrollTo(0, 0)
  })
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          [...document.querySelectorAll('.progressive-image')].every((node) => {
            const state = node.getAttribute('data-image-state')
            return state === 'ready' || state === 'empty' || state === 'error'
          })
        ),
      { timeout: 30_000, message: 'every progressive image settles' }
    )
    .toBe(true)
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          [...document.querySelectorAll('.pi-full')].every(
            (node) => (node as HTMLImageElement).complete
          )
        ),
      { timeout: 30_000, message: 'every rendered image is decoded' }
    )
    .toBe(true)
}

/** The archived preloader is removed on mount; wait for that before capturing. */
export async function waitForArchiveReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle')
  await page
    .locator('#pre-loading-screen')
    .waitFor({ state: 'detached', timeout: 15_000 })
    .catch(() => undefined)
}

type CaptureBytes = Awaited<ReturnType<Locator['screenshot']>>

type DevicePixelCrop = {
  devicePixelRatio: number
  actualRect: { x: number, y: number, width: number, height: number }
  targetDevicePixels: { width: number, height: number }
  excludedDevicePixels: { width: number, height: number }
  rawDevicePixels?: { width: number, height: number }
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000

const shape = (rect: { x: number, y: number, width: number, height: number }) => ({
  x: round3(rect.x), y: round3(rect.y), width: round3(rect.width), height: round3(rect.height)
})

/**
 * An aligned locator screenshot rounds a fractional component box up to the next
 * device pixel, so it can carry one partial row/column of whatever page content
 * sits outside the component. The raw capture is kept and the comparison runs on
 * a geometric crop of it: floor(rect * dpr) taken from the top-left, i.e. every
 * device pixel the component fully covers and nothing else. Cropping the image
 * rather than clipping the page keeps all of that area; a page clip would
 * additionally quantise to whole CSS pixels.
 *
 * Ported from the footer protocol in `layout.spec.ts`.
 */
async function alignedDevicePixelCrop(archive: Locator, current: Locator): Promise<DevicePixelCrop> {
  const archiveRect = await archive.boundingBox()
  const actualRect = await current.boundingBox()
  if (!archiveRect || !actualRect) throw new Error('region bounding box unavailable')
  // Same aligned origin and size on both sides: a different box is a layout
  // difference, not a capture artefact.
  expect(shape(actualRect), 'region bounds differ from the archived site').toEqual(shape(archiveRect))
  expect(shape(actualRect).x).toBe(0)
  expect(shape(actualRect).y).toBe(0)
  const [archiveDpr, devicePixelRatio] = await Promise.all([
    archive.page().evaluate(() => window.devicePixelRatio),
    current.page().evaluate(() => window.devicePixelRatio)
  ])
  expect(devicePixelRatio, 'device pixel ratio differs from the archived page').toBe(archiveDpr)
  // Unrounded geometry: the crop keeps whole device pixels, so at most one
  // fractional device pixel per axis stays outside the comparison.
  const excludedDevicePixels = {
    width: actualRect.width * devicePixelRatio - Math.floor(actualRect.width * devicePixelRatio),
    height: actualRect.height * devicePixelRatio - Math.floor(actualRect.height * devicePixelRatio)
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
      height: Math.floor(actualRect.height * devicePixelRatio)
    },
    excludedDevicePixels
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

/**
 * Captures the same region from the archived page and the new page, stores the
 * archive/new/diff PNGs (plus both uncropped captures) with the test result and
 * requires zero differing pixels.
 *
 * Both regions are first aligned to the same viewport origin, exactly as the
 * footer comparison in `layout.spec.ts` does. A region far down a long page is
 * captured in document space, and the fixed navbar is composited into that
 * capture at the page's scroll offset; the two pages scroll to different
 * offsets (their total heights differ), so the navbar landed on different rows
 * of the two captures and produced a handful of differing pixels in a row that
 * is not part of the region at all. Pinning the region to the origin (above the
 * navbar) removes that and makes the fractional box origin exact, so the
 * device-pixel crop below is well defined.
 */
export async function compareRegion(
  archive: Locator,
  current: Locator,
  name: string,
  info: TestInfo
): Promise<void> {
  const capture = { animations: 'disabled' as const, caret: 'hide' as const }
  const [archiveStyle, currentStyle] = await Promise.all([
    archive.getAttribute('style'),
    current.getAttribute('style')
  ])
  for (const element of [archive, current]) {
    await element.evaluate((node) => {
      Object.assign((node as HTMLElement).style, {
        position: 'fixed', top: '0', left: '0', width: '100%', zIndex: '9999'
      })
    })
  }
  // Both pages start at the same scroll origin so the aligned region and its
  // capture share one coordinate space.
  await Promise.all(
    [archive.page(), current.page()].map(async (page) => { await page.evaluate(() => window.scrollTo(0, 0)) })
  )
  const crop = await alignedDevicePixelCrop(archive, current)
  const rawArchive = await archive.screenshot(capture)
  const rawNuxt = await current.screenshot(capture)
  const archiveCapture = cropCapture(rawArchive, crop, info, `${name}-archive`)
  const nuxtCapture = cropCapture(rawNuxt, crop, info, `${name}-nuxt`)
  crop.rawDevicePixels = archiveCapture.rawDevicePixels
  expect(nuxtCapture.rawDevicePixels).toEqual(archiveCapture.rawDevicePixels)
  for (const [element, style] of [[archive, archiveStyle], [current, currentStyle]] as const) {
    await element.evaluate((node, saved) => {
      if (saved === null) node.removeAttribute('style')
      else node.setAttribute('style', saved)
    }, style)
  }
  writeFileSync(info.outputPath(`${name}-archive.png`), archiveCapture.bytes)
  writeFileSync(info.outputPath(`${name}-nuxt.png`), nuxtCapture.bytes)
  const oldImage = PNG.sync.read(archiveCapture.bytes)
  const newImage = PNG.sync.read(nuxtCapture.bytes)
  expect({ width: newImage.width, height: newImage.height }).toEqual({
    width: oldImage.width,
    height: oldImage.height
  })
  // The compared image is exactly the fully covered device pixels.
  expect(
    { width: oldImage.width, height: oldImage.height },
    'cropped capture differs from the device pixel target'
  ).toEqual(crop.targetDevicePixels)
  const diff = new PNG({ width: oldImage.width, height: oldImage.height })
  const pixels = pixelmatch(
    oldImage.data,
    newImage.data,
    diff.data,
    oldImage.width,
    oldImage.height,
    { threshold: 0.1 }
  )
  writeFileSync(info.outputPath(`${name}-diff.png`), PNG.sync.write(diff))
  writeFileSync(
    info.outputPath(`${name}-comparison.json`),
    JSON.stringify(
      {
        region: name,
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
          rawDevicePixels: crop.rawDevicePixels,
          croppedDevicePixels: { width: oldImage.width, height: oldImage.height },
          targetDevicePixels: crop.targetDevicePixels,
          excludedDevicePixels: crop.excludedDevicePixels,
          excludedCssPixels: {
            width: crop.excludedDevicePixels.width / crop.devicePixelRatio,
            height: crop.excludedDevicePixels.height / crop.devicePixelRatio
          },
          source:
            'geometric whole-device-pixel crop of the region screenshot, aligned to the viewport origin; uncropped capture kept as <region>-raw.png'
        }
      },
      null,
      2
    )
  )
  expect(pixels, `${name}: pixels different from the archived site`).toBe(0)
}
