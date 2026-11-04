import { expect, test } from '@playwright/test'

const androidBrowser = 'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.8059.43 Mobile Safari/537.36'

for (const { name, userAgent, inset } of [
  { name: 'Android QQ native bars', userAgent: `${androidBrowser} V1_AND_SQ_9.2.0_0_YYB_D QQ/9.2.0.12345`, inset: 0 },
  { name: 'standalone QQ Browser', userAgent: `${androidBrowser} MQQBrowser/15.0`, inset: 32 },
  { name: 'iOS QQ cutout', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 QQ/9.2.0.12345', inset: 32 },
]) {
  test.describe(name, () => {
    test.use({ userAgent })

    test('aligns the navbar and page offsets with the effective top safe area', async ({ page, isMobile }) => {
      const hydrationErrors: string[] = []
      page.on('console', message => {
        if (/hydration.*mismatch/i.test(message.text())) hydrationErrors.push(message.text())
      })
      // Inject a nonzero physical inset into real CSS: desktop/headless Chrome
      // normally reports zero, which would hide the duplicate native-bar gap.
      const simulateCutout = () => page.addStyleTag({ content: ':root { --club-device-safe-area-top: 32px; }' })

      await page.goto('/')
      await simulateCutout()
      const root = page.locator('html')
      if (inset === 0) await expect(root).toHaveAttribute('data-qq-webview', '')
      else await expect(root).not.toHaveAttribute('data-qq-webview')
      await expect(page.getByRole('navigation', { name: '主导航' })).toHaveCSS('padding-top', `${inset}px`)
      await expect(page.locator('.club-banner')).toHaveCSS('padding-top', `${64 + (isMobile ? inset : 0)}px`)

      await page.goto('/members')
      await simulateCutout()
      await expect(page.getByRole('navigation', { name: '主导航' })).toHaveCSS('padding-top', `${inset}px`)
      await expect(page.locator('#main-content > .club-page-stack > :not(.club-home)')).toHaveCSS('margin-top', `${64 + inset}px`)
      expect(hydrationErrors).toEqual([])
    })
  })
}
