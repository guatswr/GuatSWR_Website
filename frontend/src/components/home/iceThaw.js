export const thawDistance = (height) =>
  Math.min(240, Math.max(120, height * 0.22))
export const thawProgress = (scrollY, origin, distance) =>
  Math.min(1, Math.max(0, (scrollY - origin) / distance))

// Only observe native scrolling. Wheel, touch and navigation keys retain their
// default behaviour; fracture progress never moves the document for the reader.
export function createIceThawController(environment, { onChange, onComplete }) {
  let started = false,
    finished = false,
    frame,
    timer,
    origin,
    distance
  let progress = 0,
    phase = 'frozen',
    reduced = false
  const preference = environment.matchMedia('(prefers-reduced-motion: reduce)')
  const notify = () => onChange({ progress, phase, reduced })
  const cancelFrame = () => {
    if (frame !== undefined) environment.cancelAnimationFrame(frame)
    frame = undefined
  }
  function detach() {
    cancelFrame()
    environment.clearTimeout(timer)
    environment.removeEventListener('scroll', schedule)
    environment.removeEventListener('resize', resize)
    environment.removeEventListener('keydown', keydown)
    preference.removeEventListener('change', preferenceChanged)
  }
  function complete() {
    if (finished) return
    finished = true
    detach()
    onComplete()
  }
  function shatter() {
    if (!started || finished || phase === 'shattering') return
    phase = 'shattering'
    progress = 1
    cancelFrame()
    notify()
    timer = environment.setTimeout(complete, reduced ? 160 : 1450)
  }
  function render() {
    frame = undefined
    if (finished || phase === 'shattering') return
    const next = Math.max(
      progress,
      thawProgress(environment.scrollY, origin, distance)
    )
    if (next === progress) return
    progress = next
    if (progress >= 1) shatter()
    else notify()
  }
  function schedule() {
    if (frame === undefined && !finished && phase !== 'shattering') {
      frame = environment.requestAnimationFrame(render)
    }
  }
  function resize() {
    distance = thawDistance(environment.innerHeight)
    schedule()
  }
  function keydown(event) {
    const target = event.target
    if (
      event.defaultPrevented ||
      event.repeat ||
      target?.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)
    )
      return
    if (event.key === 'Escape') shatter()
  }
  function preferenceChanged() {
    reduced = preference.matches
    notify()
    if (reduced && phase === 'shattering') {
      environment.clearTimeout(timer)
      timer = environment.setTimeout(complete, 160)
    }
  }
  return {
    start() {
      if (started || finished) return
      started = true
      origin = environment.scrollY
      distance = thawDistance(environment.innerHeight)
      reduced = preference.matches
      environment.addEventListener('scroll', schedule, { passive: true })
      environment.addEventListener('resize', resize, { passive: true })
      environment.addEventListener('keydown', keydown)
      preference.addEventListener('change', preferenceChanged)
      notify()
    },
    shatter,
    destroy() {
      finished = true
      detach()
    }
  }
}
