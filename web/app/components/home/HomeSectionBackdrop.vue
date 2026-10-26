<script setup lang="ts">
defineProps<{ variant: 'about' | 'archive' | 'community' }>()
</script>

<template>
  <div class="home-section-backdrop" :class="`backdrop-${variant}`" aria-hidden="true">
    <div class="backdrop-grain" />

    <svg v-if="variant === 'about'" class="backdrop-orbit" viewBox="0 0 800 800" fill="none" focusable="false">
      <circle cx="400" cy="400" r="356" />
      <circle cx="400" cy="400" r="304" />
      <circle cx="400" cy="400" r="244" stroke-dasharray="2 10" />
      <path d="M400 21v30m0 698v30M21 400h30m698 0h30" />
      <path class="backdrop-accent" d="M122 178a356 356 0 0 1 223-130m278 630a356 356 0 0 1-278 74" />
      <path d="m654 128 5 12 12 5-12 5-5 12-5-12-12-5 12-5Z" />
    </svg>

    <svg v-else-if="variant === 'archive'" class="backdrop-frames" viewBox="0 0 800 700" fill="none" focusable="false">
      <g transform="rotate(-13 400 350)">
        <rect x="132" y="80" width="434" height="492" rx="5" />
        <path d="M155 103h388v350H155Zm0 383h157m-157 22h90" />
        <path d="M108 80H88v20m478-44V36h-20M108 572H88v-20m478 44v20h-20" />
      </g>
      <g transform="rotate(9 400 350)">
        <rect x="260" y="163" width="434" height="492" rx="5" />
        <path d="M283 186h388v350H283Zm0 383h157m-157 22h90" />
      </g>
      <path class="backdrop-accent" d="m104 383 7 17 17 7-17 7-7 17-7-17-17-7 17-7Zm589-273 5 12 12 5-12 5-5 12-5-12-12-5 12-5Z" />
    </svg>

    <svg v-else class="backdrop-signals" viewBox="0 0 1000 800" fill="none" focusable="false">
      <ellipse cx="580" cy="358" rx="226" ry="164" transform="rotate(-30 580 358)" />
      <ellipse cx="580" cy="358" rx="312" ry="227" transform="rotate(-30 580 358)" />
      <ellipse cx="580" cy="358" rx="398" ry="290" transform="rotate(-30 580 358)" stroke-dasharray="2 10" />
      <path d="M59 625c176-83 259 33 415-36s264-39 453-146" />
      <circle class="signal-point" cx="331" cy="301" r="6" />
      <circle class="signal-point" cx="787" cy="184" r="5" />
      <circle class="signal-point" cx="765" cy="539" r="7" />
      <path class="backdrop-accent" d="m202 534 7 19 19 7-19 7-7 19-7-19-19-7 19-7Z" />
    </svg>

    <div class="backdrop-edge" />
  </div>
</template>

<style scoped>
.home-section-backdrop {
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
  mask-image: linear-gradient(180deg, transparent, #000 8%, #000 92%, transparent);
  background:
    radial-gradient(ellipse 52% 72% at 104% 12%, var(--wash-blue), transparent 78%),
    radial-gradient(ellipse 50% 72% at -8% 96%, var(--wash-rose), transparent 78%),
    radial-gradient(ellipse 45% 35% at 53% 110%, var(--wash-gold), transparent 90%);
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
.backdrop-edge {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, var(--section-background), transparent 14%, transparent 84%, var(--section-background)),
    linear-gradient(90deg, var(--section-background), transparent 12%, transparent 88%, var(--section-background));
  opacity: 0.42;
}
.backdrop-about {
  --wash-blue: #cddcf0;
  --wash-rose: #f1d7cc;
  --wash-gold: #e8ddb5;
  background:
    radial-gradient(ellipse 44% 55% at 90% 20%, var(--wash-blue), transparent 85%),
    radial-gradient(ellipse 62% 70% at -10% 83%, var(--wash-rose), transparent 85%),
    radial-gradient(ellipse 44% 45% at 49% 105%, var(--wash-gold), transparent 85%);
}
.backdrop-archive {
  --wash-blue: #cbd6ef;
  --wash-rose: #f0d3d6;
  --wash-gold: #f0e3ba;
  --backdrop-line: #a68e83;
}
.backdrop-community {
  --wash-blue: #bbd5ec;
  --wash-rose: #d4d3ec;
  --wash-gold: #c8e2d2;
  --backdrop-line: #6f9d9f;
  --backdrop-accent: #7797af;
}
:global(.dark .home-section-backdrop) {
  --wash-blue: #273c56;
  --wash-rose: #403139;
  --wash-gold: #343b32;
  --backdrop-line: #8eabc2;
  --backdrop-accent: #b69c92;
}
:global(.dark .backdrop-about) {
  --wash-blue: #2b4058;
  --wash-rose: #40343a;
  --wash-gold: #3c4032;
}
:global(.dark .backdrop-community) {
  --wash-blue: #254b5b;
  --wash-rose: #343553;
  --wash-gold: #234a41;
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
</style>
