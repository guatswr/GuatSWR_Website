<script setup>
import { ref, onMounted, onBeforeUnmount, computed, nextTick } from 'vue'
import axios from 'axios'
import { getThumbUrl } from '../../utils/image'
import ProgressiveImage from '../../components/ProgressiveImage.vue'

// 所有历史数据
const allHistoryEvents = ref([])
const loading = ref(true)
const errorMsg = ref('')
// 灯箱状态
const lightboxOpen = ref(false)
const currentImage = ref('')
const currentMonth = ref('')
let monthObserver = null


const fetchHistory = async () => {
  try {
    const res = await axios.get('/api/history')
    allHistoryEvents.value = res.data
    currentMonth.value = getMonthKey(allHistoryEvents.value?.[0]?.date) || ''
    await nextTick()
    initMonthObserver()
    updateCurrentMonthFromViewport()
  } catch (error) {
    console.error("加载群史失败", error)
    errorMsg.value = '后端连接异常，请联系管理员Taropoi'
    allHistoryEvents.value = []
  } finally {
    loading.value = false
  }
}


// 打开灯箱查看大图
const openLightbox = (src) => {
  currentImage.value = src
  lightboxOpen.value = true
}

const getMonthKey = (dateStr) => {
  if (!dateStr || typeof dateStr !== 'string') return ''
  const m = dateStr.match(/(\d{4})[\-/年\.](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`
  const parts = dateStr.split(/\s|\//)
  return parts?.[0] || ''
}

const monthItems = computed(() => {
  const map = new Map()
  allHistoryEvents.value.forEach((evt, idx) => {
    const key = getMonthKey(evt?.date)
    if (!key || map.has(key)) return
    map.set(key, idx)
  })
  return Array.from(map.entries()).map(([month, index]) => ({ month, index }))
})

const monthRailStyle = computed(() => {
  const count = monthItems.value.length
  if (!count) return { height: '0px' }
  const dotSize = 14
  const gap = 8
  const padding = 24
  const height = count * dotSize + (count - 1) * gap + padding
  return { height: `${Math.max(height, 96)}px` }
})

const scrollToMonth = (index) => {
  const el = document.querySelector(`[data-history-index="${index}"]`)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const key = getMonthKey(allHistoryEvents.value[index]?.date)
  if (key) currentMonth.value = key
}

const initMonthObserver = () => {
  if (monthObserver) monthObserver.disconnect()
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return
  const options = { rootMargin: '-35% 0px -55% 0px', threshold: [0, 0.1] }
  monthObserver = new IntersectionObserver((entries) => {
    const visible = entries
      .filter(e => e.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
    if (visible[0]) {
      const idx = Number(visible[0].target.dataset.historyIndex)
      const key = getMonthKey(allHistoryEvents.value[idx]?.date)
      if (key) currentMonth.value = key
    }
  }, options)
  const elements = Array.from(document.querySelectorAll('[data-history-index]'))
  elements.forEach((el) => monthObserver.observe(el))
}

let scrollTicking = false
const updateCurrentMonthFromViewport = () => {
  if (typeof window === 'undefined') return
  const elements = Array.from(document.querySelectorAll('[data-history-index]'))
  if (!elements.length) return
  const anchor = window.innerHeight * 0.35
  let bestEl = null
  let bestDist = Infinity
  elements.forEach((el) => {
    const rect = el.getBoundingClientRect()
    const dist = Math.abs(rect.top - anchor)
    if (dist < bestDist) {
      bestDist = dist
      bestEl = el
    }
  })
  if (bestEl) {
    const idx = Number(bestEl.dataset.historyIndex)
    const key = getMonthKey(allHistoryEvents.value[idx]?.date)
    if (key) currentMonth.value = key
  }
}

const handleScroll = () => {
  if (scrollTicking) return
  scrollTicking = true
  requestAnimationFrame(() => {
    updateCurrentMonthFromViewport()
    scrollTicking = false
  })
}

const handleResize = () => {
  initMonthObserver()
  handleScroll()
}

onMounted(() => {
  fetchHistory()
  if (typeof window !== 'undefined') {
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleResize)
  }
})

onBeforeUnmount(() => {
  if (monthObserver) monthObserver.disconnect()
  if (typeof window !== 'undefined') {
    window.removeEventListener('scroll', handleScroll)
    window.removeEventListener('resize', handleResize)
  }
})
</script>

<template>
  <div class="min-h-screen bg-[#f8fafc] dark:bg-slate-950 py-16 font-sans relative overflow-hidden history-bg">
    <!-- 背景装饰层 -->
    <div class="absolute inset-0 pointer-events-none">
      <div class="absolute -top-24 -left-20 w-72 h-72 bg-red-200/50 dark:bg-red-500/20 rounded-full blur-3xl"></div>
      <div class="absolute top-1/3 -right-24 w-96 h-96 bg-amber-200/40 dark:bg-amber-500/15 rounded-full blur-3xl"></div>
      <div class="absolute bottom-0 left-1/3 w-80 h-80 bg-rose-200/40 dark:bg-rose-500/15 rounded-full blur-3xl"></div>
      <div class="absolute top-20 left-1/2 w-2 h-2 rounded-full bg-red-300/60 dark:bg-red-400/40 shadow-[0_0_20px_rgba(239,68,68,0.5)]"></div>
      <div class="absolute top-64 left-24 w-1.5 h-1.5 rounded-full bg-amber-300/70 dark:bg-amber-400/40 shadow-[0_0_16px_rgba(251,191,36,0.5)]"></div>
      <div class="absolute bottom-40 right-32 w-2.5 h-2.5 rounded-full bg-rose-300/70 dark:bg-rose-400/40 shadow-[0_0_18px_rgba(251,113,133,0.5)]"></div>
    </div>
    <div class="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      
      <!-- 页面标题 -->
      <div class="text-center mb-16">
        <h1 class="text-4xl md:text-5xl font-bold text-gray-800 dark:text-gray-100 font-serif mb-4 flex justify-center items-center gap-3">
          绯想天群史
        </h1>
        <p class="text-gray-500 dark:text-gray-400 italic max-w-2xl mx-auto">
          记录我们一路走来的点点滴滴。从最初的几人小群，到如今的幻想乡大家庭。
        </p>
        <div class="w-24 h-1 bg-red-400 mx-auto mt-6 rounded-full"></div>
      </div>

      <div v-if="loading" class="text-center py-20 text-gray-400 dark:text-gray-300">
        <div class="animate-spin text-3xl mb-2">⏳</div>
        <p>正在回溯时间...</p>
      </div>
      <div v-else-if="errorMsg" class="text-center py-20 text-red-500">
        <p class="font-bold">{{ errorMsg }}</p>
      </div>

      <div v-else class="relative">
        
        <!-- 中轴线 (桌面端居中，移动端靠左) -->
        <div class="absolute left-8 md:left-1/2 top-0 bottom-0 w-1 bg-gray-200 dark:bg-slate-800 transform md:-translate-x-1/2"></div>

         <div class="space-y-12">
          <!-- 循环事件 (一次性渲染全部) -->
          <div v-for="(event, index) in allHistoryEvents" :key="event.id" 
           :data-history-index="index"
           class="relative flex flex-col md:flex-row items-center md:justify-between group">
            
            <!-- 桌面端偶数项占位 (为了把内容挤到右边) -->
            <div :class="['hidden md:block w-5/12', index % 2 === 0 ? 'order-1' : 'order-3']"></div>
            <!-- 轴点 -->
            <div class="absolute left-8 md:left-1/2 transform -translate-x-1/2 w-8 h-8 bg-red-500 rounded-full border-4 border-white dark:border-slate-900 shadow-md z-10 flex items-center justify-center order-2">
              <div class="w-2 h-2 bg-white dark:bg-slate-200 rounded-full"></div>
            </div>

            <!-- 内容卡片 -->
            <div :class="[
              'w-[calc(100%-4rem)] ml-16 md:ml-0 md:w-5/12 bg-white/95 dark:bg-slate-900/90 backdrop-blur-md p-8 md:p-10 rounded-2xl shadow-md hover:shadow-xl border border-gray-100/80 dark:border-slate-800/80 transition-all duration-300 relative',
              index % 2 === 0 ? 'md:order-3 md:text-left' : 'md:order-1 md:text-right'
            ]">
              
              <div class="flex items-center gap-3 mb-4" :class="index % 2 === 0 ? '' : 'md:justify-end'">
                <span class="inline-flex items-center gap-1 px-3 py-1 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-200 text-xs font-bold rounded-full border border-red-100/70 dark:border-red-900/40 shadow-sm">
                  <span class="text-[10px]">🗓️</span> {{ event.date }}
                </span>
              </div>
              
              <h3 class="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-3 font-serif tracking-wide group-hover:text-red-600 transition">
                {{ event.title }}
              </h3>
              
              <!-- 图片优化：使用 h-auto 和 max-h 限制，显示完整内容 -->
              <div v-if="event.image" class="mb-4 overflow-hidden rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700">
                  <ProgressiveImage
                    :src="event.image"
                    :thumb="getThumbUrl(event.image)"
                    alt="History Image"
                    wrapperClass="w-full"
                    imgClass="w-full h-auto max-h-[400px] object-contain mx-auto cursor-zoom-in hover:opacity-90 transition"
                    @click="openLightbox(event.image)"
                  />
              </div>

              <div class="mt-4 rounded-xl bg-gradient-to-br from-white via-white to-red-50/70 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 border border-red-100/80 dark:border-red-400/30 shadow-md shadow-red-100/50 dark:shadow-red-900/30 ring-1 ring-red-200/60 dark:ring-red-400/30 p-4 md:p-5 relative overflow-hidden text-left">
                <div class="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-red-200/30 dark:bg-red-500/20 blur-2xl"></div>
                <div class="absolute -bottom-10 -left-10 w-28 h-28 rounded-full bg-red-100/40 dark:bg-red-600/20 blur-2xl"></div>
                <div
                  class="relative text-gray-700 dark:text-gray-200 leading-7 md:leading-8 text-[15px] md:text-base whitespace-pre-line break-words"
                  v-html="event.description"
                ></div>
              </div>
            </div>

          </div>
        </div>

        <!-- 右侧月份滚动条 -->
        <div v-if="monthItems.length > 0" class="hidden lg:flex flex-col items-center gap-3 fixed right-6 top-1/2 -translate-y-1/2 z-30">
          <div
            class="w-10 rounded-full bg-white/70 dark:bg-slate-900/70 border border-gray-200/70 dark:border-slate-700/70 backdrop-blur-md shadow-lg flex flex-col items-center justify-center py-3 relative"
            :style="monthRailStyle"
          >
            <div class="absolute inset-3 rounded-full border border-dashed border-gray-200/60 dark:border-slate-700/60"></div>
            <div class="flex flex-col gap-2 relative z-10">
              <button
                v-for="item in monthItems"
                :key="item.month"
                @click="scrollToMonth(item.index)"
                class="w-3.5 h-3.5 rounded-full border transition"
                :class="currentMonth === item.month ? 'bg-red-500 border-red-400 scale-110 shadow-[0_0_10px_rgba(239,68,68,0.6)]' : 'bg-gray-300/70 dark:bg-slate-700 border-gray-300/70 dark:border-slate-600 hover:bg-red-300'"
                :title="item.month"
              ></button>
            </div>
          </div>
          <div class="px-3 py-1.5 text-xs rounded-full bg-white/80 dark:bg-slate-900/80 border border-gray-200/70 dark:border-slate-700/70 text-gray-500 dark:text-gray-300 shadow-sm backdrop-blur-md">
            {{ currentMonth || '月份' }}
          </div>
        </div>

        <!-- 底部结语 -->
        <div class="text-center mt-16 relative z-10">
          <span class="inline-block px-6 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-full text-gray-400 dark:text-gray-300 text-sm shadow-sm">
            Next Dream...
          </span>
        </div>

      </div>
    </div>

    <!-- 简单的灯箱 (Lightbox) -->
    <div v-if="lightboxOpen" class="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm" @click="lightboxOpen = false">
      <img :src="currentImage" class="max-w-full max-h-full rounded shadow-2xl scale-100 animate-[fadeIn_0.2s_ease-out]" @click.stop>
      <button class="absolute top-4 right-4 text-white text-4xl hover:text-red-400 transition">&times;</button>
    </div>
  </div>
</template>

<style>
.history-bg::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    radial-gradient(circle at 20% 10%, rgba(239, 68, 68, 0.10), transparent 45%),
    radial-gradient(circle at 80% 20%, rgba(251, 191, 36, 0.10), transparent 50%),
    radial-gradient(circle at 30% 80%, rgba(244, 63, 94, 0.10), transparent 50%);
  opacity: 0.8;
}

.history-bg::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(180deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.0) 40%),
    radial-gradient(rgba(148, 163, 184, 0.25) 1px, transparent 1px);
  background-size: auto, 18px 18px;
  opacity: 0.35;
}

.dark .history-bg::after {
  background-image:
    linear-gradient(180deg, rgba(2, 6, 23, 0.7) 0%, rgba(2, 6, 23, 0) 40%),
    radial-gradient(rgba(51, 65, 85, 0.35) 1px, transparent 1px);
  opacity: 0.25;
}

@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
</style>
