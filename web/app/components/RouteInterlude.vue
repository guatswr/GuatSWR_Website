<script setup lang="ts">
import { createRouteProgressState } from '~/utils/route-progress'

const state = useState('route-progress', createRouteProgressState)
const active = computed(() => state.value.phase === 'loading' && state.value.fullPage)
const leaving = computed(() => (state.value.phase === 'complete' || state.value.phase === 'hiding') && state.value.fullPage)

const prayerChars = ['少', '女', '祈', '祷', '中'] as const
</script>

<template>
  <div
    class="route-interlude"
    :class="{ 'is-active': active, 'is-leaving': leaving }"
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
  --interlude-accent: #3d7a9e;
  --interlude-top-wash: rgb(125 211 252 / 0.16);
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
  will-change: opacity;
  transition: opacity 180ms ease, visibility 0s 180ms;
}

/* 顶部天青微光晕染，与顶部 RouteProgressBar 形成自然的光影衔接 */
.route-interlude::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(ellipse 68% 18% at 50% 0%, var(--interlude-top-wash) 0%, transparent 76%);
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
  --interlude-accent: #7dd3fc;
  --interlude-top-wash: rgb(56 189 248 / 0.12);
  background-color: #101923;
}

/* 默认静默态：仅使用 GPU 合成层属性（opacity + translate3d），无模糊滤镜与重绘开销 */
.route-interlude__title {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: baseline;
  margin: 0;
  color: var(--interlude-ink);
  font-size: clamp(2rem, 3.8vw, 2.75rem);
  font-weight: 600;
  letter-spacing: 0.24em;
  padding-left: 0.24em;
  line-height: 1.2;
  opacity: 0;
  transform: translate3d(0, 8px, 0);
  will-change: transform, opacity;
  transition: none;
}

/* 入场态：错峰延迟 65ms 平滑上浮显现 */
.route-interlude.is-active .route-interlude__title {
  opacity: 1;
  transform: translate3d(0, 0, 0);
  transition:
    opacity 190ms cubic-bezier(0.22, 1, 0.36, 1) 65ms,
    transform 240ms cubic-bezier(0.22, 1, 0.36, 1) 65ms;
}

/* 退场态：顺势向上轻盈消散 */
.route-interlude.is-leaving .route-interlude__title {
  opacity: 0;
  transform: translate3d(0, -6px, 0);
  transition:
    opacity 150ms cubic-bezier(0.4, 0, 1, 1),
    transform 170ms cubic-bezier(0.4, 0, 1, 1);
}

.route-interlude__char {
  display: inline-block;
  will-change: transform, opacity;
  animation: interlude-char-wave 1.15s ease-in-out infinite;
  animation-delay: calc(var(--char-i, 0) * 85ms);
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
  will-change: transform, opacity;
  animation: interlude-dot-pulse 1.15s ease-in-out infinite;
  animation-delay: calc(var(--dot-i, 0) * 180ms);
  animation-play-state: var(--interlude-play);
}

@keyframes interlude-char-wave {
  0%,
  100% {
    opacity: 0.72;
    transform: translate3d(0, 0, 0);
  }
  45% {
    opacity: 1;
    transform: translate3d(0, -4.5px, 0);
  }
}

@keyframes interlude-dot-pulse {
  0%,
  100% {
    opacity: 0.22;
    transform: translate3d(0, 0, 0);
  }
  50% {
    opacity: 0.95;
    transform: translate3d(0, -2.5px, 0);
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
