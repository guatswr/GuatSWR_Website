const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Shared pixel range for native timelines and the JavaScript fallback. */
export function scrollExitRange(height: number, viewportHeight: number, viewportWidth = 1280) {
  height = Math.max(height, 1)
  const compact = viewportWidth < 640
  const startTop = clamp(
    viewportHeight * (compact ? 0.26 : 0.22) - Math.max(0, height - 160) * 0.32,
    compact ? 92 : 68,
    viewportHeight * (compact ? 0.28 : 0.24),
  )
  const span = Math.max(
    viewportHeight * (compact ? 0.24 : 0.26),
    Math.min(height * 0.8 + 88, viewportHeight * 0.44),
    1,
  )
  return { startTop, span }
}
