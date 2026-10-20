import { expect } from '@playwright/test'
import { projectApprovedAccessibility } from './approved-accessibility'
import type { APIRequestContext, Locator, Page, TestInfo } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { compareToArchive } from './public-pages'

/**
 * Event-batch test support. Kept in its own file so it never collides with the
 * homepage/public-data helpers.
 */

/**
 * The isolated fixture origins follow the same `E2E_PORT_BASE` derivation as
 * `web/playwright.config.ts`, so a run on its own port base reaches the fixture
 * and app servers that base actually started. Hardcoding the default ports made
 * every archive/upstream read fail as soon as `E2E_PORT_BASE` moved off 3100.
 */
const portBase = Number(process.env.E2E_PORT_BASE ?? 3100)
export const ARCHIVE_ORIGIN = `http://127.0.0.1:${portBase + 2074}`
export const UPSTREAM_ORIGIN = `http://127.0.0.1:${portBase + 81}`

export const EVENT_CATEGORIES = [
  { path: '/events/bounty', type: '悬赏令', title: '悬赏令', subtitle: '发布你的挑战与奖励，等待同好们来接单。' },
  { path: '/events/betting', type: '对赌协议', title: '对赌协议', subtitle: '这使你充满了决心！' },
  { path: '/events/stg', type: 'STG', title: 'STG', subtitle: '欢迎STGer报名参加！' },
  { path: '/events/zetime', type: '则则', title: '则则', subtitle: '则批大本营，欢迎各位则批报名参加！' },
  { path: '/events/party', type: '线下聚会', title: '线下聚会', subtitle: '小聚、大聚、饭聚 都可以聚！' }
] as const

export interface EventItem {
  id: number
  type: string
  title: string
  status: string
  content: Record<string, unknown>
}

export interface EventsPage {
  total: number
  page: number
  limit: number
  items: EventItem[]
}

/** The exact v1 response the archived app renders and the new BFF projects. */
export async function upstreamEventsPage(
  request: APIRequestContext,
  type: string,
  limit = 50
): Promise<EventsPage> {
  const response = await request.get(
    `${UPSTREAM_ORIGIN}/api/event?type=${encodeURIComponent(type)}&limit=${limit}`
  )
  if (!response.ok())
    throw new Error(`upstream event fixture responded ${response.status()}`)
  return (await response.json()) as EventsPage
}

/** Serves the archived app's reads/uploads from the isolated upstream. */
export async function useUpstreamFixtures(page: Page): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    await route.fulfill({
      response: await route.fetch({ url: `${UPSTREAM_ORIGIN}${url.pathname}${url.search}` })
    })
  })
  await page.route('**/uploads/**', async (route) => {
    const url = new URL(route.request().url())
    await route.fulfill({ response: await route.fetch({ url: `${UPSTREAM_ORIGIN}${url.pathname}` }) })
  })
}

export interface GuestBffCall {
  method: string
  path: string
  body: unknown
}

export interface GuestBffState {
  calls: GuestBffCall[]
  draftId: number
  signup: Record<string, string> | null
  uploads: number
  failSaveTimes: number
  saveStatus: number
}

/**
 * In-memory double for the proposed guest BFF paths. It is a test double only:
 * the real routes are declared as a central dependency, so no production code
 * ever treats these responses as existing.
 */
export async function stubGuestBff(
  page: Page,
  overrides: Partial<Pick<GuestBffState, 'draftId' | 'signup' | 'failSaveTimes' | 'saveStatus'>> = {}
): Promise<GuestBffState> {
  const state: GuestBffState = {
    calls: [],
    draftId: 27,
    signup: null,
    uploads: 0,
    failSaveTimes: 0,
    saveStatus: 200,
    ...overrides
  }
  const jsonBody = (request: { postData: () => string | null }): unknown => {
    try {
      return JSON.parse(request.postData() ?? 'null')
    } catch {
      return null
    }
  }
  await page.route('**/api/bff/**', async (route) => {
    const request = route.request()
    const method = request.method()
    const path = new URL(request.url()).pathname
    if (path === '/api/bff/auth/csrf' && method === 'GET')
      return route.fulfill({ json: { csrfToken: 'ui-fixture-csrf', expiresIn: 7200 } })
    state.calls.push({ method, path, body: method === 'GET' ? undefined : jsonBody(request) })
    if (path === '/api/bff/guest/events/draft' && method === 'POST')
      return route.fulfill({ json: { id: state.draftId } })
    if (path.endsWith('/signup')) {
      if (method === 'GET') return route.fulfill({ json: { data: state.signup } })
      if (method === 'POST') {
        const body = jsonBody(request)
        state.signup = body && typeof body === 'object' ? (body as Record<string, string>) : null
        // `saveStatus` is the guest *save* status, so it governs the signup POST
        // as well as the event PUT: the permission-error spec drives the signup
        // modal and expects the same 403 the archived route answered.
        if (state.saveStatus !== 200)
          return route.fulfill({ status: state.saveStatus, json: { message: 'save failed' } })
        return route.fulfill({ json: { message: '保存成功' } })
      }
      if (method === 'DELETE') {
        state.signup = null
        return route.fulfill({ status: 204, body: '' })
      }
    }
    if (path.startsWith('/api/bff/guest/upload/')) {
      state.uploads += 1
      return route.fulfill({ json: { url: `/uploads/img/avatar-${state.uploads}.png` } })
    }
    if (method === 'PUT' && path.startsWith('/api/bff/guest/events/')) {
      if (state.failSaveTimes > 0) {
        state.failSaveTimes -= 1
        return route.fulfill({ status: 500, json: { message: 'unavailable' } })
      }
      return route.fulfill({ status: state.saveStatus, json: { message: '保存成功' } })
    }
    return route.fulfill({ status: 404, json: { message: 'Not Found' } })
  })
  return state
}

/** Captures the same region from archive and new page; requires zero pixel diff. */
export async function compareRegion(
  archive: Locator,
  current: Locator,
  name: string,
  info: TestInfo
): Promise<void> {
  await projectApprovedAccessibility(archive.page(), info)
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
  const pixels = pixelmatch(oldImage.data, newImage.data, diff.data, oldImage.width, oldImage.height, {
    threshold: 0.1
  })
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

/** Compare modal content at a shared pixel origin, independent of its chrome. */
export async function compareModalBody(archive: Locator, current: Locator, name: string, info: TestInfo): Promise<void> {
  const saved = []
  for (const [index, locator] of [archive, current].entries()) {
    // Preserve the original capture, including its device-pixel phase.
    await locator.screenshot({ path: info.outputPath(`${name}-unaligned-${index === 0 ? 'archive' : 'nuxt'}.png`), animations: 'disabled', caret: 'hide' })
    const context = await locator.evaluate(node => {
      let ancestor: Element | null = node
      let background = 'transparent'
      while (ancestor) {
        const color = getComputedStyle(ancestor).backgroundColor
        if (color !== 'transparent' && !/rgba\([^)]*,\s*0\)/.test(color)) { background = color; break }
        ancestor = ancestor.parentElement
      }
      return { background, rect: node.getBoundingClientRect().toJSON(), style: node.getAttribute('style') }
    })
    saved.push(context)
  }
  writeFileSync(info.outputPath(`${name}-original-context.json`), JSON.stringify(saved, null, 2))
  expect(saved[0]!.background, 'modal content canvas differs').toBe(saved[1]!.background)
  // Keep the actually painted ancestor background when isolating a transparent
  // body. No differing element is hidden, and no pixels inside its box are cut.
  try {
    for (const [index, locator] of [archive, current].entries()) {
      await locator.evaluate((node, background) => { (node as HTMLElement).style.backgroundColor = background }, saved[index]!.background)
    }
    await compareToArchive(archive, current, name, info)
  } finally {
    for (const [index, locator] of [archive, current].entries()) {
      await locator.evaluate((node, style) => {
        if (style === null) node.removeAttribute('style')
        else node.setAttribute('style', style)
      }, saved[index]!.style)
    }
  }
}

/** The archived preloader is removed on mount; wait before capturing. */
export async function waitForArchiveReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle')
  await page
    .locator('#pre-loading-screen')
    .waitFor({ state: 'detached', timeout: 15_000 })
    .catch(() => undefined)
}
