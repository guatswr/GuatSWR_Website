const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const pointText = (points) =>
  points.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
const mix = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t
})
const line = (point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`

// Repeatable geometry keeps neighbouring panels joined and resize/replays stable.
// Every visible panel is also its own fracture fragment; no replacement debris wall.
export function createIceField(width, height) {
  const w = Math.max(240, Math.round(Number(width) || 1440))
  const h = Math.max(240, Math.round(Number(height) || 900))
  const unit = Math.min(w, h)
  let seed = 9
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  const panels = [],
    branches = [],
    chips = []

  for (const edge of ['top', 'right', 'bottom', 'left']) {
    const horizontal = edge === 'top' || edge === 'bottom'
    const length = horizontal ? w : h
    const count = clamp(Math.round(length / 140), 4, horizontal ? 14 : 10)
    const base = unit * (horizontal ? 0.075 : 0.058)
    const at = (s, d) => {
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
            : ((i + (random() - 0.5) * 0.5) * length) / count,
      depth:
        base *
        (0.65 +
          random() * 0.7 +
          Math.pow(Math.abs(i / count - 0.5) * 2, 4) * 0.85)
    }))

    for (let i = 0; i < count; i++) {
      const a = marks[i],
        b = marks[i + 1]
      const corners = [
        at(a.s, -12),
        at(b.s, -12),
        at(b.s, b.depth),
        at(a.s, a.depth)
      ]
      const center = mix(
        mix(corners[0], corners[2], 0.5),
        mix(corners[1], corners[3], 0.5),
        0.5
      )
      const start = mix(corners[0], corners[1], 0.42)
      const bend = mix(start, center, 0.58)
      bend.x += (random() - 0.5) * base * 0.4
      const fork = mix(center, corners[2], 0.6)
      panels.push({
        id: `${edge}-${i}`,
        points: pointText(corners),
        facets: corners.map((corner, j) =>
          pointText([corner, corners[(j + 1) % 4], center])
        ),
        rim: `M${line(corners[3])} L${line(corners[2])}`,
        crack: `M${line(start)} L${line(bend)} L${line(center)} L${line(fork)} L${line(corners[2])} M${line(center)} L${line(mix(center, corners[3], 0.7))}`,
        origin: `${center.x.toFixed(1)}px ${center.y.toFixed(1)}px`,
        dx: (center.x - w / 2) * (0.15 + random() * 0.2),
        dy: 130 + random() * 260 + h * 0.12,
        spin: (random() - 0.5) * 100,
        delay: Math.round(random() * 150),
        growDelay: Math.round((i / count) * 260 + random() * 140),
        growX: edge === 'left' ? -24 : edge === 'right' ? 24 : 0,
        growY: edge === 'top' ? -24 : edge === 'bottom' ? 24 : 0,
        crackAt: (random() * 0.42).toFixed(3)
      })
      const anchor = at((a.s + b.s) / 2, base * 0.25)
      branches.push({
        id: `${edge}-${i}`,
        x: anchor.x,
        y: anchor.y,
        angle:
          { top: 0, right: 90, bottom: 180, left: 270 }[edge] +
          (random() - 0.5) * 30,
        scale: clamp(unit / 850, 0.45, 1.15) * (0.6 + random() * 0.7)
      })
      if (i % 2 === 0) {
        const p = at((a.s + b.s) / 2, base * (0.8 + random()))
        chips.push({
          id: `${edge}-${i}`,
          x: p.x,
          y: p.y,
          size: 5 + random() * 12,
          dx: (random() - 0.5) * 250,
          dy: 120 + random() * 360,
          spin: (random() - 0.5) * 260,
          delay: Math.round(random() * 160)
        })
      }
    }
  }

  const crystals = [-1, 1].flatMap((side) =>
    [0, 1, 2].map((i) => {
      const size = unit * [0.16, 0.19, 0.14][i]
      return {
        id: `wing-${side}-${i}`,
        x: side < 0 ? unit * 0.045 : w - unit * 0.045,
        y: h * [0.22, 0.46, 0.72][i],
        size,
        angle: side * [34, 68, 116][i],
        dx: side * (80 + i * 45),
        dy: 180 + i * 85,
        spin: side * (35 + i * 18),
        delay: i * 55
      }
    })
  )
  return { width: w, height: h, panels, branches, chips, crystals }
}
