import { expect, test } from '@playwright/test'

// Do not intercept requests or disable the HTTP cache here: either one masks
// the import-map/modulepreload race that broke every second document load.
for (const path of ['/', '/members', '/login']) {
  test(`${path} hydrates after repeated warm-cache document reloads`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text())
    })
    const documents = [await page.goto(path)]
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) documents.push(await page.reload())
      const document = documents[attempt]!
      expect(document?.status()).toBe(200)
      const html = await document!.text()
      const map = /<script[^>]*type="importmap"[^>]*>[\s\S]*?<\/script>/.exec(html)
      expect(map, 'Nuxt entry import map must be present').not.toBeNull()
      const firstModule = html.search(/<(?:link[^>]*rel="modulepreload"|script[^>]*type="module")/)
      expect(firstModule, 'import map must precede every module load').toBeGreaterThanOrEqual(map!.index + map![0].length)
      const nonce = document!.headers()['content-security-policy']?.match(/'nonce-([^']+)'/)?.[1]
      expect(nonce).toBeTruthy()
      expect(map![0]).toContain(`nonce="${nonce}"`)

      // SSR text alone cannot prove hydration. Exercise an actual client action
      // after every reload and wait for the DOM to change.
      const theme = page.getByRole('button', { name: /当前.*模式，切换为/ })
      await expect(theme).toBeVisible()
      const wasDark = await page.locator('html').evaluate(node => node.classList.contains('dark'))
      await theme.click()
      await expect.poll(() => page.locator('html').evaluate(node => node.classList.contains('dark'))).toBe(!wasDark)
      await expect(page).not.toHaveTitle(/500|Internal Server Error/)
    }
    expect(errors).toEqual([])
  })
}
