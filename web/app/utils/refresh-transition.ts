export { REFRESH_BOOT_SCRIPT, REFRESH_FAIL_OPEN_MS, REFRESH_FADE_MS } from '#shared/refresh-boot'

export interface RefreshTransition {
  dismiss(immediate?: boolean): void
}

declare global {
  interface Window {
    __clubRefreshTransition?: RefreshTransition
  }
}

/** Finish only document-time entrances. Keep ambient loops and scroll-driven
 * effects intact, including restored reading positions on a refreshed page. */
export function finishRefreshEntrances(animations: Animation[], timeline: AnimationTimeline): void {
  for (const animation of animations) {
    if (animation.timeline !== timeline || !animation.effect) continue
    // The document's cover owns its compositor-driven timeout and fade.
    if ((animation.effect as KeyframeEffect).target?.nodeName === 'HTML') continue
    const timing = animation.effect.getComputedTiming()
    if (!Number.isFinite(timing.endTime) || !Number.isFinite(timing.iterations)) continue
    try { animation.finish() } catch { /* An inactive timeline has no entrance to finish. */ }
  }
}
