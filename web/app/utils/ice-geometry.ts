/**
 * Port of the archived `frontend/src/components/home/iceGeometry.js`.
 *
 * Repeatable geometry keeps neighbouring panels joined and resize/replays
 * stable. Every visible panel is also its own fracture fragment; there is no
 * replacement debris wall. The value sequence is a seeded LCG, so the same
 * viewport always produces the same ice field.
 */

export interface IcePoint {
  x: number
  y: number
}

export type IceFacetTone = 'deep' | 'mid' | 'light' | 'specular'

export interface IceSubFacet {
  points: string
  tone: IceFacetTone
  opacity: number
}

export interface IcePanel {
  id: string
  points: string
  crownPoints: string
  bevel: string
  facets: string[]
  subFacets: IceSubFacet[]
  rim: string
  innerRim: string
  glint: string
  crack: string
  hairlineCrack: string
  origin: string
  dx: number
  dy: number
  spin: number
  delay: number
  growDelay: number
  growX: number
  growY: number
  crackAt: string
}

export interface IceBranch {
  id: string
  x: number
  y: number
  angle: number
  scale: number
  variant: 0 | 1
  opacity: number
}

export interface IceChip {
  id: string
  x: number
  y: number
  size: number
  points: string
  facet: string
  dx: number
  dy: number
  spin: number
  delay: number
}

export interface IceCrystal {
  id: string
  x: number
  y: number
  size: number
  angle: number
  dx: number
  dy: number
  spin: number
  delay: number
  growDelay: number
  growX: number
  growY: number
  origin: string
}

export interface IceSheetCrack {
  id: string
  main: string
  branches: string
  crackAt: string
  origin: string
  dx: number
  dy: number
  spin: number
  delay: number
}

export interface IceDust {
  id: string
  x: number
  y: number
  r: number
  delay: number
  duration: number
}

export interface IceField {
  width: number
  height: number
  panels: IcePanel[]
  branches: IceBranch[]
  chips: IceChip[]
  crystals: IceCrystal[]
  sheetCracks: IceSheetCrack[]
  dust: IceDust[]
}

type Edge = 'top' | 'right' | 'bottom' | 'left'

const EDGES: readonly Edge[] = ['top', 'right', 'bottom', 'left']
const EDGE_ANGLES: Record<Edge, number> = { top: 0, right: 90, bottom: 180, left: 270 }
const CRYSTAL_SIZES = [0.16, 0.19, 0.14] as const
const CRYSTAL_OFFSETS = [0.22, 0.46, 0.72] as const
const CRYSTAL_ANGLES = [34, 68, 116] as const
const FACET_TONES: readonly IceFacetTone[] = ['deep', 'light', 'mid', 'specular']

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))
const pointText = (points: IcePoint[]): string =>
  points.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
const mix = (a: IcePoint, b: IcePoint, t: number): IcePoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t
})
const line = (point: IcePoint): string =>
  `${point.x.toFixed(1)} ${point.y.toFixed(1)}`

export function createIceField(width: number, height: number): IceField {
  const w = Math.max(240, Math.round(Number(width) || 1440))
  const h = Math.max(240, Math.round(Number(height) || 900))
  const unit = Math.min(w, h)
  let seed = 9
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  const panels: IcePanel[] = []
  const branches: IceBranch[] = []
  const chips: IceChip[] = []
  const sheetCracks: IceSheetCrack[] = []

  for (const edge of EDGES) {
    const horizontal = edge === 'top' || edge === 'bottom'
    const length = horizontal ? w : h
    const count = clamp(Math.round(length / 140), 4, horizontal ? 14 : 10)
    const base = unit * (horizontal ? 0.088 : 0.068)
    const at = (s: number, d: number): IcePoint => {
      if (edge === 'top') return { x: s, y: d }
      if (edge === 'right') return { x: w - d, y: s }
      if (edge === 'bottom') return { x: w - s, y: h - d }
      return { x: d, y: h - s }
    }
    const marks = Array.from({ length: count + 1 }, (_, i) => ({
      s:
        i === 0
          ? 0
          : i === count
            ? length
            : ((i + (random() - 0.5) * 0.48) * length) / count,
      depth:
        base *
        (0.68 +
          random() * 0.72 +
          Math.pow(Math.abs(i / count - 0.5) * 2, 3.6) * 0.92)
    }))

    for (let i = 0; i < count; i++) {
      const a = marks[i]
      const b = marks[i + 1]
      if (!a || !b) continue
      const [c0, c1, c2, c3] = [
        at(a.s, -14),
        at(b.s, -14),
        at(b.s, b.depth),
        at(a.s, a.depth)
      ] as const
      const corners: IcePoint[] = [c0, c1, c2, c3]
      const center = mix(mix(c0, c2, 0.5), mix(c1, c3, 0.5), 0.5)

      // Jagged crystal teeth protruding along the inner edge (c3 -> c2),
      // while keeping c3 and c2 fixed so neighboring panels join without gaps.
      const span = b.s - a.s
      const avgDepth = (a.depth + b.depth) * 0.5
      const toothA = at(
        a.s + span * (0.24 + random() * 0.1),
        a.depth * 0.7 + b.depth * 0.3 + base * (0.12 + random() * 0.24)
      )
      const peak = at(
        a.s + span * (0.48 + (random() - 0.5) * 0.14),
        avgDepth + base * (0.28 + random() * 0.36)
      )
      const toothB = at(
        a.s + span * (0.72 + random() * 0.1),
        a.depth * 0.28 + b.depth * 0.72 + base * (0.08 + random() * 0.22)
      )

      // Internal cleavage ridge points for 3D stepped bevel & subsurface facets
      const ridgeA = mix(c0, toothA, 0.66)
      const ridgePeak = mix(mix(c0, c1, 0.5), peak, 0.72)
      const ridgeB = mix(c1, toothB, 0.68)

      const subFacets: IceSubFacet[] = [
        {
          points: pointText([c0, ridgeA, center]),
          tone: FACET_TONES[i % 4] ?? 'deep',
          opacity: 0.52
        },
        {
          points: pointText([c0, c1, ridgePeak, ridgeA]),
          tone: 'light',
          opacity: 0.44
        },
        {
          points: pointText([c1, ridgeB, ridgePeak]),
          tone: 'deep',
          opacity: 0.48
        },
        {
          points: pointText([ridgeA, ridgePeak, peak, toothA]),
          tone: 'specular',
          opacity: 0.64
        },
        {
          points: pointText([ridgePeak, ridgeB, toothB, peak]),
          tone: 'mid',
          opacity: 0.5
        },
        {
          points: pointText([c3, ridgeA, toothA]),
          tone: 'light',
          opacity: 0.58
        },
        {
          points: pointText([ridgeB, c2, toothB]),
          tone: 'deep',
          opacity: 0.46
        }
      ]

      const start = mix(c0, c1, 0.38 + random() * 0.24)
      const bend = mix(start, center, 0.54)
      bend.x += (random() - 0.5) * base * 0.38
      bend.y += (random() - 0.5) * base * 0.22
      const fork = mix(center, peak, 0.58)
      const branchLeft = mix(center, c3, 0.72)
      const branchRight = mix(fork, c2, 0.65)
      const microA = mix(bend, ridgeA, 0.75)
      const microB = mix(fork, toothA, 0.8)

      const delay = Math.round(random() * 150)
      panels.push({
        id: `${edge}-${i}`,
        points: pointText(corners),
        crownPoints: pointText([c0, c1, c2, toothB, peak, toothA, c3]),
        bevel: pointText([c3, toothA, peak, toothB, c2, ridgeB, ridgePeak, ridgeA]),
        facets: corners.map((corner, j) =>
          pointText([corner, corners[(j + 1) % 4] ?? corner, center])
        ),
        subFacets,
        rim: `M${line(c3)} L${line(toothA)} L${line(peak)} L${line(toothB)} L${line(c2)}`,
        innerRim: `M${line(c3)} L${line(ridgeA)} L${line(ridgePeak)} L${line(ridgeB)} L${line(c2)}`,
        glint: `M${line(ridgeA)} L${line(peak)} L${line(ridgeB)}`,
        crack: `M${line(start)} L${line(bend)} L${line(center)} L${line(fork)} L${line(peak)} M${line(center)} L${line(branchLeft)} M${line(fork)} L${line(branchRight)}`,
        hairlineCrack: `M${line(bend)} L${line(microA)} L${line(toothA)} M${line(center)} L${line(ridgePeak)} M${line(fork)} L${line(microB)}`,
        origin: `${center.x.toFixed(1)}px ${center.y.toFixed(1)}px`,
        dx: (center.x - w / 2) * (0.16 + random() * 0.22),
        dy: 130 + random() * 260 + h * 0.12,
        spin: (random() - 0.5) * 105,
        delay,
        growDelay: Math.round((i / count) * 240 + random() * 130),
        growX: edge === 'left' ? -28 : edge === 'right' ? 28 : 0,
        growY: edge === 'top' ? -28 : edge === 'bottom' ? 28 : 0,
        crackAt: (random() * 0.42).toFixed(3)
      })

      const anchor = at((a.s + b.s) / 2, base * 0.22)
      const isCorner = i === 0 || i === count - 1
      branches.push({
        id: `${edge}-${i}`,
        x: anchor.x,
        y: anchor.y,
        angle: EDGE_ANGLES[edge] + (random() - 0.5) * 28,
        scale:
          clamp(unit / 800, 0.5, 1.25) *
          (0.68 + random() * 0.72) *
          (isCorner ? 1.24 : 1),
        variant: (i % 2) as 0 | 1,
        opacity: Number((0.56 + random() * 0.34).toFixed(2))
      })

      if (isCorner) {
        const secondaryAnchor = at(
          a.s + span * (i === 0 ? 0.25 : 0.75),
          base * 0.42
        )
        branches.push({
          id: `${edge}-${i}-plume`,
          x: secondaryAnchor.x,
          y: secondaryAnchor.y,
          angle: EDGE_ANGLES[edge] + (i === 0 ? 22 : -22) + (random() - 0.5) * 14,
          scale: clamp(unit / 780, 0.55, 1.3) * (0.82 + random() * 0.45),
          variant: 1,
          opacity: Number((0.62 + random() * 0.28).toFixed(2))
        })
      }

      if (i % 2 === 0) {
        const p = at((a.s + b.s) / 2, base * (0.78 + random() * 0.95))
        const s = 5.5 + random() * 12.5
        const chipPts: IcePoint[] = [
          { x: 0, y: -s },
          { x: s * (0.52 + random() * 0.25), y: -s * 0.12 },
          { x: s * 0.28, y: s * (0.55 + random() * 0.2) },
          { x: -s * (0.38 + random() * 0.2), y: s * 0.18 },
          { x: -s * 0.48, y: -s * 0.36 }
        ]
        chips.push({
          id: `${edge}-${i}`,
          x: p.x,
          y: p.y,
          size: s,
          points: pointText(chipPts),
          facet: pointText([chipPts[0]!, chipPts[1]!, chipPts[2]!, { x: 0, y: 0 }]),
          dx: (random() - 0.5) * 270,
          dy: 120 + random() * 360,
          spin: (random() - 0.5) * 280,
          delay: Math.round(random() * 160)
        })
      }

      // Generate long spanning stress cracks across the central glaze sheet
      if (i === Math.floor(count * 0.28) || i === Math.floor(count * 0.72)) {
        const reach = unit * (0.34 + random() * 0.24)
        const sMid = (a.s + b.s) * 0.5
        const p0 = peak
        const p1 = at(sMid + (random() - 0.5) * span * 0.9, avgDepth + reach * 0.32)
        const p2 = at(sMid + (random() - 0.5) * span * 1.4, avgDepth + reach * 0.68)
        const p3 = at(sMid + (random() - 0.5) * span * 1.8, avgDepth + reach)
        const f1 = at(sMid + span * (0.55 + random() * 0.45), avgDepth + reach * 0.52)
        const f2 = at(sMid - span * (0.5 + random() * 0.45), avgDepth + reach * 0.84)
        sheetCracks.push({
          id: `sheet-${edge}-${i}`,
          main: `M${line(p0)} L${line(p1)} L${line(p2)} L${line(p3)}`,
          branches: `M${line(p1)} L${line(f1)} M${line(p2)} L${line(f2)}`,
          crackAt: (0.08 + random() * 0.48).toFixed(3),
          origin: `${p1.x.toFixed(1)}px ${p1.y.toFixed(1)}px`,
          dx: (p1.x - w / 2) * 0.14,
          dy: 140 + random() * 180,
          spin: (random() - 0.5) * 42,
          delay: Math.round(random() * 110)
        })
      }
    }
  }

  const crystals: IceCrystal[] = []
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const size = unit * (CRYSTAL_SIZES[i] ?? 0)
      const x = side < 0 ? unit * 0.045 : w - unit * 0.045
      const y = h * (CRYSTAL_OFFSETS[i] ?? 0)
      crystals.push({
        id: `wing-${side}-${i}`,
        x,
        y,
        size,
        angle: side * (CRYSTAL_ANGLES[i] ?? 0),
        dx: side * (80 + i * 45),
        dy: 180 + i * 85,
        spin: side * (35 + i * 18),
        delay: i * 55,
        growDelay: 90 + i * 75,
        growX: side * -22,
        growY: (i - 1) * 14,
        origin: '0px 0px'
      })
    }
  }

  const dust: IceDust[] = Array.from({ length: 24 }, (_, i) => ({
    id: `dust-${i}`,
    x: Number(((0.06 + random() * 0.88) * w).toFixed(1)),
    y: Number(((0.06 + random() * 0.88) * h).toFixed(1)),
    r: Number((1.1 + random() * 2.1).toFixed(2)),
    delay: Math.round(random() * 2400),
    duration: Math.round(2200 + random() * 2200)
  }))

  return {
    width: w,
    height: h,
    panels,
    branches,
    chips,
    crystals,
    sheetCracks,
    dust
  }
}
