interface ImageBytes { width: number; height: number; data: ArrayLike<number> }
export interface RasterComparison {
  platform: string
  project: string
  component: string
  state: string
  devicePixelRatio: number
  rawWidth: number
  rawHeight: number
  pixels: number
  archive: ImageBytes
  current: ImageBytes
  diff: ImageBytes
}

/** Explicit human approval, not a global tolerance or an image mask. */
export function approvedLogBorderPixel(input: RasterComparison) {
  if (input.platform !== 'linux' || input.project !== 'mobile'
    || input.component !== 'logs-table-dark' || input.state !== '/logs matches the archive (dark)'
    || input.devicePixelRatio !== 2.625 || input.rawHeight !== 2344
    || input.pixels !== 1) return undefined
  // Each measured browser/font environment retains equal old/new geometry.
  // The whole table width differs, but the approved pixel and its colors do not.
  const geometry = [
    { width: 2291, rawWidth: 2292, source: 'GitHub Ubuntu artifact 12240298746' },
    { width: 2179, rawWidth: 2181, source: 'local pinned Noble browser, Node 24.16.0' },
  ].find(value => value.rawWidth === input.rawWidth && value.width === input.archive.width)
  if (!geometry) return undefined
  for (const image of [input.archive, input.current, input.diff])
    if (image.width !== geometry.width || image.height !== 2344) return undefined
  const x = 670, y = 1789, offset = (y * geometry.width + x) * 4
  const same = (data: ArrayLike<number>, rgba: number[]) => rgba.every((value, channel) => data[offset + channel] === value)
  if (!same(input.archive.data, [51, 65, 85, 255])
    || !same(input.current.data, [30, 41, 61, 255])
    || !same(input.diff.data, [255, 0, 0, 255])) return undefined
  return {
    id: '2026-10-20-user-linux-log-border',
    reason: 'User approved only the documented Linux mobile dark-log avatar-border pixel.',
    coordinate: { x, y },
    archiveRGBA: [51, 65, 85, 255],
    currentRGBA: [30, 41, 61, 255],
    significantPixels: 1,
    captureGeometry: { width: geometry.width, rawWidth: geometry.rawWidth, height: 2344, source: geometry.source },
    masks: 0,
    report: 'docs/revamp/evidence/linux-log-raster-953dc79/README.md',
  } as const
}
