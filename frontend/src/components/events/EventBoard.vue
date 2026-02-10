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
  <div class="space-y-8">
    <header class="event-banner relative overflow-hidden rounded-3xl border border-slate-200/60 dark:border-white/10 p-8 text-white">
      <div class="absolute inset-0 opacity-70 event-banner-glow" />
      <div class="absolute inset-0 event-banner-grain" />
      <div class="relative">
        <h2 class="text-4xl font-semibold tracking-tight event-banner-title">{{ title }}</h2>
        <p class="mt-2 text-sm text-slate-100 max-w-2xl">{{ subtitle }}</p>
      </div>
    </header>

    <div v-if="loading" class="text-center text-sm text-slate-400">加载中...</div>

    <div v-else class="grid gap-6 md:grid-cols-2 xl:grid-cols-3 items-start">
      <EventCard
        v-for="event in items"
        :key="event.id"
        :event="event"
        :clickable="enableSignup"
        @preview="() => openPreview(event)"
      >
        <template v-if="enableSignup" #actions>
          <div class="flex flex-wrap gap-2">
            <button
              class="px-4 py-2 rounded-full text-sm bg-gradient-to-r from-emerald-700 to-cyan-500 text-white shadow-lg"
              :disabled="!['published', 'ongoing'].includes(event.status)"
              @click.stop="openSignup(event)"
            >
              报名
            </button>
            <span class="text-xs text-slate-500">点击卡片查看参赛名单</span>
          </div>
        </template>
      </EventCard>

      <div v-if="!items.length" class="text-center text-sm text-slate-400">暂无活动内容</div>
    </div>

    <el-dialog v-model="formOpen" title="发布活动" width="720px" destroy-on-close>
      <EventForm
        :allowed-types="formTypes"
        :is-admin="isAdmin && allowCreateMode === 'admin'"
        :submit-label="isAdmin && allowCreateMode === 'admin' ? '发布活动' : '提交审核'"
        @submitted="() => { formOpen = false; loadEvents() }"
      />
    </el-dialog>

    <el-dialog v-model="signupOpen" title="报名" width="640px" destroy-on-close>
      <EventSignup
        v-if="selectedEvent"
        :event-id="selectedEvent.id"
        :disabled="!['published', 'ongoing'].includes(selectedEvent.status)"
      />
    </el-dialog>

    <el-dialog v-model="previewOpen" title="参赛名单" width="640px" destroy-on-close>
      <div v-if="previewLoading" class="text-sm text-slate-400">加载中...</div>
      <div v-else-if="!previewItems.length" class="text-sm text-slate-400">暂无报名成员</div>
      <div v-else class="space-y-3 text-sm text-slate-700">
        <div class="text-xs text-slate-500">共 {{ previewItems.length }} 人</div>
        <div class="grid gap-3">
          <div v-for="item in previewItems" :key="item.id" class="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2">
            <img v-if="item.avatar" :src="item.avatar" class="w-10 h-10 rounded-full object-cover" />
            <div class="flex-1">
              <div class="font-semibold">{{ item.common_id || '未填写' }}</div>
              <div class="text-xs text-slate-500">QQ: {{ item.qq || '未填写' }}</div>
            </div>
            <div class="text-xs text-slate-400 text-right">
              <div>{{ item.pilot_source || '来源未知' }}</div>
              <div>{{ item.machine_sign || '机签未填' }}</div>
            </div>
          </div>
        </div>
      </div>
    </el-dialog>

    <button
      v-if="canCreate"
      class="fixed right-6 bottom-6 z-40 flex items-center gap-3 rounded-full px-6 py-3 text-sm font-semibold text-white shadow-2xl border border-amber-300/40 bg-gradient-to-r from-slate-900 via-emerald-800 to-amber-600 hover:brightness-110"
      @click="formOpen = true"
    >
      <span class="text-base">+</span>
      发布活动
    </button>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&family=Noto+Serif+SC:wght@400;600&display=swap');

.event-banner {
  background: radial-gradient(circle at 18% 18%, rgba(251, 191, 36, 0.5), transparent 45%),
    radial-gradient(circle at 72% 32%, rgba(59, 130, 246, 0.4), transparent 50%),
    linear-gradient(135deg, rgba(17, 24, 39, 0.98), rgba(9, 26, 53, 0.98), rgba(12, 74, 61, 0.98));
}

.event-banner-glow {
  background: radial-gradient(circle at 15% 30%, rgba(251, 191, 36, 0.4), transparent 55%),
    radial-gradient(circle at 78% 12%, rgba(34, 211, 238, 0.35), transparent 45%);
}

.event-banner-grain {
  background-image: radial-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px);
  background-size: 6px 6px;
  opacity: 0.2;
}

.event-banner-title {
  font-family: 'Ma Shan Zheng', 'Noto Serif SC', serif;
  letter-spacing: 0.04em;
}
</style>
