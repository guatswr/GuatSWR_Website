/**
 * Parliament chart geometry, ported unchanged from the archived
 * `ParliamentChart.vue` so the seat distribution keeps its original design.
 *
 * The function is pure and deterministic: the same data always produces the
 * same seat coordinates, so the server and the client cannot disagree on the
 * SVG geometry. Rendering (SVG + accessible summary) lives in
 * `components/ParliamentChart.vue`.
 */

export interface ParliamentGroup {
  readonly label: string
  readonly value: number
  readonly color: string
}

export interface ParliamentSeat {
  readonly x: number
  readonly y: number
  readonly angle: number
  readonly r: number
  readonly color: string
  readonly label: string
}

export interface ParliamentConfig {
  readonly width: number
  readonly height: number
  readonly centerX: number
  readonly centerY: number
  readonly radiusInner: number
  readonly radiusOuter: number
  readonly rows: number
}

/** Archived configuration: 8 rows, 180 degrees, centre on the bottom edge. */
export const PARLIAMENT_CONFIG: ParliamentConfig = Object.freeze({
  width: 1000,
  height: 520,
  centerX: 500,
  centerY: 480,
  radiusInner: 200,
  radiusOuter: 450,
  rows: 8,
})

const MIN_DOT_RADIUS = 4
const MAX_DOT_RADIUS = 16
const DEFAULT_MIN_ARC = 40

export function parliamentTotal(groups: readonly ParliamentGroup[]): number {
  return groups.reduce((total, group) => total + Math.max(0, Math.trunc(group.value)), 0)
}

export function parliamentSeats(
  groups: readonly ParliamentGroup[],
  config: ParliamentConfig = PARLIAMENT_CONFIG,
): ParliamentSeat[] {
  const dotList: { color: string, label: string }[] = []
  for (const group of groups) {
    for (let index = 0; index < Math.max(0, Math.trunc(group.value)); index += 1) {
      dotList.push({ color: group.color, label: group.label })
    }
  }
  const totalDots = dotList.length
  if (totalDots === 0) return []

  const rowRadii: number[] = []
  const dr = (config.radiusOuter - config.radiusInner) / (config.rows - 1)
  for (let row = 0; row < config.rows; row += 1) rowRadii.push(config.radiusInner + row * dr)

  const rowLengths = rowRadii.map(radius => Math.PI * radius)
  const totalLength = rowLengths.reduce((sum, length) => sum + length, 0)
  const exactCounts = rowLengths.map(length => (length / totalLength) * totalDots)
  const rowCounts = exactCounts.map(count => Math.floor(count))

  const remainders = exactCounts.map((count, index) => ({ value: count - Math.floor(count), index }))
  const assigned = rowCounts.reduce((sum, count) => sum + count, 0)
  remainders.sort((a, b) => b.value - a.value)
  for (let index = 0; index < totalDots - assigned; index += 1) {
    const entry = remainders[index]
    if (!entry) break
    rowCounts[entry.index] = (rowCounts[entry.index] ?? 0) + 1
  }

  let minArcPerDot = Number.POSITIVE_INFINITY
  rowCounts.forEach((count, index) => {
    if (count <= 1) return
    const length = rowLengths[index]
    if (length === undefined) return
    const spacing = length / (count - 1)
    if (spacing < minArcPerDot) minArcPerDot = spacing
  })
  if (!Number.isFinite(minArcPerDot)) minArcPerDot = DEFAULT_MIN_ARC

  const generated: { x: number, y: number, angle: number }[] = []
  rowCounts.forEach((count, rowIndex) => {
    if (count === 0) return
    const radius = rowRadii[rowIndex]
    if (radius === undefined) return
    if (count === 1) {
      generated.push({
        x: config.centerX + radius * Math.cos(Math.PI / 2),
        y: config.centerY - radius * Math.sin(Math.PI / 2),
        angle: Math.PI / 2,
      })
      return
    }
    const angleStep = Math.PI / (count - 1)
    for (let index = 0; index < count; index += 1) {
      const angle = Math.PI - index * angleStep
      generated.push({
        x: config.centerX + radius * Math.cos(angle),
        y: config.centerY - radius * Math.sin(angle),
        angle,
      })
    }
  })

  // Measure the true minimum Euclidean distance across all seat pairs (including
  // phase-shifted seats on adjacent concentric rings) so circles never collide.
  let minPairDistance = Number.POSITIVE_INFINITY
  for (let i = 0; i < generated.length; i += 1) {
    const a = generated[i]!
    for (let j = i + 1; j < generated.length; j += 1) {
      const b = generated[j]!
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (dist > 0 && dist < minPairDistance) minPairDistance = dist
    }
  }

  const spacingBound = Math.min(minArcPerDot, dr, minPairDistance)
  const maxDiameter = spacingBound * 0.72
  const dotRadius = Math.max(MIN_DOT_RADIUS, Math.min(MAX_DOT_RADIUS, maxDiameter / 2))

  // Left to right, then paint in the configured group order (as archived).
  generated.sort((a, b) => b.angle - a.angle)
  return generated.map((seat, index) => ({
    ...seat,
    r: dotRadius,
    color: dotList[index]?.color ?? '#e5e7eb',
    label: dotList[index]?.label ?? '',
  }))
}
