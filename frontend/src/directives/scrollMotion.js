const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))

function options(value) {
  const input = typeof value === 'number' ? { offset: value } : value || {}
  return {
    variant: ['hero', 'image', 'card'].includes(input.variant)
      ? input.variant
      : 'text',
    offset: clamp(Number(input.offset) || 0, 0, 120)
  }
}

// Read the stable wrapper; animate its children so transforms cannot feed back
// into the next frame's geometry. Progress is reversible, without scroll control.
export function scrollProgress(
  rect,
  viewportHeight,
  value,
  viewportWidth = 1280
) {
  const config = options(value)
  if (config.variant === 'hero') {
    return viewportWidth < 1024
      ? 0
      : clamp(-rect.top / Math.max(rect.height, 1))
  }
  const progress = clamp(
    (viewportHeight * 0.94 - rect.top - config.offset) / (viewportHeight * 0.4)
  )
  return progress * progress * (3 - 2 * progress)
}

export function createScrollMotionController(environment) {
  const records = new Map()
  const active = new Set()
  let preference, observer, frame
  const document = environment?.document
  const supported =
    environment?.IntersectionObserver &&
    environment?.requestAnimationFrame &&
    environment?.cancelAnimationFrame &&
    environment?.matchMedia &&
    environment?.addEventListener &&
    document

  function clear(record) {
    record.element.classList.remove('club-scroll-reveal')
    record.element.style.removeProperty('--scroll-progress')
    delete record.element.dataset.scrollVariant
    record.last = undefined
  }

  function write(record, progress) {
    const value = record.focused
      ? record.config.variant === 'hero'
        ? 0
        : 1
      : progress
    const rounded = value.toFixed(4)
    if (record.last === rounded) return
    record.element.style.setProperty('--scroll-progress', rounded)
    record.last = rounded
  }

  function render() {
    frame = undefined
    if (document.hidden || !observer) return
    // All layout reads happen before any style writes.
    const updates = [...active].map((record) => [
      record,
      scrollProgress(
        record.element.getBoundingClientRect(),
        environment.innerHeight,
        record.config,
        environment.innerWidth
      )
    ])
    for (const [record, progress] of updates) write(record, progress)
  }

  function schedule() {
    if (frame === undefined && observer && !document.hidden) {
      frame = environment.requestAnimationFrame(render)
    }
  }

  function cancelFrame() {
    if (frame !== undefined) environment.cancelAnimationFrame(frame)
    frame = undefined
  }

  function visibilityChanged() {
    if (document.hidden) cancelFrame()
    else schedule()
  }

  function activate(record) {
    record.element.dataset.scrollVariant = record.config.variant
    record.element.classList.add('club-scroll-reveal')
    active.add(record)
    observer.observe(record.element)
  }

  function stop() {
    cancelFrame()
    observer?.disconnect()
    observer = undefined
    active.clear()
    environment.removeEventListener('scroll', schedule)
    environment.removeEventListener('resize', schedule)
    document.removeEventListener('visibilitychange', visibilityChanged)
    for (const record of records.values()) clear(record)
  }

  function preferenceChanged() {
    stop()
    if (preference.matches) return
    try {
      observer = new environment.IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const record = records.get(entry.target)
            if (!record) continue
            if (entry.isIntersecting) active.add(record)
            else {
              active.delete(record)
              write(
                record,
                scrollProgress(
                  entry.boundingClientRect,
                  environment.innerHeight,
                  record.config,
                  environment.innerWidth
                )
              )
            }
          }
          schedule()
        },
        { rootMargin: '160px 0px' }
      )
      environment.addEventListener('scroll', schedule, { passive: true })
      environment.addEventListener('resize', schedule, { passive: true })
      document.addEventListener('visibilitychange', visibilityChanged)
      for (const record of records.values()) activate(record)
      schedule()
    } catch {
      stop() // Unsupported environments keep all content visible.
    }
  }

  return {
    mount(element, value) {
      if (!supported || records.has(element)) return
      const record = { element, config: options(value), focused: false }
      record.focusIn = () => {
        record.focused = true
        write(record, 1)
      }
      record.focusOut = (event) => {
        record.focused = element.contains(event.relatedTarget)
        schedule()
      }
      records.set(element, record)
      element.addEventListener('focusin', record.focusIn)
      element.addEventListener('focusout', record.focusOut)
      if (!preference) {
        preference = environment.matchMedia('(prefers-reduced-motion: reduce)')
        preference.addEventListener('change', preferenceChanged)
        preferenceChanged()
      } else if (observer) {
        activate(record)
        schedule()
      }
    },
    update(element, value) {
      const record = records.get(element)
      if (!record) return
      record.config = options(value)
      if (observer) element.dataset.scrollVariant = record.config.variant
      schedule()
    },
    unmount(element) {
      const record = records.get(element)
      if (!record) return
      observer?.unobserve(element)
      active.delete(record)
      element.removeEventListener('focusin', record.focusIn)
      element.removeEventListener('focusout', record.focusOut)
      clear(record)
      records.delete(element)
      if (!records.size) {
        stop()
        preference?.removeEventListener('change', preferenceChanged)
        preference = undefined
      }
    }
  }
}

let sharedController
const controller = () =>
  (sharedController ||= createScrollMotionController(
    typeof window === 'undefined' ? undefined : window
  ))

export const vScrollReveal = {
  mounted: (element, binding) => controller().mount(element, binding.value),
  updated: (element, binding) => controller().update(element, binding.value),
  beforeUnmount: (element) => controller().unmount(element)
}
