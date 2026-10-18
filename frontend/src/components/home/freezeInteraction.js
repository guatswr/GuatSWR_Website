const activationEvents = [
  'click',
  'dblclick',
  'auxclick',
  'contextmenu',
  'submit',
  'reset',
  'dragstart',
  'beforeinput',
  'input',
  'change'
]
const pointerEvents = [
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'touchstart',
  'touchend'
]
const scrollKeys = new Set([
  'ArrowDown',
  'ArrowUp',
  'PageDown',
  'PageUp',
  'Home',
  'End',
  ' ',
  'Spacebar'
])

// The frost lives outside #app. Keep native scrolling available while the
// background is inert, including during the final fracture animation.
export function createFreezeInteractionLock(
  environment,
  { surface, background, onEscape }
) {
  let locked = false,
    previousFocus,
    previousInert,
    previousFrozen
  const capture = { capture: true }
  const passiveCapture = { capture: true, passive: true }
  const stop = (event) => event.stopImmediatePropagation()
  const block = (event) => {
    event.preventDefault()
    stop(event)
  }
  function keydown(event) {
    stop(event)
    if (event.key === 'Escape') {
      event.preventDefault()
      if (!event.repeat) onEscape()
      return
    }
    // Browser shortcuts remain browser-owned; no key reaches application
    // handlers. Unmodified navigation keys scroll the document normally.
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (!scrollKeys.has(event.key)) event.preventDefault()
  }
  function keyRelease(event) {
    stop(event)
    if (!(event.ctrlKey || event.metaKey || event.altKey))
      event.preventDefault()
  }
  function focusin(event) {
    if (event.target === surface || surface.contains(event.target)) return
    stop(event)
    surface.focus({ preventScroll: true })
  }
  function restoreAttribute(name, value) {
    if (!background) return
    if (value === null) background.removeAttribute(name)
    else background.setAttribute(name, value)
  }
  return {
    lock() {
      if (locked) return
      locked = true
      previousFocus = environment.document.activeElement
      previousInert = background?.getAttribute('inert') ?? null
      previousFrozen = background?.getAttribute('data-cirno-frozen') ?? null
      background?.setAttribute('inert', '')
      background?.setAttribute('data-cirno-frozen', '')
      for (const type of activationEvents)
        environment.addEventListener(type, block, capture)
      for (const type of pointerEvents)
        environment.addEventListener(type, stop, passiveCapture)
      environment.addEventListener('keydown', keydown, capture)
      environment.addEventListener('keyup', keyRelease, capture)
      environment.addEventListener('keypress', keyRelease, capture)
      environment.addEventListener('focusin', focusin, capture)
      surface.focus({ preventScroll: true })
    },
    unlock() {
      if (!locked) return
      locked = false
      for (const type of activationEvents)
        environment.removeEventListener(type, block, capture)
      for (const type of pointerEvents)
        environment.removeEventListener(type, stop, passiveCapture)
      environment.removeEventListener('keydown', keydown, capture)
      environment.removeEventListener('keyup', keyRelease, capture)
      environment.removeEventListener('keypress', keyRelease, capture)
      environment.removeEventListener('focusin', focusin, capture)
      restoreAttribute('inert', previousInert)
      restoreAttribute('data-cirno-frozen', previousFrozen)
      if (previousFocus?.isConnected && !previousFocus.closest?.('[inert]')) {
        previousFocus.focus({ preventScroll: true })
      }
    }
  }
}
