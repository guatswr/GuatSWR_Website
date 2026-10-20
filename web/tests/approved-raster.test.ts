import { expect, test } from 'vitest'
import { approvedLogBorderPixel } from './e2e/support/approved-raster'
import type { RasterComparison } from './e2e/support/approved-raster'

function knownPixel(width = 2291, rawWidth = 2292): RasterComparison {
  const offset = (1789 * width + 670) * 4
  const image = (rgba: number[]) => ({ width, height: 2344, data: Object.assign({ length: width * 2344 * 4 }, Object.fromEntries(rgba.map((value, channel) => [offset + channel, value]))) })
  return {
    platform: 'linux', project: 'mobile', component: 'logs-table-dark',
    state: '/logs matches the archive (dark)', devicePixelRatio: 2.625,
    rawWidth, rawHeight: 2344, pixels: 1,
    archive: image([51, 65, 85, 255]), current: image([30, 41, 61, 255]), diff: image([255, 0, 0, 255]),
  }
}
test('recognizes only the exact documented user-approved edge pixel without erasing it', () => {
  expect(approvedLogBorderPixel(knownPixel())).toMatchObject({ id: '2026-10-20-user-linux-log-border', coordinate: { x: 670, y: 1789 }, masks: 0, significantPixels: 1 })
})
test('recognizes the same exact pixel with the independently measured local equal-width capture pair', () => {
  expect(approvedLogBorderPixel(knownPixel(2179, 2181))).toMatchObject({ coordinate: { x: 670, y: 1789 }, captureGeometry: { width: 2179, rawWidth: 2181, height: 2344 } })
})
test.each([
  { platform: 'win32' }, { project: 'desktop' }, { component: 'logs-table-light' },
  { state: '/members matches the archive (dark)' }, { devicePixelRatio: 2 },
  { rawWidth: 2291 }, { rawHeight: 2343 }, { pixels: 0 }, { pixels: 2 },
])('rejects a different scope, capture geometry or significant-pixel count: %j', (change) => {
  expect(approvedLogBorderPixel({ ...knownPixel(), ...change })).toBeUndefined()
})
test.each(['archive', 'current', 'diff'] as const)('rejects a different %s color or coordinate', key => {
  const data = knownPixel()
  data[key].data = new Uint8Array(0) // Correct colors somewhere else cannot authorize this location.
  expect(approvedLogBorderPixel(data)).toBeUndefined()
})
test('rejects altered cropped dimensions even when raw dimensions match', () => {
  const data = knownPixel(); data.current.width--
  expect(approvedLogBorderPixel(data)).toBeUndefined()
})
