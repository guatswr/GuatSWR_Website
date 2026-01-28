<script setup>
import { ref, onMounted, computed } from 'vue'
import axios from 'axios'
import { getThumbUrl } from '../../utils/image'
import ProgressiveImage from '../../components/ProgressiveImage.vue'

// 所有历史数据
const allHistoryEvents = ref([])
// 当前展示的数据量
const displayCount = ref(10)
const loading = ref(true)
const errorMsg = ref('')
// 灯箱状态
const lightboxOpen = ref(false)
const currentImage = ref('')

// 计算属性：只返回当前需要展示的数据，实现分批渲染
const visibleEvents = computed(() => {
  return allHistoryEvents.value.slice(0, displayCount.value)
})

// 是否还有更多数据
const hasMore = computed(() => {
  return displayCount.value < allHistoryEvents.value.length
})

const fetchHistory = async () => {
  try {
    const res = await axios.get('/api/history')
    allHistoryEvents.value = res.data
  } catch (error) {
    console.error("加载群史失败", error)
    errorMsg.value = '后端连接异常，请联系管理员Taropoi'
    allHistoryEvents.value = []
  } finally {
    loading.value = false
  }
}

// 加载更多函数
const loadMore = () => {
  displayCount.value += 10
}

// 打开灯箱查看大图
const openLightbox = (src) => {
  currentImage.value = src
  lightboxOpen.value = true
}

onMounted(() => {
  fetchHistory()
})
</script>

<template>
  <div class="min-h-screen bg-[#f8fafc] dark:bg-slate-950 py-16 font-sans">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      
      <!-- 页面标题 -->
      <div class="text-center mb-16">
        <h1 class="text-4xl md:text-5xl font-bold text-gray-800 dark:text-gray-100 font-serif mb-4 flex justify-center items-center gap-3">
          <span class="text-red-500">📜</span> 绯想天群史
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

      <!-- 时间轴容器 -->
      <div v-else class="relative">
        
        <!-- 中轴线 (桌面端居中，移动端靠左) -->
        <div class="absolute left-8 md:left-1/2 top-0 bottom-0 w-1 bg-gray-200 dark:bg-slate-800 transform md:-translate-x-1/2"></div>

        <div class="space-y-12">
          <!-- 循环事件 (只渲染 visibleEvents) -->
          <div v-for="(event, index) in visibleEvents" :key="event.id" 
               class="relative flex flex-col md:flex-row items-center md:justify-between group">
            
            <!-- 桌面端偶数项占位 (为了把内容挤到右边) -->
            <div :class="['hidden md:block w-5/12', index % 2 === 0 ? 'order-1' : 'order-3']"></div>

            <!-- 轴点 -->
            <div class="absolute left-8 md:left-1/2 transform -translate-x-1/2 w-8 h-8 bg-red-500 rounded-full border-4 border-white dark:border-slate-900 shadow-md z-10 flex items-center justify-center order-2">
              <div class="w-2 h-2 bg-white dark:bg-slate-200 rounded-full"></div>
            </div>

            <!-- 内容卡片 -->
            <div :class="[
              'w-[calc(100%-4rem)] ml-16 md:ml-0 md:w-5/12 bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 hover:shadow-lg transition-all duration-300 relative',
              index % 2 === 0 ? 'md:order-3 md:text-left' : 'md:order-1 md:text-right'
            ]">
              
              <span class="inline-block px-3 py-1 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-200 text-sm font-bold rounded-full mb-3 border border-red-100 dark:border-red-900/40">
                {{ event.date }}
              </span>
              
              <h3 class="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2 font-serif group-hover:text-red-600 transition">
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

              <p class="text-gray-600 dark:text-gray-300 leading-relaxed text-sm whitespace-pre-line">
                {{ event.description }}
              </p>
            </div>

          </div>
        </div>

        <!-- 加载更多 / 底部结语 -->
        <div class="text-center mt-16 relative z-10">
          <button 
            v-if="hasMore" 
            @click="loadMore"
            class="px-8 py-3 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 text-gray-600 dark:text-gray-200 rounded-full hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-red-500 transition shadow-sm font-medium"
          >
            加载更多历史 ({{ displayCount }} / {{ allHistoryEvents.length }}) ▼
          </button>
          <span v-else class="inline-block px-6 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-full text-gray-400 dark:text-gray-300 text-sm shadow-sm">
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
@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
</style>
