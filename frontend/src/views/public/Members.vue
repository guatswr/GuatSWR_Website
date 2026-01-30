<script setup>
import { ref, onMounted, computed, watch } from 'vue' // 引入 watch
import axios from 'axios'
import { getThumbUrl } from '../../utils/image'
import ProgressiveImage from '../../components/ProgressiveImage.vue'
import { pinyin } from 'pinyin-pro'

const members = ref([])
const loading = ref(true)
const errorMsg = ref('')

// [新增] 筛选状态
const selectedSchool = ref('')
const schoolStats = ref([])

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

// [新增] 计算筛选标签页 (合并颜色配置和统计数据)
const filterTabs = computed(() => {
  // 1. 建立统计映射 { '桂航': 10, ... }
  const statsMap = {}
  schoolStats.value.forEach(item => {
    statsMap[item.school] = item.count
  })
  
  // 2. 计算总人数 (所有学校人数之和)
  const totalCount = schoolStats.value.reduce((sum, item) => sum + item.count, 0)
  
  // 3. 构建 "全部" 选项
  const allTab = { 
    label: '全部', 
    value: '', 
    count: totalCount, 
    color: '#38bdf8' // sky-400
  }
  
  // 4. 构建各学校选项 (仅显示有定义的学校)
  const schoolTabs = schoolOptions.map(opt => ({
    ...opt,
    count: statsMap[opt.value] || 0
  }))

  return [allTab, ...schoolTabs]
})

// [新增] 获取学校统计
const fetchSchoolStats = async () => {
  try {
    const res = await axios.get('/api/members/stats/schools')
    schoolStats.value = res.data || []
  } catch (e) {
    console.error('加载统计失败', e)
  }
}

// [修改] 获取成员列表 (支持筛选)
const fetchMembers = async () => {
  loading.value = true // 切换筛选时显示加载状态
  try {
    const params = {}
    if (selectedSchool.value) params.school = selectedSchool.value // 附加筛选参数
    
    const res = await axios.get('/api/members', { params })
    members.value = res.data
  } catch (error) {
    console.error("加载失败", error)
    errorMsg.value = '后端连接异常，请联系管理员Taropoi'
    members.value = []
  } finally {
    loading.value = false
  }
}

// [新增] 监听筛选变化
watch(selectedSchool, () => {
  fetchMembers()
})

onMounted(() => {
  fetchMembers()
  fetchSchoolStats() // [新增] 初始化统计
})

const getFirstChar = (name) => {
  if (!name) return ''
  const trimmed = String(name).trim()
  return trimmed ? trimmed[0] : ''
}

const getSortKey = (name) => {
  const firstChar = getFirstChar(name)
  if (!firstChar) {
    return { category: 2, key: '' }
  }

  if (/^[A-Za-z]$/.test(firstChar)) {
    return { category: 0, key: String(name).toLowerCase() }
  }

  if (/^[\u4e00-\u9fff]$/.test(firstChar)) {
    const py = pinyin(firstChar, { toneType: 'none' })
    const initial = py ? py[0].toLowerCase() : 'z'
    return { category: 1, key: initial }
  }

  return { category: 2, key: String(name) }
}

const sortedMembers = computed(() => {
  return [...members.value].sort((a, b) => {
    const aKey = getSortKey(a?.name)
    const bKey = getSortKey(b?.name)

    if (aKey.category !== bKey.category) {
      return aKey.category - bKey.category
    }

    return aKey.key.localeCompare(bKey.key, 'en', { sensitivity: 'base' })
  })
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
      <div class="text-center mb-10">
        <h1 class="text-4xl font-bold text-sky-600 dark:text-sky-400 font-serif mb-4 flex justify-center items-center gap-2">
          绯想天住民名录
        </h1>
        <p class="text-gray-500 dark:text-gray-400 font-serif italic">按首字母排序</p>
      </div>

      <!-- [新增] 学校筛选栏 -->
      <div class="mb-12 flex flex-wrap justify-center gap-3 px-2">
        <button 
          v-for="tab in filterTabs" 
          :key="tab.value"
          @click="selectedSchool = tab.value"
          class="relative px-4 py-2 rounded-full text-sm font-bold transition-all duration-300 flex items-center gap-2 shadow-sm hover:-translate-y-0.5"
          :class="[
            selectedSchool === tab.value 
              ? 'text-white shadow-md ring-2 ring-offset-2 ring-offset-[#f0f9ff] dark:ring-offset-slate-950' 
              : 'bg-white/60 dark:bg-slate-800/60 text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-slate-800'
          ]"
          :style="{ 
            backgroundColor: selectedSchool === tab.value ? tab.color : '',
            borderColor: selectedSchool === tab.value ? tab.color : 'transparent',
            '--tw-ring-color': tab.color // 用于 ring 的动态颜色
          }"
        >
          <span>{{ tab.label }}</span>
          <span 
            class="px-1.5 py-0.5 rounded-full text-[10px] min-w-[1.2rem] flex items-center justify-center transition-colors"
            :class="selectedSchool === tab.value ? 'bg-white/20 text-white' : 'bg-gray-200/50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400'"
          >
            {{ tab.count }}
          </span>
        </button>
      </div>

      <div v-if="loading" class="text-center py-20">
        <div class="animate-spin text-blue-400 text-3xl">❄️</div>
        <p class="text-gray-400 dark:text-gray-300 mt-2">正在从红魔馆图书馆调取档案...</p>
      </div>

      <div v-else-if="errorMsg" class="text-center py-20 text-red-500">
        <p class="font-bold">{{ errorMsg }}</p>
      </div>

      <!-- 空状态展示 (如果筛选后没有数据) -->
      <div v-else-if="sortedMembers.length === 0" class="text-center py-20 text-gray-400 dark:text-gray-500">
        <p class="text-lg">该区域暂未发现住民出没...</p>
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        <div v-for="member in sortedMembers" :key="member.id" 
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