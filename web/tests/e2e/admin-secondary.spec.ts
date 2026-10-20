import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { publicImageFixtures } from '../fixtures/public-data.mjs'
import { stat } from 'node:fs/promises'

const base = Number(process.env.E2E_PORT_BASE ?? 3100), origin = `http://127.0.0.1:${base}`, fixture = `http://127.0.0.1:${base + 82}`
const png = { name: 'profile.png', mimeType: 'image/png', buffer: publicImageFixtures['.png'].body() }
async function credentials(page: Page, path: string, username = 'admin', twofa?: string) {
  await page.goto(`/login?redirect=${encodeURIComponent(path)}`)
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password', { exact: true }).fill(username === 'admin' ? 'adminpass' : 'secondpass')
  if (twofa) await page.getByLabel('二步密码 (可选)').fill(twofa)
  await page.getByRole('button', { name: '登录系统', exact: true }).click()
}
async function entry(page: Page, path: string) {
  await page.getByRole('button', { name: '进入管理端', exact: true }).click()
  await expect(page).toHaveURL(`${origin}${path}`)
  await expect(page.getByTestId('admin-shell')).toBeVisible()
}
async function login(page: Page, path: string, username = 'admin', twofa?: string) {
  await credentials(page, path, username, twofa); await entry(page, path)
}
async function csrf(page: Page) { return (await (await page.request.get('/api/bff/auth/csrf')).json()).csrfToken as string }
test.beforeEach(async ({ request }) => {
  expect((await request.post(`${fixture}/__fixture/admin`, { data: { enable: true } })).ok()).toBe(true)
})

test('avatar-only saves retain sessions while enabling and disabling 2FA requires fresh login', async ({ page, browser, request }) => {
  test.setTimeout(90_000)
  const initial = await (await request.get(`${fixture}/__fixture/admin`)).json()
  const avatar = `/uploads/admin-${initial.uploads.length + 1}.png`
  await login(page, '/admin/profile')
  const other = await browser.newContext({ baseURL: origin })
  try {
    const otherPage = await other.newPage(); await login(otherPage, '/admin/profile')
    await page.getByLabel('更换头像', { exact: true }).setInputFiles(png)
    await expect(page.getByText('头像上传成功', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '保存修改', exact: true }).click()
    await expect(page.getByText('个人资料已更新', { exact: true })).toBeVisible()
    const saved = await (await page.request.get('/api/bff/auth/session')).json()
    expect(saved).toMatchObject({ authenticated: true, user: { avatar } })
    expect((await other.request.get('/api/bff/auth/session')).status()).toBe(200)
    await page.getByLabel('启用二步验证（2FA）', { exact: true }).check()
    await page.getByRole('button', { name: '保存修改', exact: true }).click()
    await expect(page.getByText('开启二步验证需要设置二步密码', { exact: true })).toBeVisible()
    await page.getByLabel('二步验证密码', { exact: true }).fill('fixture-new-second')
    await page.getByRole('button', { name: '保存修改', exact: true }).click()
    await expect(page).toHaveURL(/\/login\?redirect=/)
    expect((await other.request.get('/api/bff/auth/session')).status()).toBe(401)
    await credentials(page, '/admin/profile')
    await expect(page.getByRole('alert').filter({ hasText: '需要二步密码' })).toBeVisible()
    await page.getByLabel('二步密码 (可选)').fill('fixture-new-second')
    await page.getByRole('button', { name: '登录系统', exact: true }).click(); await entry(page, '/admin/profile')
    await expect(page.getByLabel('启用二步验证（2FA）', { exact: true })).toBeChecked()
    await page.getByLabel('启用二步验证（2FA）', { exact: true }).uncheck()
    await page.getByRole('button', { name: '保存修改', exact: true }).click()
    await expect(page).toHaveURL(/\/login\?redirect=/)
    await login(page, '/admin/profile')
    await expect(page.getByLabel('启用二步验证（2FA）', { exact: true })).not.toBeChecked()
    const state = await (await request.get(`${fixture}/__fixture/admin`)).json()
    expect(state.uploads.slice(initial.uploads.length)).toMatchObject([{ name: 'upload.png', type: 'image/png', fields: ['file'] }])
  } finally { await other.close() }
})

test('global logout requires super admin, permits cancellation and revokes independently created sessions', async ({ page, browser, request }) => {
  await login(page, '/admin/users')
  const other = await browser.newContext({ baseURL: origin })
  try {
    const otherPage = await other.newPage(); await login(otherPage, '/admin/members', 'second', '123456')
    const denied = await other.request.post('/api/bff/admin/token-version/refresh', { headers: { origin, 'x-csrf-token': await csrf(otherPage) } })
    expect(denied.status()).toBe(403)
    await page.getByRole('button', { name: '强制刷新所有登录', exact: true }).click()
    await page.getByRole('button', { name: '取消', exact: true }).click()
    await expect(page.getByRole('button', { name: '强制登出所有人', exact: true })).toHaveCount(0)
    expect((await other.request.get('/api/bff/auth/session')).status()).toBe(200)
    await page.getByRole('button', { name: '强制刷新所有登录', exact: true }).click()
    await page.getByRole('button', { name: '强制登出所有人', exact: true }).click()
    await expect(page).toHaveURL(/\/login\?redirect=/)
    expect((await other.request.get('/api/bff/auth/session')).status()).toBe(401)
    await otherPage.reload(); await expect(otherPage).toHaveURL(/\/login\?redirect=/)
    await expect(otherPage.getByTestId('admin-member-card')).toHaveCount(0)
    await login(page, '/admin/users')
    const state = await (await request.get(`${fixture}/__fixture/admin`)).json()
    expect(state.requests.filter((call: { path: string }) => call.path === '/api/admin/token-version/refresh')).toHaveLength(1)
  } finally { await other.close() }
})

test('recycle purge confirms its exact scope, preserves active records and excludes deleted events', async ({ page, request }) => {
  await login(page, '/admin/config')
  expect((await request.post(`${fixture}/__fixture/events`, { data: { enable: true } })).ok()).toBe(true)
  const headers = { origin, 'x-csrf-token': await csrf(page) }
  for (const [resource, id] of [['activities', 1], ['members', 1], ['history', 1], ['events', 101]] as const)
    expect((await page.request.delete(`/api/bff/admin/${resource}/${id}`, { headers })).ok()).toBe(true)
  const before = await (await request.get(`${fixture}/__fixture/admin`)).json()
  const active = Object.fromEntries(['activities', 'members', 'history'].map(key => [key, before[key].filter((row: { deleted_at?: string }) => !row.deleted_at).map((row: { id: number }) => row.id)]))
  await page.getByRole('button', { name: '彻底清空回收站', exact: true }).click()
  await expect(page.getByText('将永久删除回收站中的文章、住民、群史及其关联图片；不包括活动管理中的已删除活动。', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByRole('button', { name: '确定彻底删除', exact: true })).toHaveCount(0)
  const cancelled = await (await request.get(`${fixture}/__fixture/admin`)).json()
  expect(cancelled.requests.some((call: { path: string }) => call.path === '/api/admin/recycle-bin/purge')).toBe(false)
  await page.getByRole('button', { name: '彻底清空回收站', exact: true }).click()
  await page.getByRole('button', { name: '确定彻底删除', exact: true }).click()
  await expect(page.getByText('清理完成！', { exact: true })).toBeVisible()
  const after = await (await request.get(`${fixture}/__fixture/admin`)).json()
  for (const key of ['activities', 'members', 'history']) {
    expect(after[key].some((row: { deleted_at?: string }) => row.deleted_at)).toBe(false)
    expect(after[key].map((row: { id: number }) => row.id)).toEqual(active[key])
  }
  const events = await (await request.get(`${fixture}/__fixture/events`)).json()
  expect(events.records.find((row: { id: number }) => row.id === 101).status).toBe('deleted')
  expect((await page.request.post('/api/bff/admin/activities/1/restore', { headers: { origin, 'x-csrf-token': await csrf(page) } })).status()).toBe(404)
})

test('home link icon upload uses the fixed icon category and persists through public configuration', async ({ page, request }) => {
  const initial = await (await request.get(`${fixture}/__fixture/admin`)).json()
  const iconUrl = `/uploads/admin-${initial.uploads.length + 1}.png`
  await request.get('/api/config'); await login(page, '/admin/home-links')
  await page.getByPlaceholder('例如：B站账号').first().fill('迁移上传图标')
  await page.getByPlaceholder('https://...').first().fill('https://example.com/club')
  await page.getByLabel('上传图标（SVG / PNG）', { exact: true }).first().setInputFiles(png)
  await expect(page.getByText('图标上传成功', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('保存成功', { exact: true })).toBeVisible()
  const config = await (await request.get('/api/config')).json()
  expect(JSON.parse(config.home_links)[0].iconUrl).toBe(iconUrl)
  const state = await (await request.get(`${fixture}/__fixture/admin`)).json()
  expect(state.uploads.slice(initial.uploads.length)).toMatchObject([{ name: 'upload.png', fields: ['file'], category: 'icon_svg' }])
  expect(state.requests.slice(initial.requests.length).find((call: { path: string }) => call.path === '/api/upload').query).toBe('category=icon_svg')
  await page.reload(); await expect(page.locator(`img[src="${iconUrl}"]`).first()).toBeVisible()
})

test('large backup hands the actual stream to the browser without a Blob or false completion notice', async ({ page, request }) => {
  test.setTimeout(90_000)
  await request.post(`${fixture}/__fixture/admin`, { data: { stalledBackup: true } })
  await login(page, '/admin/backups')
  await page.evaluate(() => { URL.createObjectURL = () => { throw new Error('Large downloads must not allocate a Blob URL') } })
  const downloading = page.waitForEvent('download')
  await page.locator('tr').filter({ hasText: 'full_stall.tar.gz' }).getByRole('button', { name: '下载', exact: true }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toBe('full_stall.tar.gz')
  await expect(page.getByText('下载已交给浏览器，请在浏览器下载列表查看进度', { exact: true })).toBeVisible()
  expect(await download.failure()).toBeNull()
  expect((await stat((await download.path())!)).size).toBe(100 * 1024 * 1024)
  await expect(page.getByRole('progressbar', { name: '备份下载进度' })).toHaveCount(0)
  const state = await (await request.get(`${fixture}/__fixture/admin`)).json()
  expect(state.backupStreams).toMatchObject([{ sent: 100 * 1024 * 1024, active: false }])
})
