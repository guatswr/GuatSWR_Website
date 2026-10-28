/** One read phase and one write phase for all scroll consumers in a window. */
export interface ScrollSnapshot {
  scrollY: number
  width: number
  height: number
}

export function createScrollFrame(host: {
  request(callback: () => void): number
  cancel(id: number): void
  snapshot(): ScrollSnapshot
}) {
  const reads = new Map<number, () => void>()
  let writes: Array<() => void> = []
  let frame: number | undefined
  let sequence = 0
  let current: ScrollSnapshot | undefined

  function schedule() {
    frame ??= host.request(render)
  }

  function render() {
    frame = undefined
    current = host.snapshot()
    const callbacks = [...reads.values()]
    reads.clear()
    try {
      for (const callback of callbacks) callback()
      const pending = writes
      writes = []
      for (const callback of pending) callback()
    }
    finally {
      current = undefined
      if (reads.size || writes.length) schedule()
    }
  }

  return {
    get snapshot() { return current },
    read(callback: () => void) {
      const id = ++sequence
      reads.set(id, callback)
      if (!current) schedule()
      return id
    },
    write(callback: () => void) {
      writes.push(callback)
      if (!current) schedule()
    },
    cancel(id: number) {
      reads.delete(id)
      if (!reads.size && !writes.length && frame !== undefined) {
        host.cancel(frame)
        frame = undefined
      }
    },
  }
}

const frames = new WeakMap<Window, ReturnType<typeof createScrollFrame>>()

export function browserScrollFrame(source: Window) {
  let frame = frames.get(source)
  if (!frame) {
    frame = createScrollFrame({
      request: callback => source.requestAnimationFrame(callback),
      cancel: id => source.cancelAnimationFrame(id),
      snapshot: () => ({ scrollY: source.scrollY, width: source.innerWidth, height: source.innerHeight }),
    })
    frames.set(source, frame)
  }
  return frame
}

/** Layout coordinates ignore the reveal/hover transforms on the measured node. */
export function documentLayoutRect(element: HTMLElement) {
  let top = 0
  let node: HTMLElement | null = element
  while (node) {
    top += node.offsetTop
    const parent = node.offsetParent as HTMLElement | null
    top += parent?.clientTop ?? 0
    node = parent
  }
  return { top, height: element.offsetHeight }
}
