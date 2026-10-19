# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: login.spec.ts >> login and client session boundary >> redirects a reloaded login page when a valid BFF session already exists
- Location: tests\e2e\login.spec.ts:83:3

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/admin$/
Received string:  "http://127.0.0.1:3950/login"
Timeout: 5000ms

Call log:
  - Expect "toHaveURL" with timeout 5000ms
    - waiting for navigation to finish...
    - navigated to "http://127.0.0.1:3950/login"
    14 × locator resolved to <html lang="zh-CN" data-theme="light">…</html>
       - unexpected value "http://127.0.0.1:3950/login"

```

```yaml
- heading "500" [level=1]
- heading "Internal Server Error" [level=2]
- paragraph: Failed to resolve module specifier "#entry". Relative references must start with either "/", "./", or "../".
```

# Test source

```ts
  1   | import { expect, test } from '@playwright/test'
  2   | import type { Page, TestInfo } from '@playwright/test'
  3   | import pixelmatch from 'pixelmatch'
  4   | import { PNG } from 'pngjs'
  5   | import { writeFileSync } from 'node:fs'
  6   | 
  7   | /**
  8   |  * Login / client-session E2E.
  9   |  *
  10  |  * The wiring lives in `web/playwright.config.ts`: `node tests/fixtures/auth-upstream.mjs`
  11  |  * on `E2E_PORT_BASE + 82`, and the Nuxt webServer receives
  12  |  * `NUXT_API_BASE`, `NUXT_BFF_AUTH_ALLOWED_ORIGINS` and a 32+ character
  13  |  * `NUXT_SESSION_PASSWORD`. Ports are derived from `E2E_PORT_BASE` so parallel
  14  |  * workstreams never collide.
  15  |  */
  16  | 
  17  | test.describe('login and client session boundary', () => {
  18  |   const portBase = Number(process.env.E2E_PORT_BASE ?? 3100)
  19  |   const AUTH_FIXTURE = `http://127.0.0.1:${portBase + 82}`
  20  |   const ORIGIN = `http://127.0.0.1:${portBase}`
  21  |   const ARCHIVE_ORIGIN = `http://127.0.0.1:${portBase + 2074}`
  22  |   const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/
  23  | 
  24  |   async function resetFixture(request: { post: (url: string, options?: object) => Promise<unknown> }) {
  25  |     await request.post(`${AUTH_FIXTURE}/__fixture/control`, {
  26  |       data: { lockLogin: false, loginDelayMs: 0, hugeMe: false, meStatus: null, role: 'super_admin' },
  27  |     })
  28  |   }
  29  | 
  30  |   async function login(page: Page, username: string, password: string, twofa?: string) {
  31  |     await page.goto('/login')
  32  |     await page.getByLabel('Username').fill(username)
  33  |     await page.getByLabel('Password').fill(password)
  34  |     if (twofa) await page.getByLabel('二步密码 (可选)').fill(twofa)
  35  |     await page.getByRole('button', { name: '登录系统' }).click()
  36  |   }
  37  | 
  38  |   async function confirmEntry(page: Page) {
  39  |     const confirm = page.getByRole('button', { name: '进入管理端' })
  40  |     await expect(confirm).toBeFocused()
  41  |     await confirm.click()
  42  |     await expect(page).toHaveURL(/\/admin$/)
  43  |   }
  44  | 
  45  |   test.beforeEach(async ({ request }) => {
  46  |     await resetFixture(request)
  47  |   })
  48  | 
  49  |   test('shows the sanitized credential error without navigating', async ({ page }) => {
  50  |     await login(page, 'admin', 'wrong-password')
  51  |     await expect(page.locator('[role="alert"]').filter({ hasText: '用户名或密码错误' })).toBeVisible()
  52  |     await expect(page).toHaveURL(/\/login$/)
  53  |     await expect(page.getByRole('button', { name: '登录系统' })).toBeEnabled()
  54  |   })
  55  | 
  56  |   test('asks for the second password, then completes login after confirmation', async ({ page }) => {
  57  |     await login(page, 'second', 'secondpass')
  58  |     await expect(page.locator('[role="alert"]').filter({ hasText: '需要二步密码' })).toBeVisible()
  59  | 
  60  |     await page.getByLabel('二步密码 (可选)').fill('123456')
  61  |     await page.getByRole('button', { name: '登录系统' }).click()
  62  |     await expect(page.getByText('数据无价，谨慎操作。')).toBeVisible()
  63  |     await confirmEntry(page)
  64  |   })
  65  | 
  66  |   test('blocks duplicate submits while the first login is in flight', async ({ page, request }) => {
  67  |     await request.post(`${AUTH_FIXTURE}/__fixture/control`, { data: { loginDelayMs: 400 } })
  68  |     const loginRequests: string[] = []
  69  |     page.on('request', (request) => {
  70  |       if (request.url().endsWith('/api/bff/auth/login')) loginRequests.push(request.url())
  71  |     })
  72  | 
  73  |     await page.goto('/login')
  74  |     await page.getByLabel('Username').fill('admin')
  75  |     await page.getByLabel('Password').fill('adminpass')
  76  |     await page.getByRole('button', { name: '登录系统' }).click({ noWaitAfter: true })
  77  |     await expect(page.getByRole('button', { name: '正在穿越隙间...' })).toBeDisabled()
  78  |     await page.getByRole('button', { name: '正在穿越隙间...' }).click({ force: true, noWaitAfter: true }).catch(() => {})
  79  |     await expect(page.getByText('数据无价，谨慎操作。')).toBeVisible({ timeout: 5000 })
  80  |     expect(loginRequests).toHaveLength(1)
  81  |   })
  82  | 
  83  |   test('redirects a reloaded login page when a valid BFF session already exists', async ({ page }) => {
  84  |     await login(page, 'admin', 'adminpass')
  85  |     await confirmEntry(page)
  86  |     await page.goto('/login')
> 87  |     await expect(page).toHaveURL(/\/admin$/)
      |                        ^ Error: expect(page).toHaveURL(expected) failed
  88  |   })
  89  | 
  90  |   test('keeps the session server-authoritative for expiry and role changes', async ({ page, request }) => {
  91  |     await login(page, 'admin', 'adminpass')
  92  |     await confirmEntry(page)
  93  | 
  94  |     const before = await page.request.get('/api/bff/auth/session')
  95  |     expect(before.status()).toBe(200)
  96  |     expect((await before.json()).user.role).toBe('super_admin')
  97  | 
  98  |     await request.post(`${AUTH_FIXTURE}/__fixture/control`, { data: { role: 'admin' } })
  99  |     const downgraded = await page.request.get('/api/bff/auth/session')
  100 |     expect(downgraded.status()).toBe(200)
  101 |     expect((await downgraded.json()).user.role).toBe('admin')
  102 | 
  103 |     await request.post(`${AUTH_FIXTURE}/__fixture/control`, { data: { meStatus: 403 } })
  104 |     const revoked = await page.request.get('/api/bff/auth/session')
  105 |     expect(revoked.status()).toBe(401)
  106 |     expect((await revoked.json()).error.code).toBe('session_expired')
  107 |   })
  108 | 
  109 |   test('requires CSRF for logout and clears the server record before claiming success', async ({ page }) => {
  110 |     await login(page, 'admin', 'adminpass')
  111 |     await confirmEntry(page)
  112 | 
  113 |     const csrf = await page.request.get('/api/bff/auth/csrf')
  114 |     expect(csrf.status()).toBe(200)
  115 |     const token = (await csrf.json()).csrfToken as string
  116 | 
  117 |     const rejected = await page.request.post('/api/bff/auth/logout', {
  118 |       headers: { origin: ORIGIN, 'content-type': 'application/json' },
  119 |       data: {},
  120 |     })
  121 |     expect(rejected.status()).toBe(403)
  122 |     expect((await rejected.json()).error.code).toBe('csrf_invalid')
  123 | 
  124 |     const accepted = await page.request.post('/api/bff/auth/logout', {
  125 |       headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-csrf-token': token },
  126 |       data: {},
  127 |     })
  128 |     expect(accepted.status()).toBe(200)
  129 |     const after = await page.request.get('/api/bff/auth/session')
  130 |     expect(after.status()).toBe(200)
  131 |     expect((await after.json()).authenticated).toBe(false)
  132 |   })
  133 | 
  134 |   test('keeps the upstream token out of storage, HTML, payload, URLs, headers and console', async ({ page }) => {
  135 |     const consoleMessages: string[] = []
  136 |     const requestUrls: string[] = []
  137 |     const authorizationHeaders: string[] = []
  138 |     page.on('console', (message) => consoleMessages.push(message.text()))
  139 |     page.on('request', (request) => {
  140 |       requestUrls.push(request.url())
  141 |       if (request.headers().authorization) authorizationHeaders.push(request.url())
  142 |     })
  143 | 
  144 |     await login(page, 'admin', 'adminpass')
  145 |     await confirmEntry(page)
  146 | 
  147 |     const storage = await page.evaluate(() => {
  148 |       const dump = (storage: Storage) => Object.fromEntries(Object.entries(storage))
  149 |       return { local: dump(localStorage), session: dump(sessionStorage) }
  150 |     })
  151 |     const storageText = JSON.stringify(storage)
  152 |     expect(storageText).not.toMatch(JWT_PATTERN)
  153 |     expect(storageText).not.toContain('csrfToken')
  154 | 
  155 |     const html = await page.content()
  156 |     expect(html).not.toMatch(JWT_PATTERN)
  157 | 
  158 |     const payload = await page.evaluate(() => JSON.stringify((window as unknown as { __NUXT__?: unknown }).__NUXT__ ?? null))
  159 |     expect(payload).not.toMatch(JWT_PATTERN)
  160 |     expect(payload).not.toContain('csrfToken')
  161 | 
  162 |     expect(requestUrls.filter(url => JWT_PATTERN.test(url))).toEqual([])
  163 |     expect(requestUrls.some(url => /token=/.test(url))).toBe(false)
  164 |     expect(authorizationHeaders).toEqual([])
  165 |     expect(consoleMessages.filter(message => JWT_PATTERN.test(message))).toEqual([])
  166 |   })
  167 | 
  168 |   test('keeps keyboard access, focus and the native confirmation modal', async ({ page }) => {
  169 |     await page.goto('/login')
  170 |     await page.getByLabel('Username').focus()
  171 |     await page.keyboard.type('admin')
  172 |     await page.keyboard.press('Tab')
  173 |     await page.keyboard.type('adminpass')
  174 |     await page.keyboard.press('Enter')
  175 |     const confirm = page.getByRole('button', { name: '进入管理端' })
  176 |     await expect(confirm).toBeFocused()
  177 |     await page.keyboard.press('Escape')
  178 |     await expect(page).toHaveURL(/\/admin$/)
  179 |   })
  180 | 
  181 |   test('focuses the first invalid field when client validation fails', async ({ page }) => {
  182 |     await page.goto('/login')
  183 |     await page.getByLabel('Username').fill('bad user')
  184 |     await page.getByLabel('Password').fill('x')
  185 |     await page.getByRole('button', { name: '登录系统' }).click()
  186 |     await expect(page.getByLabel('Username')).toBeFocused()
  187 |     await expect(page.getByLabel('Username')).toHaveAttribute('aria-invalid', 'true')
```