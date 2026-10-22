<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { createIceField } from '~/utils/ice-geometry'
import { createIceThawController } from '~/utils/ice-thaw'
import type { IceThawController, ThawState } from '~/utils/ice-thaw'
import { createFreezeInteractionLock } from '~/utils/freeze-interaction'
import type { FreezeInteractionLock } from '~/utils/freeze-interaction'

const emit = defineEmits<{ complete: [] }>()

const scene = ref(createIceField(1440, 900))
const state = ref<ThawState>({ phase: 'frozen', progress: 0, reduced: false })
const isShattering = computed(() => state.value.phase === 'shattering')
const surface = ref<HTMLElement | null>(null)
let controller: IceThawController | undefined
let interaction: FreezeInteractionLock | undefined

const resize = (): void => {
  scene.value = createIceField(window.innerWidth, window.innerHeight)
}

interface Fragment {
  dx: number
  dy: number
  spin: number
  delay: number
  origin?: string
  growDelay?: number
  growX?: number
  growY?: number
  crackAt?: string | number
}

const fragmentStyle = (piece: Fragment) => ({
  '--fragment-x': `${piece.dx.toFixed(1)}px`,
  '--fragment-y': `${piece.dy.toFixed(1)}px`,
  '--fragment-spin': `${piece.spin.toFixed(1)}deg`,
  '--fragment-delay': `${piece.delay}ms`,
  '--fragment-origin': piece.origin || '0 0',
  '--grow-delay': `${piece.growDelay || 0}ms`,
  '--grow-x': `${piece.growX || 0}px`,
  '--grow-y': `${piece.growY || 0}px`,
  '--crack-at': piece.crackAt || 0
})

onMounted(() => {
  resize()
  window.addEventListener('resize', resize, { passive: true })
  controller = createIceThawController(window, {
    onChange: (value) => {
      state.value = value
    },
    onComplete: () => emit('complete')
  })
  const element = surface.value
  if (element) {
    // Nuxt mounts the application into the configured root element
    // (`app.rootId`, "__nuxt"); the archived frost made that subtree inert.
    interaction = createFreezeInteractionLock(window, {
      surface: element,
      background: document.getElementById('__nuxt'),
      onEscape: () => controller?.shatter()
    })
    interaction.lock()
  }
  controller.start()
})

onBeforeUnmount(() => {
  controller?.destroy()
  interaction?.unlock()
  window.removeEventListener('resize', resize)
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="surface"
      class="cirno-freeze"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ice-spell-title"
      aria-describedby="ice-thaw-instruction"
      tabindex="-1"
      :class="{ 'is-shattering': isShattering, 'is-reduced': state.reduced }"
      :style="{ '--thaw-progress': state.progress }"
      data-testid="cirno-freeze"
      :data-phase="state.phase"
    >
      <div class="ice-atmosphere" aria-hidden="true" />
      <div class="ice-frost-grain" aria-hidden="true" />
      <svg
        class="ice-field"
        :viewBox="`0 0 ${scene.width} ${scene.height}`"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="cirno-ice-body" x1="0" y1="0" x2="1" y2="1">
            <stop stop-color="#f4fdff" stop-opacity=".92" />
            <stop offset=".3" stop-color="#beedff" stop-opacity=".7" />
            <stop offset=".65" stop-color="#419ed6" stop-opacity=".32" />
            <stop offset="1" stop-color="#e2faff" stop-opacity=".78" />
          </linearGradient>
          <linearGradient id="cirno-ice-light" x1="0" y1="0" x2="1" y2=".8">
            <stop stop-color="#fff" stop-opacity=".78" />
            <stop offset="1" stop-color="#d5f7ff" stop-opacity=".04" />
          </linearGradient>
          <linearGradient id="cirno-ice-blue" x1="0" y1="1" x2="1" y2="0">
            <stop stop-color="#2479b4" stop-opacity=".5" />
            <stop offset="1" stop-color="#a9edff" stop-opacity=".08" />
          </linearGradient>
          <g
            id="cirno-frost-branch"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
          >
            <path
              d="M0 0 0 58 M0 15 -12 6 M0 15 12 6 M0 29 -19 15 M0 29 19 15 M0 43 -14 32 M0 43 14 32 M-12 6 -12 0 M12 6 12 0 M-19 15 -19 7 M19 15 19 7 M-14 32 -14 26 M14 32 14 26"
            />
          </g>
          <g id="cirno-ice-wing">
            <polygon
              points="0,-58 18,-17 12,35 0,58 -12,35 -18,-17"
              fill="url(#cirno-ice-body)"
              stroke="#dff9ff"
              stroke-width=".8"
            />
            <polygon points="0,-58 18,-17 0,7" fill="url(#cirno-ice-light)" />
            <polygon
              points="18,-17 12,35 0,58 0,7"
              fill="url(#cirno-ice-blue)"
            />
            <polygon
              points="0,-58 0,7 -12,35 -18,-17"
              fill="url(#cirno-ice-blue)"
              opacity=".55"
            />
            <path
              d="M0 -58 0 7 0 58 M-18 -17 0 7 18 -17 M-12 35 0 7 12 35"
              fill="none"
              stroke="#f1fdff"
              stroke-width=".65"
              stroke-opacity=".8"
            />
          </g>
        </defs>

        <g class="ice-panels">
          <g
            v-for="panel in scene.panels"
            :key="panel.id"
            class="ice-cell"
            :style="fragmentStyle(panel)"
          >
            <polygon
              :points="panel.points"
              fill="url(#cirno-ice-body)"
              stroke="#a9deee"
              stroke-opacity=".4"
              stroke-width=".7"
            />
            <polygon
              v-for="(facet, i) in panel.facets"
              :key="i"
              :points="facet"
              :fill="i % 2 ? 'url(#cirno-ice-blue)' : 'url(#cirno-ice-light)'"
              :opacity="i === 0 ? 0.6 : 0.34"
            />
            <path
              :d="panel.rim"
              fill="none"
              stroke="#edfcff"
              stroke-width="1.4"
              stroke-opacity=".85"
            />
            <path
              class="ice-crack ice-crack-shadow"
              :d="panel.crack"
              pathLength="1"
            />
            <path class="ice-crack" :d="panel.crack" pathLength="1" />
          </g>
        </g>
        <g class="ice-ferns">
          <use
            v-for="branch in scene.branches"
            :key="branch.id"
            href="#cirno-frost-branch"
            :transform="`translate(${branch.x} ${branch.y}) rotate(${branch.angle}) scale(${branch.scale})`"
          />
        </g>
        <g
          v-for="crystal in scene.crystals"
          :key="crystal.id"
          :transform="`translate(${crystal.x} ${crystal.y})`"
        >
          <g class="ice-crystal" :style="fragmentStyle(crystal)">
            <use
              href="#cirno-ice-wing"
              :transform="`rotate(${crystal.angle}) scale(${crystal.size / 116})`"
            />
          </g>
        </g>
        <g
          v-for="chip in scene.chips"
          :key="`chip-${chip.id}`"
          :transform="`translate(${chip.x} ${chip.y})`"
        >
          <g class="ice-chip" :style="fragmentStyle(chip)">
            <polygon
              :points="`0,${-chip.size} ${chip.size * 0.6},0 0,${chip.size * 0.5} ${-chip.size * 0.3},0`"
              fill="url(#cirno-ice-body)"
              stroke="#effdff"
              stroke-width=".7"
            />
          </g>
        </g>
      </svg>
      <div class="ice-spell" aria-hidden="true">
        <span class="ice-spell-wings">◇ ◇ ◇ <b>「完美冻结」</b> ◇ ◇ ◇</span>
        <span class="ice-spell-kicker"/>
        <span id="ice-spell-title" class="ice-spell-name"
          >冻符「Perfect Freeze」</span
        >
      </div>
      <div class="ice-instruction">
        <div class="ice-instruction-copy">
          <span class="ice-scroll-mark" aria-hidden="true">↓</span
          ><span id="ice-thaw-instruction">向下滑动，打破冻结</span>
        </div>
        <div class="ice-thaw-track" aria-hidden="true"><span /></div>
        <span class="ice-escape-hint"><span>或按</span><kbd>Esc</kbd></span>
      </div>
      <p class="sr-only" role="status" aria-live="polite">
        {{
          isShattering
            ? '冰层正在碎裂，稍后恢复操作。'
            : '冻符，Perfect Freeze。页面操作已冻结，向下滑动或按 Escape 解冻。'
        }}
      </p>
    </div>
  </Teleport>
</template>

<style scoped>
.cirno-freeze {
  position: fixed;
  inset: 0;
  z-index: 10000;
  overflow: hidden;
  pointer-events: auto;
  touch-action: pan-y;
  user-select: none;
  outline: none;
  contain: layout paint;
}
:global([data-cirno-frozen]),
:global([data-cirno-frozen] *),
:global([data-cirno-frozen] *::before),
:global([data-cirno-frozen] *::after) {
  animation-play-state: paused !important;
}
.ice-field {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.ice-atmosphere {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse at 50% 46%,
    transparent 38%,
    rgb(79 171 222 / 0.09) 70%,
    rgb(165 225 250 / 0.48)
  );
  box-shadow: inset 0 0 64px rgb(206 244 255 / 0.28);
  animation: ice-atmosphere-in 1000ms ease-out both;
}
.ice-frost-grain {
  position: absolute;
  inset: 0;
  opacity: 0.35;
  background-image:
    repeating-linear-gradient(
      32deg,
      transparent 0 6px,
      rgb(223 248 255 / 0.32) 6px 7px,
      transparent 7px 19px
    ),
    repeating-linear-gradient(
      128deg,
      transparent 0 13px,
      rgb(223 248 255 / 0.25) 13px 14px,
      transparent 14px 23px
    );
  mask-image: radial-gradient(ellipse at center, transparent 59%, #000 99%);
  animation: ice-atmosphere-in 1400ms ease-out both;
}
.ice-cell,
.ice-crystal {
  transform-box: view-box;
  transform-origin: var(--fragment-origin, 0 0);
  animation: ice-grow 950ms var(--grow-delay, 0ms) cubic-bezier(0.16, 1, 0.3, 1)
    both;
}
.ice-crystal {
  animation-duration: 1200ms;
}
.ice-crack {
  fill: none;
  stroke: #f3fdff;
  stroke-width: 1.1;
  stroke-linecap: round;
  stroke-linejoin: bevel;
  stroke-dasharray: 1;
  stroke-dashoffset: calc(
    1 - clamp(0, (var(--thaw-progress, 0) - var(--crack-at, 0)) * 2, 1)
  );
}
.ice-crack-shadow {
  stroke: #206a98;
  stroke-width: 2.6;
  opacity: 0.5;
}
.ice-ferns {
  color: #e5f9ff;
  stroke-width: 0.85;
  opacity: 0.65;
  animation: ice-atmosphere-in 1600ms 140ms ease-out both;
}
.ice-chip {
  opacity: 0;
  transform-origin: 0 0;
}
.ice-spell {
  position: absolute;
  top: max(5rem, 12svh);
  left: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  width: max-content;
  max-width: calc(100% - 5rem);
  color: #edfbff;
  text-shadow:
    0 1px 10px #073a61,
    0 0 28px rgb(128 220 255 / 0.5);
  translate: -50% 0;
  animation: ice-inscription-in 1100ms 250ms both;
}
.ice-spell-wings {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  letter-spacing: 0.22em;
  color: #b8e9fa;
}
.ice-spell-wings b {
  margin-inline: 0.35rem;
  color: white;
  font-size: 1.7rem;
  font-weight: 400;
}
.ice-spell-kicker {
  font:
    500 0.55rem/1.5 ui-monospace,
    monospace;
  letter-spacing: 0.42em;
}
.ice-spell-name {
  font-family: ui-serif, 'Noto Serif SC', serif;
  font-size: clamp(0.75rem, 1.15vw, 1rem);
  letter-spacing: 0.18em;
}
.ice-instruction {
  position: absolute;
  bottom: max(2.5rem, calc(env(safe-area-inset-bottom) + 1.25rem));
  left: 50%;
  display: flex;
  align-items: center;
  gap: 1.2rem;
  width: max-content;
  max-width: calc(100% - 4rem);
  padding: 0.45rem 1rem;
  color: #eaf9ff;
  border-block: 1px solid rgb(191 235 255 / 0.35);
  background: linear-gradient(
    90deg,
    transparent,
    rgb(4 35 60 / 0.68) 20% 80%,
    transparent
  );
  translate: -50% 0;
  animation: ice-inscription-in 800ms 650ms both;
}
.ice-instruction-copy {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  font-size: 0.75rem;
  line-height: 1.6;
  letter-spacing: 0.1em;
  white-space: nowrap;
}
.ice-scroll-mark {
  font-size: 1.3rem;
  font-weight: 300;
}
.ice-thaw-track {
  width: 4rem;
  height: 1px;
  background: rgb(224 247 255 / 0.28);
}
.ice-thaw-track span {
  display: block;
  height: 100%;
  background: #ebfcff;
  transform: scaleX(var(--thaw-progress, 0));
  transform-origin: left;
  box-shadow: 0 0 8px #8cddff;
}
.ice-escape-hint {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: #d5f1ff;
  font-size: 0.65rem;
  white-space: nowrap;
}
.ice-escape-hint kbd {
  padding: 0.08rem 0.28rem;
  border: 1px solid rgb(221 248 255 / 0.45);
  font:
    0.6rem ui-monospace,
    monospace;
}
.is-shattering .ice-cell,
.is-shattering .ice-crystal {
  animation: ice-wall-break 1180ms var(--fragment-delay, 0ms)
    cubic-bezier(0.22, 0.61, 0.36, 1) both;
}
.is-shattering .ice-chip {
  animation: ice-chip-break 1020ms calc(var(--fragment-delay, 0ms) + 80ms)
    ease-out both;
}
.is-shattering :is(.ice-atmosphere, .ice-frost-grain, .ice-ferns) {
  animation: ice-atmosphere-out 700ms 60ms ease-out both;
}
.is-shattering :is(.ice-spell, .ice-instruction) {
  animation: ice-inscription-out 280ms ease-out both;
  pointer-events: none;
}
@keyframes ice-grow {
  from {
    opacity: 0;
    transform: translate(var(--grow-x, 0px), var(--grow-y, 0px)) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translate(0, 0) scale(1);
  }
}
@keyframes ice-wall-break {
  0% {
    opacity: 1;
    transform: translate(0, 0) rotate(0);
  }
  12% {
    opacity: 1;
    transform: translate(calc(var(--fragment-x) * 0.04), -3px)
      rotate(calc(var(--fragment-spin) * -0.06));
  }
  45% {
    opacity: 0.9;
  }
  100% {
    opacity: 0;
    transform: translate(var(--fragment-x), var(--fragment-y))
      rotate(var(--fragment-spin));
  }
}
@keyframes ice-chip-break {
  0% {
    opacity: 0;
    transform: translate(0, 0) rotate(0);
  }
  12% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(var(--fragment-x), var(--fragment-y))
      rotate(var(--fragment-spin)) scale(0.4);
  }
}
@keyframes ice-atmosphere-in {
  from {
    opacity: 0;
  }
}
@keyframes ice-atmosphere-out {
  to {
    opacity: 0;
  }
}
@keyframes ice-inscription-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@keyframes ice-inscription-out {
  to {
    opacity: 0;
    transform: translateY(-5px);
  }
}
@media (max-width: 639px) {
  .ice-spell {
    top: 5.5rem;
    gap: 0.3rem;
  }
  .ice-spell-wings {
    font-size: 0.5rem;
    gap: 0.2rem;
  }
  .ice-spell-wings b {
    font-size: 1.4rem;
  }
  .ice-instruction {
    gap: 0.8rem;
    max-width: calc(100% - 2rem);
    padding: 0.2rem 0.6rem;
    bottom: max(1.5rem, calc(env(safe-area-inset-bottom) + 0.75rem));
  }
  .ice-instruction-copy {
    font-size: 0.65rem;
    gap: 0.4rem;
  }
  .ice-thaw-track {
    width: 1.75rem;
  }
  .ice-escape-hint {
    display: none;
  }
}
.is-reduced
  :is(
    .ice-cell,
    .ice-crystal,
    .ice-ferns,
    .ice-atmosphere,
    .ice-frost-grain,
    .ice-spell,
    .ice-instruction
  ) {
  animation: none;
}
.is-reduced.is-shattering {
  opacity: 0;
  transition: opacity 140ms ease;
}
.is-reduced.is-shattering :is(.ice-cell, .ice-crystal, .ice-chip) {
  animation: none;
}
@media (prefers-reduced-motion: reduce) {
  .cirno-freeze *,
  .cirno-freeze *::before {
    animation: none !important;
  }
  .is-shattering {
    opacity: 0;
  }
}
@media print {
  .cirno-freeze {
    display: none;
  }
}
</style>
