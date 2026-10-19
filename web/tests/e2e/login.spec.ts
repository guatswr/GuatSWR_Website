import { expect, test } from '@playwright/test'
import type { Page, TestInfo } from '@playwright/test'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { writeFileSync } from 'node:fs'

/**
 * Login / client-session E2E.
 *
 * The wiring lives in `web/playwright.config.ts`: `node tests/fixtures/auth-upstream.mjs`
 * on `E2E_PORT_BASE + 82`, and the Nuxt webServer receives
 * `NUXT_API_BASE`, `NUXT_BFF_AUTH_ALLOWED_ORIGINS` and a 32+ character
 * `NUXT_SESSION_PASSWORD`. Ports are derived from `E2E_PORT_BASE` so parallel
 * workstreams never collide.
 */

test.describe('login and client session boundary', () => {
  const portBase = Number(process.env.E2E_PORT_BASE ?? 3100)
  const AUTH_FIXTURE = `http://127.0.0.1:${portBase + 82}`
  const ORIGIN = `http://127.0.0.1:${portBase}`
  const ARCHIVE_ORIGIN = `http://127.0.0.1:${portBase + 2074}`
  const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/

  async function resetFixture(request: { post: (url: string, options?: object) => Promise<unknown> }) {
    await request.post(`${AUTH_FIXTURE}/__fixture/control`, {
      data: { lockLogin: false, loginDelayMs: 0, hugeMe: false, meStatus: null, role: 'super_admin' },
    })
  }

  async function login(page: Page, username: string, password: string, twofa?: string) {
    await page.goto('/login')
    await page.getByLabel('Username').fill(username)
    await page.getByLabel('Password').fill(password)
    if (twofa) await page.getByLabel('二步密码 (可选)').fill(twofa)
    await page.getByRole('button', { name: '登录系统' }).click()
  }

  async function confirmEntry(page: Page) {
    const confirm = page.getByRole('button', { name: '进入管理端' })
    await expect(confirm).toBeFocused()
    await confirm.click()
    await expect(page).toHaveURL(/\/admin$/)
  }

  test.beforeEach(async ({ request }) => {
    await resetFixture(request)
  })

  test('shows the sanitized credential error without navigating', async ({ page }) => {
    await login(page, 'admin', 'wrong-password')
    await expect(page.locator('[role="alert"]').filter({ hasText: '用户名或密码错误' })).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('button', { name: '登录系统' })).toBeEnabled()
  })

  test('asks for the second password, then completes login after confirmation', async ({ page }) => {
    await login(page, 'second', 'secondpass')
    await expect(page.locator('[role="alert"]').filter({ hasText: '需要二步密码' })).toBeVisible()

    await page.getByLabel('二步密码 (可选)').fill('123456')
    await page.getByRole('button', { name: '登录系统' }).click()
    await expect(page.getByText('数据无价，谨慎操作。')).toBeVisible()
    await confirmEntry(page)
  })

  test('blocks duplicate submits while the first login is in flight', async ({ page, request }) => {
    await request.post(`${AUTH_FIXTURE}/__fixture/control`, { data: { loginDelayMs: 400 } })
    const loginRequests: string[] = []
    page.on('request', (request) => {
      if (request.url().endsWith('/api/bff/auth/login')) loginRequests.push(request.url())
    })

    await page.goto('/login')
    await page.getByLabel('Username').fill('admin')
    await page.getByLabel('Password').fill('adminpass')
    await page.getByRole('button', { name: '登录系统' }).click({ noWaitAfter: true })
    await expect(page.getByRole('button', { name: '正在穿越隙间...' })).toBeDisabled()
    await page.getByRole('button', { name: '正在穿越隙间...' }).click({ force: true, noWaitAfter: true }).catch(() => {})
    await expect(page.getByText('数据无价，谨慎操作。')).toBeVisible({ timeout: 5000 })
    expect(loginRequests).toHaveLength(1)
  })

  test('redirects a reloaded login page when a valid BFF session already exists', async ({ page }) => {
    await login(page, 'admin', 'adminpass')
    await confirmEntry(page)
    await page.goto('/login')
    await expect(page).toHaveURL(/\/admin$/)
  })

  test('keeps the session server-authoritative for expiry and role changes', async ({ page, request }) => {
    await login(page, 'admin', 'adminpass')
    await confirmEntry(page)

    const before = await page.request.get('/api/bff/auth/session')
    expect(before.status()).toBe(200)
    expect((await before.json()).user.role).toBe('super_admin')

    await request.post(`${AUTH_FIXTURE}/__fixture/control`, { data: { role: 'admin' } })
    const downgraded = await page.request.get('/api/bff/auth/session')
    expect(downgraded.status()).toBe(200)
    expect((await downgraded.json()).user.role).toBe('admin')

    await request.post(`${AUTH_FIXTURE}/__fixture/control`, { data: { meStatus: 403 } })
    const revoked = await page.request.get('/api/bff/auth/session')
    expect(revoked.status()).toBe(401)
    expect((await revoked.json()).error.code).toBe('session_expired')
  })

  test('requires CSRF for logout and clears the server record before claiming success', async ({ page }) => {
    await login(page, 'admin', 'adminpass')
    await confirmEntry(page)

    const csrf = await page.request.get('/api/bff/auth/csrf')
    expect(csrf.status()).toBe(200)
    const token = (await csrf.json()).csrfToken as string

    const rejected = await page.request.post('/api/bff/auth/logout', {
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      data: {},
    })
    expect(rejected.status()).toBe(403)
    expect((await rejected.json()).error.code).toBe('csrf_invalid')

    const accepted = await page.request.post('/api/bff/auth/logout', {
      headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-csrf-token': token },
      data: {},
    })
    expect(accepted.status()).toBe(200)
    const after = await page.request.get('/api/bff/auth/session')
    expect(after.status()).toBe(200)
    expect((await after.json()).authenticated).toBe(false)
  })

  test('keeps the upstream token out of storage, HTML, payload, URLs, headers and console', async ({ page }) => {
    const consoleMessages: string[] = []
    const requestUrls: string[] = []
    const authorizationHeaders: string[] = []
    page.on('console', (message) => consoleMessages.push(message.text()))
    page.on('request', (request) => {
      requestUrls.push(request.url())
      if (request.headers().authorization) authorizationHeaders.push(request.url())
    })

    await login(page, 'admin', 'adminpass')
    await confirmEntry(page)

    const storage = await page.evaluate(() => {
      const dump = (storage: Storage) => Object.fromEntries(Object.entries(storage))
      return { local: dump(localStorage), session: dump(sessionStorage) }
    })
    const storageText = JSON.stringify(storage)
    expect(storageText).not.toMatch(JWT_PATTERN)
    expect(storageText).not.toContain('csrfToken')

    const html = await page.content()
    expect(html).not.toMatch(JWT_PATTERN)

    const payload = await page.evaluate(() => JSON.stringify((window as unknown as { __NUXT__?: unknown }).__NUXT__ ?? null))
    expect(payload).not.toMatch(JWT_PATTERN)
    expect(payload).not.toContain('csrfToken')

    expect(requestUrls.filter(url => JWT_PATTERN.test(url))).toEqual([])
    expect(requestUrls.some(url => /token=/.test(url))).toBe(false)
    expect(authorizationHeaders).toEqual([])
    expect(consoleMessages.filter(message => JWT_PATTERN.test(message))).toEqual([])
  })

  test('keeps keyboard access, focus and the native confirmation modal', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Username').focus()
    await page.keyboard.type('admin')
    await page.keyboard.press('Tab')
    await page.keyboard.type('adminpass')
    await page.keyboard.press('Enter')
    const confirm = page.getByRole('button', { name: '进入管理端' })
    await expect(confirm).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(/\/admin$/)
  })

  test('focuses the first invalid field when client validation fails', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Username').fill('bad user')
    await page.getByLabel('Password').fill('x')
    await page.getByRole('button', { name: '登录系统' }).click()
    await expect(page.getByLabel('Username')).toBeFocused()
    await expect(page.getByLabel('Username')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.locator('#login-username-error')).toContainText('用户名')
  })

  for (const [project] of [['desktop'], ['mobile']] as const) {
    test(`matches the archived login visuals on ${project}`, async ({ context, page, isMobile }, info: TestInfo) => {
      test.skip(isMobile !== (project === 'mobile'), `runs on the ${project} project only`)
      // Same seeded randomness for both apps so the same archived image bytes
      // are compared (index 1 -> /login-bg/2.jpg).
      await context.addInitScript(() => {
        Math.random = () => 0.5
      })
      const archive = await context.newPage()

      await archive.emulateMedia({ reducedMotion: 'reduce' })
      await page.emulateMedia({ reducedMotion: 'reduce' })

      // Align navbar/footer branding: the archive gets the same public config
      // the Nuxt app sees, exactly like the shared-layout comparison.
      const configResponse = await page.request.get('/api/config')
      const config = configResponse.ok() ? await configResponse.json() : {}
      await archive.route('**/api/**', route => route.fulfill({ json: config }))
      // The config points at `/uploads/img/config/badge.svg`, which the archived
      // bundle cannot serve (it is not part of `frontend/dist`): the archive's
      // ClubAvatar would 404 and fall back to its bundled
      // `/brand/group-avatar.webp`, while the new app renders the configured
      // badge. Serve the archive's uploads from the same origin the new app
      // reads them from, exactly as `support/public-parity.ts` does for every
      // other archived comparison, so both navbars render the same bytes.
      await archive.route('**/uploads/**', async (route) => {
        const path = new URL(route.request().url()).pathname
        await route.fulfill({ response: await route.fetch({ url: `${ORIGIN}${path}` }) })
      })

      await archive.goto(`${ARCHIVE_ORIGIN}/login`)
      await page.goto('/login')
      await expect(page.getByRole('heading', { name: '博丽神社办事处' })).toBeVisible()
      await expect(archive.getByRole('heading', { name: '博丽神社办事处' })).toBeVisible()
      await page.waitForLoadState('networkidle')
      await archive.waitForLoadState('networkidle')

      const oldBytes = await archive.screenshot({ fullPage: true, animations: 'disabled' })
      const newBytes = await page.screenshot({ fullPage: true, animations: 'disabled' })
      writeFileSync(info.outputPath(`login-${project}-archive.png`), oldBytes)
      writeFileSync(info.outputPath(`login-${project}-nuxt.png`), newBytes)

      const oldImage = PNG.sync.read(oldBytes)
      const newImage = PNG.sync.read(newBytes)
      expect({ width: newImage.width, height: newImage.height }).toEqual({ width: oldImage.width, height: oldImage.height })
      const diff = new PNG({ width: oldImage.width, height: oldImage.height })
      const pixels = pixelmatch(oldImage.data, newImage.data, diff.data, oldImage.width, oldImage.height, { threshold: 0.1 })
      writeFileSync(info.outputPath(`login-${project}-diff.png`), PNG.sync.write(diff))
      expect(pixels, `login ${project}: pixels different from the archived login page`).toBe(0)

      await archive.close()
    })
  }
})
