export type HealthCheckState = 'ok' | 'failed' | 'timeout'
export interface ReadinessReport {
  readonly status: 'ready' | 'not_ready'
  readonly service: string
  readonly checks: Readonly<Record<string, HealthCheckState>>
}

/** Bounded probes share work, including checks that ignore cancellation. */
export function createReadinessProbe(options: {
  service: string
  checks: Readonly<Record<string, (signal: AbortSignal) => Promise<void>>>
  timeoutMs?: number
  cacheMs?: number
}) {
  const timeoutMs = options.timeoutMs ?? 1200
  const cacheMs = options.cacheMs ?? 1000
  if (!Object.keys(options.checks).length || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000
    || !Number.isInteger(cacheMs) || cacheMs < 0 || cacheMs > 5000) throw new Error('Invalid health probe configuration')
  const active = new Map<string, Set<(state: HealthCheckState) => void>>()
  let pending: Promise<ReadinessReport> | undefined
  let cached: ReadinessReport | undefined
  let until = 0

  const check = (name: string, run: (signal: AbortSignal) => Promise<void>, signal: AbortSignal): Promise<HealthCheckState> => {
    let listeners = active.get(name)
    if (!listeners) {
      listeners = new Set()
      active.set(name, listeners)
      const current = listeners
      const complete = (state: HealthCheckState) => {
        active.delete(name)
        for (const notify of current) notify(state)
        current.clear()
      }
      void Promise.resolve().then(() => run(signal)).then(() => complete('ok'), () => complete('failed'))
    }
    return new Promise(resolve => {
      const finish = (state: HealthCheckState) => {
        listeners.delete(finish)
        signal.removeEventListener('abort', timeout)
        resolve(state)
      }
      const timeout = () => finish('timeout')
      listeners.add(finish)
      signal.addEventListener('abort', timeout, { once: true })
      if (signal.aborted) timeout()
    })
  }
  return (): Promise<ReadinessReport> => {
    if (pending) return pending
    if (cached && Date.now() < until) return Promise.resolve(cached)
    const signal = new AbortController()
    const deadline = setTimeout(() => signal.abort(), timeoutMs)
    pending = Promise.all(Object.entries(options.checks).map(async ([name, run]) => [name, await check(name, run, signal.signal)] as const))
      .then(entries => {
        cached = { status: entries.every(([, state]) => state === 'ok') ? 'ready' : 'not_ready', service: options.service, checks: Object.fromEntries(entries) }
        until = Date.now() + cacheMs
        return cached
      }).finally(() => { clearTimeout(deadline); pending = undefined })
    return pending
  }
}
