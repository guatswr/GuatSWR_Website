import { expect, test } from '@playwright/test'
import { configFixture } from './support/public-parity'

test.describe('social channels', () => {
  test('renders the archived channel index without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()
    await page.goto('/social')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('绯想天 · 外界通讯')
    await expect(page.getByRole('heading', { level: 2, name: '保持联系' })).toBeVisible()
    // Only explicit http(s) outbound links reach the rendered page.
    const links = page.locator('main a[target="_blank"]')
    expect(await links.count()).toBeGreaterThan(0)
    for (const href of await links.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('href'))
    )) {
      expect(href).toMatch(/^https?:\/\//)
    }
    const html = await page.content()
    expect(html).not.toMatch(/href="(?:javascript|data):/i)
    await context.close()
  })

  test('opens curated channels in a new, isolated tab', async ({ page }) => {
    await page.goto('/social')
    const first = page.locator('main a[target="_blank"]').first()
    await expect(first).toHaveAttribute('rel', /noopener/)
    await expect(first).toHaveAttribute('rel', /noreferrer/)
    await expect(first.locator('.sr-only')).toHaveText('（在新标签页打开）')
  })

  test('does not refetch the shared configuration when navigating to join', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (request) => {
      const url = request.url()
      if (url.includes('/api/')) requests.push(new URL(url).pathname)
    })
    await page.goto('/social')
    await page.getByRole('link', { name: '加入同好群' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/一起，把热爱/)
    await page.goBack()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('绯想天 · 外界通讯')
    expect(requests.filter((path) => path === '/api/config')).toHaveLength(0)
  })
})

test.describe('join page', () => {
  test('renders group details without JavaScript', async ({ browser }) => {
    const config = configFixture()
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()
    await page.goto('/join')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/一起，把热爱/)
    await expect(page.getByRole('heading', { level: 2, name: '加入桂航绯想天' })).toBeVisible()
    if (config.qq_group_number) {
      // The footer also prints the group number, so assert on the join page's own
      // content rather than on the whole document.
      await expect(
        page.getByRole('main').getByText(String(config.qq_group_number), { exact: true })
      ).toBeVisible()
    }
    if (config.join_question) {
      await expect(page.getByText(String(config.join_question))).toBeVisible()
    }
    if (config.qq_qr_image) {
      await expect(page.getByAltText('桂航绯想天 QQ 群二维码，请使用 QQ 扫码加入')).toBeVisible()
    }
    await context.close()
  })

  test('falls back to the archived copy message when the clipboard is denied', async ({
    page
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error('denied')) }
      })
    })
    await page.goto('/join')
    const copy = page.getByRole('button', { name: '复制群号' })
    test.skip(!(await copy.count()), 'fixture has no group number')
    await copy.click()
    await expect(
      page.getByText('无法自动复制，请长按或选中上方群号手动复制。')
    ).toBeVisible()
  })

  test('confirms a successful copy', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permission API is Chromium-only here')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/join')
    const copy = page.getByRole('button', { name: '复制群号' })
    test.skip(!(await copy.count()), 'fixture has no group number')
    await copy.click()
    await expect(page.getByText('群号已复制，可以到 QQ 内搜索加入。')).toBeVisible()
  })

  test('shows the archived QR failure state and retries it', async ({ page }) => {
    const qr = String(configFixture().qq_qr_image ?? '')
    test.skip(!qr, 'fixture has no group QR image')
    const pattern = `**${qr}*`
    await page.route(pattern, (route) => route.fulfill({ status: 404, body: 'missing' }))
    await page.goto('/join')
    await expect(page.getByText('二维码暂时未能显示')).toBeVisible({ timeout: 15_000 })
    await page.unroute(pattern)
    await page.getByRole('button', { name: '重新加载二维码' }).click()
    await expect(page.getByAltText('桂航绯想天 QQ 群二维码，请使用 QQ 扫码加入')).toBeVisible()
    await expect(page.getByText('二维码暂时未能显示')).toHaveCount(0)
  })
})
