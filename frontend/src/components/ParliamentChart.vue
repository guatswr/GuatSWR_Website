<script setup>
import { computed, toRefs } from 'vue'

const props = defineProps({
  data: {
    type: Array, // 格式: [{ label: '桂航', value: 10, color: '#...' }, ...]
    required: true
  },
  title: {
    type: String,
    default: '成员分布'
  },
  subTitle: {
    type: String,
    default: ''
  }
})

const { data } = toRefs(props)

// 配置项 - 大幅增加尺寸以容纳文字和清晰的间距
const config = {
  width: 1000, // 宽度增加
  height: 520, // 高度增加
  centerX: 500, // 水平居中
  centerY: 480, // 圆心定位在底部，留出一点下边距
  radiusInner: 200, // [关键] 增大内圈半径，确保文字不被遮挡
  radiusOuter: 450, // [关键] 增大外圈半径，让扇形更舒展
  rows: 8 // 保持8排
}

// 核心算法：生成标准180度半圆席位
const seats = computed(() => {
  let dotList = []
  data.value.forEach((group) => {
    for (let i = 0; i < group.value; i++) {
      dotList.push({ color: group.color, label: group.label })
    }
  })

  const totalDots = dotList.length
  if (totalDots === 0) return []

  // 1. 计算每一排的半径
  const rowRadii = []
  // 计算行距
  const dr = (config.radiusOuter - config.radiusInner) / (config.rows - 1)
  for (let i = 0; i < config.rows; i++) {
    rowRadii.push(config.radiusInner + i * dr)
  }

  // 2. 按周长比例分配座位
  const rowLengths = rowRadii.map((r) => Math.PI * r)
  const totalLength = rowLengths.reduce((a, b) => a + b, 0)

  const counts = rowLengths.map((l) => (l / totalLength) * totalDots)
  const intCounts = counts.map((c) => Math.floor(c))

  // 补齐余数
  const remainders = counts.map((c, i) => ({ val: c - intCounts[i], idx: i }))
  let currentSum = intCounts.reduce((a, b) => a + b, 0)
  remainders.sort((a, b) => b.val - a.val)
  for (let i = 0; i < totalDots - currentSum; i++) {
    intCounts[remainders[i].idx]++
  }

  // 3. 生成坐标
  const generatedSeats = []

  // 动态计算点大小：
  // 找出最密集的行，计算其平均间隔
  let minArcPerDot = Infinity
  intCounts.forEach((count, i) => {
    if (count > 0) {
      // 该排弧长 / (数量-1) = 两个圆心之间的弧长距离
      // 如果 count=1，距离是无穷大，忽略
      if (count > 1) {
        const spacing = rowLengths[i] / (count - 1)
        if (spacing < minArcPerDot) minArcPerDot = spacing
      }
    }
  })

  // 如果 minArcPerDot 还是 Infinity (例如总共只有1个点)，给个默认值
  if (minArcPerDot === Infinity) minArcPerDot = 40

  // 限制点半径：
  // 1. 左右不重叠：直径 < 最小弧长间距
  // 2. 上下不重叠：直径 < 行距
  // 系数 0.85 留出 15% 的空隙
  const maxDiameter = Math.min(minArcPerDot, dr) * 0.85
  const dotRadius = Math.max(4, Math.min(16, maxDiameter / 2))

  intCounts.forEach((count, rowIndex) => {
    if (count === 0) return
    const radius = rowRadii[rowIndex]

    // 角度分布：严格 180 度 (PI 到 0)
    // 只有一行多于1个点时才铺开，否则居中
    if (count === 1) {
      generatedSeats.push({
        x: config.centerX + radius * Math.cos(Math.PI / 2),
        y: config.centerY - radius * Math.sin(Math.PI / 2),
        angle: Math.PI / 2,
        r: dotRadius
      })
    } else {
      // 180度均分
      // angle = PI - (i * (PI / (count - 1)))
      const angleStep = Math.PI / (count - 1)
      for (let i = 0; i < count; i++) {
        const angle = Math.PI - i * angleStep
        generatedSeats.push({
          x: config.centerX + radius * Math.cos(angle),
          y: config.centerY - radius * Math.sin(angle),
          angle: angle,
          r: dotRadius
        })
      }
    }
  })

  // 4. 排序与颜色填充 (从左到右)
  generatedSeats.sort((a, b) => b.angle - a.angle)

  return generatedSeats.map((seat, index) => ({
    ...seat,
    color: dotList[index]?.color || '#e5e7eb',
    label: dotList[index]?.label || ''
  }))
})

const totalCount = computed(() =>
  data.value.reduce((acc, cur) => acc + cur.value, 0)
)
</script>

<template>
  <div class="parliament-chart-container">
    <svg :viewBox="`0 0 ${config.width} ${config.height}`" class="chart-svg">
      <!-- 席位点 -->
      <g class="seats">
        <circle
          v-for="(dot, i) in seats"
          :key="i"
          :cx="dot.x"
          :cy="dot.y"
          :r="dot.r"
          :fill="dot.color"
          class="seat-dot"
        >
          <title>{{ dot.label }}</title>
        </circle>
      </g>

      <!-- 中心文字 -->
      <g
        class="center-text"
        :transform="`translate(${config.centerX}, ${config.centerY})`"
      >
        <!-- 数字稍微上移，避免贴底 -->
        <text x="0" y="-50" text-anchor="middle" class="total-number">
          {{ totalCount }}
        </text>
        <!-- 标题 -->
        <text x="0" y="0" text-anchor="middle" class="chart-title">
          {{ title }}
        </text>
        <!-- 日期/副标题 -->
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

    <!-- 底部图例 -->
    <div class="legend-container">
      <div
        v-for="item in data"
        :key="item.label"
        class="legend-item"
        v-show="item.value > 0"
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
  r: 18px; /* hover 放大效果 */
  z-index: 10;
}

.total-number {
  font-size: 100px;
  font-weight: 900;
  fill: #111;
  letter-spacing: -3px;
}
:global(.dark) .total-number {
  fill: #fff;
}

.chart-title {
  font-size: 42px;
  font-weight: 800;
  fill: #333;
  letter-spacing: 2px;
}
:global(.dark) .chart-title {
  fill: #ddd;
}

.chart-subtitle {
  font-size: 18px;
  fill: #888;
  font-weight: 500;
  letter-spacing: 1px;
}
:global(.dark) .chart-subtitle {
  fill: #999;
}

/* 图例容器 */
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

/* 图例项包裹层 */
.legend-item {
  /* 默认桌面端样式 */
  flex: 0 0 auto;
  display: flex;
  justify-content: center;
}

/* 图例色块 */
.legend-box {
  color: white;
  padding: 8px 0;
  width: 64px; /* 桌面端固定宽度 */
  font-size: 14px;
  font-weight: bold;
  border-radius: 4px; /* 微圆角，参考移动端截图 */
  text-align: center;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s;
  white-space: nowrap;
}

.legend-box:hover {
  transform: translateY(-2px);
}

/* 移动端响应式布局 */
@media (max-width: 640px) {
  .legend-container {
    gap: 6px; /* 间距缩小 */
    padding: 0 10px;
  }

  .legend-item {
    /* 动态计算宽度：
       (100% - 3 * gap) / 4 ≈ 23%
       让一行容纳 4 个标签，类似参考图的 Grid 布局效果
    */
    flex: 0 0 calc(25% - 5px);
    min-width: 0;
  }

  .legend-box {
    width: 100%; /* 填满父容器宽度，实现动态缩放 */
    padding: 7px 0;
    /* 动态字体大小：最小11px，最大14px，随视口缩放 */
    font-size: clamp(11px, 3vw, 14px);
    border-radius: 3px;
  }
}

/* 极小屏幕适配 (如 iPhone SE) */
@media (max-width: 360px) {
  .legend-item {
    /* 一行 3 个 */
    flex: 0 0 calc(33.33% - 4px);
  }
}
</style>
