<script setup lang="ts">
/**
 * Seat distribution chart, ported from the archived `ParliamentChart.vue`.
 *
 * The archived design (semicircle, 8 rows, seat sizing, legend) is preserved.
 * Geometry comes from the pure `parliamentSeats` helper, so the SSR markup and
 * the hydrated DOM are identical, and an `aria-label` carries the same numbers
 * to assistive technology that the visual chart carries to everyone else.
 */
import { PARLIAMENT_CONFIG, parliamentSeats, parliamentTotal } from '~/utils/parliament'
import type { ParliamentGroup } from '~/utils/parliament'

const props = withDefaults(defineProps<{
  data: readonly ParliamentGroup[]
  title?: string
  subTitle?: string
}>(), {
  title: '成员分布',
  subTitle: '',
})

const config = PARLIAMENT_CONFIG
const seats = computed(() => parliamentSeats(props.data, config))
const totalCount = computed(() => parliamentTotal(props.data))
const description = computed(() => {
  const groups = props.data
    .filter(group => group.value > 0)
    .map(group => `${group.label} ${group.value}`)
    .join('，')
  return `${props.title}共 ${totalCount.value} 人${groups ? `：${groups}` : ''}`
})
</script>

<template>
  <div class="parliament-chart-container">
    <svg
      :viewBox="`0 0 ${config.width} ${config.height}`"
      class="chart-svg"
      role="img"
      :aria-label="description"
    >
      <title>{{ description }}</title>
      <g class="seats">
        <circle
          v-for="(dot, index) in seats"
          :key="index"
          :cx="dot.x"
          :cy="dot.y"
          :r="dot.r"
          :fill="dot.color"
          class="seat-dot"
        >
          <title>{{ dot.label }}</title>
        </circle>
      </g>
      <g
        class="center-text"
        :transform="`translate(${config.centerX}, ${config.centerY})`"
      >
        <text x="0" y="-50" text-anchor="middle" class="total-number">
          {{ totalCount }}
        </text>
        <text x="0" y="0" text-anchor="middle" class="chart-title">
          {{ title }}
        </text>
        <text
          v-if="subTitle"
          x="0"
          y="30"
          text-anchor="middle"
          class="chart-subtitle"
        >
          {{ subTitle }}
        </text>
      </g>
    </svg>

    <div class="legend-container">
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
  max-width: 900px;
  margin: 0 auto;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial,
    sans-serif;
}

.chart-svg {
  width: 100%;
  height: auto;
  filter: drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.05));
}

.seat-dot {
  transition: r 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  cursor: pointer;
}

.seat-dot:hover {
  filter: brightness(1.1);
  r: 18px;
  z-index: 10;
}

.total-number {
  font-size: 100px;
  font-weight: 900;
  fill: #111;
  letter-spacing: -3px;
}

:global(.dark .total-number) {
  fill: #fff;
}

.chart-title {
  font-size: 42px;
  font-weight: 800;
  fill: #333;
  letter-spacing: 2px;
}

:global(.dark .chart-title) {
  fill: #ddd;
}

.chart-subtitle {
  font-size: 18px;
  fill: #888;
  font-weight: 500;
  letter-spacing: 1px;
}

:global(.dark .chart-subtitle) {
  fill: #999;
}

.legend-container {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 20px;
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
  padding: 8px 0;
  width: 64px;
  font-size: 14px;
  font-weight: bold;
  border-radius: 4px;
  text-align: center;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s;
  white-space: nowrap;
}

.legend-box:hover {
  transform: translateY(-2px);
}

@media (max-width: 640px) {
  .legend-container {
    gap: 6px;
    padding: 0 10px;
  }

  .legend-item {
    flex: 0 0 calc(25% - 5px);
    min-width: 0;
  }

  .legend-box {
    width: 100%;
    padding: 7px 0;
    font-size: clamp(11px, 3vw, 14px);
    border-radius: 3px;
  }
}

@media (max-width: 360px) {
  .legend-item {
    flex: 0 0 calc(33.33% - 4px);
  }
}
</style>
