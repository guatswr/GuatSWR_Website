<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { getThumbUrl } from '../../utils/image'
import ProgressiveImage from '../../components/ProgressiveImage.vue'

const members = ref([])
const loading = ref(true)
const errorMsg = ref('')

// 学校颜色映射配置
const schoolOptions = [
  { value: '桂航', color: '#0047BA', label: '桂航' },
  { value: '桂电', color: '#0050A1', label: '桂电' },
  { value: '师大', color: '#722E87', label: '师大' },
  { value: '桂师', color: '#E60012', label: '桂师' },
  { value: '桂信', color: '#F39C12', label: '桂信' },
  { value: '桂理', color: '#006400', label: '桂理' },
  { value: '桂旅', color: '#20B2AA', label: '桂旅' },
  { value: '漓院', color: '#00BFFF', label: '漓院' },
  { value: '桂医', color: '#2E8B57', label: '桂医' },
  { value: '联外', color: '#800000', label: '联外' }
]

// 获取学校颜色辅助函数
const getSchoolColor = (schoolName) => {
  const school = schoolOptions.find(s => s.value === schoolName)
  return school ? school.color : '#9ca3af' // 默认灰色
}

const fetchMembers = async () => {
  try {
    const res = await axios.get('/api/members')
    members.value = res.data
  } catch (error) {
    console.error("加载失败", error)
    errorMsg.value = '后端连接异常，请联系管理员Taropoi'
    members.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchMembers()
})
</script>

<template>
  <div class="min-h-screen bg-[#f0f9ff] dark:bg-slate-950 py-12 px-4 relative overflow-hidden font-sans">
    <!-- 冰雪背景装饰 - 呼应琪露诺 -->
    <div class="absolute top-0 right-0 w-96 h-96 bg-blue-200/20 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
    <div class="absolute bottom-0 left-0 w-96 h-96 bg-red-200/20 rounded-full blur-3xl -ml-20 -mb-20 pointer-events-none"></div>
    <!-- 9水印 -->
    <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[20rem] font-bold text-white opacity-40 select-none pointer-events-none font-serif">⑨</div>

    <div class="max-w-7xl mx-auto relative z-10">
      <div class="text-center mb-16">
        <h1 class="text-4xl font-bold text-sky-600 dark:text-sky-400 font-serif mb-4 flex justify-center items-center gap-2">
          <span class="text-2xl">❄️</span> 绯想天住民名录 <span class="text-2xl">❄️</span>
        </h1>
        <p class="text-gray-500 dark:text-gray-400 font-serif italic">Club Member List</p>
      </div>

      <div v-if="loading" class="text-center py-20">
        <div class="animate-spin text-blue-400 text-3xl">❄️</div>
        <p class="text-gray-400 dark:text-gray-300 mt-2">正在从红魔馆图书馆调取档案...</p>
      </div>

      <div v-else-if="errorMsg" class="text-center py-20 text-red-500">
        <p class="font-bold">{{ errorMsg }}</p>
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        <div v-for="member in members" :key="member.id" 
             class="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm rounded-2xl p-6 shadow-sm hover:shadow-lg transition transform hover:-translate-y-2 border border-blue-50 dark:border-slate-800 relative group">
          
          <!-- 头像 -->
            <div class="relative w-24 h-24 mx-auto mb-4">
              <div class="w-full h-full rounded-full p-1 bg-gradient-to-tr from-blue-300 to-pink-300 shadow-inner overflow-hidden">
                <ProgressiveImage
                  :src="member.avatar"
                  :thumb="member.avatar_thumb || getThumbUrl(member.avatar)"
                  alt="Avatar"
                  wrapperClass="w-full h-full"
                  imgClass="w-full h-full object-cover rounded-full block transform group-hover:scale-110 transition duration-500"
                />
              </div>
            
            <!-- 学校标签 (悬浮在头像右下方) -->
            <div v-if="member.school" 
                 class="absolute -bottom-1 -right-2 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md border-2 border-white transform rotate-[-5deg] group-hover:rotate-0 transition duration-300"
                 :style="{ backgroundColor: getSchoolColor(member.school) }">
              {{ member.school }}
            </div>
          </div>

          <!-- 信息 -->
          <div class="text-center">
            <h3 class="text-xl font-bold text-gray-800 dark:text-gray-100 mb-1 font-serif">{{ member.name }}</h3>
            <!-- 能力/身份标签 -->
            <span class="inline-block px-3 py-1 bg-blue-100 dark:bg-slate-800 text-blue-600 dark:text-blue-200 text-xs rounded-full font-bold mb-4 border border-blue-200 dark:border-slate-700">
              {{ member.role }}
            </span>
            <p class="text-sm text-gray-600 dark:text-gray-300 leading-relaxed italic border-t border-dashed border-gray-200 dark:border-slate-700 pt-4 relative">
              <span class="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-white dark:bg-slate-900 px-2 text-gray-300 dark:text-gray-400 text-xs">Spell Card</span>
              "{{ member.bio }}"
            </p>
          </div>

          <!-- 悬停时的边框高亮 -->
          <div class="absolute inset-0 rounded-2xl border-2 border-transparent group-hover:border-blue-300 transition pointer-events-none"></div>
        </div>
      </div>
    </div>
  </div>
</template>
