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
  <div class="space-y-8 relative event-list-container">
    <!-- 顶部横幅：琪露诺(Cirno) 冰雪主题风格 -->
    <header class="event-banner relative overflow-hidden rounded-2xl p-8 md:p-10 text-white shadow-lg transition-all hover:shadow-xl group">
      <!-- 清新蓝白渐变背景 -->
      <div class="absolute inset-0 bg-gradient-to-br from-sky-400 via-blue-500 to-cyan-600" />
      
      <!-- 冰晶装饰 (CSS模拟) -->
      <div class="absolute inset-0 ice-crystal-overlay opacity-20" />
      
      <!-- 飘雪动画 -->
      <div class="snow-container absolute inset-0 overflow-hidden pointer-events-none">
        <span class="snow s1"></span>
        <span class="snow s2"></span>
        <span class="snow s3"></span>
      </div>

      <!-- 内容区域 -->
      <div class="relative z-10 flex flex-col items-start border-l-4 border-white/40 pl-6 backdrop-blur-[2px]">
        <h2 class="text-3xl md:text-4xl font-bold tracking-normal text-white drop-shadow-sm">
          {{ title }}
        </h2>
        <p class="mt-2 text-sm md:text-base text-blue-50 font-medium tracking-wide max-w-2xl leading-relaxed">
          {{ subtitle }}
        </p>
      </div>

      <!-- 装饰性图案：琪露诺的 ⑨ -->
      <div class="absolute -right-4 -bottom-10 opacity-15 transform -rotate-12 pointer-events-none text-white select-none transition-transform duration-700 group-hover:scale-110 group-hover:rotate-0">
        <div class="font-bold text-[180px] leading-none font-serif">⑨</div>
      </div>
    </header>

    <!-- 加载状态 -->
    <div v-if="loading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
    </div>

    <!-- 内容列表 -->
    <div v-else class="grid gap-6 md:grid-cols-2 xl:grid-cols-3 items-start relative z-0">
      <EventCard
        v-for="event in items"
        :key="event.id"
        :event="event"
        :clickable="enableSignup"
        class="group transition-all duration-300 hover:-translate-y-1 hover:shadow-md border border-slate-100 hover:border-sky-200 bg-white"
        @preview="() => openPreview(event)"
      >
        <template v-if="enableSignup" #actions>
          <!-- 底部操作栏优化：两端对齐，视觉更轻量 -->
          <div class="flex items-center justify-between w-full mt-4 pt-3 border-t border-slate-100/80 relative z-10">
            <!-- 状态标签组 -->
            <div class="flex items-center gap-2">
               <!-- 装饰性小标签 -->
               <div class="flex items-center gap-1 text-[10px] font-bold text-sky-400 bg-sky-50 px-2 py-0.5 rounded-full">
                  <span>⑨</span>
                  <span class="opacity-70">Ice Fairy</span>
               </div>
            </div>
            
            <!-- 报名按钮 -->
            <button
              class="relative flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-300 shadow-sm"
              :class="['published', 'ongoing'].includes(event.status) 
                ? 'bg-gradient-to-r from-sky-400 to-blue-500 text-white hover:shadow-sky-200 hover:scale-105' 
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'"
              :disabled="!['published', 'ongoing'].includes(event.status)"
              @click.stop="openSignup(event)"
            >
              <span>{{ ['published', 'ongoing'].includes(event.status) ? '立即报名' : '已结束' }}</span>
              <span v-if="['published', 'ongoing'].includes(event.status)" class="text-xs opacity-80">→</span>
            </button>
          </div>
        </template>
      </EventCard>

      <div v-if="!items.length" class="col-span-full py-12 text-center">
        <div class="text-sky-200 text-4xl mb-2">❄</div>
        <p class="text-slate-400 text-sm">这里冷冷清清的，什么都没有发生呢...</p>
      </div>
    </div>

    <!-- 弹窗组件 -->
    <el-dialog v-model="formOpen" title="发布新活动" width="720px" destroy-on-close class="touhou-dialog">
      <EventForm
        :allowed-types="formTypes"
        :is-admin="isAdmin && allowCreateMode === 'admin'"
        :submit-label="isAdmin && allowCreateMode === 'admin' ? '发布活动' : '提交审核'"
        @submitted="() => { formOpen = false; loadEvents() }"
      />
    </el-dialog>

    <el-dialog v-model="signupOpen" title="活动报名" width="640px" destroy-on-close class="touhou-dialog">
      <EventSignup
        v-if="selectedEvent"
        :event-id="selectedEvent.id"
        :disabled="!['published', 'ongoing'].includes(selectedEvent.status)"
      />
    </el-dialog>

    <el-dialog v-model="previewOpen" title="参赛名单" width="640px" destroy-on-close class="touhou-dialog">
      <div v-if="previewLoading" class="text-sm text-slate-400 text-center py-4">正在读取...</div>
      <div v-else-if="!previewItems.length" class="text-sm text-slate-400 text-center py-4">暂无报名人员</div>
      <div v-else class="space-y-3 text-sm text-slate-700 max-h-[60vh] overflow-y-auto pr-2">
        <div class="flex items-center justify-between px-1 mb-2">
          <span class="text-xs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded">Total: {{ previewItems.length }}</span>
        </div>
        <div class="grid gap-3">
          <div v-for="item in previewItems" :key="item.id" class="flex items-center gap-3 rounded-lg border border-slate-100 bg-white p-3 hover:border-sky-200 transition-colors">
            <div class="relative">
              <img v-if="item.avatar" :src="item.avatar" class="w-10 h-10 rounded-full object-cover border border-slate-100" />
              <div v-else class="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 text-xs">无</div>
            </div>
            <div class="flex-1 min-w-0">
              <div class="font-semibold truncate text-slate-700">{{ item.common_id || '用户' }}</div>
              <div class="text-xs text-slate-400">QQ: {{ item.qq || '未公开' }}</div>
            </div>
            <div class="text-xs text-right space-y-0.5">
              <div class="text-sky-600 bg-sky-50 px-2 py-0.5 rounded inline-block">{{ item.pilot_source || '未知来源' }}</div>
              <div class="text-slate-400">{{ item.machine_sign || '-' }}</div>
            </div>
          </div>
        </div>
      </div>
    </el-dialog>

    <!-- 悬浮发布按钮 -->
    <button
      v-if="canCreate"
      class="fixed right-8 bottom-8 z-40 flex items-center gap-2 px-6 py-3 rounded-full shadow-lg shadow-sky-500/20 transition-all duration-300 bg-gradient-to-r from-sky-400 to-blue-500 text-white hover:brightness-105 hover:-translate-y-0.5 active:scale-95"
      @click="formOpen = true"
    >
      <span class="text-xl leading-none font-light">＋</span>
      <span class="font-medium text-sm">发布活动</span>
    </button>
  </div>
</template>

<style scoped>
/* 冰晶背景纹理 */
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

/* Dialog 样式微调 */
:deep(.touhou-dialog) {
  border-radius: 12px;
  overflow: hidden;
}
:deep(.touhou-dialog .el-dialog__header) {
  margin-right: 0;
  background-color: #f0f9ff;
  border-bottom: 1px solid #e0f2fe;
  padding: 16px 24px;
}
:deep(.touhou-dialog .el-dialog__title) {
  color: #0369a1;
  font-weight: 600;
  font-size: 1.1rem;
}
:deep(.touhou-dialog .el-dialog__body) {
  padding: 20px 24px;
}
</style>