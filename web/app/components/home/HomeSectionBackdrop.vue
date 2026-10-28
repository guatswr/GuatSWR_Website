<script setup lang="ts">
import { vMotionScene } from '~/utils/motion'

defineProps<{ variant: 'about' | 'archive' | 'community' }>()
</script>

<template>
  <div v-motion-scene class="home-section-backdrop" :class="`backdrop-${variant}`" aria-hidden="true">
    <div class="backdrop-wash" />
    <div class="backdrop-grain" />

    <svg v-if="variant === 'about'" class="backdrop-orbit" viewBox="0 0 800 800" fill="none" focusable="false">
      <g class="orbit-ring-outer">
        <circle cx="400" cy="400" r="356" />
        <path d="M400 21v30m0 698v30M21 400h30m698 0h30" />
      </g>
      <circle class="orbit-ring-mid" cx="400" cy="400" r="304" />
      <circle class="orbit-ring-dashed" cx="400" cy="400" r="244" stroke-dasharray="2 10" />
      <g class="orbit-accent-group">
        <path class="backdrop-accent" d="M122 178a356 356 0 0 1 223-130m278 630a356 356 0 0 1-278 74" />
      </g>
      <path class="orbit-star orbit-star-main" d="m654 128 5 12 12 5-12 5-5 12-5-12-12-5 12-5Z" />
      <path class="backdrop-accent orbit-star orbit-star-sub" d="m168 612 4 9 9 4-9 4-4 9-4-9-9-4 9-4Z" />
    </svg>

    <svg v-else-if="variant === 'archive'" class="backdrop-frames" viewBox="0 0 800 700" fill="none" focusable="false">
      <g transform="rotate(-13 400 350)">
        <g class="archive-frame-back">
          <rect x="132" y="80" width="434" height="492" rx="5" />
          <path d="M155 103h388v350H155Zm0 383h157m-157 22h90" />
          <path class="archive-crop-marks" d="M108 80H88v20m478-44V36h-20M108 572H88v-20m478 44v20h-20" />
        </g>
      </g>
      <g transform="rotate(9 400 350)">
        <g class="archive-frame-front">
          <rect x="260" y="163" width="434" height="492" rx="5" />
          <path d="M283 186h388v350H283Zm0 383h157m-157 22h90" />
        </g>
      </g>
      <path class="backdrop-accent archive-star archive-star-left" d="m104 383 7 17 17 7-17 7-7 17-7-17-17-7 17-7Z" />
      <path class="backdrop-accent archive-star archive-star-right" d="m693 110 5 12 12 5-12 5-5 12-5-12-12-5 12-5Z" />
    </svg>

    <svg v-else class="backdrop-signals" viewBox="0 0 1000 800" fill="none" focusable="false">
      <g transform="rotate(-30 580 358)">
        <ellipse class="signal-ellipse-inner" cx="580" cy="358" rx="226" ry="164" />
        <ellipse class="signal-ellipse-mid" cx="580" cy="358" rx="312" ry="227" />
        <ellipse class="signal-ellipse-dashed" cx="580" cy="358" rx="398" ry="290" stroke-dasharray="2 10" />
      </g>
      <path class="signal-wave" d="M59 625c176-83 259 33 415-36s264-39 453-146" />
      <path class="backdrop-accent signal-wave-pulse" d="M59 625c176-83 259 33 415-36s264-39 453-146" />
      <g class="signal-node signal-node-1">
        <circle class="signal-ripple" cx="331" cy="301" r="6" />
        <circle class="signal-point" cx="331" cy="301" r="6" />
      </g>
      <g class="signal-node signal-node-2">
        <circle class="signal-ripple" cx="787" cy="184" r="5" />
        <circle class="signal-point" cx="787" cy="184" r="5" />
      </g>
      <g class="signal-node signal-node-3">
        <circle class="signal-ripple" cx="765" cy="539" r="7" />
        <circle class="signal-point" cx="765" cy="539" r="7" />
      </g>
      <path class="backdrop-accent signal-star" d="m202 534 7 19 19 7-19 7-7 19-7-19-19-7 19-7Z" />
    </svg>
    <div class="backdrop-edge" />
  </div>
</template>

<style scoped>
.home-section-backdrop {
  --ambient-play-state: paused;
  --wash-blue: #bed3f0;
  --wash-rose: #edccc7;
  --wash-gold: #ede2be;
  --backdrop-line: #8a9baf;
  --backdrop-accent: #ad7376;
  position: absolute;
  z-index: 0;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  isolation: isolate;
  contain: paint;
  background:
    radial-gradient(ellipse 52% 72% at 104% 12%, var(--wash-blue), transparent 78%),
    radial-gradient(ellipse 50% 72% at -8% 96%, var(--wash-rose), transparent 78%),
    radial-gradient(ellipse 45% 35% at 53% 110%, var(--wash-gold), transparent 90%);
}
.backdrop-wash {
  position: absolute;
  inset: 0;
}
.backdrop-wash::before,
.backdrop-wash::after {
  content: '';
  position: absolute;
  width: min(65%, 42rem);
  aspect-ratio: 1.2;
  opacity: 0.34;
  animation: backdrop-wash-drift 22s ease-in-out infinite alternate;
}
.backdrop-wash::before {
  top: -3rem;
  right: -3rem;
  background: radial-gradient(ellipse at center, var(--wash-blue), transparent 72%);
}
.backdrop-wash::after {
  bottom: -3rem;
  left: -3rem;
  background: radial-gradient(ellipse at center, var(--wash-rose), transparent 72%);
  animation-duration: 26s;
  animation-delay: -11s;
  animation-direction: alternate-reverse;
}
.backdrop-grain {
  position: absolute;
  inset: 0;
  color: var(--backdrop-line);
  opacity: 0.13;
  background-image: radial-gradient(currentColor 0.6px, transparent 0.8px);
  background-size: 9px 9px;
  mask-image: linear-gradient(125deg, transparent 25%, #000 100%);
}
.home-section-backdrop svg {
  position: absolute;
  color: var(--backdrop-line);
  stroke: currentColor;
  stroke-width: 0.8;
  opacity: 0.22;
  transform: translateZ(0);
  backface-visibility: hidden;
}
.backdrop-accent {
  stroke: var(--backdrop-accent);
}
.backdrop-orbit {
  width: clamp(32rem, 57vw, 60rem);
  height: auto;
  top: -18%;
  right: -9%;
}
.backdrop-frames {
  width: clamp(30rem, 47vw, 54rem);
  height: auto;
  top: -9rem;
  right: -6%;
}
.backdrop-signals {
  width: clamp(38rem, 72vw, 78rem);
  height: auto;
  top: -9rem;
  right: -15%;
}
.signal-point {
  fill: var(--backdrop-accent);
  stroke: var(--section-background);
  stroke-width: 5;
}
.signal-ripple {
  fill: none;
  stroke: var(--backdrop-accent);
  stroke-width: 1.1;
  transform-box: fill-box;
  transform-origin: center;
  animation: signal-ripple-ping 6.6s cubic-bezier(0.16, 1, 0.3, 1) infinite;
}
.signal-node-2 .signal-ripple {
  animation-delay: -2.2s;
}
.signal-node-3 .signal-ripple {
  animation-delay: -4.4s;
}

/* About variant: orbital rotation, compass swing, and star twinkle */
.orbit-ring-outer {
  transform-origin: 400px 400px;
  animation: orbit-compass-swing 24s ease-in-out infinite alternate;
}
.orbit-ring-mid {
  transform-origin: 400px 400px;
  animation: orbit-breathe 12s ease-in-out infinite alternate;
}
.orbit-ring-dashed {
  transform-origin: 400px 400px;
  animation: orbit-spin-reverse 72s linear infinite;
}
.orbit-accent-group {
  transform-origin: 400px 400px;
  animation: orbit-spin 54s linear infinite;
}
.orbit-star-main {
  transform-origin: 654px 145px;
  animation: backdrop-star-twinkle 5.5s ease-in-out infinite alternate;
}
.orbit-star-sub {
  transform-origin: 168px 625px;
  animation: backdrop-star-twinkle 7s ease-in-out -2.5s infinite alternate;
}

/* Archive variant: floating memory frames & twinkling stars */
.archive-frame-back {
  transform-origin: 349px 326px;
  animation: archive-float-back 15s ease-in-out infinite alternate;
}
.archive-frame-front {
  transform-origin: 477px 409px;
  animation: archive-float-front 18s ease-in-out infinite alternate;
}
.archive-crop-marks {
  transform-origin: 349px 326px;
  animation: orbit-breathe 9s ease-in-out infinite alternate;
}
.archive-star-left {
  transform-origin: 104px 407px;
  animation: backdrop-star-twinkle 6s ease-in-out infinite alternate;
}
.archive-star-right {
  transform-origin: 693px 127px;
  animation: backdrop-star-twinkle 4.8s ease-in-out -1.8s infinite alternate;
}

/* Community variant: signal ellipses, carrier pulse, and node drift */
.signal-ellipse-inner {
  transform-origin: 580px 358px;
  animation: orbit-breathe 10s ease-in-out infinite alternate;
}
.signal-ellipse-mid {
  transform-origin: 580px 358px;
  animation: orbit-breathe 14s ease-in-out -4s infinite alternate;
}
.signal-ellipse-dashed {
  stroke-dashoffset: 0;
  animation: signal-dash-march 28s linear infinite;
}
.signal-wave-pulse {
  stroke-width: 1.25;
  stroke-dasharray: 90 920;
  stroke-dashoffset: 1010;
  opacity: 0.75;
  animation: signal-wave-travel 11s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}
.signal-node-1 {
  animation: signal-node-bob 6.5s ease-in-out infinite alternate;
}
.signal-node-2 {
  animation: signal-node-bob 7.8s ease-in-out -2.4s infinite alternate;
}
.signal-node-3 {
  animation: signal-node-bob 8.4s ease-in-out -4.8s infinite alternate;
}
.signal-star {
  transform-origin: 202px 560px;
  animation: backdrop-star-twinkle 5.8s ease-in-out infinite alternate;
}

/* Keep static SSR output and inactive scenes out of the animation pipeline. */
.home-section-backdrop > svg {
  animation: backdrop-art-drift 28s ease-in-out infinite alternate;
}
.home-section-backdrop svg * {
  animation: none;
}
.home-section-backdrop[data-scene-active='true'] {
  --ambient-play-state: running;
}
.backdrop-wash::before,
.backdrop-wash::after,
.home-section-backdrop > svg,
.home-section-backdrop svg * {
  animation-play-state: var(--ambient-play-state);
}
.home-section-backdrop[data-scene-active='true'] .backdrop-wash::before,
.home-section-backdrop[data-scene-active='true'] .backdrop-wash::after {
  will-change: transform;
}

@keyframes backdrop-art-drift {
  from { translate: 0 -5px; }
  to { translate: 0 5px; }
}
@keyframes backdrop-wash-drift {
  0% {
    transform: translate3d(-12px, -8px, 0);
  }
  100% {
    transform: translate3d(12px, 10px, 0);
  }
}

@keyframes orbit-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes orbit-spin-reverse {
  to {
    transform: rotate(-360deg);
  }
}

@keyframes orbit-compass-swing {
  0% {
    transform: rotate(-5deg) scale(0.992);
  }
  100% {
    transform: rotate(5deg) scale(1.008);
  }
}

@keyframes orbit-breathe {
  0% {
    transform: scale(0.982);
    opacity: 0.78;
  }
  100% {
    transform: scale(1.018);
    opacity: 1;
  }
}

@keyframes backdrop-star-twinkle {
  0% {
    transform: scale(0.78) rotate(-10deg);
    opacity: 0.45;
  }
  100% {
    transform: scale(1.18) rotate(10deg);
    opacity: 1;
  }
}

@keyframes archive-float-back {
  0% {
    transform: translate3d(-7px, -9px, 0) rotate(-1.5deg);
  }
  100% {
    transform: translate3d(7px, 9px, 0) rotate(1.5deg);
  }
}

@keyframes archive-float-front {
  0% {
    transform: translate3d(8px, 6px, 0) rotate(1.4deg);
  }
  100% {
    transform: translate3d(-8px, -10px, 0) rotate(-1.6deg);
  }
}

@keyframes signal-dash-march {
  to {
    stroke-dashoffset: -240;
  }
}

@keyframes signal-wave-travel {
  0% {
    stroke-dashoffset: 1010;
    opacity: 0;
  }
  15%,
  80% {
    opacity: 0.85;
  }
  100% {
    stroke-dashoffset: 0;
    opacity: 0;
  }
}

@keyframes signal-node-bob {
  0% {
    transform: translate3d(0, -4px, 0);
  }
  100% {
    transform: translate3d(0, 4px, 0);
  }
}

@keyframes signal-ripple-ping {
  0% {
    transform: scale(1);
    opacity: 0.7;
  }
  75%,
  100% {
    transform: scale(3.4);
    opacity: 0;
  }
}

.backdrop-edge {
  --edge-top: var(--section-edge-top, var(--section-background));
  --edge-bottom: var(--section-edge-bottom, var(--section-background));
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    var(--edge-top) 0%,
    color-mix(in srgb, var(--edge-top) 68%, transparent) 10%,
    color-mix(in srgb, var(--edge-top) 26%, transparent) 22%,
    transparent 36%,
    transparent 64%,
    color-mix(in srgb, var(--edge-bottom) 26%, transparent) 78%,
    color-mix(in srgb, var(--edge-bottom) 68%, transparent) 90%,
    var(--edge-bottom) 100%
  );
}
.backdrop-about {
  --wash-blue: #d6e1ee;
  --wash-rose: #f1dcd4;
  --wash-gold: #ece3c4;
  background:
    radial-gradient(ellipse 44% 55% at 90% 20%, var(--wash-blue), transparent 85%),
    radial-gradient(ellipse 62% 70% at -10% 83%, var(--wash-rose), transparent 85%),
    radial-gradient(ellipse 44% 45% at 49% 105%, var(--wash-gold), transparent 85%);
}
.backdrop-archive {
  --wash-blue: #d6deef;
  --wash-rose: #f0dbdd;
  --wash-gold: #f0e6c7;
  --backdrop-line: #a68e83;
}
.backdrop-community {
  --wash-blue: #cce0ef;
  --wash-rose: #dedeef;
  --wash-gold: #d5e8dc;
  --backdrop-line: #6f9d9f;
  --backdrop-accent: #7797af;
}
:global(.dark .home-section-backdrop) {
  --wash-blue: #24374d;
  --wash-rose: #382c34;
  --wash-gold: #2f352e;
  --backdrop-line: #8eabc2;
  --backdrop-accent: #b69c92;
}
:global(.dark .backdrop-about) {
  --wash-blue: #26384c;
  --wash-rose: #382f35;
  --wash-gold: #35382e;
}
:global(.dark .backdrop-community) {
  --wash-blue: #21404e;
  --wash-rose: #2d3048;
  --wash-gold: #203f39;
}
:global(.dark .home-section-backdrop svg) {
  opacity: 0.15;
}
:global(.dark .backdrop-grain) {
  opacity: 0.08;
}
@media (max-width: 639px) {
  .home-section-backdrop {
    background:
      radial-gradient(ellipse 105% 50% at 110% 10%, var(--wash-blue), transparent 85%),
      radial-gradient(ellipse 100% 55% at -35% 95%, var(--wash-rose), transparent 80%);
  }
  .home-section-backdrop svg {
    opacity: 0.12;
  }
  .backdrop-orbit { width: 35rem; right: -24rem; top: -2rem; }
  .backdrop-frames { width: 30rem; right: -18rem; top: -4rem; }
  .backdrop-signals { width: 44rem; right: -28rem; top: -4rem; }
  .backdrop-grain { opacity: 0.08; }
}
/* Touch devices (including landscape phones and tablet desktop mode) use one
   small composited glow. SVG timelines and masked grain are unnecessary work
   while the user is scrolling, even when only a corner of them is visible. */
@media (max-width: 767px), (hover: none) and (pointer: coarse) {
  .home-section-backdrop svg,
  .home-section-backdrop svg * {
    animation: none;
    will-change: auto;
  }
  .home-section-backdrop svg,
  .backdrop-grain {
    display: none;
    transform: none;
  }
  .backdrop-wash::after {
    display: none;
    animation: none;
  }
  .home-section-backdrop[data-scene-active='true'] .backdrop-wash::after {
    will-change: auto;
  }
  .backdrop-wash::before {
    width: min(72vw, 18rem);
    opacity: 0.3;
    animation: backdrop-mobile-drift 32s ease-in-out infinite alternate;
    animation-play-state: var(--ambient-play-state);
  }
}
@keyframes backdrop-mobile-drift {
  from { transform: translate3d(-4px, -3px, 0); }
  to { transform: translate3d(4px, 3px, 0); }
}
</style>
