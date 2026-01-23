<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { useRouter } from 'vue-router' // 引入 router
import { getThumbUrl } from '../../utils/image'

const router = useRouter()
const activities = ref([])
const loading = ref(true)

const fetchActivities = async () => {
  try {
    const res = await axios.get('/api/activities')
    activities.value = res.data
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
          <img
            :src="getThumbUrl(activity.cover_image)"
            @error="(e) => (e.target.src = activity.cover_image)"
            alt="Cover"
            class="w-full h-full object-cover transition duration-700 group-hover:scale-110"
          >
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
    </div>
  </div>
</template>
