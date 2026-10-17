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
const isAdmin = computed(
  () => store.role === 'admin' || store.role === 'super_admin'
)

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
    const res = await axios.get('/api/event', {
      params: { type: props.type, limit: 50 }
    })
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
    <header class="border-b border-slate-200 pb-8 dark:border-slate-800">
      <p class="club-eyebrow">LET'S MEET</p>
      <h1
        class="mt-4 font-serif text-3xl font-semibold leading-relaxed md:text-4xl"
      >
        {{ title }}
      </h1>
      <p
        class="mt-4 max-w-2xl text-sm leading-8 text-slate-500 dark:text-slate-400"
      >
        {{ subtitle }}
      </p>
    </header>

    <!-- 加载状态 -->
    <div v-if="loading" class="flex justify-center py-12">
      <div
        class="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500 dark:border-sky-400"
      ></div>
    </div>

    <!-- 内容列表 -->
    <div
      v-else
      class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),1fr))] gap-6 items-start relative z-0"
    >
      <EventCard
        v-for="event in items"
        :key="event.id"
        :event="event"
        :clickable="enableSignup"
        class="group border-t border-slate-300 dark:border-slate-700"
        @preview="() => openPreview(event)"
      >
        <template v-if="enableSignup" #actions>
          <div
            class="flex flex-wrap gap-2 items-center justify-between w-full mt-3 pt-3 border-t border-slate-50 dark:border-slate-800"
          >
            <span class="text-xs text-slate-500 dark:text-slate-400"
              >活动参与</span
            >
            <button
              class="relative px-5 py-1.5 rounded-full text-sm font-medium transition-all duration-300"
              :class="
                ['published', 'ongoing'].includes(event.status)
                  ? 'bg-sky-50 text-sky-600 hover:bg-sky-500 hover:text-white dark:bg-sky-900/40 dark:text-sky-200 dark:hover:bg-sky-600'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500'
              "
              :disabled="!['published', 'ongoing'].includes(event.status)"
              @click.stop="openSignup(event)"
            >
              <span>{{
                ['published', 'ongoing'].includes(event.status)
                  ? '我要参加'
                  : '已结束'
              }}</span>
            </button>
          </div>
        </template>
      </EventCard>

      <div v-if="!items.length" class="col-span-full py-12 text-center">
        <div class="text-sky-200 text-4xl mb-2 dark:text-sky-400">❄</div>
        <p class="text-slate-400 text-sm dark:text-slate-500">
          这里冷冷清清的，什么都没有发生呢...
        </p>
      </div>
    </div>

    <!-- 弹窗组件 -->
    <el-dialog
      v-model="formOpen"
      title="发布新活动"
      width="92vw"
      :style="{ maxWidth: '720px' }"
      destroy-on-close
      class="touhou-dialog"
    >
      <EventForm
        :allowed-types="formTypes"
        :is-admin="isAdmin && allowCreateMode === 'admin'"
        :submit-label="
          isAdmin && allowCreateMode === 'admin' ? '发布活动' : '提交审核'
        "
        @submitted="
          () => {
            formOpen = false
            loadEvents()
          }
        "
      />
    </el-dialog>

    <el-dialog
      v-model="signupOpen"
      title="活动报名"
      width="92vw"
      :style="{ maxWidth: '640px' }"
      destroy-on-close
      class="touhou-dialog"
    >
      <EventSignup
        v-if="selectedEvent"
        :event-id="selectedEvent.id"
        :disabled="!['published', 'ongoing'].includes(selectedEvent.status)"
      />
    </el-dialog>

    <el-dialog
      v-model="previewOpen"
      title="参赛名单"
      width="92vw"
      :style="{ maxWidth: '640px' }"
      destroy-on-close
      class="touhou-dialog"
    >
      <div
        v-if="previewLoading"
        class="text-sm text-slate-400 text-center py-4 dark:text-slate-500"
      >
        正在读取...
      </div>
      <div
        v-else-if="!previewItems.length"
        class="text-sm text-slate-400 text-center py-4 dark:text-slate-500"
      >
        暂无报名人员
      </div>
      <div
        v-else
        class="space-y-3 text-sm text-slate-700 max-h-[60vh] overflow-y-auto pr-2 dark:text-slate-200"
      >
        <div class="flex items-center justify-between px-1 mb-2">
          <span
            class="text-xs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded dark:bg-sky-900/40 dark:text-sky-200"
            >Total: {{ previewItems.length }}</span
          >
        </div>
        <div class="grid gap-3">
          <div
            v-for="item in previewItems"
            :key="item.id"
            class="flex items-center gap-3 rounded-lg border border-slate-100 bg-white p-3 hover:border-sky-200 transition-colors dark:bg-slate-900/60 dark:border-slate-800 dark:hover:border-sky-700"
          >
            <div class="relative">
              <img
                v-if="item.avatar"
                :src="item.avatar"
                class="w-10 h-10 rounded-full object-cover border border-slate-100 dark:border-slate-800"
              />
              <div
                v-else
                class="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 text-xs dark:bg-slate-800 dark:text-slate-500"
              >
                无
              </div>
            </div>
            <div class="flex-1 min-w-0">
              <div
                class="font-semibold truncate text-slate-700 dark:text-slate-100"
              >
                {{ item.common_id || '用户' }}
              </div>
              <div class="text-xs text-slate-400 dark:text-slate-500">
                QQ: {{ item.qq || '未公开' }}
              </div>
            </div>
            <div class="text-xs text-right space-y-0.5">
              <div
                class="text-sky-600 bg-sky-50 px-2 py-0.5 rounded inline-block dark:bg-sky-900/40 dark:text-sky-200"
              >
                {{ item.pilot_source || '未知来源' }}
              </div>
              <div class="text-slate-400 dark:text-slate-500">
                {{ item.machine_sign || '-' }}
              </div>
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
