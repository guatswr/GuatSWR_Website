import { expect, test } from '@playwright/test'
import { archiveMathAsset, prepareArchiveMathReference } from '../../scripts/archive-math-reference.mjs'
import { ARCHIVE_ORIGIN, FIXTURE_ORIGIN, compareToArchive, proxyArchiveRequests, settlePublicPage } from './support/public-pages'
import { publicMathMarkdownFixture as source } from '../fixtures/public-markdown-advanced.mjs'

test.beforeAll(async () => { await prepareArchiveMathReference() })

for (const theme of ['light', 'dark'] as const) {
  test(`formulas and prose match the actual archived renderer (${theme})`, async ({ context, page, request }, info) => {
    test.setTimeout(60_000)
    await context.addInitScript(mode => localStorage.setItem('theme-preference', mode), theme)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const archive = await context.newPage()
    try {
      await archive.emulateMedia({ reducedMotion: 'reduce' })
      await proxyArchiveRequests(archive)
      // The reference gets the canonical joined/decoded v1 DTO. Override only
      // its article content, preserving the archived page and rendering code.
      await archive.route('**/api/activities/1', async route => {
        const response = await route.fetch({ url: `${FIXTURE_ORIGIN}/api/activities/1` })
        const article = await response.json()
        await route.fulfill({ response, json: { ...article, content: source } })
      })
      const blocked: string[] = []
      await archive.route('https://**/*', async route => {
        const asset = archiveMathAsset(route.request().url())
        if (asset) await route.fulfill(asset)
        else { blocked.push(route.request().url()); await route.abort() }
      })
      await archive.goto(`${ARCHIVE_ORIGIN}/activity/1`)
      // Permanently warm a different real BFF cache key before math, even when
      // sharding no longer happens to pair this case with the advanced spec.
      const advanced = await request.get('/api/content/activity/991')
      expect(advanced.ok()).toBe(true)
      expect((await advanced.json()).headings).toEqual(expect.arrayContaining([expect.objectContaining({ text: '高阶公式与图表回归' })]))
      await page.goto('/activity/992')
      await expect(page.getByRole('heading', { name: '公式对照', exact: true })).toBeVisible()
      await expect(page.locator('.md-mermaid-wrapper')).toHaveCount(0)
      const expected = archive.locator('.md-editor-preview .katex')
      const actual = page.locator('.safe-markdown .katex')
      await expect(expected).toHaveCount(3)
      await expect(actual).toHaveCount(3)
      await Promise.all([archive, page].map(p => p.evaluate(() => document.fonts.ready)))
      await Promise.all([archive, page].map(p => settlePublicPage(p)))
      // Transparent prose stays in its natural article context. Moving it over
      // the viewport origin captures unrelated navigation/cover pixels, even
      // when those same incidental pixels happen to match on both sites.
      for (let index = 0; index < 3; index++) {
        await expect(actual.nth(index)).toHaveCSS('font-size', await expected.nth(index).evaluate(node => getComputedStyle(node).fontSize))
        await compareToArchive(expected.nth(index), actual.nth(index), `math-${index}-${theme}`, info, 'natural')
      }
      await compareToArchive(archive.locator('main .md-editor-preview'), page.locator('main .safe-markdown'), `math-prose-${theme}`, info, 'natural')
      const ordinary = await request.get('/api/content/activity/1')
      expect(ordinary.ok()).toBe(true)
      expect((await ordinary.json()).headings).toEqual(expect.arrayContaining([expect.objectContaining({ text: '例会记录' })]))
      await info.attach('reference-scope', { body: JSON.stringify({ reference: 'Archived MdPreview with integrity-pinned KaTeX 0.16.11 and highlight.js 11.10.0; production keeps current KaTeX', scope: 'Three isolated formula glyph regions and the entire common math/prose body', unusedArchivedRequestsBlocked: blocked }, null, 2), contentType: 'application/json' })
    }
    finally { await archive.close() }
  })
}
