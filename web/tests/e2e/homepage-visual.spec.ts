import { expect, test } from '@playwright/test'
import {
  ARCHIVE_ORIGIN,
  compareRegion,
  settleImages,
  useUpstreamFixtures,
  waitForArchiveReady
} from './support/public-parity'

const regions = [
  { name: 'hero', selector: '.club-banner' },
  { name: 'interests', selector: '#interests' },
  { name: 'about', selector: '#about' },
  { name: 'archive', selector: 'section[aria-labelledby="archive-title"]' },
  { name: 'community', selector: 'section[aria-labelledby="community-title"]' }
] as const

for (const theme of ['light', 'dark'] as const) {
  test(`homepage matches the archived ${theme} layout`, async ({
    context,
    page,
    isMobile
  }, info) => {
    await context.addInitScript(
      (mode) => localStorage.setItem('theme-preference', mode),
      theme
    )
    const archive = await context.newPage()
    // One raw v1 fixture response for the archive; the new BFF projects the
    // same upstream data, so both sides render the same content.
    await useUpstreamFixtures(archive)
    await archive.emulateMedia({ reducedMotion: 'reduce' })
    await page.emulateMedia({ reducedMotion: 'reduce' })

    await archive.goto(`${ARCHIVE_ORIGIN}/`)
    await waitForArchiveReady(archive)
    await settleImages(archive)

    await page.goto('/')
    await settleImages(page)

    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await expect(archive.locator('html')).toHaveAttribute('data-theme', theme)
    // Both sides must have painted the same fixture-driven content.
    await expect(archive.getByRole('heading', { level: 1 })).toHaveText('桂航绯想天')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('桂航绯想天')

    for (const region of regions) {
      await compareRegion(
        archive.locator(region.selector),
        page.locator(region.selector),
        `${region.name}-${theme}-${isMobile ? 'mobile' : 'desktop'}`,
        info
      )
    }
    await archive.close()
  })
}
