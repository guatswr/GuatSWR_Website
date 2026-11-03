import { createRouteProgress, createRouteProgressState, navigationPath } from '~/utils/route-progress'
import type { NavigationToken } from '~/utils/route-progress'

export default defineNuxtPlugin((nuxtApp) => {
  const router = useRouter()
  const state = useState('route-progress', createRouteProgressState)
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const controller = createRouteProgress(state.value, () => motion.matches)
  const tokens = new WeakMap<object, NavigationToken>()
  const before = router.beforeEach((to, from) => {
    if (nuxtApp.isHydrating || navigationPath(to.path) === navigationPath(from.path)) return
    // A new layout's first page has no enter animation. Clear the public bar
    // on either admin boundary, including logout back to the login page.
    if (to.meta.layout === 'admin' || from.meta.layout === 'admin' || to.path === '/login' || from.path === '/login') { controller.cancel(); return }
    // A nested category change keeps its parent shell; only a new top-level
    // page needs the interlude that covers the leave/enter gap.
    tokens.set(to, controller.start(to.path, to.matched[0] !== from.matched[0]))
  })
  const after = router.afterEach((to, _from, failure) => {
    const token = tokens.get(to)
    if (failure && token) controller.cancel(token)
  })
  const error = router.onError((_error, to) => controller.complete(tokens.get(to), true))
  const appError = nuxtApp.hook('app:error', () => controller.complete(controller.current(), true))
  nuxtApp.vueApp.onUnmount(() => { before(); after(); error(); appError(); controller.dispose() })
  return { provide: { routeProgress: controller } }
})
