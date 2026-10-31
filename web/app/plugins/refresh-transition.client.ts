import { finishRefreshEntrances } from '~/utils/refresh-transition'

export default defineNuxtPlugin((app) => {
  const root = document.documentElement
  const transition = window.__clubRefreshTransition
  if (!transition || !root.dataset.refreshInitializing) return
  const router = useRouter()
  let disposed = false

  const ready = app.hook('app:suspense:resolve', async () => {
    const initialRoute = router.currentRoute.value
    // Images keep their own progressive loader; they must not hold up the page.
    await nextTick()
    // Let page onMounted/rAF entry classes and native timelines settle first.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    if (disposed || !root.dataset.refreshInitializing) return
    // Unfreeze and finish in the same task so no initial animation frame can
    // paint, including when hydration arrives after the fail-open timeout.
    delete root.dataset.refreshInitializing
    if (router.currentRoute.value === initialRoute) finishRefreshEntrances(document.getAnimations(), document.timeline)
    transition.dismiss()
  })
  const error = app.hook('app:error', () => {
    delete root.dataset.refreshInitializing
    finishRefreshEntrances(document.getAnimations(), document.timeline)
    transition.dismiss()
  })
  app.vueApp.onUnmount(() => {
    disposed = true
    ready()
    error()
    delete root.dataset.refreshInitializing
    transition.dismiss(true)
  })
})
