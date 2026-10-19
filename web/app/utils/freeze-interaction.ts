/**
 * Port of the archived `frontend/src/components/home/freezeInteraction.js`.
 *
 * The frost lives outside the Nuxt root element. Keep native scrolling
 * available while the background is inert, including during the final fracture
 * animation, and always restore the previous attributes and focus on unlock.
 */

export type FreezeEventType =
  | 'click'
  | 'dblclick'
  | 'auxclick'
  | 'contextmenu'
  | 'submit'
  | 'reset'
  | 'dragstart'
  | 'beforeinput'
  | 'input'
  | 'change'
  | 'pointerdown'
  | 'pointerup'
  | 'mousedown'
  | 'mouseup'
  | 'touchstart'
  | 'touchend'
  | 'keydown'
  | 'keyup'
  | 'keypress'
  | 'focusin'

export interface FreezeEvent {
  readonly target?: unknown
  readonly key?: string
  readonly repeat?: boolean
  readonly ctrlKey?: boolean
  readonly metaKey?: boolean
  readonly altKey?: boolean
  readonly defaultPrevented: boolean
  preventDefault(): void
  stopImmediatePropagation(): void
}

export interface FreezeListenerOptions {
  capture?: boolean
  passive?: boolean
}

export interface FocusTarget {
  isConnected?: boolean
  closest?(selector: string): unknown
  focus?(options?: { preventScroll: boolean }): void
}

export interface FreezeSurface extends FocusTarget {
  contains(other: unknown): boolean
}

/** Only the part of `document` the lock touches; `Element` satisfies it. */
export interface FrozenDocument {
  activeElement: FocusTarget | null
}

export interface FreezeBackground {
  getAttribute(name: string): string | null
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
}

export interface FreezeEnvironment {
  document: FrozenDocument
  addEventListener(
    type: FreezeEventType,
    listener: (event: FreezeEvent) => void,
    options?: FreezeListenerOptions
  ): void
  removeEventListener(
    type: FreezeEventType,
    listener: (event: FreezeEvent) => void,
    options?: FreezeListenerOptions
  ): void
}

export interface FreezeInteractionOptions {
  surface: FreezeSurface
  background?: FreezeBackground | null
  onEscape(): void
}

export interface FreezeInteractionLock {
  lock(): void
  unlock(): void
}

const activationEvents: readonly FreezeEventType[] = [
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
const pointerEvents: readonly FreezeEventType[] = [
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'touchstart',
  'touchend'
]
const scrollKeys = new Set<string>([
  'ArrowDown',
  'ArrowUp',
  'PageDown',
  'PageUp',
  'Home',
  'End',
  ' ',
  'Spacebar'
])

export function createFreezeInteractionLock(
  environment: FreezeEnvironment,
  { surface, background, onEscape }: FreezeInteractionOptions
): FreezeInteractionLock {
  let locked = false
  let previousFocus: FocusTarget | null | undefined
  let previousInert: string | null | undefined
  let previousFrozen: string | null | undefined
  const capture: FreezeListenerOptions = { capture: true }
  const passiveCapture: FreezeListenerOptions = { capture: true, passive: true }
  const stop = (event: FreezeEvent): void => event.stopImmediatePropagation()
  const block = (event: FreezeEvent): void => {
    event.preventDefault()
    stop(event)
  }

  function keydown(event: FreezeEvent): void {
    stop(event)
    if (event.key === 'Escape') {
      event.preventDefault()
      if (!event.repeat) onEscape()
      return
    }
    // Browser shortcuts remain browser-owned; no key reaches application
    // handlers. Unmodified navigation keys scroll the document normally.
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (!scrollKeys.has(event.key ?? '')) event.preventDefault()
  }

  function keyRelease(event: FreezeEvent): void {
    stop(event)
    if (!(event.ctrlKey || event.metaKey || event.altKey)) event.preventDefault()
  }

  function focusin(event: FreezeEvent): void {
    if (event.target === surface || surface.contains(event.target)) return
    stop(event)
    surface.focus?.({ preventScroll: true })
  }

  function restoreAttribute(name: string, value: string | null | undefined): void {
    if (!background) return
    if (value === null || value === undefined) background.removeAttribute(name)
    else background.setAttribute(name, value)
  }

  return {
    lock(): void {
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
      surface.focus?.({ preventScroll: true })
    },
    unlock(): void {
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
        previousFocus.focus?.({ preventScroll: true })
      }
    }
  }
}
