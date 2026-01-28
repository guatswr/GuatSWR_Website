<script setup>
import { ref, onMounted, computed } from 'vue'
import axios from 'axios'
import { useRouter } from 'vue-router' // 引入 router
import { getThumbUrl } from '../../utils/image'
import ProgressiveImage from '../../components/ProgressiveImage.vue'

const router = useRouter()
const activities = ref([])
const loading = ref(true)
const page = ref(1)
const limit = ref(12)
const total = ref(0)

const fetchActivities = async () => {
  try {
    const res = await axios.get('/api/activities', {
      params: { page: page.value, limit: limit.value }
    })
    activities.value = res.data?.items || []
    total.value = res.data?.total || 0
  } catch (error) {
    console.error("加载失败", error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchActivities()
})

const goDetail = (id) => {
  router.push(`/activity/${id}`)
}

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit.value)))
const canPrev = computed(() => page.value > 1)
const canNext = computed(() => page.value < totalPages.value)

const pageItems = computed(() => {
  const totalP = totalPages.value
  if (totalP <= 1) return [1]

  const current = page.value
  const items = [1]

  let start = Math.max(2, current - 1)
  let end = Math.min(totalP - 1, current + 1)

  if (current <= 3) {
    start = 2
    end = Math.min(totalP - 1, 4)
  } else if (current >= totalP - 2) {
    start = Math.max(2, totalP - 3)
    end = totalP - 1
  }

  if (start > 2) items.push('...')
  for (let i = start; i <= end; i += 1) items.push(i)
  if (end < totalP - 1) items.push('...')

  items.push(totalP)
  return items
})

const changePage = async (nextPage) => {
  if (nextPage < 1 || nextPage > totalPages.value) return
  page.value = nextPage
  loading.value = true
  await fetchActivities()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-slate-950 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-7xl mx-auto text-center mb-16">
      <h1 class="text-4xl font-bold text-red-600 dark:text-red-400 font-serif mb-4 flex justify-center items-center gap-4">
        <span class="text-2xl opacity-50">☯</span>
        社团活动记录
        <span class="text-2xl opacity-50">☯</span>
      </h1>
      <p class="text-gray-500 dark:text-gray-400 italic">Records of Activities</p>
      <div class="w-24 h-1 bg-red-400 mx-auto mt-6 rounded-full"></div>
    </div>

    <div v-if="loading" class="text-center py-20 text-gray-500 dark:text-gray-300">
      <div class="animate-spin text-4xl mb-4 inline-block">⏳</div>
      <p>少女祈祷中...</p>
    </div>

    <div v-else class="max-w-5xl mx-auto space-y-8">
       <div v-for="(activity, index) in activities" :key="activity.id" 
         class="bg-white dark:bg-slate-900 rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 border border-gray-100 dark:border-slate-800 flex flex-col md:flex-row h-auto md:h-64 group cursor-pointer"
           @click="goDetail(activity.id)"> <!-- 点击整个卡片跳转 -->
        
        <div class="md:w-2/5 h-48 md:h-full relative overflow-hidden shrink-0">
          <ProgressiveImage
            :src="activity.cover_image"
            :thumb="getThumbUrl(activity.cover_image)"
            alt="Cover"
            wrapperClass="w-full h-full"
            imgClass="w-full h-full object-cover transition duration-700 group-hover:scale-110"
          />
          <div class="absolute inset-0 bg-black/10 group-hover:bg-transparent transition"></div>
        </div>

        <div class="p-6 md:p-8 flex flex-col justify-center flex-grow">
          <div class="flex flex-wrap items-center justify-between gap-3 z-10 mb-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="inline-flex items-center gap-1 text-[11px] font-semibold px-3 py-1 rounded-full bg-white/70 text-red-600 border border-red-100 shadow-sm dark:bg-slate-800/80 dark:text-red-200 dark:border-slate-700">
                <span class="text-[10px]">📅</span>
                {{ activity.date }}
              </span>
              <span
                class="inline-flex items-center gap-1 text-[11px] font-semibold px-3 py-1 rounded-full bg-gradient-to-r from-rose-50 via-red-50 to-amber-50 text-red-600 border border-red-100 shadow-sm dark:from-slate-800 dark:via-slate-800 dark:to-slate-800 dark:text-red-200 dark:border-slate-700"
              >
                <span class="text-[10px]">🏷️</span>
                {{ activity.tag || '未标注' }}
              </span>
            </div>

            <span class="inline-flex items-center text-[11px] font-mono px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 border border-gray-200 dark:bg-slate-800 dark:text-gray-200 dark:border-slate-700">
              pid: {{ activity.id }}
            </span>
          </div>

          <h2 class="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4 group-hover:text-red-600 transition z-10 font-serif">
            {{ activity.title }}
          </h2>
          <p class="text-gray-600 dark:text-gray-300 leading-relaxed z-10 line-clamp-3">
            {{ activity.description }}
          </p>
          
          <div class="mt-6 pt-4 border-t border-gray-100 dark:border-slate-800 flex justify-between items-center z-10">
            <span class="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-widest">Activity Record</span>
            <!-- 按钮点击事件 -->
            <button @click.stop="goDetail(activity.id)" class="text-sm text-red-500 dark:text-red-300 font-medium hover:text-red-600 flex items-center gap-1 group/btn">
              查看详情
              <span class="transform group-hover/btn:translate-x-1 transition">→</span>
            </button>
          </div>
        </div>
      </div>

      <div v-if="total > 0" class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-4 border-t border-gray-100 dark:border-slate-800">
        <div class="text-xs text-gray-500 dark:text-gray-400">
          共 {{ total }} 条 · 第 {{ page }}/{{ totalPages }} 页
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button
            class="px-3 py-1 text-sm rounded border text-gray-600 dark:text-gray-200 border-gray-200 dark:border-slate-700 disabled:opacity-50"
            :disabled="!canPrev"
            @click="changePage(page - 1)"
          >上一页</button>

          <template v-for="(item, idx) in pageItems" :key="`${item}-${idx}`">
            <span v-if="item === '...'" class="px-2 text-gray-400">···</span>
            <button
              v-else
              class="px-3 py-1 text-sm rounded border border-gray-200 dark:border-slate-700"
              :class="item === page ? 'bg-red-600 text-white border-red-600' : 'text-gray-600 dark:text-gray-200'"
              @click="changePage(item)"
            >{{ item }}</button>
          </template>

          <button
            class="px-3 py-1 text-sm rounded border text-gray-600 dark:text-gray-200 border-gray-200 dark:border-slate-700 disabled:opacity-50"
            :disabled="!canNext"
            @click="changePage(page + 1)"
          >下一页</button>
        </div>
      </div>
    </div>
  </div>
</template>
