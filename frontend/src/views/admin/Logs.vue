<script setup>
import { ref, reactive, onMounted, watch, computed } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '../../stores/user'

const userStore = useUserStore()
// 保持与之前文件一致，使用 store getter
const isSuperAdmin = computed(() => userStore.isSuperAdmin)

// --- 状态定义 ---
const logs = ref([])
const logTotal = ref(0)
const logPage = ref(1)
const logLimit = ref(20)
const logFilter = reactive({ username: '', action: '' })
const selectedLogIds = ref(new Set())
const loading = ref(false)
const deleteLoading = ref(false)

const logActions = [
  'LOGIN', 'UPLOAD', 'CREATE_ACTIVITY', 'UPDATE_ACTIVITY', 'DELETE_ACTIVITY',
  'CREATE_MEMBER', 'UPDATE_MEMBER', 'DELETE_MEMBER',
  'CREATE_HISTORY', 'UPDATE_HISTORY', 'DELETE_HISTORY',
  'UPDATE_CONFIG', 'CREATE_USER', 'DELETE_USER', 'RESET_PWD',
  'UPDATE_PROFILE'
]

// 计算总页数
const totalPages = computed(() => Math.ceil(logTotal.value / logLimit.value) || 1)

// --- 数据获取 ---
const fetchLogs = async () => {
  loading.value = true
  try {
    const params = { 
      page: logPage.value, 
      limit: logLimit.value, 
      username: logFilter.username || undefined, // 空字符串转 undefined 避免传空参
      action: logFilter.action || undefined 
    }
    const res = await axios.get('/api/admin/logs', { params })
    
    // 兼容后端可能返回的两种格式
    if (res.data.logs) { 
      logs.value = res.data.logs; 
      logTotal.value = res.data.total 
    } else { 
      // 假设如果返回数组则没有分页元数据
      logs.value = res.data; 
      logTotal.value = res.data.length 
    }
    
    selectedLogIds.value.clear()
  } catch (err) {
    ElMessage.error('日志加载失败')
  } finally {
    loading.value = false
  }
}

// 初始化
onMounted(() => fetchLogs())

// --- 监听器 ---
// 单独监听 limit，重置页码
watch(logLimit, () => {
  logPage.value = 1
  fetchLogs()
})

// 监听页码变化
watch(logPage, () => {
  fetchLogs()
})

// --- 业务逻辑 ---

const formatTime = (timeStr) => {
  if (!timeStr) return '-'
  const date = new Date(timeStr)
  return date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const toggleLogSelect = (id) => { 
    if (selectedLogIds.value.has(id)) selectedLogIds.value.delete(id)
    else selectedLogIds.value.add(id) 
}

const toggleAllLogs = () => { 
    // 仅选中当前页显示的日志
    const currentIds = logs.value.map(l => l.id)
    const allSelected = currentIds.every(id => selectedLogIds.value.has(id))
    
    if (allSelected) {
        currentIds.forEach(id => selectedLogIds.value.delete(id))
    } else {
        currentIds.forEach(id => selectedLogIds.value.add(id))
    }
}

// 检查当前页是否全选
const isAllSelected = computed(() => {
    return logs.value.length > 0 && logs.value.every(l => selectedLogIds.value.has(l.id))
})

const batchDeleteLogs = async () => {
  const count = selectedLogIds.value.size
  if (count === 0) return ElMessage.warning('未选择日志')

  try {
    await ElMessageBox.confirm(`确定永久删除选中的 ${count} 条日志吗？`, '批量删除', { 
        type: 'warning',
        confirmButtonClass: 'el-button--danger'
    })
    
    deleteLoading.value = true
    const ids = Array.from(selectedLogIds.value)
    
    // 优化：改为串行或小批次请求，防止并发过高炸库或触发防火墙
    // 这里使用简单的 for...of 串行删除
    let successCount = 0
    for (const id of ids) {
        try {
            await axios.delete(`/api/admin/logs/${id}`)
            successCount++
        } catch (e) {
            console.error(`ID ${id} 删除失败`, e)
        }
    }

    if (successCount === ids.length) {
        ElMessage.success('删除成功')
    } else {
        ElMessage.warning(`删除完成，但有 ${ids.length - successCount} 条失败`)
    }
    
    selectedLogIds.value.clear()
    fetchLogs()
  } catch (err) {
    if (err !== 'cancel') ElMessage.error('操作已取消或出错')
  } finally {
    deleteLoading.value = false
  }
}

const deleteLog = async (id) => {
  try {
    await ElMessageBox.confirm('确定删除该日志吗？', '提示', { type: 'warning' })
    await axios.delete(`/api/admin/logs/${id}`)
    ElMessage.success('已删除')
    // 如果当前页只有一条数据且被删除了，向前翻页
    if (logs.value.length === 1 && logPage.value > 1) {
        logPage.value--
    } else {
        fetchLogs()
    }
  } catch (err) {
    if (err !== 'cancel') ElMessage.error('删除失败')
  }
}
</script>

<template>
  <div class="bg-white p-6 rounded-xl shadow-sm border-t-4 border-gray-500">
    <!-- 头部工具栏 -->
    <div class="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
      <h2 class="font-bold text-lg flex items-center gap-2">
        🔍 系统日志 
        <span class="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Total: {{ logTotal }}</span>
      </h2>
      
      <div class="flex flex-wrap gap-2 text-sm w-full md:w-auto">
        <input 
            v-model="logFilter.username" 
            placeholder="按操作人搜索..." 
            class="border border-gray-300 px-3 py-1.5 rounded-lg w-full sm:w-32 focus:ring-2 focus:ring-gray-200 outline-none"
            @keyup.enter="logPage=1;fetchLogs()"
        >
        <div class="relative w-full sm:w-auto">
            <select v-model="logFilter.action" class="appearance-none border border-gray-300 px-3 py-1.5 pr-8 rounded-lg w-full bg-white focus:ring-2 focus:ring-gray-200 outline-none">
            <option value="">所有动作类型</option>
            <option v-for="act in logActions" :key="act" :value="act">{{act}}</option>
            </select>
            <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
            </div>
        </div>

        <button @click="logPage=1;fetchLogs()" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg font-medium transition shadow-sm w-full sm:w-auto">
            查询
        </button>
        
        <button 
            v-if="isSuperAdmin && selectedLogIds.size > 0" 
            @click="batchDeleteLogs" 
            :disabled="deleteLoading"
            class="bg-red-500 hover:bg-red-600 text-white px-4 py-1.5 rounded-lg font-medium transition shadow-sm w-full sm:w-auto flex items-center justify-center gap-2"
        >
            <span v-if="deleteLoading" class="animate-spin">⚙️</span>
            批量删除 ({{selectedLogIds.size}})
        </button>
      </div>
    </div>

    <!-- 列表容器 -->
    <div class="relative min-h-[300px]">
        <!-- Loading 遮罩 -->
        <div v-if="loading" class="absolute inset-0 bg-white/80 z-10 flex items-center justify-center">
            <div class="flex flex-col items-center text-gray-400">
                <span class="animate-spin text-3xl mb-2">⏳</span>
                <span class="text-sm">加载日志中...</span>
            </div>
        </div>

        <!-- 移动端卡片视图 -->
        <div class="md:hidden space-y-3">
            <div v-for="log in logs" :key="log.id" class="border rounded-lg p-4 bg-gray-50 hover:bg-gray-100 transition relative group">
                <div class="flex items-start justify-between gap-2 mb-2">
                    <div class="flex items-center gap-2">
                         <div v-if="isSuperAdmin" class="shrink-0">
                            <input type="checkbox" :checked="selectedLogIds.has(log.id)" @change="toggleLogSelect(log.id)" class="w-4 h-4 rounded text-blue-600">
                        </div>
                        <div class="text-xs text-gray-500 font-mono">{{ formatTime(log.created_at) }}</div>
                    </div>
                    <span class="inline-block bg-white px-2 py-0.5 rounded text-xs border font-bold text-gray-700 shadow-sm">{{ log.action }}</span>
                </div>
                
                <div class="flex items-center gap-2 mb-2">
                    <div class="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                        {{ log.username ? log.username.charAt(0).toUpperCase() : '?' }}
                    </div>
                    <div class="text-sm font-bold text-gray-800">{{ log.username || '未知用户' }}</div>
                </div>

                <div class="text-xs text-gray-600 break-words bg-white p-2 rounded border border-gray-200 font-mono leading-relaxed">
                    {{ log.details || '-' }}
                </div>
                
                <div v-if="isSuperAdmin" class="mt-3 flex justify-end">
                    <button @click="deleteLog(log.id)" class="text-red-500 text-xs px-2 py-1 hover:bg-red-50 rounded">删除记录</button>
                </div>
            </div>
            
             <div v-if="!loading && logs.length === 0" class="text-center py-8 text-gray-400 text-sm">暂无日志数据</div>
        </div>

        <!-- PC端表格视图 -->
        <div class="hidden md:block overflow-x-auto rounded-lg border border-gray-100">
            <table class="w-full text-sm text-left">
                <thead class="bg-gray-50 text-gray-700 uppercase text-xs">
                    <tr>
                        <th class="p-3 w-10 text-center" v-if="isSuperAdmin">
                            <input type="checkbox" :checked="isAllSelected" @change="toggleAllLogs" class="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer">
                        </th>
                        <th class="p-3 w-48">时间</th>
                        <th class="p-3 w-32">操作人</th>
                        <th class="p-3 w-40">动作类型</th>
                        <th class="p-3">详情内容</th>
                        <th class="p-3 text-right w-20" v-if="isSuperAdmin">操作</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    <tr v-for="log in logs" :key="log.id" class="hover:bg-gray-50 transition group">
                        <td class="p-3 text-center" v-if="isSuperAdmin">
                            <input type="checkbox" :checked="selectedLogIds.has(log.id)" @change="toggleLogSelect(log.id)" class="w-4 h-4 rounded text-blue-600 cursor-pointer">
                        </td>
                        <td class="p-3 font-mono text-xs text-gray-500">{{ formatTime(log.created_at) }}</td>
                        <td class="p-3 font-medium text-gray-800">{{ log.username }}</td>
                        <td class="p-3">
                            <span class="bg-white px-2 py-1 rounded text-xs border text-gray-600 shadow-sm inline-block min-w-[80px] text-center">{{ log.action }}</span>
                        </td>
                        <td class="p-3 text-gray-600">
                            <div class="truncate max-w-xs cursor-help font-mono text-xs" :title="log.details">{{ log.details || '-' }}</div>
                        </td>
                        <td class="p-3 text-right" v-if="isSuperAdmin">
                            <button @click="deleteLog(log.id)" class="text-gray-400 hover:text-red-600 w-8 h-8 rounded-full hover:bg-red-50 transition flex items-center justify-center">
                                ×
                            </button>
                        </td>
                    </tr>
                    <tr v-if="!loading && logs.length === 0">
                        <td :colspan="isSuperAdmin ? 6 : 5" class="p-8 text-center text-gray-400">暂无日志数据</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>

    <!-- 分页控件 -->
    <div class="flex flex-col sm:flex-row justify-between items-center mt-6 pt-4 border-t border-gray-100 text-sm text-gray-600 gap-4">
      <div>当前显示 {{ logs.length }} 条 / 共 {{ logTotal }} 条</div>
      
      <div class="flex items-center gap-2">
        <button 
            :disabled="logPage <= 1 || loading" 
            @click="logPage--" 
            class="px-3 py-1 border rounded bg-white hover:bg-gray-50 disabled:opacity-50 disabled:bg-gray-50 transition shadow-sm"
        >
            上一页
        </button>
        
        <span class="mx-2 font-mono bg-gray-100 px-2 py-1 rounded text-xs">{{ logPage }} / {{ totalPages }}</span>
        
        <button 
            :disabled="logPage >= totalPages || loading" 
            @click="logPage++" 
            class="px-3 py-1 border rounded bg-white hover:bg-gray-50 disabled:opacity-50 disabled:bg-gray-50 transition shadow-sm"
        >
            下一页
        </button>
        
        <select v-model="logLimit" class="ml-2 border rounded p-1 bg-white focus:ring-2 focus:ring-blue-100 outline-none cursor-pointer">
            <option :value="20">20条/页</option>
            <option :value="50">50条/页</option>
            <option :value="100">100条/页</option>
        </select>
      </div>
    </div>
  </div>
</template>