<script setup>
import { ref, onMounted, computed } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import { useUserStore } from '../../stores/user'
import EventCard from './EventCard.vue'
import EventForm from './EventForm.vue'
import EventSignup from './EventSignup.vue'

const props = defineProps({
  type: {
    type: String,
    required: true
  },
  title: {
    type: String,
    default: ''
  },
  subtitle: {
    type: String,
    default: ''
  },
  enableSignup: {
    type: Boolean,
    default: false
  },
  allowCreateMode: {
    type: String,
    default: 'visitor'
  }
})

const store = useUserStore()
const isAdmin = computed(() => store.role === 'admin' || store.role === 'super_admin')

const loading = ref(false)
const items = ref([])
const formOpen = ref(false)
const signupOpen = ref(false)
const previewOpen = ref(false)
const selectedEvent = ref(null)
const previewLoading = ref(false)
const previewItems = ref([])

const loadEvents = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/event', { params: { type: props.type, limit: 50 } })
    items.value = res.data?.items || []
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message)
  } finally {
    loading.value = false
  }
}

const canCreate = computed(() => {
  if (props.allowCreateMode === 'none') return false
  if (props.allowCreateMode === 'admin') return isAdmin.value
  return props.allowCreateMode === 'visitor'
})

const formTypes = computed(() => [props.type])

onMounted(() => {
  loadEvents()
})

const openSignup = (event) => {
  selectedEvent.value = event
  signupOpen.value = true
}

const openPreview = async (event) => {
  selectedEvent.value = event
  previewOpen.value = true
  previewLoading.value = true
  previewItems.value = []
  try {
    const res = await axios.get(`/api/event/${event.id}/participants/public`)
    previewItems.value = res.data?.items || []
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message)
  } finally {
    previewLoading.value = false
  }
}
</script>

<template>
  <div class="space-y-8 relative">
    <!-- 顶部横幅：琪露诺(Cirno) 冰雪主题风格 -->
    <header class="event-banner relative overflow-hidden rounded-2xl p-8 md:p-10 text-white shadow-lg transition-all hover:shadow-xl dark:shadow-slate-950/60">
      <!-- 清新蓝白渐变背景 -->
      <div class="absolute inset-0 bg-gradient-to-br from-sky-400 via-blue-500 to-cyan-600 dark:from-sky-700 dark:via-blue-800 dark:to-cyan-900" />
      
      <!-- 冰晶装饰 (CSS模拟) -->
      <div class="absolute inset-0 ice-crystal-overlay opacity-20" />
      
      <!-- 飘雪动画 -->
      <div class="snow-container absolute inset-0 overflow-hidden pointer-events-none">
        <span class="snow s1"></span>
        <span class="snow s2"></span>
        <span class="snow s3"></span>
      </div>

      <!-- 内容区域 -->
      <div class="relative z-10 flex flex-col items-start border-l-4 border-white/40 pl-6">
        <h2 class="text-3xl md:text-4xl font-bold tracking-normal text-white drop-shadow-sm">
          {{ title }}
        </h2>
        <p class="mt-2 text-sm md:text-base text-blue-50 font-medium tracking-wide max-w-2xl leading-relaxed">
          {{ subtitle }}
        </p>
      </div>

      <!-- 装饰性几何图案 -->
      <div class="absolute -right-6 -bottom-10 opacity-10 transform -rotate-12 pointer-events-none text-white dark:opacity-20">
        <!-- 简单的雪花SVG -->
        <svg width="200" height="200" viewBox="0 0 24 24" fill="currentColor">
           <path d="M12,2L14.12,7.34L19.66,8.21L15.5,12L16.64,17.44L12,14.75L7.36,17.44L8.5,12L4.34,8.21L9.88,7.34L12,2Z" />
        </svg>
      </div>
    </header>

    <!-- 加载状态 -->
    <div v-if="loading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500 dark:border-sky-400"></div>
    </div>

    <!-- 内容列表 -->
    <div v-else class="grid gap-6 md:grid-cols-2 xl:grid-cols-3 items-start relative z-0">
      <EventCard
        v-for="event in items"
        :key="event.id"
        :event="event"
        :clickable="enableSignup"
        class="group transition-all duration-300 hover:-translate-y-1 hover:shadow-md border border-slate-100 hover:border-sky-200 bg-white dark:bg-slate-900/70 dark:border-slate-800 dark:hover:border-sky-700"
        @preview="() => openPreview(event)"
      >
        <template v-if="enableSignup" #actions>
          <div class="flex flex-wrap gap-2 items-center justify-between w-full mt-3 pt-3 border-t border-slate-50 dark:border-slate-800">
            <!-- 小彩蛋：Circle 9 -->
            <span class="text-xs text-slate-400 font-medium bg-slate-50 px-2 py-1 rounded dark:bg-slate-800 dark:text-slate-500">
              <span class="text-sky-400 mr-1">⑨</span>
              <span class="group-hover:text-sky-500 transition-colors">Event Card</span>
            </span>
            
            <button
              class="relative px-5 py-1.5 rounded-full text-sm font-medium transition-all duration-300"
              :class="['published', 'ongoing'].includes(event.status) ? 'bg-sky-50 text-sky-600 hover:bg-sky-500 hover:text-white dark:bg-sky-900/40 dark:text-sky-200 dark:hover:bg-sky-600' : 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500'"
              :disabled="!['published', 'ongoing'].includes(event.status)"
              @click.stop="openSignup(event)"
            >
              <span>{{ ['published', 'ongoing'].includes(event.status) ? '我要参加' : '已结束' }}</span>
            </button>
          </div>
        </template>
      </EventCard>

      <div v-if="!items.length" class="col-span-full py-12 text-center">
        <div class="text-sky-200 text-4xl mb-2 dark:text-sky-400">❄</div>
        <p class="text-slate-400 text-sm dark:text-slate-500">这里冷冷清清的，什么都没有发生呢...</p>
      </div>
    </div>

    <!-- 弹窗组件 -->
    <el-dialog v-model="formOpen" title="发布新活动" width="92vw" :style="{ maxWidth: '720px' }" destroy-on-close class="touhou-dialog">
      <EventForm
        :allowed-types="formTypes"
        :is-admin="isAdmin && allowCreateMode === 'admin'"
        :submit-label="isAdmin && allowCreateMode === 'admin' ? '发布活动' : '提交审核'"
        @submitted="() => { formOpen = false; loadEvents() }"
      />
    </el-dialog>

    <el-dialog v-model="signupOpen" title="活动报名" width="92vw" :style="{ maxWidth: '640px' }" destroy-on-close class="touhou-dialog">
      <EventSignup
        v-if="selectedEvent"
        :event-id="selectedEvent.id"
        :disabled="!['published', 'ongoing'].includes(selectedEvent.status)"
      />
    </el-dialog>

    <el-dialog v-model="previewOpen" title="参赛名单" width="92vw" :style="{ maxWidth: '640px' }" destroy-on-close class="touhou-dialog">
      <div v-if="previewLoading" class="text-sm text-slate-400 text-center py-4 dark:text-slate-500">正在读取...</div>
      <div v-else-if="!previewItems.length" class="text-sm text-slate-400 text-center py-4 dark:text-slate-500">暂无报名人员</div>
      <div v-else class="space-y-3 text-sm text-slate-700 max-h-[60vh] overflow-y-auto pr-2 dark:text-slate-200">
        <div class="flex items-center justify-between px-1 mb-2">
          <span class="text-xs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded dark:bg-sky-900/40 dark:text-sky-200">Total: {{ previewItems.length }}</span>
        </div>
        <div class="grid gap-3">
          <div v-for="item in previewItems" :key="item.id" class="flex items-center gap-3 rounded-lg border border-slate-100 bg-white p-3 hover:border-sky-200 transition-colors dark:bg-slate-900/60 dark:border-slate-800 dark:hover:border-sky-700">
            <div class="relative">
              <img v-if="item.avatar" :src="item.avatar" class="w-10 h-10 rounded-full object-cover border border-slate-100 dark:border-slate-800" />
              <div v-else class="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 text-xs dark:bg-slate-800 dark:text-slate-500">无</div>
            </div>
            <div class="flex-1 min-w-0">
              <div class="font-semibold truncate text-slate-700 dark:text-slate-100">{{ item.common_id || '用户' }}</div>
              <div class="text-xs text-slate-400 dark:text-slate-500">QQ: {{ item.qq || '未公开' }}</div>
            </div>
            <div class="text-xs text-right space-y-0.5">
              <div class="text-sky-600 bg-sky-50 px-2 py-0.5 rounded inline-block dark:bg-sky-900/40 dark:text-sky-200">{{ item.pilot_source || '未知来源' }}</div>
              <div class="text-slate-400 dark:text-slate-500">{{ item.machine_sign || '-' }}</div>
            </div>
          </div>
        </div>
      </div>
    </el-dialog>

    <!-- 悬浮发布按钮 -->
    <div v-if="canCreate" class="sticky bottom-8 z-40 flex justify-end">
      <button
        class="mr-8 flex items-center gap-2 px-6 py-3 rounded-full shadow-lg shadow-sky-500/20 transition-all duration-300 bg-gradient-to-r from-sky-400 to-blue-500 text-white hover:brightness-105 hover:-translate-y-0.5 active:scale-95 dark:from-sky-600 dark:to-blue-700 dark:shadow-sky-900/40"
        @click="formOpen = true"
      >
        <span class="text-xl leading-none font-light">＋</span>
        <span class="font-medium text-sm">发布活动</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 冰晶背景纹理 - 更加微妙 */
.ice-crystal-overlay {
  background-image: 
    radial-gradient(circle at 20% 30%, rgba(255, 255, 255, 0.25) 0%, transparent 8%),
    radial-gradient(circle at 80% 70%, rgba(255, 255, 255, 0.2) 0%, transparent 10%),
    radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.15) 0%, transparent 12%);
  background-size: 80px 80px;
}

/* 飘雪效果 */
.snow-container {
  perspective: 1000px;
}
.snow {
  position: absolute;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 50%;
  animation: fall linear infinite;
}
.s1 { width: 6px; height: 6px; top: -10%; left: 15%; animation-duration: 6s; animation-delay: 0s; }
.s2 { width: 4px; height: 4px; top: -10%; left: 45%; animation-duration: 9s; animation-delay: 2s; opacity: 0.6; }
.s3 { width: 5px; height: 5px; top: -10%; left: 85%; animation-duration: 7s; animation-delay: 4s; }

@keyframes fall {
  0% { transform: translateY(0) translateX(0); opacity: 0; }
  10% { opacity: 0.8; }
  100% { transform: translateY(300px) translateX(-20px); opacity: 0; }
}

/* 适配 Element Plus Dialog - 清新风格 */
:deep(.touhou-dialog) {
  border-radius: 12px;
  overflow: hidden;
}
:deep(.dark .touhou-dialog) {
  background-color: #0f172a;
  border: 1px solid #1e293b;
}
:deep(.touhou-dialog .el-dialog__header) {
  margin-right: 0;
  background-color: #f0f9ff; /* sky-50 */
  border-bottom: 1px solid #e0f2fe; /* sky-100 */
  padding: 16px 24px;
}
:deep(.dark .touhou-dialog .el-dialog__header) {
  background-color: #0b1220;
  border-bottom: 1px solid #1e293b;
}
:deep(.touhou-dialog .el-dialog__title) {
  color: #0369a1; /* sky-700 */
  font-weight: 600;
  font-size: 1.1rem;
}
:deep(.dark .touhou-dialog .el-dialog__title) {
  color: #bae6fd;
}
:deep(.touhou-dialog .el-dialog__body) {
  padding: 20px 24px;
  max-height: 70vh;
  overflow-y: auto;
  overscroll-behavior: contain;
}
:deep(.dark .touhou-dialog .el-dialog__body) {
  background-color: #0f172a;
  color: #e2e8f0;
}
</style>