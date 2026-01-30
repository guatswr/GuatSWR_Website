<script setup>
import { ref, reactive, onMounted } from 'vue'
import axios from 'axios'

const logs = ref([])
const logTotal = ref(0)
const logPage = ref(1)
const logLimit = ref(20)
const logFilter = reactive({ username: '', action: '' })
const loading = ref(false)
const stats = ref([])
const errorMsg = ref('')
const showRules = ref(false) // 控制算法说明的显示/隐藏

// 动作字典，用于筛选
const logActions = [
  'LOGIN', 'UPLOAD', 'CREATE_ACTIVITY', 'UPDATE_ACTIVITY', 'DELETE_ACTIVITY',
  'CREATE_MEMBER', 'UPDATE_MEMBER', 'DELETE_MEMBER',
  'CREATE_HISTORY', 'UPDATE_HISTORY', 'DELETE_HISTORY',
  'UPDATE_CONFIG', 'CREATE_USER', 'DELETE_USER', 'RESET_PWD',
  'UPDATE_PROFILE'
]

// 辅助函数：格式化时间
const formatTime = (isoString) => {
  if (!isoString) return '-'
  const date = new Date(isoString)
  return date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 辅助函数：动作颜色映射
const getActionStyle = (action) => {
  if (action.includes('DELETE') || action.includes('RESET')) {
    return 'bg-red-50 text-red-600 border-red-100'
  }
  if (action.includes('CREATE') || action.includes('UPLOAD')) {
    return 'bg-emerald-50 text-emerald-600 border-emerald-100'
  }
  if (action.includes('UPDATE')) {
    return 'bg-blue-50 text-blue-600 border-blue-100'
  }
  if (action.includes('LOGIN')) {
    return 'bg-purple-50 text-purple-600 border-purple-100'
  }
  return 'bg-gray-50 text-gray-600 border-gray-200'
}

// 辅助函数：动作友好显示 (可选，去除下划线)
const formatAction = (action) => {
  return action.replace(/_/g, ' ')
}

const fetchStats = async () => {
  try {
    const res = await axios.get('/api/logs/stats')
    stats.value = res.data?.stats || []
  } catch (e) {
    // ignore stats error
  }
}

const fetchLogs = async () => {
  loading.value = true
  errorMsg.value = '' // 重置错误
  try {
    const params = { page: logPage.value, limit: logLimit.value, username: logFilter.username, action: logFilter.action }
    const res = await axios.get('/api/logs', { params })
    logs.value = res.data.logs || []
    logTotal.value = res.data.total || 0
  } catch (err) {
    errorMsg.value = '无法连接到数据中心，请稍后再试'
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  logPage.value = 1
  fetchLogs()
}

onMounted(() => {
  fetchStats()
  fetchLogs()
})
</script>

<template>
  <div class="min-h-screen bg-[#FDFBF7] font-sans pb-20">
    <!-- 头部 Hero 区域 -->
    <div class="bg-white border-b border-gray-100 pt-16 pb-12 mb-10">
      <div class="max-w-6xl mx-auto px-4 text-center">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-500 mb-6 shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 class="text-3xl md:text-4xl font-bold text-gray-800 font-serif mb-3 tracking-tight">日志档案</h1>
        <p class="text-gray-500 max-w-lg mx-auto leading-relaxed">
          这里记录了桂航绯想天的每一次变迁。所有的内容都是由同好们一点一滴积累而成，见证着这个小小同好会的成长。
        </p>
      </div>
    </div>

    <div class="max-w-6xl mx-auto px-4 space-y-10">
      
      <!-- 贡献排行榜 -->
      <section v-if="stats.length > 0">
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-2">
            <span class="text-2xl">🏆</span>
            <h2 class="font-bold text-xl text-gray-800 font-serif">近期贡献榜</h2>
          </div>
          <button 
            @click="showRules = !showRules" 
            class="text-xs font-medium text-indigo-500 hover:text-indigo-700 flex items-center gap-1 transition-colors px-3 py-1.5 rounded-full hover:bg-indigo-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {{ showRules ? '收起算法说明' : '如何计算贡献？' }}
          </button>
        </div>

        <!-- 算法说明卡片 (可折叠) -->
        <div v-show="showRules" class="bg-indigo-50/50 rounded-xl p-5 mb-6 text-sm text-gray-600 border border-indigo-100 animate-fadeIn">
          <h4 class="font-bold text-indigo-700 mb-3 flex items-center gap-2">
            贡献值计算规则
          </h4>
          <div class="grid md:grid-cols-2 gap-6">
            <ul class="space-y-2 list-disc pl-4 marker:text-indigo-300">
              <li><strong>核心公式：</strong> 贡献值 = 用户执行“有效内容编辑”的总次数。</li>
              <li><strong>统计范围：</strong> 基于全站历史数据统计，展示贡献前 10 名的用户。</li>
            </ul>
            <div class="bg-white/60 rounded-lg p-3 text-xs border border-indigo-50">
              <p class="font-bold text-gray-700 mb-1">✅ 计入贡献的操作：</p>
              <p class="mb-2">发布/修改/删除（异变、成员、历史记录）、更新系统配置、更新个人资料。</p>
              <p class="font-bold text-gray-700 mb-1">❌ 不计入的操作：</p>
              <p>日常登录、单纯文件上传、管理员账号管理（如创建账号、重置密码）。</p>
            </div>
          </div>
        </div>
        
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div 
            v-for="(s, idx) in stats" 
            :key="idx" 
            class="relative flex items-center gap-4 bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group"
          >
            <!-- 排名标记 -->
            <div 
              class="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm"
              :class="{
                'bg-yellow-400': idx === 0,
                'bg-gray-400': idx === 1,
                'bg-orange-400': idx === 2,
                'bg-indigo-100 text-indigo-600': idx > 2
              }"
            >
              {{ idx + 1 }}
            </div>

            <!-- 头像 -->
            <div 
              class="w-12 h-12 rounded-full p-0.5 bg-gradient-to-tr from-gray-100 to-gray-200 shrink-0"
              :class="{
                'from-yellow-200 to-yellow-100': idx === 0,
                'from-gray-300 to-gray-100': idx === 1,
                'from-orange-200 to-orange-100': idx === 2
              }"
            >
              <div class="w-full h-full rounded-full overflow-hidden bg-white">
                <img v-if="s.user_avatar" :src="s.user_avatar" class="w-full h-full object-cover" alt="avatar">
                <div v-else class="w-full h-full flex items-center justify-center text-xs text-gray-400 bg-gray-50">
                  {{ s.username?.charAt(0) || '?' }}
                </div>
              </div>
            </div>

            <!-- 信息 -->
            <div class="flex-1 min-w-0">
              <div class="text-base font-bold text-gray-800 truncate group-hover:text-indigo-600 transition-colors">{{ s.username || '神秘访客' }}</div>
              <div class="text-xs text-gray-400 truncate mt-0.5">UID: {{ s.user_id || 'Unknown' }}</div>
            </div>

            <!-- 贡献数 -->
            <div class="text-right">
              <div class="text-lg font-bold text-gray-900 font-mono">{{ s.count }}</div>
              <div class="text-[10px] text-gray-400 uppercase tracking-wider">Edits</div>
            </div>
          </div>
        </div>
      </section>

      <!-- 日志列表主体 -->
      <section class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <!-- 筛选工具栏 -->
        <div class="p-5 border-b border-gray-50 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div class="flex items-center gap-2">
            <span class="text-xl">📜</span>
            <h2 class="font-bold text-lg text-gray-800">变更明细</h2>
            <span class="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full font-mono">{{ logTotal }}</span>
          </div>
          
          <div class="flex gap-2 w-full sm:w-auto">
             <div class="relative flex-grow sm:flex-grow-0">
               <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
               </span>
               <input 
                  v-model="logFilter.username" 
                  placeholder="搜索用户..." 
                  class="pl-9 pr-3 py-2 w-full border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 outline-none transition bg-white"
                  @keyup.enter="handleSearch"
               >
             </div>
             
             <div class="relative flex-grow sm:flex-grow-0">
                <select 
                  v-model="logFilter.action" 
                  class="w-full appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 outline-none transition bg-white cursor-pointer"
                  @change="handleSearch"
                >
                  <option value="">全部动作类型</option>
                  <option v-for="act in logActions" :key="act" :value="act">{{ formatAction(act) }}</option>
                </select>
                <span class="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none text-gray-400">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
             </div>
             
             <button @click="handleSearch" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg shadow-sm transition-colors flex-shrink-0">
               搜索
             </button>
          </div>
        </div>

        <!-- 状态展示 -->
        <div v-if="loading" class="py-20 text-center">
           <div class="inline-block animate-spin text-3xl mb-3 text-indigo-500">⏳</div>
           <p class="text-gray-400 text-sm">正在读取历史档案...</p>
        </div>

        <div v-else-if="errorMsg" class="py-20 text-center">
           <div class="text-3xl mb-3">📡</div>
           <p class="text-red-500 font-medium">{{ errorMsg }}</p>
           <button @click="fetchLogs" class="mt-4 text-indigo-600 hover:underline text-sm">重试连接</button>
        </div>

        <div v-else-if="logs.length === 0" class="py-20 text-center text-gray-400">
           <div class="text-4xl mb-3 opacity-30">📭</div>
           <p>没有找到相关记录</p>
        </div>

        <!-- 日志表格 -->
        <div v-else class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead class="bg-gray-50/80 border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500 font-medium">
              <tr>
                <th class="px-6 py-4 w-48">操作时间</th>
                <th class="px-6 py-4 w-48">执行者</th>
                <th class="px-6 py-4 w-40">动作</th>
                <th class="px-6 py-4">详细内容</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              <tr v-for="log in logs" :key="log.id" class="hover:bg-gray-50/50 transition-colors group">
                <!-- 时间 -->
                <td class="px-6 py-4 whitespace-nowrap">
                   <div class="flex items-center gap-2 text-gray-500 font-mono text-sm">
                     <span class="w-1.5 h-1.5 rounded-full bg-gray-300 group-hover:bg-indigo-400 transition-colors"></span>
                     {{ formatTime(log.created_at) }}
                   </div>
                </td>

                <!-- 用户 -->
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-gray-100 p-0.5 border border-gray-100 shrink-0">
                       <img v-if="log.user_avatar" :src="log.user_avatar" class="w-full h-full rounded-full object-cover" alt="avatar">
                       <div v-else class="w-full h-full rounded-full flex items-center justify-center text-xs text-gray-400 font-bold bg-white">
                         {{ log.username?.charAt(0) || '?' }}
                       </div>
                    </div>
                    <span class="font-medium text-gray-700 text-sm">{{ log.username || 'Unknown' }}</span>
                  </div>
                </td>

                <!-- 动作 -->
                <td class="px-6 py-4 whitespace-nowrap">
                  <span 
                    class="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold border tracking-wide uppercase shadow-sm"
                    :class="getActionStyle(log.action)"
                  >
                    {{ formatAction(log.action) }}
                  </span>
                </td>

                <!-- 详情 -->
                <td class="px-6 py-4">
                  <p class="text-sm text-gray-600 leading-relaxed truncate max-w-xs sm:max-w-sm lg:max-w-md" :title="log.details">
                    {{ log.details || '-' }}
                  </p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 分页 -->
        <div class="px-6 py-4 border-t border-gray-50 bg-gray-50/50 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div class="text-xs text-gray-500">
            显示第 <span class="font-bold text-gray-700">{{ (logPage - 1) * logLimit + 1 }}</span> 
            至 <span class="font-bold text-gray-700">{{ Math.min(logPage * logLimit, logTotal) }}</span> 条，
            共 <span class="font-bold text-gray-700">{{ logTotal }}</span> 条记录
          </div>
          
          <div class="flex items-center gap-2">
            <button 
              :disabled="logPage <= 1" 
              @click="logPage--;fetchLogs()" 
              class="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
            >
              上一页
            </button>
            
            <div class="hidden sm:flex px-2 text-sm font-medium text-gray-600">
              {{ logPage }}
            </div>

            <button 
              :disabled="logs.length < logLimit" 
              @click="logPage++;fetchLogs()" 
              class="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
            >
              下一页
            </button>
            
            <div class="h-4 w-px bg-gray-300 mx-2"></div>

            <select 
              v-model="logLimit" 
              @change="fetchLogs()" 
              class="text-xs border-none bg-transparent text-gray-500 focus:ring-0 cursor-pointer hover:text-gray-700"
            >
              <option :value="20">20 条/页</option>
              <option :value="50">50 条/页</option>
              <option :value="100">100 条/页</option>
            </select>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.animate-fadeIn {
  animation: fadeIn 0.2s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>