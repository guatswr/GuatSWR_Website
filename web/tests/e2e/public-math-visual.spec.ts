import { expect, test } from '@playwright/test'
import { archiveMathAsset, prepareArchiveMathReference } from '../../scripts/archive-math-reference.mjs'
import { ARCHIVE_ORIGIN, FIXTURE_ORIGIN, compareToArchive, proxyArchiveRequests } from './support/public-pages'

const base = Number(process.env.E2E_PORT_BASE ?? 3100)
const fixture = `http://127.0.0.1:${base + 82}`
const source = '## 公式对照\n\n行内公式 $x+1$ 。\n\n根式 $\\sqrt{x}+\\frac{1}{2}$ 。\n\n$$\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}$$'

test.beforeAll(async () => { await prepareArchiveMathReference() })

for (const theme of ['light', 'dark'] as const) {
  test(`formulas and prose match the actual archived renderer (${theme})`, async ({ context, page, request }, info) => {
    test.setTimeout(60_000)
    expect((await request.post(`${fixture}/__fixture/admin`, { data: { publicMarkdown: source } })).ok()).toBe(true)
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
      await page.goto('/activity/1')
      const expected = archive.locator('.md-editor-preview .katex')
      const actual = page.locator('.safe-markdown .katex')
      await expect(expected).toHaveCount(3)
      await expect(actual).toHaveCount(3)
      await Promise.all([archive, page].map(p => p.evaluate(() => document.fonts.ready)))
      for (let index = 0; index < 3; index++) {
        await expect(actual.nth(index)).toHaveCSS('font-size', await expected.nth(index).evaluate(node => getComputedStyle(node).fontSize))
        await compareToArchive(expected.nth(index), actual.nth(index), `math-${index}-${theme}`, info)
      }
      await compareToArchive(archive.locator('main .md-editor-preview'), page.locator('main .safe-markdown'), `math-prose-${theme}`, info)
      await info.attach('reference-scope', { body: JSON.stringify({ reference: 'Archived MdPreview with integrity-pinned KaTeX 0.16.11 and highlight.js 11.10.0; production keeps current KaTeX', scope: 'Three isolated formula glyph regions and the entire common math/prose body', unusedArchivedRequestsBlocked: blocked }, null, 2), contentType: 'application/json' })
    }
    finally { await archive.close() }
  })
}
