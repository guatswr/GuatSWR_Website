<script setup lang="ts">
import { createRouteProgressState } from '~/utils/route-progress'

const state = useState('route-progress', createRouteProgressState)
const active = computed(() => state.value.phase === 'loading' && state.value.fullPage)

const prayerChars = ['少', '女', '祈', '祷', '中'] as const
</script>

<template>
  <div
    class="route-interlude"
    :class="{ 'is-active': active }"
    aria-hidden="true"
  >
    <p class="route-interlude__title club-display">
      <span
        v-for="(char, index) in prayerChars"
        :key="char"
        class="route-interlude__char"
        :style="{ '--char-i': index }"
      >{{ char }}</span><span class="route-interlude__dots"><span style="--dot-i: 0">.</span><span style="--dot-i: 1">.</span><span style="--dot-i: 2">.</span></span>
    </p>
  </div>
</template>

<style scoped>
.route-interlude {
  --interlude-ink: #243440;
  --interlude-crimson: #b54942;
  --interlude-play: paused;
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  background-color: #fbfbf8;
  color: var(--interlude-ink);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 180ms ease, visibility 0s 180ms;
}

.route-interlude.is-active {
  --interlude-play: running;
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transition: opacity 140ms ease, visibility 0s;
}

:global(.dark .route-interlude) {
  --interlude-ink: #e2edf5;
  --interlude-crimson: #f27482;
  background-color: #101923;
}

.route-interlude__title {
  position: relative;
  display: inline-flex;
  align-items: baseline;
  margin: 0;
  color: var(--interlude-ink);
  font-size: clamp(2rem, 3.8vw, 2.75rem);
  font-weight: 600;
  letter-spacing: 0.24em;
  padding-left: 0.24em;
  line-height: 1.2;
  transform: translateY(4px);
  transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
}

.route-interlude.is-active .route-interlude__title {
  transform: translateY(0);
}

.route-interlude__char {
  display: inline-block;
  animation: interlude-char-wave 1.5s ease-in-out infinite;
  animation-delay: calc(var(--char-i, 0) * 100ms);
  animation-play-state: var(--interlude-play);
}

.route-interlude__dots {
  position: absolute;
  left: 100%;
  bottom: 0;
  display: inline-flex;
  margin-left: 0.04em;
  color: var(--interlude-crimson);
  letter-spacing: 0.14em;
}

.route-interlude__dots > span {
  display: inline-block;
  animation: interlude-dot-pulse 1.4s ease-in-out infinite;
  animation-delay: calc(var(--dot-i, 0) * 200ms);
  animation-play-state: var(--interlude-play);
}

@keyframes interlude-char-wave {
  0%,
  100% {
    transform: translateY(0);
  }
  40% {
    transform: translateY(-5px);
  }
}

@keyframes interlude-dot-pulse {
  0%,
  100% {
    opacity: 0.22;
  }
  50% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .route-interlude {
    display: none;
    opacity: 0 !important;
    transition: none;
  }
  .route-interlude *,
  .route-interlude *::before,
  .route-interlude *::after {
    animation: none !important;
    transition: none !important;
  }
}
</style>
