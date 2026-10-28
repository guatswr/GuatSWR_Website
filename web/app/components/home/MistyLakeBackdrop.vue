<script setup lang="ts">
import { vMotionScene } from '~/utils/motion'
</script>

<template>
  <div v-motion-scene class="misty-lake" aria-hidden="true">
    <div class="lake-surface">
      <div class="lake-drift" />
      <div class="lake-light" />

      <svg
        class="lake-ripples"
        viewBox="0 0 1200 620"
        fill="none"
        focusable="false"
      >
        <!-- Concentric water ripples -->
        <g class="lake-ripple-origin">
          <ellipse class="lake-ripple lake-ripple-1" cx="920" cy="190" rx="88" ry="32" />
          <ellipse class="lake-ripple lake-ripple-2" cx="920" cy="190" rx="164" ry="58" />
          <ellipse
            class="lake-ripple-dashed"
            cx="920"
            cy="190"
            rx="248"
            ry="88"
            stroke-dasharray="3 11"
          />
        </g>

        <!-- Counter-drifting water reflection strokes -->
        <g class="lake-shimmer-far" stroke-linecap="round">
          <path d="M680 118h96m26 0h48M590 162h132m34 0h78M760 248h118m28 0h64" />
        </g>
        <g class="lake-shimmer-near" stroke-linecap="round">
          <path d="M120 438h134m32 0h68M240 486h168m40 0h84M810 452h142m30 0h58" />
        </g>

        <!-- Floating ice-crystal & star accents -->
        <g class="lake-crystal lake-crystal-main">
          <path
            class="lake-accent"
            d="m920 172 6 14 14 6-14 6-6 14-6-14-14-6 14-6Z"
          />
        </g>
        <g class="lake-crystal lake-crystal-sub">
          <path
            class="lake-accent"
            d="m246 410 5 11 11 5-11 5-5 11-5-11-11-5 11-5Z"
          />
        </g>
      </svg>
    </div>
    <div class="lake-to-paper" />
  </div>
</template>

<style scoped>
.misty-lake {
  --ambient-play-state: paused;
  --lake-surface: var(--section-background, #f4f5f2);
  --lake-blue: rgb(156 184 228 / 0.28);
  --lake-blue-soft: rgb(192 210 236 / 0.16);
  --lake-rose: rgb(224 168 174 / 0.2);
  --lake-rose-soft: rgb(238 208 208 / 0.13);
  --lake-gold: rgb(226 208 152 / 0.18);
  --lake-ice: rgb(198 220 224 / 0.14);
  --lake-light: rgb(250 249 245 / 0.34);
  --lake-line: #7d96ad;
  --lake-accent: #5288a8;
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  background: var(--section-background);
}
/* Broad color fields soften into the reading surface. */
.lake-surface {
  position: absolute;
  inset: 0;
  overflow: hidden;
  container-type: size;
  background:
    radial-gradient(ellipse 60% 80% at 102% 8%, var(--lake-blue) 0%, var(--lake-blue-soft) 42%, transparent 78%),
    radial-gradient(ellipse 58% 74% at -8% 78%, var(--lake-rose) 0%, var(--lake-rose-soft) 44%, transparent 80%),
    radial-gradient(ellipse 50% 56% at 52% 86%, var(--lake-gold) 0%, transparent 78%),
    radial-gradient(ellipse 42% 56% at 92% 76%, var(--lake-ice), transparent 82%),
    var(--lake-surface);
}
.lake-drift {
  position: absolute;
  inset: 0;
}
.lake-drift::before,
.lake-drift::after {
  content: '';
  position: absolute;
  width: min(70%, 42rem);
  aspect-ratio: 1.2;
  opacity: 0.36;
  animation: lake-mist-drift 20s ease-in-out infinite alternate;
}
.lake-drift::before {
  top: -2rem;
  right: -2rem;
  background: radial-gradient(ellipse at center, var(--lake-blue-soft), transparent 72%);
}
.lake-drift::after {
  bottom: -2rem;
  left: -2rem;
  background: radial-gradient(ellipse at center, var(--lake-rose-soft), transparent 72%);
  animation-duration: 24s;
  animation-delay: -9s;
  animation-direction: alternate-reverse;
}
.lake-light {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 49% 82% at 39% 24%, var(--lake-light), transparent 82%),
    linear-gradient(150deg, var(--lake-light), transparent 48%);
  animation: lake-light-breathe 14s ease-in-out infinite alternate;
}
.lake-ripples {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  color: var(--lake-line);
  stroke: currentColor;
  stroke-width: 0.85;
  opacity: 0.22;
  transform: translateZ(0);
  backface-visibility: hidden;
}
@supports (width: 1cqw) {
  /* Match the original SVG's xMidYMid meet placement without allocating a
     full-height transparent SVG texture on tall phones. */
  .lake-ripples {
    inset: auto;
    top: 50%;
    left: 50%;
    width: min(100cqw, calc(100cqh * 1200 / 620));
    height: auto;
    transform: translate3d(-50%, -50%, 0);
  }
}
.lake-accent {
  stroke: var(--lake-accent);
}
.lake-ripple {
  transform-box: fill-box;
  transform-origin: center;
  animation: lake-ripple-expand 9s cubic-bezier(0.22, 1, 0.36, 1) infinite;
}
.lake-ripple-2 {
  animation-delay: -4.5s;
}
.lake-ripple-dashed {
  stroke-dashoffset: 0;
  animation: lake-dash-flow 32s linear infinite;
}
.lake-shimmer-far {
  animation: lake-shimmer-glide 16s ease-in-out infinite alternate;
}
.lake-shimmer-near {
  animation: lake-shimmer-glide 19s ease-in-out -6s infinite alternate-reverse;
}
.lake-crystal-main {
  transform-origin: 920px 192px;
  animation: lake-crystal-twinkle 5.6s ease-in-out infinite alternate;
}
.lake-crystal-sub {
  transform-origin: 246px 426px;
  animation: lake-crystal-twinkle 6.8s ease-in-out -2.4s infinite alternate;
}

/* Default to paused, including before the scene observer has initialized. */
.lake-ripples {
  animation: lake-art-drift 22s ease-in-out infinite alternate;
}
/* Move the SVG canvas as one cached layer. Animating its individual paths
   repeatedly repaints the vector tree as the hero returns above this scene. */
.lake-ripples * {
  animation: none;
}
.misty-lake[data-scene-active='true'] {
  --ambient-play-state: running;
}
.lake-drift::before,
.lake-drift::after,
.lake-light,
.lake-ripples,
.lake-ripples * {
  animation-play-state: var(--ambient-play-state);
}
.misty-lake[data-scene-active='true'] .lake-drift::before,
.misty-lake[data-scene-active='true'] .lake-drift::after {
  will-change: transform;
}

@keyframes lake-art-drift {
  from { translate: 0 -5px; }
  to { translate: 0 5px; }
}
@keyframes lake-mist-drift {
  0% {
    transform: translate3d(-14px, -8px, 0);
  }
  100% {
    transform: translate3d(14px, 10px, 0);
  }
}

@keyframes lake-light-breathe {
  0% {
    opacity: 0.88;
  }
  100% {
    opacity: 1;
  }
}

@keyframes lake-ripple-expand {
  0% {
    transform: scale(0.76);
    opacity: 0;
  }
  25%,
  65% {
    opacity: 0.85;
  }
  100% {
    transform: scale(1.26);
    opacity: 0;
  }
}

@keyframes lake-dash-flow {
  to {
    stroke-dashoffset: -224;
  }
}

@keyframes lake-shimmer-glide {
  0% {
    transform: translate3d(-14px, 0, 0);
    opacity: 0.65;
  }
  100% {
    transform: translate3d(14px, 0, 0);
    opacity: 1;
  }
}

@keyframes lake-crystal-twinkle {
  0% {
    transform: translate3d(0, -3px, 0) scale(0.82) rotate(-8deg);
    opacity: 0.45;
  }
  100% {
    transform: translate3d(0, 3px, 0) scale(1.16) rotate(8deg);
    opacity: 1;
  }
}

/* Fade back to the next chapter's paper, keeping the section boundary quiet. */
.lake-to-paper {
  --edge-bottom: var(--section-edge-bottom, var(--home-about-background));
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    transparent 38%,
    color-mix(in srgb, var(--edge-bottom) 26%, transparent) 58%,
    color-mix(in srgb, var(--edge-bottom) 66%, transparent) 80%,
    var(--edge-bottom) 100%
  );
}
:global(.dark .misty-lake) {
  --lake-surface: var(--section-background, #19232c);
  --lake-blue: rgb(75 105 168 / 0.28);
  --lake-blue-soft: rgb(54 79 130 / 0.16);
  --lake-rose: rgb(146 77 108 / 0.18);
  --lake-rose-soft: rgb(100 64 88 / 0.12);
  --lake-gold: rgb(133 123 66 / 0.14);
  --lake-ice: rgb(63 116 132 / 0.1);
  --lake-light: rgb(26 36 45 / 0.36);
  --lake-line: #8eabc2;
  --lake-accent: #7ec3df;
}
:global(.dark .lake-ripples) {
  opacity: 0.15;
}
@media (max-width: 639px) {
  .lake-surface {
    background:
      radial-gradient(ellipse 120% 46% at 118% 4%, var(--lake-blue) 0%, var(--lake-blue-soft) 44%, transparent 80%),
      radial-gradient(ellipse 115% 48% at -28% 82%, var(--lake-rose) 0%, var(--lake-rose-soft) 44%, transparent 82%),
      radial-gradient(ellipse 96% 35% at 62% 88%, var(--lake-gold), transparent 80%),
      var(--lake-surface);
  }
  .lake-light {
    background: radial-gradient(ellipse 120% 55% at 0% 30%, var(--lake-light), transparent 90%);
  }
  .lake-ripples {
    opacity: 0.13;
  }
  .lake-to-paper {
    background: linear-gradient(
      180deg,
      transparent 48%,
      color-mix(in srgb, var(--edge-bottom) 28%, transparent) 66%,
      color-mix(in srgb, var(--edge-bottom) 68%, transparent) 84%,
      var(--edge-bottom) 100%
    );
  }
}
@media (max-width: 767px), (hover: none) and (pointer: coarse) {
  .lake-ripples,
  .lake-ripples * {
    animation: none;
    will-change: auto;
  }
  .lake-ripples {
    display: none;
    transform: none;
  }
  .lake-light {
    animation: none;
    opacity: 1;
  }
  .lake-drift::after {
    display: none;
    animation: none;
  }
  .misty-lake[data-scene-active='true'] .lake-drift::after {
    will-change: auto;
  }
  .lake-drift::before {
    width: min(72vw, 18rem);
    opacity: 0.35;
    animation: lake-mobile-drift 32s ease-in-out infinite alternate;
    animation-play-state: var(--ambient-play-state);
  }
}
@keyframes lake-mobile-drift {
  from { transform: translate3d(-4px, -3px, 0); }
  to { transform: translate3d(4px, 3px, 0); }
}
</style>
