import { expect } from '@playwright/test'
import type { APIRequestContext, Locator, Page, Route, TestInfo } from '@playwright/test'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { writeFileSync } from 'node:fs'
// Shared deterministic dataset owned by the public-data worker: raw v1 rows plus
// the isolated v1 server handler. Types come from the sibling `public-data.d.mts`
// declaration, so nothing here re-implements visibility filtering or fixtures.
import * as publicData from '../../fixtures/public-data.mjs'

export const ARCHIVE_ORIGIN = 'http://127.0.0.1:5174'
export const UPSTREAM_ORIGIN = 'http://127.0.0.1:3181'

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

/**
 * Captures the same region from the archived page and the new page, stores the
 * archive/new/diff PNGs with the test result and requires zero differing pixels.
 */
export async function compareRegion(
  archive: Locator,
  current: Locator,
  name: string,
  info: TestInfo
): Promise<void> {
  const capture = { animations: 'disabled' as const, caret: 'hide' as const }
  const oldBytes = await archive.screenshot(capture)
  const newBytes = await current.screenshot(capture)
  writeFileSync(info.outputPath(`${name}-archive.png`), oldBytes)
  writeFileSync(info.outputPath(`${name}-nuxt.png`), newBytes)
  const oldImage = PNG.sync.read(oldBytes)
  const newImage = PNG.sync.read(newBytes)
  expect({ width: newImage.width, height: newImage.height }).toEqual({
    width: oldImage.width,
    height: oldImage.height
  })
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
        includeAntialias: false
      },
      null,
      2
    )
  )
  expect(pixels, `${name}: pixels different from the archived site`).toBe(0)
}
