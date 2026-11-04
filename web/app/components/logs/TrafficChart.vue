<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { buildPoints, buildSmoothPath, formatNumber } from '~/utils/logs'
import type { LogChartDatum, LogChartUnit } from '~/utils/logs'
import { TRAFFIC_PLOT as plot, trafficDate, trafficIndex, trafficScale, trafficTicks } from '~/utils/traffic-chart'

const props = defineProps<{
  data: readonly LogChartDatum[]
  unit: LogChartUnit
  interval: string
  range: string
  timezone: string
  referenceTime: number
  loading?: boolean
}>()
const emit = defineEmits<{ interval: [value: string] }>()
const id = useId()
const root = ref<HTMLElement | null>(null)
const metric = ref<'all' | 'pv' | 'uv'>('all')
const active = ref<number | null>(null)
const pinned = ref(false)
const dragging = ref(false)
const keyboard = ref(false)
const unitName = computed(() => ({ hour: '小时', day: '天', month: '月', year: '年' })[props.unit])
const available = computed(() => ['24h', '7d', '30d'].includes(props.range) ? ['hour', 'day'] : ['day', 'month'])
const scale = computed(() => trafficScale(Math.max(0, ...props.data.map(point => metric.value === 'pv' ? point.pageviews : metric.value === 'uv' ? point.visitors : Math.max(point.pageviews, point.visitors)))))
const pv = computed(() => buildPoints(props.data.map(point => point.pageviews), scale.value.max, plot))
const uv = computed(() => buildPoints(props.data.map(point => point.visitors), scale.value.max, plot))
const pvPath = computed(() => buildSmoothPath(pv.value))
const uvPath = computed(() => buildSmoothPath(uv.value))
const baseline = plot.height - plot.padding
const area = (path: string, points: typeof pv.value) => points.length ? `${path} L ${points.at(-1)!.x} ${baseline} L ${points[0]!.x} ${baseline} Z` : ''
const selected = computed(() => active.value === null ? null : props.data[active.value] ?? null)
const markerIndex = computed(() => active.value ?? (props.data.length === 1 ? 0 : null))
const selectedX = computed(() => markerIndex.value === null ? 0 : pv.value[markerIndex.value]?.x ?? 0)
const markerStyle = (y: number | undefined) => ({ left: `${selectedX.value / plot.width * 100}%`, top: `${(y ?? 0) / plot.height * 100}%` })
const tooltipStyle = computed(() => ({ left: `clamp(0px, calc(${selectedX.value / plot.width * 100}% - 100px), calc(100% - 200px))` }))
const tickIndices = computed(() => trafficTicks(props.data.length))
const partial = computed(() => {
  if (active.value !== props.data.length - 1 || !props.referenceTime) return false
  const iso = new Date(props.referenceTime + (props.timezone === 'Asia/Shanghai' ? 8 * 3600000 : 0)).toISOString()
  return String(selected.value?.date) === iso.slice(0, props.unit === 'hour' ? 13 : props.unit === 'day' ? 10 : props.unit === 'month' ? 7 : 4)
})
const hasVisits = computed(() => props.data.some(point => point.pageviews > 0 || point.visitors > 0))
let frame: number | undefined
let pendingIndex = 0
const select = (index: number) => { active.value = Math.max(0, Math.min(props.data.length - 1, index)) }
const reset = () => {
  if (frame !== undefined) cancelAnimationFrame(frame)
  frame = undefined
  active.value = null
  pinned.value = false
  dragging.value = false
}
const indexAt = (event: PointerEvent) => {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  return trafficIndex((event.clientX - rect.left) / (rect.width || 1), props.data.length)
}
const move = (event: PointerEvent) => {
  if ((pinned.value && !dragging.value) || (!dragging.value && event.pointerType !== 'mouse')) return
  keyboard.value = false
  pendingIndex = indexAt(event)
  if (frame !== undefined) return
  frame = requestAnimationFrame(() => { frame = undefined; select(pendingIndex) })
}
const press = (event: PointerEvent) => {
  if (!event.isPrimary || event.button !== 0) return
  if (frame !== undefined) cancelAnimationFrame(frame)
  frame = undefined
  keyboard.value = false
  select(indexAt(event))
  pinned.value = event.pointerType === 'mouse' ? !pinned.value : true
  dragging.value = event.pointerType !== 'mouse'
  if (dragging.value) (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
const leave = (event: PointerEvent) => { if (event.pointerType === 'mouse' && !pinned.value && !keyboard.value) reset() }
const focusPlot = (event: FocusEvent) => {
  if ((event.currentTarget as HTMLElement).matches(':focus-visible')) {
    keyboard.value = true
    if (active.value === null) select(props.data.length - 1)
  }
}
const navigate = (event: KeyboardEvent) => {
  if (frame !== undefined) cancelAnimationFrame(frame)
  frame = undefined
  keyboard.value = true
  const current = active.value ?? props.data.length - 1
  if (event.key === 'Escape') { event.preventDefault(); reset(); return }
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter', ' '].includes(event.key)) return
  event.preventDefault()
  if (event.key === 'Enter' || event.key === ' ') { pinned.value = !pinned.value; return }
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? props.data.length - 1 : current + (['ArrowLeft', 'ArrowDown'].includes(event.key) ? -1 : 1)
  select(next)
}
const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.value?.contains(event.target)) reset() }
watch(() => [props.data, metric.value], reset)
onMounted(() => document.addEventListener('pointerdown', outside, { passive: true }))
onBeforeUnmount(() => { document.removeEventListener('pointerdown', outside); if (frame !== undefined) cancelAnimationFrame(frame) })
</script>

<template>
  <section ref="root" class="traffic-chart" aria-label="访问趋势" :aria-busy="loading || undefined" data-testid="traffic-chart">
    <div class="traffic-toolbar">
      <div>
        <p class="traffic-eyebrow">TRAFFIC OVER TIME</p>
        <h3>访问趋势</h3>
        <p class="traffic-caption">{{ timezone === 'Asia/Shanghai' ? '北京时间' : 'UTC' }} · 按{{ unitName }}统计 · {{ data.length }} 个时段</p>
      </div>
      <label class="traffic-interval">
        <span>时间粒度</span>
        <select aria-label="趋势时间粒度" :value="interval" @change="emit('interval', ($event.target as HTMLSelectElement).value)">
          <option value="auto">自动</option>
          <option v-for="value in available" :key="value" :value="value">按{{ value === 'hour' ? '小时' : value === 'day' ? '天' : '月' }}</option>
        </select>
      </label>
    </div>

    <div class="traffic-readout" :aria-live="keyboard ? 'polite' : 'off'" aria-atomic="true">
      <div class="traffic-period">
        <span v-if="selected">{{ trafficDate(selected.date, unit, true) }}</span>
        <span v-else>选择一个时段查看数据</span>
        <span v-if="selected && partial" class="traffic-live">统计中</span>
        <button v-if="pinned" type="button" class="traffic-unpin" aria-label="取消固定读数" title="取消固定读数" @click="reset">×</button>
      </div>
      <div class="traffic-legend" role="group" aria-label="趋势指标">
        <button type="button" class="traffic-series traffic-series--all" :aria-pressed="metric === 'all'" @click="metric = 'all'">全部</button>
        <button type="button" class="traffic-series traffic-series--pv" :aria-pressed="metric === 'pv'" @click="metric = 'pv'">
          <i aria-hidden="true" />浏览量 <b>{{ selected ? selected.pageviews.toLocaleString('zh-CN') : 'PV' }}</b>
        </button>
        <button type="button" class="traffic-series traffic-series--uv" :aria-pressed="metric === 'uv'" @click="metric = 'uv'">
          <i aria-hidden="true" />访客数 <b>{{ selected ? selected.visitors.toLocaleString('zh-CN') : 'UV' }}</b>
        </button>
      </div>
    </div>

    <div v-if="!data.length" class="traffic-empty">当前时间范围暂无趋势数据</div>
    <div v-else class="traffic-frame" :class="{ 'is-loading': loading }">
      <div class="traffic-y-axis" aria-hidden="true">
        <span v-for="tick in scale.ticks" :key="tick" :style="{ top: `${(plot.padding + (1 - tick / scale.max) * (plot.height - 2 * plot.padding)) / plot.height * 100}%` }">{{ formatNumber(tick) }}</span>
      </div>
      <div
        class="traffic-plot" role="slider" tabindex="0" aria-label="浏览流量时间点"
        :aria-valuemin="1" :aria-valuemax="data.length" :aria-valuenow="(active ?? data.length - 1) + 1"
        :aria-valuetext="selected ? `${trafficDate(selected.date, unit, true)}，浏览量 ${selected.pageviews}，访客数 ${selected.visitors}` : '使用左右方向键查看时间点'"
        :aria-describedby="`${id}-help`" data-testid="traffic-plot"
        @pointermove="move" @pointerdown="press" @pointerleave="leave" @pointerup="dragging = false"
        @pointercancel="reset" @keydown="navigate" @focus="focusPlot"
        @blur="keyboard = false; !pinned && reset()">
        <svg :viewBox="`0 0 ${plot.width} ${plot.height}`" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient :id="`${id}-pv`" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--chart-pv)" stop-opacity=".16" /><stop offset="100%" stop-color="var(--chart-pv)" stop-opacity=".015" /></linearGradient>
            <linearGradient :id="`${id}-uv`" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--chart-uv)" stop-opacity=".16" /><stop offset="100%" stop-color="var(--chart-uv)" stop-opacity=".015" /></linearGradient>
          </defs>
          <g class="traffic-grid">
            <line v-for="tick in scale.ticks" :key="tick" :x1="plot.padding" :x2="plot.width - plot.padding" :y1="plot.padding + (1 - tick / scale.max) * (plot.height - 2 * plot.padding)" :y2="plot.padding + (1 - tick / scale.max) * (plot.height - 2 * plot.padding)" />
          </g>
          <g v-if="metric !== 'uv'" class="traffic-pv">
            <path :d="area(pvPath, pv)" :fill="`url(#${id}-pv)`" />
            <path :d="pvPath" class="traffic-line" data-testid="traffic-pv-line" />
          </g>
          <g v-if="metric !== 'pv'" class="traffic-uv">
            <path v-if="metric === 'uv'" :d="area(uvPath, uv)" :fill="`url(#${id}-uv)`" />
            <path :d="uvPath" class="traffic-line traffic-line--uv" />
          </g>
          <g v-if="selected && active !== null" class="traffic-selection">
            <line :x1="selectedX" :x2="selectedX" :y1="plot.padding" :y2="baseline" />
          </g>
        </svg>
        <template v-if="markerIndex !== null">
          <span v-if="metric !== 'uv'" class="traffic-dot traffic-pv" :style="markerStyle(pv[markerIndex]?.y)" />
          <span v-if="metric !== 'pv'" class="traffic-dot traffic-uv" :style="markerStyle(uv[markerIndex]?.y)" />
        </template>
        <div v-if="!hasVisits" class="traffic-zero">这个时段还没有访问记录</div>
        <div v-if="selected" class="traffic-tooltip" :style="tooltipStyle" data-testid="traffic-tooltip" aria-hidden="true">
          <strong>{{ trafficDate(selected.date, unit, true) }}</strong>
          <div><span class="traffic-pv">浏览量 PV</span><b>{{ selected.pageviews.toLocaleString('zh-CN') }}</b></div>
          <div><span class="traffic-uv">访客数 UV</span><b>{{ selected.visitors.toLocaleString('zh-CN') }}</b></div>
          <small v-if="partial">当前时段仍在统计</small>
        </div>
      </div>
      <div class="traffic-x-axis" aria-hidden="true"><span v-for="index in tickIndices" :key="index" :style="{ left: `${pv[index]!.x / plot.width * 100}%` }">{{ trafficDate(data[index]!.date, unit) }}</span></div>
    </div>

    <div class="traffic-footnote">
      <p :id="`${id}-help`"><span class="traffic-help-mouse">悬停查看 · 点击固定 · 方向键逐点浏览</span><span class="traffic-help-touch">点按查看 · 横向滑动切换时段</span></p>
      <span>首尾时段可能未满 · UV 按时段去重</span>
    </div>
    <details v-if="data.length" class="traffic-table">
      <summary>查看数据表 <span>{{ data.length }} 个时段</span></summary>
      <div class="traffic-table-scroll" tabindex="0" role="region" aria-label="流量明细表">
        <table v-memo="[data, unit]"><thead><tr><th>时间</th><th>浏览量 PV</th><th>访客数 UV</th></tr></thead><tbody><tr v-for="row in data" :key="row.date"><td>{{ trafficDate(row.date, unit, true) }}</td><td>{{ row.pageviews }}</td><td>{{ row.visitors }}</td></tr></tbody></table>
      </div>
    </details>
  </section>
</template>

<style scoped>
.traffic-chart { --chart-pv: #0284c7; --chart-uv: #0f766e; --chart-ink: #263749; --chart-muted: #64748b; --chart-line: #e2e8f0; --chart-paper: #fff; color: var(--chart-ink); padding: clamp(1rem, 3vw, 1.75rem); background: var(--chart-paper); border: 1px solid var(--chart-line); border-radius: 12px; margin-bottom: 1.5rem; }
:global(.dark .traffic-chart) { --chart-pv: #7dd3fc; --chart-uv: #5eead4; --chart-ink: #e2e8f0; --chart-muted: #94a3b8; --chart-line: #334155; --chart-paper: #15212d; }
.traffic-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
.traffic-eyebrow { color: var(--chart-muted); font-size: .625rem; letter-spacing: .14em; }
.traffic-toolbar h3 { margin-top: .3rem; font-size: 1.125rem; font-weight: 650; }
.traffic-caption { margin-top: .4rem; font-size: .6875rem; color: var(--chart-muted); }
.traffic-interval { display: flex; align-items: center; gap: .5rem; font-size: .75rem; color: var(--chart-muted); }
.traffic-interval select { min-height: 2.75rem; padding: .4rem .65rem; color: var(--chart-ink); background: var(--chart-paper); border: 1px solid var(--chart-line); border-radius: 6px; }
.traffic-readout { display: flex; min-height: 4.5rem; align-items: center; justify-content: space-between; gap: .75rem; border-bottom: 1px solid var(--chart-line); margin-top: 1rem; margin-bottom: 1.25rem; }
.traffic-period { position: relative; display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; min-height: 2.75rem; padding-right: 2.5rem; font-size: .75rem; font-variant-numeric: tabular-nums; }
.traffic-live { color: var(--chart-muted); font-size: .625rem; border: 1px solid var(--chart-line); border-radius: 3px; padding: 1px 4px; }
.traffic-unpin { position: absolute; top: 0; right: 0; width: 2.5rem; font-size: 1.125rem; color: var(--chart-pv); min-height: 2.75rem; }
.traffic-legend { display: flex; align-items: center; gap: .25rem; flex-shrink: 0; }
.traffic-series { display: flex; align-items: center; gap: .4rem; min-height: 2.75rem; padding: .4rem .6rem; font-size: .75rem; border-radius: 6px; }
.traffic-series[aria-pressed='true'] { opacity: 1; background: color-mix(in srgb, currentColor 6%, transparent); }
.traffic-series--pv, .traffic-pv { color: var(--chart-pv); }
.traffic-series--uv, .traffic-uv { color: var(--chart-uv); }
.traffic-series i { width: 1rem; border-top: 2px solid currentColor; }
.traffic-series--uv i { border-top-style: dashed; }
.traffic-series b { min-width: 1.5rem; font-variant-numeric: tabular-nums; text-align: right; }
.traffic-frame { position: relative; padding-left: 2.5rem; }
.traffic-frame.is-loading { opacity: .55; }
.traffic-y-axis { position: absolute; left: 0; top: 0; width: 2rem; height: 260px; color: var(--chart-muted); font-size: .6875rem; font-variant-numeric: tabular-nums; }
.traffic-y-axis span { position: absolute; right: 0; transform: translateY(-50%); }
.traffic-plot { position: relative; height: 260px; touch-action: pan-y; cursor: crosshair; outline-offset: 5px; border-radius: 4px; }
.traffic-plot:focus-visible, .traffic-chart button:focus-visible, .traffic-table summary:focus-visible { outline: 2px solid var(--chart-pv); outline-offset: 3px; }
.traffic-plot svg { display: block; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.traffic-grid line { stroke: var(--chart-line); stroke-dasharray: 3 5; vector-effect: non-scaling-stroke; }
.traffic-line { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
.traffic-line--uv { stroke-dasharray: 4 4; }
.traffic-selection line { stroke: var(--chart-muted); stroke-dasharray: 3 3; vector-effect: non-scaling-stroke; }
.traffic-dot { position: absolute; width: 9px; height: 9px; border-radius: 50%; background: currentColor; border: 2px solid var(--chart-paper); transform: translate(-50%, -50%); pointer-events: none; }
.traffic-tooltip { position: absolute; top: .25rem; width: min(200px, 100%); padding: .75rem; border: 1px solid var(--chart-line); border-radius: 8px; background: var(--chart-paper); box-shadow: 0 6px 20px rgb(15 23 42 / .1); pointer-events: none; font-size: .75rem; }
.traffic-tooltip strong { display: block; margin-bottom: .6rem; font-size: .6875rem; font-weight: 500; color: var(--chart-muted); }
.traffic-tooltip div { display: flex; justify-content: space-between; gap: 1rem; line-height: 1.9; font-variant-numeric: tabular-nums; }
.traffic-tooltip small { display: block; margin-top: .4rem; color: var(--chart-muted); font-size: .625rem; }
.traffic-x-axis { position: relative; height: 2.25rem; margin-top: .5rem; color: var(--chart-muted); font-size: .6875rem; font-variant-numeric: tabular-nums; }
.traffic-x-axis span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
.traffic-x-axis span:first-child { transform: none; }
.traffic-x-axis span:last-child { transform: translateX(-100%); }
.traffic-footnote { display: flex; justify-content: space-between; flex-wrap: wrap; gap: .4rem; color: var(--chart-muted); font-size: .6875rem; line-height: 1.8; }
.traffic-help-touch { display: none; }
.traffic-table { margin-top: 1rem; border-top: 1px solid var(--chart-line); color: var(--chart-muted); font-size: .75rem; }
.traffic-table summary { min-height: 2.75rem; padding-top: .8rem; cursor: pointer; }
.traffic-table summary span { float: right; font-size: .6875rem; }
.traffic-table-scroll { max-height: 18rem; overflow: auto; }
.traffic-table table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.traffic-table th, .traffic-table td { padding: .65rem .5rem; border-bottom: 1px solid var(--chart-line); text-align: right; white-space: nowrap; }
.traffic-table th:first-child, .traffic-table td:first-child { text-align: left; }
.traffic-table th { position: sticky; top: 0; background: var(--chart-paper); }
.traffic-zero, .traffic-empty { color: var(--chart-muted); font-size: .8125rem; text-align: center; }
.traffic-zero { position: absolute; top: 45%; inset-inline: 0; pointer-events: none; }
.traffic-empty { padding: 4rem 0; }
@media (max-width: 639px) {
  .traffic-interval > span { display: none; }
  .traffic-readout { flex-direction: column; align-items: stretch; justify-content: center; gap: .25rem; padding: .65rem 0; }
  .traffic-period { font-size: .6875rem; }
  .traffic-legend { justify-content: flex-start; }
  .traffic-series { padding-inline: .5rem; }
  .traffic-y-axis, .traffic-plot { height: 230px; }
  .traffic-x-axis span:nth-child(2), .traffic-x-axis span:nth-last-child(2) { display: none; }
  .traffic-tooltip { top: 0; font-size: .6875rem; }
}
@media (pointer: coarse) { .traffic-help-mouse { display: none; } .traffic-help-touch { display: inline; } }
</style>
