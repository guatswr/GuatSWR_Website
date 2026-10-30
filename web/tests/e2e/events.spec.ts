import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { EVENT_CATEGORIES, upstreamEventsPage, stubGuestBff } from './support/events-parity'

// Derived from the same base as `playwright.config.ts`; a hardcoded 3100 made the
// manual context unreachable on any other port base.
const BASE_URL = `http://127.0.0.1:${Number(process.env.E2E_PORT_BASE ?? 3100)}`

test.describe('event routes', () => {
  test('renders an activity overview without redirecting', async ({ request }) => {
    const response = await request.get('/events', { maxRedirects: 0 })
    expect(response.status()).toBe(200)
    const html = await response.text()
    expect(html).toContain('全部活动')
    for (const category of EVENT_CATEGORIES) expect(html).toContain(category.title)
  })

  test('renders all five categories with Chinese titles and public rows', async ({
    request
  }) => {
    for (const category of EVENT_CATEGORIES) {
      const page = await upstreamEventsPage(request, category.type)
      const response = await request.get(category.path)
      expect(response.ok()).toBe(true)
      const html = await response.text()
      expect(html).toContain(category.title)
      expect(html).not.toContain("LET'S MEET")
      // Only the frozen public statuses are ever projected into the page.
      for (const item of page.items) {
        expect(html).toContain(item.title)
        expect(['published', 'ongoing', 'ended', 'settled']).toContain(item.status)
      }
    }
  })

  test('is readable without JavaScript including statuses and signup affordance', async ({
    browser
  }) => {
    const context = await browser.newContext({
      baseURL: BASE_URL,
      javaScriptEnabled: false
    })
    const page = await context.newPage()
    await page.goto('/events/stg')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('活动中心')
    await expect(page.getByRole('heading', { level: 2, name: 'STG', exact: true })).toBeVisible()
    const cards = page.locator('article')
    expect(await cards.count()).toBeGreaterThan(0)
    for (let index = 0; index < (await cards.count()); index++) {
      await expect(cards.nth(index).getByRole('heading', { level: 3 })).not.toBeEmpty()
    }
    // The archived status labels and signup button are server-rendered.
    await expect(page.getByRole('button', { name: /我要参加|报名已结束/ }).first()).toBeVisible()
    // No interactive form chunk was needed to read the page.
    await expect(page.locator('[data-testid="event-modal"]')).toHaveCount(0)
    await context.close()
  })
})

async function openCategoryFromClient(page: Page, isMobile: boolean, label: string, title = label) {
  await page.getByRole('button', { name: isMobile ? '打开导航菜单' : '活动' }).click()
  if (isMobile) await page.getByRole('button', { name: '活动' }).click()
  await page.getByRole('link', { name: '活动中心' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '活动中心', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: '桂航绯想天', exact: true })).toHaveCount(0)
  await page.getByRole('navigation', { name: '活动种类' }).getByRole('link', { name: label, exact: true }).click()
  await expect(page.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible()
  await expect(page.locator('.events-board')).toHaveCount(1)
}

test.describe('event board interactions', () => {
  test('provides useful links when a category has no events', async ({ page, isMobile }) => {
    await page.goto('/')
    await page.route('**/api/event?*', (route) =>
      route.fulfill({ json: { total: 0, page: 1, limit: 50, items: [] } })
    )
    await openCategoryFromClient(page, isMobile, '非想天则')
    await expect(page.getByRole('heading', { name: '暂无公开活动' })).toBeVisible()
    await expect(page.getByRole('link', { name: '往期回顾', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: '加入同好群', exact: true })).toBeVisible()
  })

  test('filters mixed event statuses and keeps every category accessible', async ({ page, isMobile }) => {
    await page.goto('/')
    await page.route('**/api/event?*', route => route.fulfill({ json: {
      total: 3, page: 1, limit: 50,
      items: [
        { id: 91, type: '悬赏令', title: '已截止悬赏', status: 'published', content: { deadline: '2020-01-01T00:00', reward: '徽章' } },
        { id: 92, type: 'STG', title: '可报名比赛', status: 'published', content: { deadline: '2099-01-01T00:00', rules: '不续关通关' } },
        { id: 93, type: '线下聚会', title: '已结束聚会', status: 'ended', content: { location: '校园' } },
      ],
    } }))
    await openCategoryFromClient(page, isMobile, '全部活动')
    await expect(page.locator('article')).toHaveCount(3)
    await expect(page.locator('article').first().getByRole('heading', { level: 3 })).toHaveText('可报名比赛')
    await page.getByRole('button', { name: /^进行中\s*1$/ }).click()
    await expect(page.locator('article')).toHaveCount(1)
    await expect(page.getByRole('button', { name: '我要参加' })).toBeEnabled()
    await page.getByRole('button', { name: /^已结束\s*2$/ }).click()
    await expect(page.locator('article')).toHaveCount(2)
    await expect(page.getByRole('heading', { name: '可报名比赛' })).toHaveCount(0)
    const categories = page.getByRole('navigation', { name: '活动种类' })
    await expect(categories.getByRole('link')).toHaveCount(6)
    await expect(categories.getByRole('link', { name: '线下聚会' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('opens the signup modal from mouse and keyboard, traps focus and returns it', async ({
    page
  }) => {
    await page.goto('/events/stg')
    const trigger = page.getByRole('button', { name: '我要参加' }).first()
    test.skip((await trigger.count()) === 0, 'fixture has no open STG event')

    await trigger.click()
    const modal = page.getByTestId('event-modal')
    await expect(modal).toBeVisible()
    await expect(modal.getByRole('heading', { name: '活动报名' })).toBeVisible()
    // Native dialog: the rest of the page is inert and focus is inside the modal.
    expect(await modal.evaluate((element) => element.matches(':modal'))).toBe(true)
    expect(
      await modal.evaluate((element) => element.contains(document.activeElement))
    ).toBe(true)
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')

    await page.keyboard.press('Escape')
    await expect(modal).toHaveCount(0)
    await expect(trigger).toBeFocused()
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('')

    // Keyboard activation works the same way.
    await trigger.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('event-modal')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('event-modal')).toHaveCount(0)
  })

  test('validates the form and focuses the first invalid field', async ({ page }) => {
    const bff = await stubGuestBff(page)
    await page.goto('/events/bounty')
    await page.getByRole('button', { name: '发布活动' }).click()
    const modal = page.getByTestId('event-modal')
    await expect(modal).toBeVisible()
    await modal.getByRole('button', { name: '提交审核' }).click()
    await expect(modal.getByText('请填写标题')).toBeVisible()
    await expect(modal.locator('input[name="title"]')).toBeFocused()
    // Validation never reached the network.
    expect(bff.calls).toEqual([])
  })

  test('shares one draft between upload and submission and retries with the same id', async ({
    page
  }) => {
    const bff = await stubGuestBff(page, { failSaveTimes: 1 })
    await page.goto('/events/bounty')
    await page.getByRole('button', { name: '发布活动' }).click()
    const modal = page.getByTestId('event-modal')
    await modal.locator('input[name="title"]').fill('测试悬赏')
    await modal.locator('input[name="challenge"]').fill('一命通关')
    await modal.locator('input[name="reward"]').fill('吧唧')
    // The archived form (and the port) binds the hidden file input to the field
    // whose upload button opened it: `chooseImage(key)` sets `uploadTarget`
    // before `input.click()`, and `handleFileChange` returns early when the
    // target is empty. Setting files on the input without pressing the button is
    // therefore not a flow the UI supports, so drive the real one.
    const chooser = page.waitForEvent('filechooser')
    await modal.locator('button[aria-label="上传发起人头像"]').click()
    await (
      await chooser
    ).setFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      )
    })
    await expect(modal.getByText('已上传头像')).toHaveCount(0)
    await expect(modal.locator('button[aria-label="上传发起人头像"]')).toHaveAttribute(
      'aria-invalid',
      'false'
    )

    await modal.getByRole('button', { name: '提交审核' }).click()
    // First attempt fails and must not be retried automatically.
    await expect(modal.getByText('服务暂时不可用，请稍后重试')).toBeVisible()
    const draftCalls = bff.calls.filter((call) => call.path.endsWith('/events/draft'))
    expect(draftCalls).toHaveLength(1)
    expect(bff.calls.filter((call) => call.method === 'PUT')).toHaveLength(1)

    await modal.getByRole('button', { name: '提交审核' }).click()
    // The archived board closes the dialog the moment the form emits
    // `submitted` (`@submitted="() => { formOpen = false; loadEvents() }"`), so
    // the success copy inside the modal is never observable - the archived UI
    // behaves the same way. The observable outcome is the closed dialog.
    await expect(modal).toHaveCount(0)
    const puts = bff.calls.filter((call) => call.method === 'PUT')
    expect(puts).toHaveLength(2)
    expect(puts.every((call) => call.path === '/api/bff/guest/events/27')).toBe(true)
    expect(puts.at(-1)?.body).toMatchObject({ type: '悬赏令', title: '测试悬赏', submit: true })
    expect(bff.uploads).toBe(1)
  })

  test('reads, saves and cancels the visitor signup', async ({ page }) => {
    const bff = await stubGuestBff(page, {
      signup: {
        id: 3,
        common_id: '⑨',
        qq: '123456',
        avatar: '/uploads/img/avatar-0.png',
        machine_sign: '冰',
        pilot_source: '桂航'
      }
    })
    await page.goto('/events/stg')
    const trigger = page.getByRole('button', { name: '我要参加' }).first()
    test.skip((await trigger.count()) === 0, 'fixture has no open STG event')
    await trigger.click()
    const modal = page.getByTestId('event-modal')
    await expect(modal.locator('input[name="common_id"]')).toHaveValue('⑨')
    await expect(modal.locator('input[name="qq"]')).toHaveValue('123456')

    await modal.locator('input[name="common_id"]').fill('⑨改')
    await modal.getByRole('button', { name: '保存报名' }).click()
    await expect(modal.getByText('报名信息已保存')).toBeVisible()
    const post = bff.calls.find((call) => call.method === 'POST' && call.path.endsWith('/signup'))
    expect(post?.body).toMatchObject({ common_id: '⑨改', qq: '123456', pilot_source: '桂航' })

    await modal.getByRole('button', { name: '删除报名' }).click()
    await expect(modal.getByText('报名已删除')).toBeVisible()
    expect(bff.calls.some((call) => call.method === 'DELETE' && call.path.endsWith('/signup'))).toBe(
      true
    )
    await expect(modal.locator('input[name="common_id"]')).toHaveValue('')
  })

  test('distinguishes permission errors from an expired session', async ({ page }) => {
    // The archived signup refuses to save without an avatar (`请先上传头像`, see
    // frontend/src/components/events/EventSignup.vue) and the port keeps that
    // rule, so the visitor must already own a signup with an avatar for the save
    // to reach the network at all. Without it this test asserted a message that
    // the archived UI could never produce either.
    const bff = await stubGuestBff(page, {
      saveStatus: 403,
      signup: {
        id: 3,
        common_id: '⑨',
        qq: '123456',
        avatar: '/uploads/img/avatar-0.png',
        machine_sign: '冰',
        pilot_source: '桂航'
      }
    })
    await page.goto('/events/stg')
    const trigger = page.getByRole('button', { name: '我要参加' }).first()
    test.skip((await trigger.count()) === 0, 'fixture has no open STG event')
    await trigger.click()
    const modal = page.getByTestId('event-modal')
    await modal.locator('input[name="common_id"]').fill('⑨')
    await modal.locator('input[name="qq"]').fill('123456')
    await modal.getByRole('button', { name: '保存报名' }).click()
    await expect(modal.getByText('没有权限执行该操作')).toBeVisible()
    // The theme preference survives a permission error.
    const theme = await page.locator('html').getAttribute('data-theme')
    expect(['light', 'dark']).toContain(theme)
    expect(bff.calls.length).toBeGreaterThan(0)
  })

  test('shows the participant preview and retries after a failure', async ({ page, isMobile }) => {
    let attempts = 0
    await page.goto('/')
    await page.route('**/api/event?*', async (route) => {
      const response = await route.fetch()
      const body = (await response.json()) as { items: { id: number }[]; total: number }
      await route.fulfill({ json: { ...body, total: body.items.length } })
    })
    await page.route('**/participants/public', (route) => {
      attempts += 1
      if (attempts === 1) return route.fulfill({ status: 502, json: { message: 'no' } })
      return route.fulfill({
        json: [
          {
            id: 1,
            common_id: '⑨',
            qq: '123456',
            avatar: '',
            pilot_source: '桂航',
            machine_sign: '冰',
            created_at: ''
          }
        ]
      })
    })
    await openCategoryFromClient(page, isMobile, '东方STG', 'STG')
    const card = page.locator('article').first()
    test.skip((await card.count()) === 0, 'fixture has no STG event')
    await card.getByRole('button', { name: '参赛名单' }).click()
    const modal = page.getByTestId('event-modal')
    await expect(modal.getByText('参赛名单读取失败，请重试')).toBeVisible()
    await modal.getByRole('button', { name: '重新读取' }).click()
    await expect(modal.getByText('共 1 人')).toBeVisible()
    await expect(modal.getByText('QQ：123456')).toBeVisible()
  })

  test('stops accepting signups after the Beijing deadline', async ({ page, isMobile }) => {
    await page.goto('/')
    await page.route('**/api/event?*', (route) =>
      route.fulfill({
        json: {
          total: 1,
          page: 1,
          limit: 50,
          items: [
            {
              id: 99,
              type: 'STG',
              title: '已截止比赛',
              status: 'published',
              content: { deadline: '2020-01-01T00:00' },
              created_by: 'admin',
              created_by_avatar: '',
              created_at: '',
              updated_at: ''
            }
          ]
        }
      })
    )
    await openCategoryFromClient(page, isMobile, '东方STG', 'STG')
    await expect(page.getByRole('button', { name: '报名已结束' })).toBeDisabled()
    await expect(page.locator('.event-card-status')).toHaveText('已截止')
    await expect(page.getByTestId('event-modal')).toHaveCount(0)
  })
})
