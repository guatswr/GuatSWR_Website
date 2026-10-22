import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { HistoryContentResponse } from '../../shared/content'

interface HistoryMotionProbe {
  starts: Record<string, number>
  ends: Record<string, number>
  contentStarts: Record<string, number>
  contentEnds: Record<string, number>
  imageStartStates: Record<string, string>
  visibleMotion: Record<string, { minY: number, maxY: number, frames: number }>
  rootStyleChanges: number
  settledOpacityDrops: number
  unstableTouchSurfaces: number
  unstableTouchLabels: number
  inkStarts: Record<string, number>
  inkEnds: Record<string, number>
  inkFrames: Record<string, number>
  touchStarts: number
  touchEnds: number
  entryReadsWhileTouching: number
  nodes: HTMLElement[]
}

declare global {
  interface Window { historyMotionProbe: HistoryMotionProbe }
}

async function openLongHistory(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe: HistoryMotionProbe = { starts: {}, ends: {}, contentStarts: {}, contentEnds: {}, imageStartStates: {}, visibleMotion: {}, rootStyleChanges: 0, settledOpacityDrops: 0, unstableTouchSurfaces: 0, unstableTouchLabels: 0, inkStarts: {}, inkEnds: {}, inkFrames: {}, touchStarts: 0, touchEnds: 0, entryReadsWhileTouching: 0, nodes: [] }
    window.historyMotionProbe = probe
    window.addEventListener('touchstart', () => probe.touchStarts++, { passive: true })
    window.addEventListener('touchend', () => probe.touchEnds++, { passive: true })
    const originalRect = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
      if (probe.touchStarts > probe.touchEnds && this.matches('.history-entry')) probe.entryReadsWhileTouching++
      return originalRect.call(this)
    }
    for (const [type, counts] of [['animationstart', probe.starts], ['animationend', probe.ends]] as const) {
      document.addEventListener(type, (event) => {
        const target = event.target
        if (!(target instanceof HTMLElement)) return
        const touch = target.closest<HTMLElement>('.history-stage')?.dataset.historyMotion === 'touch'
        const index = target.closest<HTMLElement>('.history-entry')?.dataset.historyIndex
        if (touch && index && target.matches('.history-year-banner, .history-date-seal')) {
          const inkCounts = type === 'animationstart' ? probe.inkStarts : probe.inkEnds
          const key = `${index}:${target.matches('.history-year-banner') ? 'year' : 'seal'}`
          inkCounts[key] = (inkCounts[key] ?? 0) + 1
        }
        if (touch && index && target.dataset.historyReveal) {
          const contentCounts = type === 'animationstart' ? probe.contentStarts : probe.contentEnds
          const key = `${index}:${target.dataset.historyReveal}`
          contentCounts[key] = (contentCounts[key] ?? 0) + 1
          if (type === 'animationstart' && target.dataset.historyReveal === 'image') {
            probe.imageStartStates[key] = target.querySelector<HTMLElement>('.progressive-image')?.dataset.imageState ?? ''
          }
        }
        if (!target.matches(touch ? '.history-card-meta' : '.history-card')) return
        if (index) counts[index] = (counts[index] ?? 0) + 1
      }, true)
    }
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.target instanceof Element && record.target.matches('.history-stage, .history-timeline')) probe.rootStyleChanges++
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['style'] })
    const sample = (): void => {
      for (const label of document.querySelectorAll<HTMLElement>('.history-stage[data-history-motion="touch"] .history-year-banner, .history-stage[data-history-motion="touch"] .history-date-seal')) {
        for (const node of [label, ...label.children]) {
          const style = getComputedStyle(node)
          if (style.opacity !== '1' || style.transform !== 'none' || style.translate !== 'none' || style.scale !== 'none') probe.unstableTouchLabels++
        }
        const decoration = getComputedStyle(label, label.matches('.history-year-banner') ? '::before' : '::after')
        if (decoration.opacity !== '1') probe.unstableTouchLabels++
        const rect = label.getBoundingClientRect()
        if (rect.top >= innerHeight || rect.bottom <= 0 || decoration.clipPath === 'none') continue
        const clippedRight = Number.parseFloat(decoration.clipPath.split(' ')[1] ?? '')
        if (clippedRight > 0 && clippedRight < 100) {
          const key = `${label.closest<HTMLElement>('.history-entry')?.dataset.historyIndex}:${label.matches('.history-year-banner') ? 'year' : 'seal'}`
          probe.inkFrames[key] = (probe.inkFrames[key] ?? 0) + 1
        }
      }
      for (const card of document.querySelectorAll<HTMLElement>('.history-card')) {
        const index = card.closest<HTMLElement>('.history-entry')?.dataset.historyIndex
        if (index && probe.ends[index] && getComputedStyle(card).opacity !== '1') probe.settledOpacityDrops++
        if (card.closest<HTMLElement>('.history-stage')?.dataset.historyMotion === 'touch') {
          const style = getComputedStyle(card)
          const image = card.querySelector('.pi-full')
          const bitmap = image ? getComputedStyle(image) : null
          const date = card.querySelector('.history-card-meta')
          const dateStyle = date ? getComputedStyle(date) : null
          if (style.opacity !== '1' || style.transform !== 'none' || style.translate !== 'none'
            || (dateStyle && (dateStyle.opacity !== '1' || dateStyle.transform !== 'none' || dateStyle.translate !== 'none'))
            || (bitmap && (bitmap.opacity !== '1' || bitmap.transform !== 'none' || bitmap.scale !== 'none' || bitmap.translate !== 'none'))) probe.unstableTouchSurfaces++
          for (const block of card.querySelectorAll<HTMLElement>('.history-figure, .history-prose-box')) {
            if (block.dataset.revealState !== 'visible') continue
            const transform = getComputedStyle(block).transform
            if (transform === 'none') continue
            const offset = new DOMMatrixReadOnly(transform).m42
            if (offset < 0.1) continue
            const rect = block.getBoundingClientRect()
            if (rect.top >= innerHeight || rect.bottom <= 0) continue
            const key = `${index}:${block.dataset.historyReveal}`
            const motion = probe.visibleMotion[key] ??= { minY: offset, maxY: offset, frames: 0 }
            motion.minY = Math.min(motion.minY, offset)
            motion.maxY = Math.max(motion.maxY, offset)
            motion.frames++
          }
        }
      }
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
  const response = await page.request.get('/api/content/history')
  expect(response.ok()).toBe(true)
  const content = await response.json() as HistoryContentResponse
  const source = content.items.find(item => item.image)
  expect(source).toBeTruthy()
  const items = Array.from({ length: 8 }, (_, index) => ({
    ...source!, id: 100 + index, date: `${2026 - index}-04-11`, title: `群史动画回归 ${index + 1}`,
  }))
  await page.route('**/api/content/history*', route => route.fulfill({ json: { items } }))
  await page.goto('/members')
  await page.getByRole('contentinfo').getByRole('link', { name: '群史', exact: true }).click()
  await expect(page.locator('.history-stage')).toHaveClass(/is-entered/)
  await expect(page.locator('.history-entry')).toHaveCount(8)
  await expect(page.locator('.club-page-enter-active, .club-page-leave-active')).toHaveCount(0)
  await page.mouse.move(0, 0)
  await page.evaluate(() => {
    window.historyMotionProbe.nodes = [...document.querySelectorAll<HTMLElement>('.history-card')]
  })
}

async function touchDrag(page: Page, down: boolean): Promise<void> {
  const session = await page.context().newCDPSession(page)
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 210, y: down ? 700 : 100 }] })
  for (let step = 1; step <= 25; step++) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 210, y: down ? 700 - step * 24 : 100 + step * 24 }] })
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())))
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await session.detach()
}

test('history retains its animations while scrolling without hiding settled cards', async ({ page, isMobile }, info) => {
  await openLongHistory(page)
  const first = page.locator('#history-0 .history-card')
  await expect(page.locator('.history-stage')).toHaveAttribute('data-history-motion', isMobile ? 'touch' : 'pointer')
  await expect(first).toHaveCSS('animation-name', isMobile ? 'none' : /history-card-enter-/)
  if (isMobile) {
    const date = page.locator('#history-0 .history-card-meta')
    await expect(date).toHaveCSS('animation-name', 'none')
    await expect.poll(() => date.evaluate(node => getComputedStyle(node, '::after').animationName)).toBe('history-touch-date-rule')
    await expect.poll(() => first.evaluate(node => getComputedStyle(node, '::before').animationName)).toBe('history-touch-surface')
  }
  await expect(page.locator('.history-glow-vermilion')).toHaveCSS('animation-name', isMobile ? 'history-touch-glow' : /history-ambient-drift/)
  await expect.poll(() => page.evaluate(() => window.historyMotionProbe.ends['0'] ?? 0)).toBe(1)
  await expect(first).toHaveCSS('translate', isMobile ? 'none' : '0px -3px')
  const astrolabe = page.locator('.history-astrolabe.is-primary')
  const initialAngle = await astrolabe.evaluate(node => getComputedStyle(node).transform)
  const progress = page.locator('.history-spine-progress')
  const initialProgress = await progress.evaluate(node => getComputedStyle(node).transform)

  if (isMobile) await touchDrag(page, true)
  else await page.mouse.wheel(0, 600)
  // A successfully dispatched gesture is insufficient: require real scrolling.
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(300)
  await expect.poll(() => progress.evaluate(node => getComputedStyle(node).transform)).not.toBe(initialProgress)
  await expect.poll(() => astrolabe.evaluate(node => getComputedStyle(node).transform)).not.toBe(initialAngle)
  for (let step = 0; step < 3; step++) {
    if (isMobile) await touchDrag(page, true)
    else await page.mouse.wheel(0, 600)
  }
  await page.locator('#history-4 .history-card').scrollIntoViewIfNeeded()
  await expect.poll(() => page.evaluate(() => window.historyMotionProbe.ends['4'] ?? 0)).toBe(1)
  await expect(page.locator(`#history-4 ${isMobile ? '.history-card-meta' : '.history-card'}`)).toHaveCSS('animation-name', isMobile ? 'none' : /history-card-enter-/)
  if (isMobile) {
    const figure = page.locator('#history-4 .history-figure')
    const timing = await figure.evaluate((node) => {
      const style = getComputedStyle(node)
      return { duration: parseFloat(style.animationDuration), delay: parseFloat(style.animationDelay) }
    })
    expect(timing.duration).toBeLessThanOrEqual(0.5)
    expect(timing.delay).toBe(0)
    await expect(figure).toHaveCSS('clip-path', 'none')
    await expect(figure).toHaveCSS('opacity', '1')
    await expect(figure).toHaveCSS('transform', 'none')
    const body = page.locator('#history-4 .history-prose-box')
    // Fully visible at the bottom edge can still be outside the reading zone.
    await body.evaluate(node => scrollTo({ top: scrollY + node.getBoundingClientRect().top - innerHeight * 0.55, behavior: 'instant' }))
    await expect(body).toHaveAttribute('data-reveal-state', 'visible')
    await expect(body).toHaveCSS('transform', 'none')
  }
  if (isMobile) await touchDrag(page, false)
  else await page.mouse.wheel(0, -600)
  await page.locator('.history-year-bar a[href="#history-0"]').click()
  await expect(page.locator('#history-0')).toHaveClass(/is-active/)
  await expect(first).toHaveCSS('translate', isMobile ? 'none' : '0px -3px')

  const result = await page.evaluate(() => {
    const probe = window.historyMotionProbe
    return {
      starts: probe.starts, ends: probe.ends, rootStyleChanges: probe.rootStyleChanges,
      settledOpacityDrops: probe.settledOpacityDrops,
      unstableTouchSurfaces: probe.unstableTouchSurfaces,
      unstableTouchLabels: probe.unstableTouchLabels,
      entryReadsWhileTouching: probe.entryReadsWhileTouching,
      visibleMotion: probe.visibleMotion, imageStartStates: probe.imageStartStates,
      sameNodes: probe.nodes.every((node, index) => node === document.querySelectorAll('.history-card')[index]),
    }
  })
  expect(result.rootStyleChanges).toBe(0)
  expect(result.settledOpacityDrops).toBe(0)
  expect(result.unstableTouchSurfaces).toBe(0)
  expect(result.unstableTouchLabels).toBe(0)
  expect(result.sameNodes).toBe(true)
  if (isMobile) expect(result.entryReadsWhileTouching).toBe(0)
  if (isMobile) {
    for (const kind of ['image', 'body']) {
      const motion = result.visibleMotion[`4:${kind}`]
      expect(motion.frames).toBeGreaterThanOrEqual(3)
      expect(motion.maxY - motion.minY).toBeGreaterThan(4)
    }
    expect(result.imageStartStates['4:image']).toBe('ready')
  }
  expect(result.starts['0']).toBe(1)
  expect(result.starts['4']).toBe(1)
  for (const count of Object.values(result.starts)) expect(count).toBe(1)
  await page.locator('#history-0 .history-figure').click()
  await expect(page.getByRole('dialog', { name: '图片预览' })).toBeVisible()
  await page.getByRole('button', { name: '关闭图片预览' }).click()
  await info.attach('history-animation-probe', { body: JSON.stringify(result), contentType: 'application/json' })
  await info.attach('history-animations-preserved', { body: await page.screenshot(), contentType: 'image/png' })
})

test('touch pointer entry does not latch the mouse hover focus', async ({ page, isMobile }) => {
  await page.goto('/history')
  await expect(page.locator('.history-stage')).toHaveClass(/is-entered/)
  const first = page.locator('#history-0')
  const second = page.locator('#history-1')
  await expect(first).toHaveClass(/is-active/)
  await second.dispatchEvent('pointerenter', { pointerType: 'touch' })
  await expect(first).toHaveClass(/is-active/)
  await expect(second).not.toHaveClass(/is-active/)
  await second.dispatchEvent('pointerenter', { pointerType: 'mouse' })
  if (isMobile) await expect(first).toHaveClass(/is-active/)
  else await expect(second).toHaveClass(/is-active/)
  await second.dispatchEvent('pointerleave', { pointerType: 'mouse' })
  await expect(first).toHaveClass(/is-active/)
  if (!isMobile) {
    await page.locator('#history-0 .history-figure').hover()
    await expect(page.locator('#history-0 .pi-full')).toHaveCSS('transform', 'matrix(1.025, 0, 0, 1.025, 0, 0)')
  }
})

test('year headings and date seals draw once without fading or scaling their text', async ({ page, isMobile }, info) => {
  await openLongHistory(page)
  if (!isMobile) {
    await expect(page.locator('#history-0 .history-year-banner')).toHaveCSS('animation-name', /history-banner-enter/)
    return
  }
  const year = page.locator('#history-4 .history-year-banner')
  const seal = page.locator('#history-4 .history-date-seal')
  await year.evaluate(node => scrollTo({ top: scrollY + node.getBoundingClientRect().top - innerHeight * 0.3, behavior: 'instant' }))
  await expect(year).toHaveAttribute('data-reveal-state', 'visible')
  for (const kind of ['year', 'seal']) {
    await expect.poll(() => page.evaluate(key => window.historyMotionProbe.inkEnds[key] ?? 0, `4:${kind}`)).toBe(1)
  }
  for (const [label, pseudo] of [[year, '::before'], [seal, '::after']] as const) {
    await expect(label).toHaveCSS('opacity', '1')
    await expect(label).toHaveCSS('transform', 'none')
    await expect.poll(() => label.evaluate((node, ornament) => getComputedStyle(node, ornament).clipPath, pseudo)).toBe('none')
  }
  await touchDrag(page, true)
  await touchDrag(page, false)
  await page.locator('#history-7 .history-year-banner').scrollIntoViewIfNeeded()
  await year.scrollIntoViewIfNeeded()
  await expect(seal).toBeInViewport()
  const result = await page.evaluate(() => ({ starts: window.historyMotionProbe.inkStarts, frames: window.historyMotionProbe.inkFrames, unstable: window.historyMotionProbe.unstableTouchLabels }))
  expect(result.unstable).toBe(0)
  for (const kind of ['year', 'seal']) {
    expect(result.starts[`4:${kind}`]).toBe(1)
    expect(result.frames[`4:${kind}`]).toBeGreaterThanOrEqual(3)
  }
  await info.attach('stable-year-and-seal', { body: JSON.stringify(result), contentType: 'application/json' })
  await info.attach('mobile-year-and-seal', { body: await page.screenshot(), contentType: 'image/png' })
})

test('touch mode supports wide screens and settles focus after finger release', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await openLongHistory(page)
  const stage = page.locator('.history-stage')
  await stage.dispatchEvent('pointerdown', { pointerType: 'touch' })
  await expect(stage).toHaveAttribute('data-history-motion', 'touch')
  await expect(page.locator('#history-0')).toHaveClass(/is-active/)
  const session = await page.context().newCDPSession(page)
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 210, y: 700 }] })
  await expect.poll(() => page.evaluate(() => window.historyMotionProbe.touchStarts)).toBe(1)
  await page.locator('#history-4').evaluate(node => {
    window.scrollTo({ top: scrollY + node.getBoundingClientRect().top - innerHeight * 0.25, behavior: 'instant' })
  })
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(1000)
  const readsBeforeResize = await page.evaluate(() => window.historyMotionProbe.entryReadsWhileTouching)
  // Android Chrome changes viewport height when its toolbar collapses.
  await page.setViewportSize({ width: 1024, height: 740 })
  // Observe longer than the settle deadline while contact is still active.
  await page.evaluate(async () => {
    const start = performance.now()
    while (performance.now() - start < 180) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  })
  await expect(page.locator('#history-0')).toHaveClass(/is-active/)
  expect(await page.evaluate(() => window.historyMotionProbe.entryReadsWhileTouching)).toBe(readsBeforeResize)
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page.locator('#history-4')).toHaveClass(/is-active/)
  await expect(page.locator('#history-4 .history-card')).toHaveCSS('translate', 'none')
  await expect(page.locator('#history-4 .history-card')).toHaveCSS('transform', 'none')
  await expect.poll(() => page.locator('#history-4 .history-card').evaluate(node => getComputedStyle(node, '::after').opacity)).toBe('0.65')
  await session.detach()
})

test('image loading uses the touch poster without fading or scaling the bitmap', async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 390, height: 1200 })
  let releaseImage!: () => void
  const imageGate = new Promise<void>(resolve => { releaseImage = resolve })
  await page.route('**/uploads/img/History/**', async (route) => {
    await imageGate
    await route.continue()
  })
  try {
    await openLongHistory(page)
    const image = page.locator('#history-0 .pi-full')
    const wrapper = page.locator('#history-0 .progressive-image')
    await expect(wrapper).toHaveAttribute('data-image-reveal', isMobile ? 'uncover' : 'fade')
    await expect(wrapper).toHaveAttribute('data-image-managed', 'true')
    await expect(image).toHaveCSS('opacity', isMobile ? '1' : '0')
    if (isMobile) {
      await expect(image).toHaveCSS('transform', 'none')
      await expect(image).toHaveCSS('scale', 'none')
      await expect(page.locator('#history-0 .history-figure')).toHaveAttribute('data-reveal-state', 'pending')
      expect(await page.evaluate(() => window.historyMotionProbe.contentStarts['0:image'] ?? 0)).toBe(0)
    }
    releaseImage()
    await expect(wrapper).toHaveAttribute('data-image-state', 'ready')
    await expect(image).toHaveCSS('opacity', '1')
    await expect(page.locator('#history-0 .pi-placeholder')).toHaveCSS('opacity', '0')
    if (isMobile) {
      await expect.poll(() => page.evaluate(() => window.historyMotionProbe.contentEnds['0:image'] ?? 0)).toBe(1)
      const result = await page.evaluate(() => ({ state: window.historyMotionProbe.imageStartStates['0:image'], motion: window.historyMotionProbe.visibleMotion['0:image'] }))
      expect(result.state).toBe('ready')
      expect(result.motion.frames).toBeGreaterThanOrEqual(3)
      expect(result.motion.maxY - result.motion.minY).toBeGreaterThan(4)
    }
  }
  finally { releaseImage() }
})

test('the touch chapter dock navigates years and follows reading progress', async ({ page, isMobile }, info) => {
  await openLongHistory(page)
  const dock = page.locator('.history-touch-dock')
  if (!isMobile) {
    await expect(dock).toBeHidden()
    return
  }
  await page.locator('#history-0').evaluate(node => {
    window.scrollTo({ top: scrollY + node.getBoundingClientRect().top - innerHeight * 0.2, behavior: 'instant' })
  })
  await expect(dock).toBeVisible()
  await expect(dock.locator('.history-touch-dock-year')).toHaveText('2026 年卷')
  await expect(dock.getByRole('button', { name: '上一年卷' })).toBeDisabled()
  const progress = page.locator('.history-spine-progress')
  const initialProgress = await progress.evaluate(node => getComputedStyle(node).transform)
  await dock.getByRole('button', { name: '下一年卷' }).click()
  await expect.poll(() => page.locator('#history-1').evaluate(node => Math.abs(node.getBoundingClientRect().top - innerHeight * 0.24))).toBeLessThan(3)
  await expect(page.locator('#history-1')).toHaveClass(/is-active/)
  await expect(dock.locator('.history-touch-dock-year')).toHaveText('2025 年卷')
  await expect(dock.locator('.history-touch-dock-count')).toHaveText('2 / 8')
  // Model an earlier lazy image changing height after the smooth jump ends.
  await page.locator('#history-0 .history-figure').evaluate(node => { node.style.height = '320px' })
  await expect.poll(() => page.locator('#history-1').evaluate(node => Math.abs(node.getBoundingClientRect().top - innerHeight * 0.24))).toBeLessThan(3)
  await expect.poll(() => progress.evaluate(node => getComputedStyle(node).transform)).not.toBe(initialProgress)
  await expect.poll(() => dock.locator('.history-touch-dock-track > span').evaluate(node => getComputedStyle(node).transform)).not.toBe('matrix(0, 0, 0, 1, 0, 0)')
  await page.locator('#history-1 .history-figure').click()
  await expect(dock).toHaveAttribute('inert', '')
  await page.getByRole('button', { name: '关闭图片预览' }).click()
  await expect(dock).not.toHaveAttribute('inert')
  await info.attach('touch-chapter-dock', { body: await page.screenshot(), contentType: 'image/png' })
})

test('touch dates stay readable while image and body reveal separately once', async ({ page }) => {
  await openLongHistory(page)
  // A tall heading places the image/body below the fold inside the same card.
  await page.addStyleTag({ content: '#history-4 .history-card-title { min-height: 110vh; }' })
  await page.locator('.history-stage').dispatchEvent('pointerdown', { pointerType: 'touch' })
  const date = page.locator('#history-4 .history-card-meta')
  const image = page.locator('#history-4 .history-figure')
  const body = page.locator('#history-4 .history-prose-box')
  await date.evaluate(node => scrollTo({ top: scrollY + node.getBoundingClientRect().top - innerHeight * 0.2, behavior: 'instant' }))
  await expect(date).toHaveAttribute('data-reveal-state', 'visible')
  await expect(date).toHaveCSS('opacity', '1')
  await expect(date).toHaveCSS('transform', 'none')
  await expect(image).toHaveAttribute('data-reveal-state', 'pending')
  await expect(body).toHaveAttribute('data-reveal-state', 'pending')

  for (const [block, kind] of [[image, 'image'], [body, 'body']] as const) {
    await block.scrollIntoViewIfNeeded()
    await expect(block).toHaveAttribute('data-reveal-state', 'visible')
    await expect.poll(() => page.evaluate(key => window.historyMotionProbe.contentEnds[key] ?? 0, `4:${kind}`)).toBe(1)
    await expect(block).toHaveCSS('opacity', '1')
    await expect(block).toHaveCSS('clip-path', 'none')
  }
  await date.scrollIntoViewIfNeeded()
  await body.scrollIntoViewIfNeeded()
  const counts = await page.evaluate(() => ({ starts: window.historyMotionProbe.contentStarts, unstable: window.historyMotionProbe.unstableTouchSurfaces }))
  expect(counts.starts['4:image']).toBe(1)
  expect(counts.starts['4:body']).toBe(1)
  expect(counts.unstable).toBe(0)
})

test('the existing reduced-motion preference still suppresses motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/history')
  await expect(page.locator('.history-stage')).not.toHaveClass(/is-entered/)
  await expect(page.locator('.history-entry.is-unrevealed')).toHaveCount(0)
  await expect(page.locator('#history-0 .history-card')).toHaveCSS('animation-name', 'none')
  await expect(page.locator('#history-0 .history-card')).toHaveCSS('translate', 'none')
  await expect(page.locator('#history-0 .history-figure')).toHaveCSS('animation-name', 'none')
  await expect(page.locator('#history-0 .history-prose-box')).toHaveCSS('animation-name', 'none')
})
