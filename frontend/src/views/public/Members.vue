<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import axios from 'axios'
import { getThumbUrl } from '../../utils/image'
import ProgressiveImage from '../../components/ProgressiveImage.vue'
import ParliamentChart from '../../components/ParliamentChart.vue' 
import { pinyin } from 'pinyin-pro'

const members = ref([])
const loading = ref(true)
const errorMsg = ref('')

//筛选状态
const selectedSchool = ref('')
const schoolStats = ref([])
const currentDate = ref('')

// 学校代表色配置
const schoolOptions = [
  { value: '桂航', color: '#2B65EC', label: '桂航' },
  { value: '桂电', color: '#002060', label: '桂电' },
  { value: '师大', color: '#722E87', label: '师大' }, // 紫色
  { value: '桂师', color: '#E60012', label: '桂师' }, // 正红
  { value: '桂信', color: '#F39C12', label: '桂信' }, // 橙色
  { value: '漓院', color: '#00BFFF', label: '漓院' },
  { value: '桂理', color: '#607D8B', label: '桂理' }, // 深绿
  { value: '桂旅', color: '#20B2AA', label: '桂旅' }, // 浅海绿
  { value: '桂医', color: '#2E8B57', label: '桂医' }, // 海洋绿
  { value: '联外', color: '#800000', label: '联外' },  // 栗色
  { value: 'bot', color: '#424242', label: 'bot' }    // 深灰
]

// 辅助：获取颜色
const getSchoolColor = (schoolName) => {
  const school = schoolOptions.find(s => s.value === schoolName)
  return school ? school.color : '#9ca3af' // 默认灰色
}

const getMemberTags = (member) => {
  if (!member || !Array.isArray(member.tags)) return []
  return member.tags.map(t => String(t || '').trim()).filter(Boolean)
}

// 核心逻辑：确保数据完全按照 schoolOptions 的顺序排列，以实现色块聚合
const parliamentData = computed(() => {
  if (!schoolStats.value.length) return []

  // 1. 创建映射
  const statsMap = {}
  schoolStats.value.forEach(s => {
    statsMap[s.school] = s.count
  })

  // 2. 按配置顺序生成
  const chartData = schoolOptions.map(opt => {
    return {
      label: opt.label,
      value: statsMap[opt.value] || 0,
      color: opt.color
    }
  }).filter(item => item.value > 0)

  // 3. 处理配置表中没有的学校 (归类为灰色其他)
  const knownSchools = schoolOptions.map(s => s.value)
  const otherStats = schoolStats.value.filter(s => !knownSchools.includes(s.school) && s.school)
  
  otherStats.forEach(s => {
    chartData.push({
      label: s.school,
      value: s.count,
      color: '#9ca3af' // 灰色
    })
  })

  return chartData
})

// 计算筛选标签页
const filterTabs = computed(() => {
  const statsMap = {}
  schoolStats.value.forEach(item => {
    statsMap[item.school] = item.count
  })
  
  const totalCount = schoolStats.value.reduce((sum, item) => sum + item.count, 0)
  
  const allTab = { 
    label: '全部', 
    value: '', 
    count: totalCount, 
    color: '#38bdf8' 
  }
  
  const schoolTabs = schoolOptions.map(opt => ({
    ...opt,
    count: statsMap[opt.value] || 0
  }))

  return [allTab, ...schoolTabs]
})

const fetchSchoolStats = async () => {
  try {
    const res = await axios.get('/api/members/stats/schools')
    schoolStats.value = res.data || []
  } catch (e) {
    console.error('加载统计失败', e)
  }
}

const fetchMembers = async () => {
  loading.value = true
  try {
    const params = {}
    if (selectedSchool.value) params.school = selectedSchool.value
    
    const res = await axios.get('/api/members', { params })
    members.value = res.data
  } catch (error) {
    console.error("加载失败", error)
    errorMsg.value = '后端连接异常，请联系管理员'
    members.value = []
  } finally {
    loading.value = false
  }
}

watch(selectedSchool, () => {
  fetchMembers()
})

onMounted(() => {
  // [新增] 动态获取当前日期，格式 YYYY-MM-DD
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  currentDate.value = `${year}-${month}-${day}`

  fetchMembers()
  fetchSchoolStats()
})

// 排序逻辑...
const getFirstChar = (name) => {
  if (!name) return ''
  const trimmed = String(name).trim()
  return trimmed ? trimmed[0] : ''
}

const getSortKey = (name) => {
  const firstChar = getFirstChar(name)
  if (!firstChar) return { category: 2, key: '' }
  if (/^[A-Za-z]$/.test(firstChar)) return { category: 0, key: String(name).toLowerCase() }
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
    if (aKey.category !== bKey.category) return aKey.category - bKey.category
    return aKey.key.localeCompare(bKey.key, 'en', { sensitivity: 'base' })
  })
})
</script>

<template>
  <div class="min-h-screen bg-[#f0f9ff] dark:bg-slate-950 py-12 px-4 relative overflow-hidden font-sans">
    <!-- 背景装饰 -->
    <div class="absolute top-0 right-0 w-96 h-96 bg-blue-200/20 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
    <div class="absolute bottom-0 left-0 w-96 h-96 bg-red-200/20 rounded-full blur-3xl -ml-20 -mb-20 pointer-events-none"></div>
    <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[20rem] font-bold text-white opacity-40 select-none pointer-events-none font-serif">⑨</div>

    <div class="max-w-7xl mx-auto relative z-10">
      <div class="text-center mb-8">
        <h1 class="text-4xl font-bold text-sky-600 dark:text-sky-400 font-serif mb-4 flex justify-center items-center gap-2">
          绯想天住民名录
        </h1>

        <!--  温馨提示栏 -->
        <div class="flex flex-wrap justify-center gap-3 mb-4">
          <!-- 提示1: 小号 -->
          <div class="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md rounded-full border border-blue-100 dark:border-slate-800 shadow-sm transition hover:scale-105 cursor-default select-none">
            <div class="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_5px_rgba(251,191,36,0.5)]"></div>
            <span>小号不列入统计</span>
          </div>
          <!-- 提示2: 排序 -->
          <div class="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md rounded-full border border-blue-100 dark:border-slate-800 shadow-sm transition hover:scale-105 cursor-default select-none">
            <div class="w-1.5 h-1.5 rounded-full bg-pink-400 shadow-[0_0_5px_rgba(244,114,182,0.5)]"></div>
            <span>按首字母排序</span>
          </div>
          <!-- 提示3: 管理员 -->
          <div class="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md rounded-full border border-blue-100 dark:border-slate-800 shadow-sm transition hover:scale-105 cursor-default select-none">
            <div class="w-1.5 h-1.5 rounded-full bg-sky-500 shadow-[0_0_5px_rgba(14,165,233,0.5)]"></div>
            <span>如需修改信息请联系管理员</span>
          </div>
        </div>
      </div>

      <!-- 席位分布图 (传递当前日期) -->
      <div class="mb-12" v-if="parliamentData.length > 0">
        <ParliamentChart 
          :data="parliamentData" 
          title="桂航绯想天" 
          :subTitle="currentDate" 
        />
      </div>

      <!-- 筛选栏 (样式优化匹配图片) -->
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
            '--tw-ring-color': tab.color
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

      <div v-else-if="sortedMembers.length === 0" class="text-center py-20 text-gray-400 dark:text-gray-500">
        <p class="text-lg">该区域暂未发现住民出没...</p>
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        <div v-for="member in sortedMembers" :key="member.id" 
             class="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm rounded-2xl p-6 shadow-sm hover:shadow-lg transition transform hover:-translate-y-2 border border-blue-50 dark:border-slate-800 relative group">
          
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
            
            <div v-if="member.school" 
                 class="absolute -bottom-1 -right-2 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md border-2 border-white transform rotate-[-5deg] group-hover:rotate-0 transition duration-300"
                 :style="{ backgroundColor: getSchoolColor(member.school) }">
              {{ member.school }}
            </div>
          </div>

          <div class="text-center">
            <h3 class="text-xl font-bold text-gray-800 dark:text-gray-100 mb-1 font-serif">{{ member.name }}</h3>
            <span class="inline-block px-3 py-1 bg-blue-100 dark:bg-slate-800 text-blue-600 dark:text-blue-200 text-xs rounded-full font-bold mb-2 border border-blue-200 dark:border-slate-700">
              {{ member.role }}
            </span>
            <div class="flex flex-wrap justify-center gap-1.5 mb-4 min-h-[18px]">
              <span 
                v-for="tag in getMemberTags(member)" 
                :key="tag"
                class="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-violet-100 text-violet-600 border border-violet-200/70 dark:bg-violet-900/30 dark:text-violet-200 dark:border-violet-800/60"
              >
                {{ tag }}
              </span>
            </div>
            <p class="text-sm text-gray-600 dark:text-gray-300 leading-relaxed italic border-t border-dashed border-gray-200 dark:border-slate-700 pt-4 relative">
              <span class="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-white dark:bg-slate-900 px-2 text-gray-300 dark:text-gray-400 text-xs">Spell Card</span>
              "{{ member.bio }}"
            </p>
          </div>
          <div class="absolute inset-0 rounded-2xl border-2 border-transparent group-hover:border-blue-300 transition pointer-events-none"></div>
        </div>
      </div>
    </div>
  </div>
</template>