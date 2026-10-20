import { expect, test } from '@playwright/test'
import fixtures from '../../../scripts/revamp/route-fixtures.json' with { type: 'json' }
import { auditAccessibility, collectAccessibility } from './support/accessibility-audit'

for (const route of fixtures.routes) for (const theme of ['light', 'dark'] as const) {
  const diagnostic = route.path === '/events/zetime'
  test(`${diagnostic ? 'UNACCEPTED empty-event diagnostic' : 'public automatic accessibility'} ${route.path} (${theme})`, async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(value => localStorage.setItem('theme-preference', value), theme)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const response = await page.goto(route.path, { waitUntil: 'networkidle' })
    expect(response?.ok()).toBe(true)
    await expect(page.locator('main')).toContainText(route.mainContent)
    if (diagnostic) {
      // The existing empty-board message is outside the approved status-label
      // palette. Preserve the full findings, without calling this a WCAG pass.
      await collectAccessibility(page, info, 'UNACCEPTED-empty-event-message')
      info.annotations.push({ type: 'open-accessibility-debt', description: 'Empty-board message contrast needs a separate visual decision; checklist #80 remains open.' })
    }
    else await auditAccessibility(page, info)
    expect(errors).toEqual([])
  })
}
