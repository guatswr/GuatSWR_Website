<script setup lang="ts">
import { createRouteProgressState } from '~/utils/route-progress'
const state = useState('route-progress', createRouteProgressState)
</script>

<template>
  <div
    class="route-progress__bar"
    data-testid="route-progress"
    :class="{ 'route-progress--error': state.error }"
    :style="{ opacity: state.phase === 'loading' || state.phase === 'complete' ? 1 : 0, transform: `scaleX(${state.progress})` }"
    aria-hidden="true"
  />
</template>

<style>
.route-progress__bar {
  position: fixed;
  inset: 0 0 auto;
  height: 3px;
  z-index: 70;
  pointer-events: none;
  transform-origin: left;
  background: linear-gradient(90deg, #e0f2fe 0%, #7dd3fc 55%, #38bdf8 100%);
  background-size: 100% auto;
  box-shadow: 0 0 6px rgb(56 189 248 / 35%);
  transition: transform 0.16s linear, opacity 0.25s ease;
}

html.dark .route-progress__bar {
  background: linear-gradient(90deg, #0b2a3c 0%, #1e3a8a 45%, #38bdf8 100%);
  box-shadow: 0 0 8px rgb(56 189 248 / 50%);
}

html .route-progress__bar.route-progress--error {
  background: linear-gradient(90deg, #f87171, #ef4444);
}

@media (prefers-reduced-motion: reduce) {
  .route-progress__bar {
    transition: none !important;
  }
}
</style>
