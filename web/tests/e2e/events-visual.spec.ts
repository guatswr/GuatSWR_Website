import { expect, test } from '@playwright/test'
import type { Locator, TestInfo } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import {
  ARCHIVE_ORIGIN,
  EVENT_CATEGORIES,
  compareRegion,
  stubGuestBff,
  useUpstreamFixtures,
  waitForArchiveReady
} from './support/events-parity'

/**
 * The archived dark signup modal is a light island, and that is a defect in the
 * archive rather than a design: its `.touhou-dialog` rules compile to
 * `[data-v-…] .dark .touhou-dialog`, while Element Plus teleports the dialog to
 * `<body>`, so the selectors never match and the dark theme is never applied.
 * The archived modal therefore renders light-on-light, with an invisible heading
 * and invisible buttons.
 *
 * The project owner approved the deviation on 2026-10-19: the port renders the
 * modal correctly instead of reproducing an unreadable one. This comparison
 * therefore asserts the *intended* difference and that the port's own text is
 * readable, rather than demanding zero differing pixels against broken output.
 * The light-theme comparison stays strict, and the event E2E log records this.
 */
async function assertDarkModalDeviation(
  archiveBody: Locator,
  body: Locator,
  suffix: string,
  info: TestInfo
) {
  const read = (locator: Locator) =>
    locator.evaluate((node) => {
      // The body itself is transparent, so walk up to the first painted ancestor.
      let current: Element | null = node
      let background = 'rgba(0, 0, 0, 0)'
      while (current) {
        const value = getComputedStyle(current).backgroundColor
        if (value && !/rgba?\(0,\s*0,\s*0,\s*0\)/.test(value)) {
          background = value
          break
        }
        current = current.parentElement
      }
      return { background, color: getComputedStyle(node).color }
    })
  const [archiveColors, portColors] = await Promise.all([read(archiveBody), read(body)])
  const luminance = (rgb: string): number => {
    const parts = (rgb.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
    const [r = 0, g = 0, b = 0] = parts
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  }
  const contrast = (a: string, b: string): number => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
    return (hi + 0.05) / (lo + 0.05)
  }
  writeFileSync(
    info.outputPath(`signup-modal-${suffix}-approved-deviation.json`),
    JSON.stringify(
      {
        region: `signup-modal-${suffix}`,
        approved: '2026-10-19 by the project owner',
        reason:
          'the archived dark signup modal never receives its dark theme, because its scoped selectors cannot match a dialog teleported to <body>; reproducing it would ship an unreadable modal',
        archive: archiveColors,
        port: portColors,
        portTextContrast: contrast(portColors.color, portColors.background)
      },
      null,
      2
    )
  )
  // If the port ever matches the archive here, the deviation is gone and the
  // strict comparison below should be restored.
  expect(portColors).not.toEqual(archiveColors)
  // The port's own text must be readable — which the archived pair is not.
  expect(contrast(portColors.color, portColors.background)).toBeGreaterThanOrEqual(4.5)
}

/** Bounty (cards + visitor create) and STG (signup) cover both interaction shapes. */
const COMPARED = [EVENT_CATEGORIES[0], EVENT_CATEGORIES[2]]

for (const theme of ['light', 'dark'] as const) {
  test(`event pages match the archived ${theme} layout`, async ({
    context,
    page,
    isMobile
  }, info) => {
    await context.addInitScript(
      (mode) => localStorage.setItem('theme-preference', mode),
      theme
    )
    const archive = await context.newPage()
    // One raw v1 fixture response for the archive; the new BFF projects the same data.
    await useUpstreamFixtures(archive)
    // Guest writes are a test double only; the real BFF routes are a declared dependency.
    await stubGuestBff(page)
    await archive.emulateMedia({ reducedMotion: 'reduce' })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const suffix = `${theme}-${isMobile ? 'mobile' : 'desktop'}`

    for (const category of COMPARED) {
      await archive.goto(`${ARCHIVE_ORIGIN}${category.path}`)
      await waitForArchiveReady(archive)
      await page.goto(category.path)
      await expect(archive.getByRole('heading', { level: 1 })).toHaveText(category.title)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(category.title)
      await expect(archive.locator('html')).toHaveAttribute('data-theme', theme)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)

      // Rail + board + first card ("category / card" comparisons).
      await compareRegion(
        archive.locator('main'),
        page.locator('main'),
        `board-${category.type}-${suffix}`,
        info
      )
      if (await archive.locator('article').count()) {
        await compareRegion(
          archive.locator('article').first(),
          page.locator('article').first(),
          `card-${category.type}-${suffix}`,
          info
        )
      }
    }

    // Signup modal content (the archived Element Plus chrome is not compared).
    await archive.goto(`${ARCHIVE_ORIGIN}/events/stg`)
    await waitForArchiveReady(archive)
    await page.goto('/events/stg')
    const trigger = page.getByRole('button', { name: '我要参加' }).first()
    const archiveTrigger = archive.getByRole('button', { name: '我要参加' }).first()
    if ((await trigger.count()) && (await archiveTrigger.count())) {
      await trigger.click()
      await archiveTrigger.click()
      const archiveBody = archive.locator('.el-dialog__body').first()
      const body = page.locator('[data-region="modal-body"]')
      await expect(archiveBody).toBeVisible()
      await expect(body).toBeVisible()
      if (theme === 'dark') {
        await assertDarkModalDeviation(archiveBody, body, suffix, info)
      } else {
        await compareRegion(archiveBody, body, `signup-modal-${suffix}`, info)
      }
    }
    await archive.close()
  })
}
