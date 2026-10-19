import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { publicImageFixtures } from '../fixtures/public-data.mjs'
import { readFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { get as httpGet } from 'node:http'

const base = Number(process.env.E2E_PORT_BASE ?? 3100)
const fixture = `http://127.0.0.1:${base + 82}`
async function login(page: Page, path: string, username = 'admin', password = 'adminpass', twofa?: string) {
  await page.goto(`/login?redirect=${encodeURIComponent(path)}`)
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password', { exact: true }).fill(password)
  if (twofa) await page.getByLabel('二步密码 (可选)').fill(twofa)
  await page.getByRole('button', { name: '登录系统', exact: true }).click()
  await page.getByRole('button', { name: '进入管理端', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`${path}$`))
  await expect(page.getByTestId('admin-shell')).toBeVisible()
  await expect(page.locator('#admin-main > .admin-page-heading h1')).toBeVisible()
}
test.beforeEach(async ({ request }) => {
  expect((await request.post(`${fixture}/__fixture/admin`, { data: { enable: true } })).ok()).toBe(true)
})

test('member upload, create, edit, sort, delete and restore cross the real BFF and invalidate public data', async ({ page, request }, info) => {
  const name = `迁移住民-${info.project.name}`
  const before = await request.get('/api/members')
  expect(await before.text()).not.toContain(name)
  const browserCalls: { url: string; headers: Record<string, string> }[] = []
  page.on('request', req => { if (req.url().includes('/api/bff/admin/')) browserCalls.push({ url: req.url(), headers: req.headers() }) })
  await login(page, '/admin/members')
  await page.getByPlaceholder('用户昵称').fill(name)
  await page.getByPlaceholder('e.g. 芋泥头').fill('迁移测试')
  await page.locator('input[type="file"]').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: publicImageFixtures['.png'].body() })
  await expect(page.locator('img[src*="/uploads/admin-"]')).toBeVisible()
  await page.getByRole('button', { name: '添加成员', exact: true }).click()
  const card = page.getByTestId('admin-member-card').filter({ hasText: name })
  await expect(card).toHaveCount(1)
  expect(await (await request.get('/api/members')).text()).toContain(name)
  await card.hover()
  await card.getByTitle('编辑', { exact: true }).click()
  await page.getByPlaceholder('用户昵称').fill(`${name}-改`)
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect(card).toContainText(`${name}-改`)
  await card.hover(); await card.getByTitle('下移', { exact: true }).click()
  await expect(card.getByTitle('下移', { exact: true })).toBeEnabled()
  await card.hover(); await card.getByTitle('删除', { exact: true }).click()
  await page.getByRole('button', { name: 'OK', exact: true }).click()
  await expect(card).toHaveCount(0)
  expect(await (await request.get('/api/members')).text()).not.toContain(name)
  await page.getByRole('button', { name: '显示已删除', exact: true }).click()
  await expect(card).toContainText('已删')
  await card.hover(); await card.getByRole('button', { name: '恢复', exact: true }).click()
  await expect(card).not.toContainText('已删')
  expect(await (await request.get('/api/members')).text()).toContain(`${name}-改`)
  expect(browserCalls.every(call => !call.headers.authorization)).toBe(true)
  const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }))
  expect(JSON.stringify(storage)).not.toMatch(/eyJ[A-Za-z\d_-]+\.[A-Za-z\d_-]+\./)
  const state = await (await request.get(`${fixture}/__fixture/admin`)).json()
  expect(state.uploads).toMatchObject([{ type: 'image/png', name: 'upload.png', fields: ['file'] }])
  expect(state.requests.filter((call: { path: string }) => call.path.startsWith('/api/members')).every((call: { headers: Record<string, string> }) => !call.headers.cookie && !call.headers.origin)).toBe(true)
})

test('private writes reject missing CSRF and fresh role denials without browser tokens', async ({ page, request }) => {
  await login(page, '/admin/members', 'second', 'secondpass', '123456')
  const without = await page.evaluate(async () => {
    const response = await fetch('/api/bff/admin/members', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'forged', role: 'x' }) })
    return { status: response.status, data: await response.json() }
  })
  expect(without).toMatchObject({ status: 403, data: { error: { code: 'csrf_invalid' } } })
  expect((await page.request.get('/api/bff/admin/users')).status()).toBe(403)
  expect((await page.request.get('/api/bff/auth/session')).status()).toBe(200)
  await request.post(`${fixture}/__fixture/control`, { data: { username: 'second', disabled: true } })
  expect((await page.request.get('/api/bff/admin/members')).status()).toBe(401)
  await page.reload()
  await expect(page).toHaveURL(/\/login\?redirect=/)
  await expect(page.getByTestId('admin-member-card')).toHaveCount(0)
})

test('history edits retain the archived HTML controls and sanitize both previews and public output', async ({ page, request }, info) => {
  const title = `迁移群史-${info.project.name}`
  await request.get('/api/history')
  await login(page, '/admin/history')
  await page.locator('input[type="date"]').fill('2026-10-19')
  await page.getByPlaceholder('例如：新成员加入').fill(title)
  await page.getByPlaceholder('事件描述（支持 HTML 标签）...').fill('<p>安全预览<img src=x onerror="window.adminXss=1"></p>')
  await page.getByRole('button', { name: '提交记录', exact: true }).click()
  const card = page.getByTestId('admin-history-card').filter({ hasText: title })
  await expect(card).toContainText('安全预览')
  await expect(card.locator('[onerror]')).toHaveCount(0)
  expect(await page.evaluate(() => 'adminXss' in window)).toBe(false)
  const publicPage = await request.get('/history')
  expect(await publicPage.text()).toContain(title)
  expect(await publicPage.text()).not.toContain('onerror=')
  await card.hover(); await card.getByRole('button', { name: '编辑', exact: true }).click()
  await page.getByPlaceholder('例如：新成员加入').fill(`${title}-改`)
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect(card).toContainText(`${title}-改`)
  await card.hover(); await card.getByRole('button', { name: '删除', exact: true }).click()
  await page.getByRole('button', { name: 'OK', exact: true }).click()
  await expect(card).toHaveCount(0)
  expect(await (await request.get('/api/history')).text()).not.toContain(title)
  await page.getByRole('button', { name: '显示已删除', exact: true }).click()
  await card.hover(); await card.getByRole('button', { name: '恢复', exact: true }).click()
  await expect(card).not.toContainText('已删除')
  expect(await (await request.get('/api/history')).text()).toContain(`${title}-改`)
})

test('configuration validates before writing and refreshes a previously cached public read', async ({ page, request }, info) => {
  await request.get('/api/config')
  await login(page, '/admin/config')
  const banner = `迁移配置-${info.project.name}`
  await page.getByPlaceholder('请输入一些有趣的介绍文字...').fill(banner)
  await page.getByRole('button', { name: '保存所有配置', exact: true }).click()
  await expect(page.getByText('全局配置已更新', { exact: true })).toBeVisible()
  expect((await (await request.get('/api/config')).json()).banner_text).toBe(banner)
  const writes: string[] = []
  page.on('request', req => { if (req.method() === 'PUT' && req.url().endsWith('/api/bff/admin/config')) writes.push(req.url()) })
  await page.locator('#qq-group-number').fill('abcde')
  await page.getByRole('button', { name: '保存所有配置', exact: true }).click()
  await expect(page.getByText('QQ群号须为 5 至 12 位数字，或留空', { exact: false })).toBeVisible()
  expect(writes).toHaveLength(0)
})

test('a confirmed credential change revokes the opaque session and accepts only the new password', async ({ page, request, browser }) => {
  await login(page, '/admin/profile', 'second', 'secondpass', '123456')
  const stale = await browser.newContext()
  await stale.addCookies(await page.context().cookies())
  await page.getByPlaceholder('如果不修改，请留空').fill('new-second-pass')
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect(page).toHaveURL(/\/login\?redirect=/)
  const anonymous = await page.request.get('/api/bff/auth/session')
  expect(anonymous.status()).toBe(200)
  expect((await anonymous.json()).authenticated).toBe(false)
  expect((await stale.request.get(`http://127.0.0.1:${base}/api/bff/auth/session`)).status()).toBe(401)
  await stale.close()
  await login(page, '/admin/profile', 'second', 'new-second-pass', '123456')
  await expect(page.getByRole('heading', { name: '个人资料设置', exact: true })).toBeVisible()
  const state = await (await request.get(`${fixture}/__fixture/admin`)).json()
  expect(JSON.stringify(state.requests.map((call: { headers: Record<string, string> }) => call.headers.cookie))).not.toContain('guatswr-next')
})

test('home link editing validates destinations and updates the public projection', async ({ page, request }, info) => {
  await request.get('/api/config')
  await login(page, '/admin/home-links')
  const title = `迁移外链-${info.project.name}`
  await page.getByPlaceholder('例如：B站账号').first().fill(title)
  await page.getByPlaceholder('https://...').first().fill('https://example.com/club')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('保存成功', { exact: true })).toBeVisible()
  const config = await (await request.get('/api/config')).json()
  expect(JSON.parse(config.home_links)).toMatchObject([{ title, url: 'https://example.com/club' }])
  await expect(page.locator('a[href="https://example.com/club"]')).toContainText(title)
  await page.getByPlaceholder('https://...').first().fill('javascript:alert(1)')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0)
  expect((await (await request.get('/api/config')).json()).home_links).toBe(config.home_links)
})

test('private log selection and confirmed deletion update the actual admin list', async ({ page }) => {
  await login(page, '/admin/logs')
  await expect(page.getByText('IP 1.2.3.4', { exact: true }).filter({ visible: true })).toBeVisible()
  await page.getByRole('checkbox').filter({ visible: true }).first().check()
  await page.getByRole('button', { name: /批量删除 \(1\)/ }).click()
  await page.getByRole('button', { name: 'OK', exact: true }).click()
  await expect(page.getByText('IP 1.2.3.4', { exact: true }).filter({ visible: true })).toHaveCount(0)
  const response = await page.request.get('/api/bff/admin/logs')
  expect(await response.json()).toMatchObject({ total: 0, logs: [] })
})

test('account and IPv6 ban workflows stay on protected fixed endpoints', async ({ page, request }, info) => {
  await login(page, '/admin/users')
  const username = `new_${info.project.name}`
  await page.getByPlaceholder('Username', { exact: true }).fill(username)
  await page.getByPlaceholder('Password', { exact: true }).fill('fixture-pass')
  await page.getByRole('button', { name: /添加管理员/ }).click()
  const card = page.getByTestId('admin-user-card').filter({ hasText: username })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: '重置密码', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('input[type="password"]').fill('changed-fixture-pass')
  await dialog.getByRole('button', { name: 'OK', exact: true }).click()
  await expect(page.getByText('密码重置成功', { exact: true })).toBeVisible()
  await card.getByRole('button', { name: '重置 2FA', exact: true }).click()
  await page.getByRole('button', { name: 'OK', exact: true }).click()
  await expect(page.getByText('二步验证已重置', { exact: true })).toBeVisible()
  await page.getByPlaceholder('x.x.x.x').fill('2001:db8::19')
  await page.getByPlaceholder('例如：恶意扫描').fill('迁移隔离测试')
  await page.getByRole('button', { name: /执行封禁/ }).click()
  await expect(page.getByText('2001:db8::19', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const banRow = page.locator('tr').filter({ hasText: '2001:db8::19' })
  await banRow.getByRole('button', { name: '解封', exact: true }).click()
  await expect(banRow).toHaveCount(0)
  await card.getByRole('button', { name: '删除', exact: true }).click()
  await page.getByRole('button', { name: '确定删除', exact: true }).click()
  await expect(card).toHaveCount(0)
  const csrf = (await (await page.request.get('/api/bff/auth/csrf')).json()).csrfToken as string
  const self = await page.request.delete('/api/bff/admin/users/1', { headers: { origin: `http://127.0.0.1:${base}`, 'x-csrf-token': csrf } })
  expect(self.status()).toBe(400)
  const state = await (await request.get(`${fixture}/__fixture/admin`)).json()
  expect(state.requests.some((call: { path: string; method: string }) => call.path === '/api/admin/bans/2001%3Adb8%3A%3A19' && call.method === 'DELETE')).toBe(true)
})

test('backups preserve settings, manual execution, byte-exact download and confirmed deletion', async ({ page, request }) => {
  await login(page, '/admin/backups')
  await page.locator('input[type="time"]').fill('03:15')
  await page.getByRole('button', { name: '保存设置', exact: true }).click()
  await expect(page.getByText('自动备份设置已更新', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '手动立即备份', exact: true }).click()
  await page.getByRole('button', { name: '立即执行', exact: true }).click()
  const manual = page.locator('tr').filter({ hasText: 'full_manual_' })
  await expect(manual).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const downloadEvent = page.waitForEvent('download')
  await page.locator('tr').filter({ hasText: 'full_fixture.tar.gz' }).getByRole('button', { name: '下载', exact: true }).click()
  const downloaded = await downloadEvent
  expect(downloaded.suggestedFilename()).toBe('full_fixture.tar.gz')
  expect(gunzipSync(await readFile((await downloaded.path())!))).toEqual(Buffer.alloc(1024))
  const head = await page.request.head('/api/bff/admin/backups/download?file=full_fixture.tar.gz')
  expect(head.status()).toBe(200)
  expect(Number(head.headers()['content-length'])).toBeGreaterThan(0)
  expect((await head.body()).byteLength).toBe(0)
  await manual.getByRole('button', { name: '删除', exact: true }).click()
  await page.getByRole('button', { name: '确定删除', exact: true }).click()
  await expect(manual).toHaveCount(0)
  expect((await page.request.get('/api/bff/admin/backups/download?type=full&file=..%2Fprivate')).status()).toBe(400)
  const state = await (await request.get(`${fixture}/__fixture/admin`)).json()
  const calls = state.requests.filter((call: { path: string }) => call.path.startsWith('/api/admin/backups'))
  expect(calls.every((call: { headers: Record<string, string> }) => call.headers.authorization?.startsWith('Bearer ') && !call.headers.cookie && !call.headers.origin)).toBe(true)
})

test('cancelled backpressured binary downloads release both BFF concurrency slots', async ({ page, request }) => {
  await login(page, '/admin/backups')
  await request.post(`${fixture}/__fixture/admin`, { data: { stalledBackup: true } })
  const cookies = (await page.context().cookies()).map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
  function stalled() {
    let abort!: () => void
    const ready = new Promise<void>((resolve, reject) => {
      let cancelled = false
      const req = httpGet(`http://127.0.0.1:${base}/api/bff/admin/backups/download?file=full_stall.tar.gz`, { headers: { cookie: cookies } }, res => {
        if (res.statusCode !== 200) { clearTimeout(timer); res.resume(); reject(new Error(`download status ${res.statusCode}`)); return }
        res.once('data', () => { clearTimeout(timer); res.pause(); resolve() })
        res.on('error', () => {})
      })
      const timer = setTimeout(() => { reject(new Error('download did not start')); req.destroy() }, 5000)
      req.on('error', error => { clearTimeout(timer); if (!cancelled) reject(error) })
      abort = () => { cancelled = true; clearTimeout(timer); req.destroy() }
    })
    return { ready, abort: () => abort() }
  }
  const first = stalled(), second = stalled()
  try {
    await Promise.all([first.ready, second.ready])
    expect((await (await request.get(`${fixture}/__fixture/admin`)).json()).activeBackupStreams).toBe(2)
    await expect.poll(async () => {
      const firstSample = ((await (await request.get(`${fixture}/__fixture/admin`)).json()).backupStreams as { sent: number; active: boolean }[]).filter(sample => sample.active)
      await new Promise(resolve => setTimeout(resolve, 250))
      const secondSample = ((await (await request.get(`${fixture}/__fixture/admin`)).json()).backupStreams as { sent: number; active: boolean }[]).filter(sample => sample.active)
      // Socket buffers may stop the upstream below 1 MiB (measured 768–832
      // KiB on Windows). Require actual streamed chunks followed by a stable
      // byte count, rather than inventing a minimum TCP buffer capacity.
      return firstSample.length === 2 && secondSample.length === 2 && firstSample.every((sample, index) => sample.active && sample.sent >= 128 * 1024 && sample.sent === secondSample[index]?.sent)
    }, { timeout: 10_000, message: 'both paused downloads actually backpressure the upstream' }).toBe(true)
    first.abort(); second.abort()
    await expect.poll(async () => (await (await request.get(`${fixture}/__fixture/admin`)).json()).activeBackupStreams).toBe(0)
    await expect.poll(async () => (await page.request.get('/api/bff/admin/backups/download?file=full_fixture.tar.gz')).status()).toBe(200)
  } finally { first.abort(); second.abort() }
})
