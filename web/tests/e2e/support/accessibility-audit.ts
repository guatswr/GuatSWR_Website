import { expect } from '@playwright/test'
import type { Page, TestInfo } from '@playwright/test'
import axe from 'axe-core'

/** Real production DOM; incomplete checks are retained for manual review. */
export async function collectAccessibility(page: Page, info: TestInfo, name = 'axe') {
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(axe.source + '\n;undefined')
  const result = await page.evaluate(async () => {
    const engine = (window as typeof window & { axe: typeof axe }).axe
    const result = await engine.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
    })
    return {
      url: result.url, testEngine: result.testEngine, testEnvironment: result.testEnvironment,
      violations: result.violations, incomplete: result.incomplete,
      passes: result.passes.map(item => item.id),
    }
  })
  await info.attach(name, { body: JSON.stringify(result, null, 2), contentType: 'application/json' })
  return result
}

export async function auditAccessibility(page: Page, info: TestInfo, name = 'axe') {
  const result = await collectAccessibility(page, info, name)
  expect(result.violations, `${name}: automatic checks; incomplete checks still require manual review`).toEqual([])
}
