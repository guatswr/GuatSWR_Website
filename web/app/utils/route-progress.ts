export interface RouteProgressState {
  phase: 'idle' | 'loading' | 'complete' | 'hiding'
  progress: number
  error: boolean
  generation: number
  path: string
}
export interface NavigationToken { id: number, path: string }
export const navigationPath = (path: string): string => path.replace(/\/+$/, '') || '/'
export const createRouteProgressState = (): RouteProgressState => ({
  phase: 'idle', progress: 0, error: false, generation: 0, path: '',
})

/** Estimated feedback, owned by one navigation. Stale completions cannot
 * finish its successor, even when both navigations have the same path. */
export function createRouteProgress(state: RouteProgressState, reducedMotion: () => boolean) {
  let tick: ReturnType<typeof setInterval> | undefined
  let hide: ReturnType<typeof setTimeout> | undefined
  let reset: ReturnType<typeof setTimeout> | undefined
  const clear = () => { clearInterval(tick); clearTimeout(hide); clearTimeout(reset) }
  const owns = (token: NavigationToken | undefined) => token?.id === state.generation && token.path === state.path
  const cancel = (token?: NavigationToken) => {
    if (token && !owns(token)) return
    clear()
    Object.assign(state, { phase: 'idle', progress: 0, error: false, generation: state.generation + 1, path: '' })
  }
  const start = (path: string): NavigationToken => {
    clear()
    path = navigationPath(path)
    Object.assign(state, { phase: 'loading', progress: 0.12, error: false, generation: state.generation + 1, path })
    tick = setInterval(() => {
      if (!reducedMotion()) state.progress += (0.92 - state.progress) * 0.08
    }, 160)
    return { id: state.generation, path }
  }
  const complete = (token: NavigationToken | undefined, error = false) => {
    if (!owns(token) || state.phase !== 'loading') return
    clear()
    Object.assign(state, { phase: 'complete', progress: 1, error })
    hide = setTimeout(() => {
      state.phase = 'hiding'
      // Fade the full bar before resetting its width, so it never retreats.
      reset = setTimeout(() => { state.phase = 'idle'; state.progress = 0 }, 250)
    }, 180)
  }
  const current = (): NavigationToken => ({ id: state.generation, path: state.path })
  return { start, complete, cancel, current, dispose: () => cancel() }
}
