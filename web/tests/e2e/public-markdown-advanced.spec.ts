import { expect, test } from '@playwright/test'
import { readFile, readdir } from 'node:fs/promises'

const base = Number(process.env.E2E_PORT_BASE ?? 3100)

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('theme-preference', 'light'))
})

test('math and readable diagram source exist without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL })
  try {
    const page = await context.newPage()
    expect((await page.goto('/activity/991'))?.status()).toBe(200)
    const body = page.locator('.safe-markdown')
    await expect(body.getByRole('heading', { name: '高阶公式与图表回归' })).toBeVisible()
    await expect(body.locator('math')).toHaveCount(3)
    await expect(body.locator('annotation[encoding="application/x-tex"]').nth(1)).toHaveText('\\sqrt{x}+\\frac{1}{2}')
    await expect(body.locator('.katex path').first()).toHaveAttribute('d', /^M/)
    await expect(body.locator('.md-diagram-source[open]')).toHaveCount(3)
    await expect(body.locator('pre').first()).toContainText('A[开始] --> B[完成]')
    await expect(body.locator('.md-diagram-help')).toContainText(['启用 JavaScript', '启用 JavaScript', '启用 JavaScript'])
    await expect(body.locator('svg:not(.katex svg), [onload], [style*="position:absolute"]')).toHaveCount(0)
    await expect(body.getByText('author text', { exact: true })).toHaveCSS('position', 'static')
    await expect(body.locator('path[d="M0 0"]')).toHaveCount(0)
  }
  finally { await context.close() }
})

test('diagram engines load only after keyboard activation and clean up on hide, theme change and failure', async ({ page }, info) => {
  test.setTimeout(60_000)
  // Identify the actual built engine, independent of hashed asset names. An
  // empty match fails closed instead of making the network assertion vacuous.
  const assets = new URL('../../.output/public/_nuxt/', import.meta.url)
  const enginePaths = new Set<string>()
  for (const file of await readdir(assets)) {
    if (file.endsWith('.js') && (await readFile(new URL(file, assets), 'utf8')).includes('mermaidAPI')) enginePaths.add(`/_nuxt/${file}`)
  }
  expect(enginePaths.size).toBeGreaterThan(0)
  const engineRequests: string[] = [], external: string[] = [], errors: string[] = [], csp: string[] = []
  page.on('request', request => {
    const url = new URL(request.url())
    if (enginePaths.has(url.pathname)) engineRequests.push(url.pathname)
    if (url.protocol.startsWith('http') && url.origin !== `http://127.0.0.1:${base}`) external.push(url.href)
  })
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (/Content Security Policy|Refused to (load|execute|apply)/i.test(message.text())) csp.push(message.text()) })
  expect((await page.goto('/activity/991', { waitUntil: 'load' }))?.status()).toBe(200)
  const body = page.locator('.safe-markdown'), blocks = body.locator('.md-mermaid-wrapper')
  await expect(blocks).toHaveCount(3)
  await page.waitForTimeout(2000) // Same interaction-free observation window as the route collector.
  await blocks.first().getByRole('button', { name: '显示图表', exact: true }).focus()
  await expect(blocks.first().getByRole('button', { name: '显示图表', exact: true })).toBeFocused()
  expect(engineRequests).toEqual([]) // Focus must not prefetch the engine either.
  await expect(body.locator('.safe-mermaid')).toHaveCount(0)
  await blocks.first().getByRole('button', { name: '显示图表', exact: true }).press('Enter')
  const flow = blocks.first().locator('.mermaid-container svg')
  await expect(flow).toBeVisible()
  await expect(flow).toContainText('开始')
  expect(engineRequests.length).toBeGreaterThan(0)
  await expect(blocks.first().locator('details')).not.toHaveAttribute('open')
  await blocks.nth(1).getByRole('button', { name: '显示图表', exact: true }).click()
  await expect(blocks.nth(1).locator('.mermaid-container svg')).toContainText('hello')
  await expect(body.locator('.mermaid-container style, .mermaid-container foreignObject')).toHaveCount(0)
  await expect(page.locator('[data-public-diagram-scratch]')).toHaveCount(0)
  const lightFill = await flow.locator('rect').first().evaluate(node => getComputedStyle(node).fill)
  await info.attach('advanced-light', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
  await page.getByRole('button', { name: /当前.*模式/ }).first().click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(blocks.first().locator('.md-diagram-toggle')).toHaveCSS('color', 'rgb(125, 211, 252)')
  await expect(blocks.first().locator('.md-code')).toHaveCSS('background-color', 'rgb(17, 24, 39)')
  await expect(blocks.first().locator('.md-code-head')).toHaveCSS('background-color', 'rgb(26, 26, 26)')
  await expect.poll(() => flow.locator('rect').first().evaluate(node => getComputedStyle(node).fill)).not.toBe(lightFill)
  await expect(body.locator('.mermaid-container svg')).toHaveCount(2)
  await blocks.first().getByRole('button', { name: '隐藏图表', exact: true }).click()
  await expect(blocks.first().locator('.safe-mermaid')).toHaveCount(0)
  await expect(blocks.first().locator('details')).toHaveAttribute('open', '')
  await expect(blocks.first().locator('pre')).toContainText('A[开始] --> B[完成]')
  await blocks.nth(2).getByRole('button', { name: '显示图表', exact: true }).click()
  await expect(blocks.nth(2).getByText('流程图渲染错误', { exact: true })).toBeVisible()
  await expect(page.locator('[data-public-diagram-scratch]')).toHaveCount(0)
  await blocks.nth(2).getByRole('button', { name: '隐藏图表', exact: true }).click()
  await expect(blocks.nth(2).locator('pre')).toContainText('A[unterminated')
  await info.attach('advanced-dark', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
  expect(await page.evaluate(() => 'publicPwned' in window)).toBe(false)
  expect(external).toEqual([])
  expect(errors).toEqual([])
  expect(csp).toEqual([])
  await info.attach('engine-network', { body: JSON.stringify({ enginePaths: [...enginePaths], engineRequests, external, errors, csp }, null, 2), contentType: 'application/json' })
  await page.locator('main a[href="/activities"]').first().click()
  await expect(page.getByRole('heading', { name: '社团活动记录', exact: true })).toBeVisible()
  await expect(page.locator('[data-public-diagram-scratch]')).toHaveCount(0)
})
