<script setup lang="ts">
/**
 * Seat distribution chart for `/members`.
 *
 * Geometry comes from the pure `parliamentSeats` helper, so the SSR markup and
 * the hydrated DOM are identical, and an `aria-label` carries the same numbers
 * to assistive technology that the visual chart carries to everyone else.
 * Supports a fan-sweep entrance animation on initial mount and smooth seat/count
 * transitions when hovering or selecting a school.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getSchoolColor, getSchoolDarkColor } from '~/utils/members'
import { PARLIAMENT_CONFIG, parliamentSeats, parliamentTotal } from '~/utils/parliament'
import type { ParliamentGroup } from '~/utils/parliament'

const props = withDefaults(defineProps<{
  data: readonly ParliamentGroup[]
  title?: string
  subTitle?: string
  activeSchool?: string
  showLegend?: boolean
}>(), {
  title: '成员分布',
  subTitle: '',
  activeSchool: '',
  showLegend: false,
})

const emit = defineEmits<{
  select: [school: string]
  hover: [school: string]
}>()

const config = PARLIAMENT_CONFIG
const seats = computed(() => parliamentSeats(props.data, config))

/** Per-seat stagger delays for both initial fan sweep and school-switch wave. */
const enrichedSeats = computed(() => {
  const list = seats.value
  const total = Math.max(1, list.length - 1)
  const groupTotals = new Map<string, number>()
  const groupSeen = new Map<string, number>()

  for (const seat of list) {
    groupTotals.set(seat.label, (groupTotals.get(seat.label) ?? 0) + 1)
  }

  return list.map((seat, index) => {
    const rank = groupSeen.get(seat.label) ?? 0
    groupSeen.set(seat.label, rank + 1)
    const groupTotal = Math.max(1, (groupTotals.get(seat.label) ?? 1) - 1)
    const enterDelay = Math.round((index / total) * 520)
    const waveDelay = Math.round((rank / groupTotal) * 140)
    return {
      ...seat,
      darkColor: getSchoolDarkColor(seat.label),
      enterDelay: `${enterDelay}ms`,
      waveDelay: `${waveDelay}ms`,
    }
  })
})

const totalCount = computed(() => parliamentTotal(props.data))
const activeGroup = computed<ParliamentGroup | null>(() => {
  if (!props.activeSchool) return null
  return (
    props.data.find(group => group.label === props.activeSchool) ?? {
      label: props.activeSchool,
      value: 0,
      color: getSchoolColor(props.activeSchool),
    }
  )
})
const activeDarkColor = computed(() =>
  activeGroup.value ? getSchoolDarkColor(activeGroup.value.label) : '#38bdf8',
)
const targetCount = computed(() =>
  activeGroup.value ? activeGroup.value.value : totalCount.value,
)

const displayCount = ref(targetCount.value)
let rafId = 0

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const cancelCountAnimation = (): void => {
  if (rafId && typeof window !== 'undefined') {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
}

const animateCount = (from: number, to: number, durationMs: number): void => {
  cancelCountAnimation()
  if (typeof window === 'undefined' || prefersReducedMotion() || from === to) {
    displayCount.value = to
    return
  }
  const start = performance.now()
  const step = (now: number): void => {
    const progress = Math.min(1, (now - start) / durationMs)
    const eased = 1 - (1 - progress) ** 4
    displayCount.value = Math.round(from + (to - from) * eased)
    if (progress < 1) {
      rafId = requestAnimationFrame(step)
    }
    else {
      displayCount.value = to
      rafId = 0
    }
  }
  rafId = requestAnimationFrame(step)
}

watch(targetCount, (next, prev) => {
  if (import.meta.server) {
    displayCount.value = next
    return
  }
  animateCount(displayCount.value ?? prev, next, 320)
})

onMounted(() => {
  if (!prefersReducedMotion() && targetCount.value > 0) {
    animateCount(0, targetCount.value, 720)
  }
  else {
    displayCount.value = targetCount.value
  }
})

onBeforeUnmount(() => {
  cancelCountAnimation()
})

const activeTitle = computed(() =>
  activeGroup.value ? activeGroup.value.label : props.title,
)

const activeSubtitle = computed(() => {
  if (activeGroup.value && totalCount.value > 0) {
    const share = Math.round((activeGroup.value.value / totalCount.value) * 100)
    return `共 ${activeGroup.value.value} 席 · 占 ${share}%`
  }
  return props.subTitle
})

const innerArcRadius = config.radiusInner - 26
const innerArcLength = Math.round(Math.PI * innerArcRadius * 10) / 10

const innerArcPath = computed(() => {
  const r = innerArcRadius
  const startX = config.centerX - r
  const endX = config.centerX + r
  const y = config.centerY
  return `M ${startX} ${y} A ${r} ${r} 0 0 1 ${endX} ${y}`
})

const activeArcOffset = computed(() => {
  if (!activeGroup.value || totalCount.value <= 0) return innerArcLength
  const ratio = Math.min(1, Math.max(0, activeGroup.value.value / totalCount.value))
  return Math.round(innerArcLength * (1 - ratio) * 10) / 10
})

const description = computed(() => {
  const groups = props.data
    .filter(group => group.value > 0)
    .map(group => `${group.label} ${group.value}`)
    .join('，')
  return `${props.title}共 ${totalCount.value} 人${groups ? `：${groups}` : ''}`
})
</script>

<template>
  <div
    class="parliament-chart-container"
    :data-has-active="Boolean(activeSchool)"
    :style="{
      '--active-color': activeGroup?.color ?? '#0369a1',
      '--active-dark-color': activeDarkColor,
    }"
    @mouseleave="emit('hover', '')"
  >
    <svg
      :viewBox="`0 0 ${config.width} ${config.height}`"
      class="chart-svg"
      role="img"
      :aria-label="description"
    >
      <title>{{ description }}</title>
      <path
        :d="innerArcPath"
        fill="none"
        class="chart-guide-arc"
        aria-hidden="true"
      />
      <path
        :d="innerArcPath"
        fill="none"
        class="chart-active-arc"
        :style="{
          strokeDasharray: `${innerArcLength}`,
          strokeDashoffset: `${activeArcOffset}`,
        }"
        aria-hidden="true"
      />
      <line
        :x1="config.centerX - config.radiusOuter - 16"
        :y1="config.centerY + 18"
        :x2="config.centerX + config.radiusOuter + 16"
        :y2="config.centerY + 18"
        class="chart-base-line"
        aria-hidden="true"
      />
      <g class="seats">
        <circle
          v-for="(dot, index) in enrichedSeats"
          :key="index"
          :cx="dot.x"
          :cy="dot.y"
          :r="dot.r"
          :fill="dot.color"
          class="seat-dot"
          :class="{
            'is-highlighted': Boolean(activeSchool && dot.label === activeSchool),
            'is-dimmed': Boolean(activeSchool && dot.label !== activeSchool),
          }"
          :style="{
            '--seat-color': dot.color,
            '--seat-dark-color': dot.darkColor,
            '--enter-delay': dot.enterDelay,
            '--wave-delay': dot.waveDelay,
          }"
          @mouseenter="emit('hover', dot.label)"
          @click="emit('select', dot.label)"
        >
          <title>{{ dot.label }}</title>
        </circle>
      </g>
      <g
        class="center-text"
        :transform="`translate(${config.centerX}, ${config.centerY})`"
      >
        <text
          x="0"
          y="-54"
          text-anchor="middle"
          class="total-number"
          :class="{ 'is-active-school': Boolean(activeGroup) }"
        >
          {{ displayCount }}
        </text>
        <text x="0" y="-2" text-anchor="middle" class="chart-title">
          {{ activeTitle }}
        </text>
        <text
          v-if="activeSubtitle"
          x="0"
          y="30"
          text-anchor="middle"
          class="chart-subtitle"
          :class="{ 'is-active-school': Boolean(activeGroup) }"
        >
          {{ activeSubtitle }}
        </text>
      </g>
    </svg>

    <div v-if="showLegend" class="legend-container">
      <div
        v-for="item in data"
        v-show="item.value > 0"
        :key="item.label"
        class="legend-item"
      >
        <div class="legend-box" :style="{ backgroundColor: item.color }">
          {{ item.label }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.parliament-chart-container {
  width: 100%;
  max-width: 48.75rem;
  margin: 0 auto;
}

.chart-svg {
  width: 100%;
  height: auto;
  overflow: visible;
}

.chart-guide-arc {
  stroke: #cbd5e1;
  stroke-width: 1.5;
  stroke-dasharray: 4 6;
  animation: chart-chrome-fade 600ms ease-out backwards;
}

:global(.dark .chart-guide-arc) {
  stroke: #64748b;
}

.chart-active-arc {
  stroke: var(--active-color, #0369a1);
  stroke-width: 3;
  stroke-linecap: round;
  transition:
    stroke-dashoffset 460ms cubic-bezier(0.22, 1, 0.36, 1),
    stroke 280ms ease;
}

:global(.dark .chart-active-arc) {
  stroke: var(--active-dark-color, #38bdf8);
  filter: drop-shadow(0 0 6px rgb(56 189 248 / 0.35));
}

.chart-base-line {
  stroke: #e2e8f0;
  stroke-width: 1;
  animation: chart-chrome-fade 600ms ease-out 120ms backwards;
}

:global(.dark .chart-base-line) {
  stroke: #475569;
}

.seat-dot {
  fill: var(--seat-color);
  transform-box: fill-box;
  transform-origin: center;
  animation: seat-bloom 560ms cubic-bezier(0.22, 1, 0.36, 1) var(--enter-delay, 0ms) backwards;
  transition:
    transform 320ms cubic-bezier(0.22, 1, 0.36, 1) var(--wave-delay, 0ms),
    opacity 260ms ease var(--wave-delay, 0ms),
    stroke-width 240ms ease var(--wave-delay, 0ms),
    filter 260ms ease;
  cursor: pointer;
}

:global(.dark .seat-dot) {
  fill: var(--seat-dark-color, var(--seat-color));
  stroke: rgb(248 250 252 / 0.24);
  stroke-width: 1px;
}

.seat-dot.is-dimmed {
  opacity: 0.16;
  transform: scale(0.72);
  filter: saturate(0.3);
  transition-delay: 0ms;
}

:global(.dark .seat-dot.is-dimmed) {
  opacity: 0.2;
}

.seat-dot.is-highlighted {
  opacity: 1;
  transform: scale(1.04);
  stroke: #ffffff;
  stroke-width: 1.5px;
  filter: brightness(1.08) drop-shadow(0 2px 4px rgb(15 23 42 / 0.18));
}

:global(.dark .seat-dot.is-highlighted) {
  stroke: #ffffff;
  stroke-width: 1.5px;
  filter: brightness(1.1) drop-shadow(0 0 5px var(--seat-dark-color, #38bdf8));
}

.seat-dot:hover {
  opacity: 1;
  transform: scale(1.12);
  filter: brightness(1.12);
  transition-delay: 0ms;
}

.center-text {
  animation: center-fade-up 580ms cubic-bezier(0.22, 1, 0.36, 1) 140ms backwards;
}

.total-number {
  font-family: var(--club-serif);
  font-size: 92px;
  font-weight: 700;
  fill: #0f172a;
  letter-spacing: -0.03em;
  transition: fill 260ms ease;
}

.total-number.is-active-school {
  fill: var(--active-color, #0f172a);
}

:global(.dark .total-number) {
  fill: #f8fafc;
}

:global(.dark .total-number.is-active-school) {
  fill: var(--active-dark-color, #f8fafc);
}

.chart-title {
  font-family: var(--club-serif);
  font-size: 32px;
  font-weight: 600;
  fill: #334155;
  letter-spacing: 0.14em;
  transition: fill 240ms ease;
}

:global(.dark .chart-title) {
  fill: #f1f5f9;
}

.chart-subtitle {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 15px;
  fill: #475569;
  font-weight: 500;
  letter-spacing: 0.14em;
  transition: fill 240ms ease;
}

.chart-subtitle.is-active-school {
  font-family: var(--club-serif);
  fill: #0369a1;
  font-weight: 600;
  letter-spacing: 0.08em;
}

:global(.dark .chart-subtitle) {
  fill: #cbd5e1;
}

:global(.dark .chart-subtitle.is-active-school) {
  fill: #7dd3fc;
}

.legend-container {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 16px;
  padding: 0 16px;
  width: 100%;
  box-sizing: border-box;
}

.legend-item {
  flex: 0 0 auto;
  display: flex;
  justify-content: center;
}

.legend-box {
  color: white;
  padding: 6px 10px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 2px;
  text-align: center;
  white-space: nowrap;
}

@keyframes seat-bloom {
  0% {
    opacity: 0;
    transform: scale(0.15) translateY(10px);
  }
  68% {
    opacity: 1;
    transform: scale(1.08) translateY(-1px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes chart-chrome-fade {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

@keyframes center-fade-up {
  0% {
    opacity: 0;
    transform: translate(500px, 492px);
  }
  100% {
    opacity: 1;
    transform: translate(500px, 480px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .seat-dot,
  .chart-guide-arc,
  .chart-active-arc,
  .chart-base-line,
  .center-text,
  .total-number,
  .chart-title,
  .chart-subtitle {
    animation: none;
    transition: none;
    transform: none;
  }
}
</style>
