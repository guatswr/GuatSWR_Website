import { browserScrollFrame, documentLayoutRect } from './scroll-frame'
import { scrollExitRange } from './scroll-range'

/** Native scroll timelines keep scroll-linked effects off the JS thread. */
export function supportsScrollTimeline() {
  return typeof CSS !== 'undefined'
    && CSS.supports('animation-timeline', 'scroll(root block)')
    && CSS.supports('animation-range', '0px 1px')
}

function createHeroTimeline(source: Window) {
  const records = new Map<HTMLElement, { signature: string; hero: boolean }>()
  const frame = browserScrollFrame(source)
  let pending: number | undefined
  let resize: ResizeObserver | undefined
  let navbar: HTMLElement | null = null
  let mutation: MutationObserver | undefined
  let preference: MediaQueryList | undefined

  function clear(element: HTMLElement) {
    const record = records.get(element)
    if (!record) return
    element.classList.remove('club-scroll-reveal')
    delete element.dataset.scrollNative
    delete element.dataset.scrollReady
    delete element.dataset.scrollVariant
    delete element.dataset.nativeEnter
    element.style.removeProperty('--hero-exit-start')
    element.style.removeProperty('--hero-exit-end')
    element.style.removeProperty('--section-exit-start')
    element.style.removeProperty('--section-exit-end')
    record.signature = ''
  }

  function measure() {
    pending = undefined
    const nav = source.document.querySelector<HTMLElement>('.club-navbar')
    if (nav !== navbar) {
      mutation?.disconnect()
      navbar = nav
      if (nav) mutation?.observe(nav, { attributes: true, attributeFilter: ['data-collapse-scroll'] })
    }
    const width = frame.snapshot?.width ?? source.innerWidth
    const rawAnchor = navbar?.dataset.collapseScroll
    const anchor = rawAnchor === undefined ? undefined : Number(rawAnchor)
    const height = frame.snapshot?.height ?? source.innerHeight
    // Keep the same CSSAnimation objects while the navbar expands/contracts.
    // An out-of-document range holds the hero at its initial appearance until
    // the navbar settles, without tearing down and repainting its layers.
    const parkedStart = source.document.documentElement.scrollHeight + height
    const updates = [...records.entries()].map(([element, record]) => {
      const rect = documentLayoutRect(element)
      if (!record.hero) {
        const range = scrollExitRange(rect.height, height, width)
        const start = rect.top - range.startTop
        return { element, start, end: start + range.span }
      }
      const origin = width >= 1024 ? anchor : rect.top
      const start = origin === undefined ? parkedStart : origin + rect.height * 0.3
      return { element, start, end: start + rect.height * 0.5 }
    })
    frame.write(() => {
      for (const { element, start, end } of updates) {
        const record = records.get(element)
        if (!record) continue
        if (preference?.matches) { clear(element); continue }
        if (record.hero) {
          element.classList.add('club-scroll-reveal')
          element.dataset.scrollVariant = 'hero'
        }
        element.dataset.scrollNative = 'true'
        if (start === undefined || end === undefined || !Number.isFinite(start)) {
          delete element.dataset.scrollReady
          record.signature = ''
          continue
        }
        const signature = `${start}:${end}`
        if (record.signature === signature) continue
        const prefix = record.hero ? '--hero-exit' : '--section-exit'
        element.style.setProperty(`${prefix}-start`, `${start}px`)
        element.style.setProperty(`${prefix}-end`, `${end}px`)
        element.dataset.scrollReady = 'true'
        record.signature = signature
      }
    })
  }

  function schedule() {
    pending ??= frame.read(measure)
  }

  function start() {
    preference = source.matchMedia('(prefers-reduced-motion: reduce)')
    preference.addEventListener('change', schedule)
    resize = new ResizeObserver(schedule)
    resize.observe(source.document.documentElement)
    mutation = new MutationObserver(schedule)
    source.addEventListener('resize', schedule, { passive: true })
    source.document.addEventListener('load', schedule, true)
    source.document.fonts?.addEventListener('loadingdone', schedule)
  }

  return {
    mount(element: HTMLElement, hero = true) {
      if (!records.size) start()
      records.set(element, { signature: '', hero })
      if (!hero && !preference?.matches && element.dataset.reveal === 'pending') element.dataset.nativeEnter = 'true'
      resize?.observe(element)
      schedule()
    },
    unmount(element: HTMLElement) {
      if (!records.has(element)) return
      resize?.unobserve(element)
      clear(element)
      records.delete(element)
      if (records.size) return
      if (pending !== undefined) frame.cancel(pending)
      pending = undefined
      resize?.disconnect()
      mutation?.disconnect()
      navbar = null
      preference?.removeEventListener('change', schedule)
      source.removeEventListener('resize', schedule)
      source.document.removeEventListener('load', schedule, true)
      source.document.fonts?.removeEventListener('loadingdone', schedule)
    },
  }
}

let native: ReturnType<typeof createHeroTimeline> | undefined
const mounted = new WeakSet<HTMLElement>()
const sections = new WeakSet<HTMLElement>()

export function mountHeroTimeline(element: HTMLElement) {
  if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined' || !supportsScrollTimeline()) return false
  native ??= createHeroTimeline(window)
  native.mount(element)
  mounted.add(element)
  return true
}

export function unmountHeroTimeline(element: HTMLElement) {
  if (!mounted.delete(element)) return false
  native?.unmount(element)
  return true
}

export function hasHeroTimeline(element: HTMLElement) {
  return mounted.has(element)
}

function finishEntrance(event: AnimationEvent) {
  if (event.target === event.currentTarget && event.animationName === 'club-native-enter-scale') {
    delete (event.currentTarget as HTMLElement).dataset.nativeEnter
  }
}

export function mountSectionTimeline(element: HTMLElement) {
  native ??= createHeroTimeline(window)
  native.mount(element, false)
  sections.add(element)
  element.addEventListener('animationend', finishEntrance)
}

export function hasSectionTimeline(element: HTMLElement) {
  return sections.has(element)
}

export function unmountSectionTimeline(element: HTMLElement) {
  if (!sections.delete(element)) return false
  element.removeEventListener('animationend', finishEntrance)
  native?.unmount(element)
  return true
}
