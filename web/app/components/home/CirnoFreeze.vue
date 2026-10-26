<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { createIceField } from '~/utils/ice-geometry'
import type { IceFacetTone } from '~/utils/ice-geometry'
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

const FACET_FILL: Record<IceFacetTone, string> = {
  deep: 'url(#cirno-ice-deep)',
  mid: 'url(#cirno-ice-blue)',
  light: 'url(#cirno-ice-light)',
  specular: 'url(#cirno-ice-specular)'
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
      <div class="ice-glaze" aria-hidden="true" />
      <div class="ice-atmosphere" aria-hidden="true" />
      <div class="ice-frost-grain" aria-hidden="true" />
      <div class="ice-flash" aria-hidden="true" />

      <svg
        class="ice-field"
        :viewBox="`0 0 ${scene.width} ${scene.height}`"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="cirno-ice-body" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#fafeff" stop-opacity=".95" />
            <stop offset=".22" stop-color="#d5f4ff" stop-opacity=".84" />
            <stop offset=".48" stop-color="#6cc3f4" stop-opacity=".56" />
            <stop offset=".74" stop-color="#1e79b8" stop-opacity=".46" />
            <stop offset=".9" stop-color="#c7d8fe" stop-opacity=".68" />
            <stop offset="1" stop-color="#eefcff" stop-opacity=".9" />
          </linearGradient>
          <linearGradient id="cirno-ice-deep" x1="0" y1="0" x2="0.9" y2="1">
            <stop offset="0" stop-color="#06375c" stop-opacity=".7" />
            <stop offset=".55" stop-color="#1669a5" stop-opacity=".44" />
            <stop offset="1" stop-color="#7cd4fc" stop-opacity=".16" />
          </linearGradient>
          <linearGradient id="cirno-ice-light" x1="0" y1="0" x2="1" y2=".8">
            <stop offset="0" stop-color="#ffffff" stop-opacity=".92" />
            <stop offset=".45" stop-color="#e3f9ff" stop-opacity=".54" />
            <stop offset="1" stop-color="#bae8ff" stop-opacity=".08" />
          </linearGradient>
          <linearGradient id="cirno-ice-blue" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stop-color="#135c91" stop-opacity=".64" />
            <stop offset=".5" stop-color="#48ace2" stop-opacity=".36" />
            <stop offset="1" stop-color="#bef2ff" stop-opacity=".12" />
          </linearGradient>
          <linearGradient id="cirno-ice-specular" x1="0" y1="0" x2="0.85" y2="0.85">
            <stop offset="0" stop-color="#ffffff" stop-opacity=".96" />
            <stop offset=".32" stop-color="#ecfbff" stop-opacity=".66" />
            <stop offset=".7" stop-color="#dbeafe" stop-opacity=".28" />
            <stop offset="1" stop-color="#8addff" stop-opacity=".05" />
          </linearGradient>
          <linearGradient id="cirno-ice-bevel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#ffffff" stop-opacity=".94" />
            <stop offset=".36" stop-color="#bceaff" stop-opacity=".76" />
            <stop offset=".72" stop-color="#1d74ad" stop-opacity=".58" />
            <stop offset="1" stop-color="#073152" stop-opacity=".72" />
          </linearGradient>
          <radialGradient id="cirno-wing-aura" cx="50%" cy="50%" r="50%">
            <stop offset="0" stop-color="#f0fcff" stop-opacity=".78" />
            <stop offset=".45" stop-color="#67cbfa" stop-opacity=".35" />
            <stop offset="1" stop-color="#0284c7" stop-opacity="0" />
          </radialGradient>

          <pattern
            id="cirno-rime-pattern"
            width="84"
            height="84"
            patternUnits="userSpaceOnUse"
          >
            <g fill="none" stroke="#e8faff" stroke-linecap="round">
              <path
                d="M14 10l8 5m-4-7v9m4-7l-8 5M56 26l6 4m-3-6v8m3-6l-6 4M28 58l8 4m-4-6v8m4-6l-8 4M68 66l5 3m-2.5-4.5v6"
                stroke-width=".58"
                stroke-opacity=".38"
              />
              <path
                d="M4 36l13-7 8 3M42 12l11 8-5 9M48 48l14-6 7 7M12 72l15-8M64 10l12 7"
                stroke-width=".45"
                stroke-opacity=".26"
              />
              <circle
                cx="36"
                cy="34"
                r="1.9"
                stroke="#ffffff"
                stroke-width=".45"
                stroke-opacity=".35"
              />
              <circle
                cx="72"
                cy="44"
                r="1.4"
                stroke="#ffffff"
                stroke-width=".4"
                stroke-opacity=".3"
              />
            </g>
            <g fill="#f4fdff" fill-opacity=".44">
              <circle cx="18" cy="12" r=".95" />
              <circle cx="35" cy="33" r=".6" />
              <circle cx="65" cy="16" r="1.05" />
              <circle cx="52" cy="42" r=".8" />
              <circle cx="12" cy="51" r=".95" />
              <circle cx="32" cy="70" r=".75" />
              <circle cx="71" cy="56" r=".85" />
            </g>
          </pattern>

          <g
            id="cirno-frost-branch"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M0 0 0 68 M0 12 -11 4 M0 12 11 4 M0 24 -18 12 M0 24 18 12 M0 37 -23 22 M0 37 23 22 M0 50 -16 38 M0 50 16 38 M0 60 -9 52 M0 60 9 52"
              stroke-width="1.05"
            />
            <path
              d="M-6 8 -6 1 M6 8 6 1 M-11 4 -16 6 M11 4 16 6 M-10 17 -10 9 M10 17 10 9 M-18 12 -24 14 M18 12 24 14 M-13 29 -13 19 M13 29 13 19 M-19 25 -25 27 M19 25 25 27 M-23 22 -21 15 M23 22 21 15 M-11 43 -11 35 M11 43 11 35 M-16 38 -21 40 M16 38 21 40 M-5 64 0 68 5 64"
              stroke-width=".68"
              stroke-opacity=".82"
            />
          </g>

          <g
            id="cirno-frost-plume"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M0 0 Q-3 28 0 62 M-1 16 -14 7 M-1 16 13 8 M-2 31 -21 18 M-2 31 19 19 M-1 45 -15 34 M-1 45 15 35 M0 55 -8 48 M0 55 8 48"
              stroke-width=".95"
            />
            <path
              d="M-12 18 -26 24 M11 19 24 25 M-14 7 -13 1 M13 8 12 2 M-14 23 -15 14 M13 24 14 15 M-21 18 -27 20 M19 19 25 21 M-10 38 -11 30 M10 39 11 31"
              stroke-width=".62"
              stroke-opacity=".76"
            />
          </g>

          <g id="cirno-ice-wing">
            <ellipse cx="0" cy="0" rx="34" ry="68" fill="url(#cirno-wing-aura)" />
            <polygon
              points="0,-62 21,-19 14,37 0,62 -14,37 -21,-19"
              fill="url(#cirno-ice-body)"
              stroke="#ecfcff"
              stroke-width="1.05"
            />
            <polygon
              points="0,-62 21,-19 8,-6 0,9"
              fill="url(#cirno-ice-specular)"
            />
            <polygon
              points="0,-62 0,9 -8,-6 -21,-19"
              fill="url(#cirno-ice-light)"
              opacity=".82"
            />
            <polygon
              points="21,-19 14,37 0,62 0,9 8,-6"
              fill="url(#cirno-ice-blue)"
            />
            <polygon
              points="-21,-19 -8,-6 0,9 0,62 -14,37"
              fill="url(#cirno-ice-deep)"
              opacity=".64"
            />
            <polygon
              points="0,-38 9,-12 6,21 0,38 -6,21 -9,-12"
              fill="url(#cirno-ice-specular)"
              opacity=".68"
              stroke="#ffffff"
              stroke-width=".55"
            />
            <path
              d="M0 -62 0 9 0 62 M-21 -19 -8 -6 0 9 8 -6 21 -19 M-14 37 -6 21 0 9 6 21 14 37 M0 -38 -9 -12 0 9 9 -12 Z"
              fill="none"
              stroke="#f6feff"
              stroke-width=".75"
              stroke-opacity=".9"
            />
          </g>
        </defs>

        <rect
          width="100%"
          height="100%"
          fill="url(#cirno-rime-pattern)"
          class="ice-rime-sheet"
        />

        <g class="ice-sheet-cracks">
          <g
            v-for="crack in scene.sheetCracks"
            :key="crack.id"
            class="ice-sheet-fracture"
            :style="fragmentStyle(crack)"
          >
            <path
              class="ice-crack ice-crack-glow"
              :d="crack.main"
              pathLength="1"
            />
            <path
              class="ice-crack ice-crack-shadow"
              :d="crack.main"
              pathLength="1"
            />
            <path class="ice-crack" :d="crack.main" pathLength="1" />
            <path
              class="ice-crack ice-crack-hairline"
              :d="crack.branches"
              pathLength="1"
            />
          </g>
        </g>

        <g class="ice-panels">
          <g
            v-for="panel in scene.panels"
            :key="panel.id"
            class="ice-cell"
            :style="fragmentStyle(panel)"
          >
            <polygon
              :points="panel.crownPoints"
              class="ice-cell-shadow"
            />
            <polygon
              :points="panel.points"
              fill="url(#cirno-ice-body)"
              stroke="#bce9fa"
              stroke-opacity=".42"
              stroke-width=".75"
            />
            <polygon
              :points="panel.crownPoints"
              fill="url(#cirno-ice-body)"
              stroke="#d8f6ff"
              stroke-opacity=".55"
              stroke-width=".7"
            />
            <polygon
              v-for="(facet, i) in panel.facets"
              :key="`f-${i}`"
              :points="facet"
              :fill="i % 2 ? 'url(#cirno-ice-blue)' : 'url(#cirno-ice-light)'"
              :opacity="i === 0 ? 0.56 : 0.32"
            />
            <polygon
              v-for="(sub, j) in panel.subFacets"
              :key="`sf-${j}`"
              :points="sub.points"
              :fill="FACET_FILL[sub.tone]"
              :opacity="sub.opacity"
            />
            <polygon
              :points="panel.bevel"
              fill="url(#cirno-ice-bevel)"
              opacity=".78"
            />
            <path
              :d="panel.innerRim"
              fill="none"
              stroke="#d7f6ff"
              stroke-width=".85"
              stroke-opacity=".68"
            />
            <path
              :d="panel.glint"
              fill="none"
              stroke="#ffffff"
              stroke-width="1.15"
              stroke-linecap="round"
              stroke-opacity=".82"
            />
            <path
              :d="panel.rim"
              fill="none"
              stroke="#f5feff"
              stroke-width="1.65"
              stroke-linejoin="bevel"
              stroke-opacity=".94"
            />
            <path
              class="ice-crack ice-crack-shadow"
              :d="panel.crack"
              pathLength="1"
            />
            <path class="ice-crack" :d="panel.crack" pathLength="1" />
            <path
              class="ice-crack ice-crack-hairline"
              :d="panel.hairlineCrack"
              pathLength="1"
            />
          </g>
        </g>

        <g class="ice-ferns">
          <use
            v-for="branch in scene.branches"
            :key="branch.id"
            :href="branch.variant ? '#cirno-frost-plume' : '#cirno-frost-branch'"
            :opacity="branch.opacity"
            :transform="`translate(${branch.x} ${branch.y}) rotate(${branch.angle}) scale(${branch.scale})`"
          />
        </g>

        <g class="ice-dust-layer">
          <circle
            v-for="mote in scene.dust"
            :key="mote.id"
            class="ice-dust-mote"
            :cx="mote.x"
            :cy="mote.y"
            :r="mote.r"
            :style="{
              '--dust-delay': `${mote.delay}ms`,
              '--dust-duration': `${mote.duration}ms`
            }"
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
              :points="chip.points"
              fill="url(#cirno-ice-body)"
              stroke="#f2fdff"
              stroke-width=".75"
            />
            <polygon
              :points="chip.facet"
              fill="url(#cirno-ice-specular)"
              opacity=".75"
            />
          </g>
        </g>
      </svg>

      <div class="ice-spell" aria-hidden="true">
        <span class="ice-spell-wings">◇ ◇ ◇ <b>「完美冻结」</b> ◇ ◇ ◇</span>
        <span class="ice-spell-kicker" />
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
  contain: layout style;
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
.ice-glaze {
  position: absolute;
  inset: 0;
  backdrop-filter: blur(calc(1.6px + var(--thaw-progress, 0) * 1.4px))
    saturate(calc(0.76 - var(--thaw-progress, 0) * 0.1)) brightness(1.04)
    contrast(1.04) hue-rotate(-4deg);
  -webkit-backdrop-filter: blur(calc(1.6px + var(--thaw-progress, 0) * 1.4px))
    saturate(calc(0.76 - var(--thaw-progress, 0) * 0.1)) brightness(1.04)
    contrast(1.04) hue-rotate(-4deg);
  background:
    linear-gradient(
      126deg,
      rgb(255 255 255 / 0.16) 0%,
      rgb(210 245 255 / 0.05) 22%,
      transparent 42%,
      rgb(186 238 255 / 0.11) 56%,
      transparent 74%,
      rgb(240 253 255 / 0.18) 100%
    ),
    radial-gradient(
      ellipse at 50% 48%,
      rgb(224 248 255 / 0.04) 0%,
      rgb(56 189 248 / 0.1) 68%,
      rgb(14 116 144 / 0.22) 100%
    );
  box-shadow:
    inset 0 0 110px rgb(155 228 255 / 0.34),
    inset 0 0 28px rgb(255 255 255 / 0.42);
  animation: ice-atmosphere-in 780ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
.ice-atmosphere {
  position: absolute;
  inset: 0;
  backdrop-filter: blur(9px) saturate(0.58) brightness(1.09);
  -webkit-backdrop-filter: blur(9px) saturate(0.58) brightness(1.09);
  mask-image: radial-gradient(
    ellipse 70% 64% at 50% 48%,
    transparent 34%,
    rgb(0 0 0 / 0.52) 64%,
    #000 92%
  );
  background:
    radial-gradient(
      circle at 0% 0%,
      rgb(240 253 255 / 0.62) 0%,
      transparent 36%
    ),
    radial-gradient(
      circle at 100% 0%,
      rgb(240 253 255 / 0.62) 0%,
      transparent 36%
    ),
    radial-gradient(
      circle at 0% 100%,
      rgb(224 248 255 / 0.58) 0%,
      transparent 38%
    ),
    radial-gradient(
      circle at 100% 100%,
      rgb(224 248 255 / 0.58) 0%,
      transparent 38%
    ),
    radial-gradient(
      ellipse at 50% 46%,
      transparent 32%,
      rgb(56 168 226 / 0.18) 66%,
      rgb(186 235 255 / 0.58) 100%
    );
  box-shadow:
    inset 0 0 96px rgb(12 74 110 / 0.38),
    inset 0 0 42px rgb(224 249 255 / 0.58);
  animation: ice-atmosphere-in 980ms ease-out both;
}
.ice-frost-grain {
  position: absolute;
  inset: 0;
  opacity: 0.62;
  background-image:
    radial-gradient(
      circle at 18% 14%,
      rgb(255 255 255 / 0.55) 0 1px,
      transparent 2px
    ),
    radial-gradient(
      circle at 84% 20%,
      rgb(240 253 255 / 0.5) 0 1.2px,
      transparent 2.2px
    ),
    radial-gradient(
      circle at 14% 82%,
      rgb(240 253 255 / 0.48) 0 1px,
      transparent 2px
    ),
    radial-gradient(
      circle at 86% 84%,
      rgb(255 255 255 / 0.52) 0 1.2px,
      transparent 2.4px
    ),
    repeating-linear-gradient(
      30deg,
      transparent 0 5px,
      rgb(235 252 255 / 0.28) 5px 6px,
      transparent 6px 17px
    ),
    repeating-linear-gradient(
      150deg,
      transparent 0 7px,
      rgb(214 246 255 / 0.24) 7px 8px,
      transparent 8px 21px
    ),
    repeating-linear-gradient(
      90deg,
      transparent 0 11px,
      rgb(255 255 255 / 0.16) 11px 12px,
      transparent 12px 29px
    );
  mask-image: radial-gradient(
    ellipse 72% 66% at 50% 48%,
    transparent 42%,
    rgb(0 0 0 / 0.55) 72%,
    #000 96%
  );
  animation: ice-atmosphere-in 1250ms ease-out both;
}
.ice-flash {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(
    circle at 50% 45%,
    rgb(255 255 255 / 0.72) 0%,
    rgb(186 238 255 / 0.42) 38%,
    rgb(56 189 248 / 0.18) 68%,
    transparent 100%
  );
  animation: ice-flash-wave 860ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
.ice-rime-sheet {
  opacity: 0.75;
  mask-image: radial-gradient(
    ellipse 74% 68% at 50% 48%,
    transparent 38%,
    #000 88%
  );
}
.ice-cell,
.ice-crystal {
  transform-box: view-box;
  transform-origin: var(--fragment-origin, 0 0);
  translate: calc(var(--fragment-x, 0px) * var(--thaw-progress, 0) * 0.035)
    calc(var(--fragment-y, 0px) * var(--thaw-progress, 0) * 0.02);
  rotate: calc(var(--fragment-spin, 0deg) * var(--thaw-progress, 0) * 0.035);
  animation: ice-grow 920ms var(--grow-delay, 0ms)
    cubic-bezier(0.16, 1, 0.3, 1) both;
}
.ice-crystal {
  animation-duration: 1180ms;
  filter: drop-shadow(0 6px 18px rgb(7 58 97 / 0.42));
}
.ice-cell-shadow {
  fill: rgb(6 42 74 / 0.32);
  transform: translate(0, 3px);
}
.ice-crack {
  fill: none;
  stroke: #f7feff;
  stroke-width: 1.25;
  stroke-linecap: round;
  stroke-linejoin: bevel;
  stroke-dasharray: 1;
  stroke-dashoffset: calc(
    1 - clamp(0, (var(--thaw-progress, 0) - var(--crack-at, 0)) * 2.1, 1)
  );
}
.ice-crack-shadow {
  stroke: #0e4f79;
  stroke-width: 2.85;
  opacity: 0.56;
}
.ice-crack-glow {
  stroke: #7dd3fc;
  stroke-width: 4.5;
  opacity: calc(clamp(0, (var(--thaw-progress, 0) - var(--crack-at, 0)) * 1.8, 0.48));
}
.ice-crack-hairline {
  stroke: #e6faff;
  stroke-width: 0.78;
  opacity: 0.84;
  stroke-dashoffset: calc(
    1 - clamp(0, (var(--thaw-progress, 0) - var(--crack-at, 0) - 0.08) * 2.3, 1)
  );
}
.ice-sheet-fracture {
  transform-box: view-box;
  transform-origin: var(--fragment-origin, 0 0);
}
.ice-ferns {
  color: #effbff;
  filter: drop-shadow(0 0 6px rgb(125 211 252 / 0.55));
  animation: ice-atmosphere-in 1450ms 120ms ease-out both;
}
.ice-dust-mote {
  fill: #f5feff;
  opacity: 0.65;
  filter: drop-shadow(0 0 5px #7dd3fc);
  animation: ice-dust-twinkle var(--dust-duration, 2800ms)
    var(--dust-delay, 0ms) ease-in-out infinite alternate;
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
  padding: 0.7rem 1.65rem 0.85rem;
  color: #f2fcff;
  background: linear-gradient(
    90deg,
    transparent,
    rgb(6 38 66 / 0.52) 18% 82%,
    transparent
  );
  border-block: 1px solid rgb(206 244 255 / 0.42);
  box-shadow: 0 10px 36px rgb(3 22 42 / 0.28);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  text-shadow:
    0 2px 12px #052e4f,
    0 0 28px rgb(128 220 255 / 0.65);
  translate: -50% 0;
  animation: ice-inscription-in 1050ms 220ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
.ice-spell-wings {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  letter-spacing: 0.22em;
  color: #c2eefc;
}
.ice-spell-wings b {
  margin-inline: 0.35rem;
  color: #ffffff;
  font-size: 1.75rem;
  font-weight: 500;
  text-shadow:
    0 0 18px rgb(186 238 255 / 0.88),
    0 2px 10px rgb(4 35 62 / 0.85);
}
.ice-spell-kicker {
  width: 6.5rem;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    rgb(224 249 255 / 0.85),
    transparent
  );
}
.ice-spell-name {
  font-family: ui-serif, 'Noto Serif SC', serif;
  font-size: clamp(0.78rem, 1.15vw, 1.02rem);
  letter-spacing: 0.2em;
  color: #e6f9ff;
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
  padding: 0.5rem 1.15rem;
  color: #effbff;
  border-block: 1px solid rgb(204 242 255 / 0.48);
  background: linear-gradient(
    90deg,
    transparent,
    rgb(5 34 59 / 0.76) 16% 84%,
    transparent
  );
  box-shadow:
    0 8px 28px rgb(2 18 36 / 0.36),
    inset 0 1px 0 rgb(255 255 255 / 0.24);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  translate: -50% 0;
  animation: ice-inscription-in 800ms 580ms cubic-bezier(0.16, 1, 0.3, 1) both;
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
  color: #bae8ff;
  animation: ice-scroll-bob 1800ms ease-in-out infinite;
}
.ice-thaw-track {
  position: relative;
  width: 4.25rem;
  height: 2px;
  background: rgb(224 247 255 / 0.28);
  overflow: hidden;
}
.ice-thaw-track span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #7dd3fc, #ffffff);
  transform: scaleX(var(--thaw-progress, 0));
  transform-origin: left;
  box-shadow:
    0 0 10px #7dd3fc,
    0 0 4px #ffffff;
}
.ice-escape-hint {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: #d8f3ff;
  font-size: 0.65rem;
  white-space: nowrap;
}
.ice-escape-hint kbd {
  padding: 0.1rem 0.32rem;
  border: 1px solid rgb(221 248 255 / 0.55);
  background: rgb(255 255 255 / 0.1);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.25);
  font:
    0.6rem ui-monospace,
    monospace;
}
.is-shattering .ice-cell,
.is-shattering .ice-crystal,
.is-shattering .ice-sheet-fracture {
  animation: ice-wall-break 1180ms var(--fragment-delay, 0ms)
    cubic-bezier(0.22, 0.61, 0.36, 1) both;
}
.is-shattering .ice-chip {
  animation: ice-chip-break 1020ms calc(var(--fragment-delay, 0ms) + 60ms)
    cubic-bezier(0.16, 0.84, 0.44, 1) both;
}
.is-shattering .ice-flash {
  animation: ice-shatter-flash 520ms ease-out both;
}
.is-shattering
  :is(
    .ice-glaze,
    .ice-atmosphere,
    .ice-frost-grain,
    .ice-ferns,
    .ice-rime-sheet,
    .ice-dust-layer
  ) {
  animation: ice-atmosphere-out 680ms 40ms ease-out both;
}
.is-shattering :is(.ice-spell, .ice-instruction) {
  animation: ice-inscription-out 280ms ease-out both;
  pointer-events: none;
}
@keyframes ice-grow {
  0% {
    opacity: 0;
    transform: translate(var(--grow-x, 0px), var(--grow-y, 0px)) scale(0.92);
    filter: brightness(1.35);
  }
  65% {
    opacity: 1;
  }
  100% {
    opacity: 1;
    transform: translate(0, 0) scale(1);
    filter: brightness(1);
  }
}
@keyframes ice-wall-break {
  0% {
    opacity: 1;
    transform: translate(0, 0) rotate(0) scale(1);
  }
  10% {
    opacity: 1;
    transform: translate(calc(var(--fragment-x) * 0.05), -4px)
      rotate(calc(var(--fragment-spin) * -0.07)) scale(1.015);
  }
  45% {
    opacity: 0.92;
  }
  100% {
    opacity: 0;
    transform: translate(var(--fragment-x), var(--fragment-y))
      rotate(var(--fragment-spin)) scale(0.86);
  }
}
@keyframes ice-chip-break {
  0% {
    opacity: 0;
    transform: translate(0, 0) rotate(0) scale(0.7);
  }
  12% {
    opacity: 1;
    transform: translate(calc(var(--fragment-x) * 0.12), -6px)
      rotate(calc(var(--fragment-spin) * 0.15)) scale(1.08);
  }
  100% {
    opacity: 0;
    transform: translate(var(--fragment-x), var(--fragment-y))
      rotate(var(--fragment-spin)) scale(0.35);
  }
}
@keyframes ice-flash-wave {
  0% {
    opacity: 0.95;
    transform: scale(0.92);
  }
  100% {
    opacity: 0;
    transform: scale(1.08);
  }
}
@keyframes ice-shatter-flash {
  0% {
    opacity: 0.78;
  }
  100% {
    opacity: 0;
  }
}
@keyframes ice-dust-twinkle {
  0% {
    opacity: 0.22;
    transform: translateY(0) scale(0.85);
  }
  100% {
    opacity: 0.88;
    transform: translateY(-5px) scale(1.2);
  }
}
@keyframes ice-scroll-bob {
  0%,
  100% {
    transform: translateY(-1px);
  }
  50% {
    transform: translateY(2px);
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
    padding: 0.5rem 1.1rem 0.65rem;
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
    padding: 0.25rem 0.7rem;
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
    .ice-glaze,
    .ice-atmosphere,
    .ice-frost-grain,
    .ice-dust-mote,
    .ice-scroll-mark,
    .ice-spell,
    .ice-instruction
  ) {
  animation: none;
  translate: none;
  rotate: none;
}
.is-reduced .ice-flash {
  display: none;
}
.is-reduced.is-shattering {
  opacity: 0;
  transition: opacity 140ms ease;
}
.is-reduced.is-shattering
  :is(.ice-cell, .ice-crystal, .ice-chip, .ice-sheet-fracture) {
  animation: none;
}
@media (prefers-reduced-motion: reduce) {
  .cirno-freeze *,
  .cirno-freeze *::before {
    animation: none !important;
  }
  .ice-cell,
  .ice-crystal {
    translate: none !important;
    rotate: none !important;
  }
  .ice-flash {
    display: none;
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
