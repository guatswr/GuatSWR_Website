import { createRouteProgressState, navigationPath } from '~/utils/route-progress'

export function usePublicPageTransition() {
  const router = useRouter()
  const app = useNuxtApp()
  const progress = useState('route-progress', createRouteProgressState)
  return computed(() => {
    // Capture the navigation identity when this vnode's transition is created.
    // Reading the current route inside an old callback would finish a new page.
    const token = { id: progress.value.generation, path: navigationPath(router.currentRoute.value.path) }
    return { name: 'club-page', onAfterEnter: () => app.$routeProgress?.complete(token) }
  })
}
