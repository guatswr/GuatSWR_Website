import { expect, test } from '@playwright/test'
import { publicImageFixtures } from '../fixtures/public-data.mjs'

const base = Number(process.env.E2E_PORT_BASE ?? 3100)
const fixture = `http://127.0.0.1:${base + 82}`
const image = { name: 'visitor.png', mimeType: 'image/png', buffer: publicImageFixtures['.png'].body() }

interface Call { method: string; path: string; headers: Record<string, string>; body?: Record<string, unknown>; upload?: { eid: number; name: string; type: string; size: number; fields: string[] } }
interface State { requests: Call[]; drafts: { id: number; status: string; title?: string }[]; signups: Record<string, unknown>[] }

test('real guest BFF reuses a draft across upload, manual retry and a confirmed receipt', async ({ page, request, browser }) => {
  await request.post(`${fixture}/__fixture/guest`, { data: { reset: true, failSaveTimes: 1 } })
  const browserWrites: { path: string; csrf: string | undefined }[] = []
  page.on('request', req => {
    if (req.url().includes('/api/bff/guest/') && req.method() !== 'GET')
      browserWrites.push({ path: new URL(req.url()).pathname, csrf: req.headers()['x-csrf-token'] })
  })
  await page.goto('/events/bounty')
  await page.getByRole('button', { name: '发布活动' }).click()
  const modal = page.getByTestId('event-modal')
  await modal.locator('input[name="title"]').fill('真实链路悬赏')
  await modal.locator('input[name="challenge"]').fill('一命通关')
  await modal.locator('input[name="reward"]').fill('吧唧')
  const chooser = page.waitForEvent('filechooser')
  await modal.getByRole('button', { name: '上传发起人头像', exact: true }).click()
  await (await chooser).setFiles(image)
  await expect(modal.locator('img[src*="/uploads/img/events/700/"]')).toBeVisible()
  const draftCookie = (await page.context().cookies()).find(cookie => cookie.name === 'bff_guest_drafts')
  expect(draftCookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/api/bff/guest' })
  // Model a lost first Set-Cookie while preserving the CSRF cookie/token.
  await page.context().clearCookies({ name: 'bff_guest_drafts' })
  const recovered = await page.evaluate(async csrf => {
    const response = await fetch('/api/bff/guest/events/draft', { method: 'POST', headers: { 'x-csrf-token': csrf } })
    return { status: response.status, data: await response.json() as { id: number } }
  }, browserWrites.at(-1)!.csrf!)
  expect(recovered).toEqual({ status: 200, data: { id: 700 } })
  await modal.getByRole('button', { name: '提交审核' }).click()
  await expect(modal.getByText('服务暂时不可用，请稍后重试')).toBeVisible()
  let state = await (await request.get(`${fixture}/__fixture/guest`)).json() as State
  expect(state.requests.filter(call => call.path.endsWith('/draft'))).toHaveLength(1)
  expect(state.requests.filter(call => call.method === 'PUT')).toHaveLength(1)
  expect(state.drafts).toMatchObject([{ id: 700, status: 'draft' }])

  await modal.getByRole('button', { name: '提交审核' }).click()
  await expect(modal).toHaveCount(0)
  state = await (await request.get(`${fixture}/__fixture/guest`)).json() as State
  expect(state.drafts).toMatchObject([{ id: 700, status: 'pending', title: '真实链路悬赏' }])
  expect(state.requests.filter(call => call.path.endsWith('/draft'))).toHaveLength(1)
  const puts = state.requests.filter(call => call.method === 'PUT')
  expect(puts).toHaveLength(2)
  expect(puts.every(call => call.path === '/api/event/700')).toBe(true)
  const upload = state.requests.find(call => call.path === '/api/upload_visitor')!
  expect(upload.upload).toMatchObject({ eid: 700, name: 'upload.png', type: 'image/png', fields: ['file', 'eid'] })
  expect(upload.upload!.size).toBeGreaterThan(0)
  expect(browserWrites.length).toBe(5)
  expect(browserWrites.every(call => Boolean(call.csrf))).toBe(true)
  for (const call of state.requests) {
    expect(call.headers.cookie).toBeUndefined()
    expect(call.headers.origin).toBeUndefined()
    expect(call.headers.authorization).toBeUndefined()
    expect(call.headers['x-forwarded-for']).toMatch(/^(?:127\.0\.0\.1|::1)$/)
  }
  const csrf = browserWrites.at(-1)!.csrf!
  const replay = await page.evaluate(async ({ body, csrf }) => {
    const response = await fetch('/api/bff/guest/events/700', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify(body) })
    return response.status
  }, { body: puts.at(-1)!.body, csrf })
  expect(replay).toBe(200)
  // A second cookie jar on the same network address cannot guess the first
  // visitor's draft. This is an actual HTTP request, not a test route stub.
  const stranger = await browser.newContext({ baseURL: `http://127.0.0.1:${base}` })
  try {
    const token = await (await stranger.request.get('/api/bff/auth/csrf')).json() as { csrfToken: string }
    const response = await stranger.request.put('/api/bff/guest/events/700', { headers: { origin: `http://127.0.0.1:${base}`, 'x-csrf-token': token.csrfToken }, data: puts.at(-1)!.body })
    expect(response.status()).toBe(404)
  } finally { await stranger.close() }
  state = await (await request.get(`${fixture}/__fixture/guest`)).json() as State
  expect(state.requests.filter(call => call.method === 'PUT')).toHaveLength(2)
})

test('real guest BFF uploads an avatar, saves, reads and deletes the visitor signup', async ({ page, request }) => {
  await request.post(`${fixture}/__fixture/guest`, { data: { reset: true } })
  await page.goto('/events/stg')
  await page.getByRole('button', { name: '我要参加' }).first().click()
  const modal = page.getByTestId('event-modal')
  await modal.locator('input[name="common_id"]').fill('真实⑨')
  await modal.locator('input[name="qq"]').fill('123456')
  await modal.locator('select[name="pilot_source"]').selectOption('桂航')
  const chooser = page.waitForEvent('filechooser')
  await modal.getByRole('button', { name: '上传头像', exact: true }).click()
  await (await chooser).setFiles(image)
  await expect(modal.getByText('头像已上传', { exact: true })).toBeVisible()
  await modal.getByRole('button', { name: '保存报名' }).click()
  await expect(modal.getByText('报名信息已保存')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '我要参加' }).first().click()
  await expect(modal.locator('input[name="common_id"]')).toHaveValue('真实⑨')
  await expect(modal.locator('input[name="qq"]')).toHaveValue('123456')
  await expect(modal.locator('select[name="pilot_source"]')).toHaveValue('桂航')
  await modal.getByRole('button', { name: '删除报名' }).click()
  await expect(modal.getByText('报名已删除')).toBeVisible()
  await expect(modal.locator('input[name="common_id"]')).toHaveValue('')
  const state = await (await request.get(`${fixture}/__fixture/guest`)).json() as State
  expect(state.signups).toEqual([])
  expect(state.requests.filter(call => call.path.endsWith('/signup')).map(call => call.method)).toEqual(['GET', 'POST', 'GET', 'DELETE'])
  expect(state.requests.find(call => call.path === '/api/upload_visitor/avatar')?.upload).toMatchObject({ eid: 101, name: 'upload.png' })
})

test('real upload ingress accepts a file above the middleware default and rejects above 50 MiB', async ({ page, request }) => {
  await request.post(`${fixture}/__fixture/guest`, { data: { reset: true } })
  await page.goto('/events/stg')
  const result = await page.evaluate(async png => {
    const { csrfToken } = await (await fetch('/api/bff/auth/csrf')).json() as { csrfToken: string }
    const { id } = await (await fetch('/api/bff/guest/events/draft', { method: 'POST', headers: { 'x-csrf-token': csrfToken } })).json() as { id: number }
    const statuses = []
    for (const bytes of [9 * 1024 * 1024, 50 * 1024 * 1024 + 1]) {
      // Valid PNG signature/content plus padding. Send directly so client image
      // compression cannot hide the server middleware's real ingress limit.
      const data = new Uint8Array(bytes)
      data.set(png)
      const body = new FormData()
      body.append('file', new Blob([data], { type: 'image/png' }), 'large.png')
      body.append('eid', String(id))
      const response = await fetch('/api/bff/guest/upload/content', { method: 'POST', headers: { 'x-csrf-token': csrfToken }, body })
      await response.text()
      statuses.push(response.status)
    }
    return statuses
  }, [...image.buffer])
  expect(result).toEqual([200, 413])
  const state = await (await request.get(`${fixture}/__fixture/guest`)).json() as State
  const uploads = state.requests.filter(call => call.path === '/api/upload_visitor')
  expect(uploads).toHaveLength(1)
  expect(uploads[0]!.upload?.size).toBe(9 * 1024 * 1024)
})
