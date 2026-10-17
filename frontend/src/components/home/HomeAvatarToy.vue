<script setup>
import { ref } from 'vue'
import ClubAvatar from '../ClubAvatar.vue'

defineProps({ src: { type: String, default: '' } })
const burst = ref(0)
const nines = [
  { x: '-18%', y: '-10%', turn: '-18deg', dx: -1, dy: -1, delay: '0ms' },
  { x: '93%', y: '15%', turn: '16deg', dx: 1, dy: -1, delay: '60ms' },
  { x: '-19%', y: '72%', turn: '-12deg', dx: -1, dy: -0.6, delay: '110ms' },
  { x: '79%', y: '92%', turn: '20deg', dx: 1, dy: -0.8, delay: '30ms' }
]
</script>

<template>
  <div class="club-avatar-toy">
    <button
      type="button"
      class="club-toy-trigger"
      aria-label="点击群头像，让小⑨跳起来"
      @click="burst += 1"
    >
      <ClubAvatar :src="src" prefer-original class="club-toy-avatar" />
      <span
        :key="burst"
        class="club-nine-scene"
        :class="{ 'is-playing': burst > 0 }"
        aria-hidden="true"
      >
        <span
          v-for="(nine, index) in nines"
          :key="index"
          class="club-nine-satellite"
          :style="{
            left: nine.x,
            top: nine.y,
            '--nine-turn': nine.turn,
            '--kick-x': nine.dx,
            '--kick-y': nine.dy,
            '--nine-delay': nine.delay
          }"
        >
          <span class="club-nine-glyph">⑨</span>
        </span>
        <span v-if="burst" class="club-nine-ripple" />
      </span>
    </button>
  </div>
</template>

<style scoped>
.club-avatar-toy {
  --avatar-size: clamp(4.5rem, 12svh, 7rem);
  --nine-size: clamp(1.6rem, 4svh, 2.25rem);
  --jump-distance: clamp(1rem, 3vw, 2.5rem);
  padding: 2rem;
}
.club-toy-trigger {
  position: relative;
  display: block;
  width: var(--avatar-size);
  height: var(--avatar-size);
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.club-toy-avatar {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  border: 4px solid rgb(255 255 255 / 0.9);
  box-shadow: 0 12px 36px rgb(2 6 23 / 0.22);
  transition: transform 250ms ease;
}
.club-toy-trigger:focus-visible {
  outline: 2px solid #bae6fd;
  outline-offset: 12px;
}
.club-toy-trigger:active .club-toy-avatar {
  transform: scale(0.95) rotate(-2deg);
}
.club-nine-scene {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.club-nine-satellite {
  position: absolute;
  z-index: 2;
  width: var(--nine-size);
  height: var(--nine-size);
}
.club-nine-glyph {
  display: block;
  color: #e0f2fe;
  font-family: 'Segoe UI Symbol', 'Noto Sans Symbols 2', sans-serif;
  font-size: var(--nine-size);
  line-height: 1;
  font-weight: 700;
  text-shadow:
    0 2px 5px #075985,
    0 0 14px rgb(125 211 252 / 0.6);
  transform: rotate(var(--nine-turn));
  user-select: none;
}
.club-nine-satellite:nth-child(2) .club-nine-glyph {
  color: #a5ddff;
}
.club-nine-satellite:nth-child(3) .club-nine-glyph {
  color: #c7d2fe;
}
.is-playing .club-nine-glyph {
  animation: nine-hop 1100ms var(--nine-delay) cubic-bezier(0.2, 0.7, 0.25, 1)
    both;
}
.club-nine-ripple {
  position: absolute;
  inset: -4px;
  border: 2px solid #bae6fd;
  border-radius: 50%;
  animation: nine-ripple 900ms ease-out both;
}
@keyframes nine-hop {
  0%,
  100% {
    transform: translate(0, 0) rotate(var(--nine-turn)) scale(1);
  }
  28% {
    transform: translate(
        calc(var(--kick-x) * var(--jump-distance)),
        calc(var(--kick-y) * var(--jump-distance) - 1rem)
      )
      rotate(calc(var(--nine-turn) + 110deg)) scale(1.2);
  }
  58% {
    transform: translate(
        calc(var(--kick-x) * var(--jump-distance) * 0.4),
        0.4rem
      )
      rotate(calc(var(--nine-turn) - 15deg)) scale(0.92);
  }
  80% {
    transform: translate(0, -0.35rem) rotate(calc(var(--nine-turn) + 6deg))
      scale(1.04);
  }
}
@keyframes nine-ripple {
  from {
    opacity: 0.7;
    transform: scale(0.95);
  }
  to {
    opacity: 0;
    transform: scale(1.4);
  }
}
@media (hover: hover) and (pointer: fine) {
  .club-toy-trigger:hover .club-toy-avatar {
    transform: rotate(1deg) scale(1.02);
  }
}
@media (min-width: 1024px) {
  .club-avatar-toy {
    --avatar-size: clamp(17rem, 26vw, 23rem);
    --nine-size: clamp(2.5rem, 4vw, 3.5rem);
  }
}
@media (max-width: 1023px) {
  .club-avatar-toy {
    --avatar-size: clamp(3.5rem, 16vw, 4.25rem);
    --nine-size: 1.05rem;
    --jump-distance: 0.5rem;
    padding: 1rem;
  }
  .club-toy-avatar {
    border-width: 2px;
    box-shadow: 0 6px 20px rgb(2 6 23 / 0.18);
  }
  .club-nine-glyph {
    text-shadow: 0 1px 3px #075985;
  }
}
@media (prefers-reduced-motion: reduce) {
  .is-playing .club-nine-glyph {
    animation: none;
    color: #fff;
  }
  .club-nine-ripple {
    display: none;
  }
  .club-toy-avatar {
    transition: none;
  }
  .club-toy-trigger:is(:hover, :active) .club-toy-avatar {
    transform: none;
  }
}
</style>
