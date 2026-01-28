<script setup>
import { ref, reactive, onMounted, onUnmounted, watch, computed } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '../../stores/user'

const userStore = useUserStore()
const isSuperAdmin = computed(() => userStore.role === 'super_admin')

const logs = ref([])
const logTotal = ref(0)
const logPage = ref(1)
const logLimit = ref(20)
const logFilter = reactive({ username: '', action: '' })
const selectedLogIds = ref(new Set())
const loading = ref(false)

const logActions = [
  'LOGIN', 'UPLOAD', 'CREATE_ACTIVITY', 'UPDATE_ACTIVITY', 'DELETE_ACTIVITY',
  'CREATE_MEMBER', 'UPDATE_MEMBER', 'DELETE_MEMBER',
  'CREATE_HISTORY', 'UPDATE_HISTORY', 'DELETE_HISTORY',
  'UPDATE_CONFIG', 'CREATE_USER', 'DELETE_USER', 'RESET_PWD',
  'UPDATE_PROFILE'
]

const fetchLogs = async () => {
  try {
    const params = { page: logPage.value, limit: logLimit.value, username: logFilter.username, action: logFilter.action }
    const res = await axios.get('/api/admin/logs', { params })
    if (res.data.logs) { logs.value = res.data.logs; logTotal.value = res.data.total }
    else { logs.value = res.data; logTotal.value = res.data.length }
    selectedLogIds.value.clear()
  } catch (err) {
    ElMessage.error('日志加载失败')
  }
}

onMounted(() => fetchLogs())
watch([logPage, logLimit], () => fetchLogs())

onUnmounted(() => {
  logs.value = []
  logTotal.value = 0
  logPage.value = 1
  logLimit.value = 20
  logFilter.username = ''
  logFilter.action = ''
  selectedLogIds.value.clear()
})

const toggleLogSelect = (id) => { if (selectedLogIds.value.has(id)) selectedLogIds.value.delete(id); else selectedLogIds.value.add(id) }
const toggleAllLogs = () => { if (selectedLogIds.value.size === logs.value.length) selectedLogIds.value.clear(); else logs.value.forEach(l => selectedLogIds.value.add(l.id)) }

const batchDeleteLogs = async () => {
  if (selectedLogIds.value.size === 0) return ElMessage.warning('未选择')
  try {
    await ElMessageBox.confirm(`确定删除 ${selectedLogIds.value.size} 条日志吗？`, '提示', { type: 'warning' })
    loading.value = true
    await Promise.all(Array.from(selectedLogIds.value).map(id => axios.delete(`/api/admin/logs/${id}`)))
    ElMessage.success('删除成功')
    selectedLogIds.value.clear()
    fetchLogs()
  } catch (err) {
    if (err !== 'cancel') ElMessage.error('出错')
  } finally {
    loading.value = false
  }
}

const deleteLog = async (id) => {
  try {
    await ElMessageBox.confirm('确定删除该日志吗？', '提示', { type: 'warning' })
    await axios.delete(`/api/admin/logs/${id}`)
    fetchLogs()
  } catch (err) {
    if (err !== 'cancel') ElMessage.error('删除失败')
  }
}
</script>

<template>
  <div class="bg-white p-6 rounded-xl shadow-sm border-t-4 border-gray-500">
    <div class="flex flex-wrap items-center justify-between mb-4 gap-2">
      <h2 class="font-bold text-lg">🔍 系统日志</h2>
      <div class="flex flex-wrap gap-2 text-sm w-full md:w-auto">
        <input v-model="logFilter.username" placeholder="操作人" class="border p-1 rounded w-full sm:w-24">
        <select v-model="logFilter.action" class="border p-1 rounded w-full sm:w-32 bg-white">
          <option value="">全部动作</option>
          <option v-for="act in logActions" :key="act" :value="act">{{act}}</option>
        </select>
        <button @click="logPage=1;fetchLogs()" class="bg-blue-500 text-white px-3 py-1 rounded w-full sm:w-auto">查询</button>
        <button v-if="isSuperAdmin && selectedLogIds.size > 0" @click="batchDeleteLogs" class="bg-red-500 text-white px-3 py-1 rounded w-full sm:w-auto">删除选中 ({{selectedLogIds.size}})</button>
      </div>
    </div>
    <div class="md:hidden space-y-3">
      <div v-for="log in logs" :key="log.id" class="border rounded-lg p-3 bg-gray-50">
        <div class="flex items-start justify-between gap-2">
          <div class="text-xs text-gray-500 font-mono">{{ new Date(log.created_at).toLocaleString() }}</div>
          <div v-if="isSuperAdmin" class="shrink-0">
            <input type="checkbox" :checked="selectedLogIds.has(log.id)" @change="toggleLogSelect(log.id)">
          </div>
        </div>
        <div class="mt-2 text-sm font-bold text-gray-800">{{ log.username }}</div>
        <div class="mt-1">
          <span class="inline-block bg-gray-100 px-2 py-0.5 rounded text-xs border">{{ log.action }}</span>
        </div>
        <div class="mt-2 text-xs text-gray-600 break-words">{{ log.details || '-' }}</div>
        <div v-if="isSuperAdmin" class="mt-3 flex items-center justify-between">
          <button @click="deleteLog(log.id)" class="text-red-500 text-xs">删除</button>
        </div>
      </div>
    </div>
    <div class="hidden md:block overflow-x-auto min-h-[400px]">
      <table class="w-full text-sm text-left">
        <thead class="bg-gray-50 text-gray-700"><tr><th class="p-2 w-10 text-center" v-if="isSuperAdmin"><input type="checkbox" :checked="selectedLogIds.size===logs.length && logs.length>0" @change="toggleAllLogs"></th><th class="p-2">时间</th><th class="p-2">操作人</th><th class="p-2">动作</th><th class="p-2">详情</th><th class="p-2 text-right" v-if="isSuperAdmin">操作</th></tr></thead>
        <tbody>
          <tr v-for="log in logs" :key="log.id" class="border-b hover:bg-gray-50">
            <td class="p-2 text-center" v-if="isSuperAdmin"><input type="checkbox" :checked="selectedLogIds.has(log.id)" @change="toggleLogSelect(log.id)"></td>
            <td class="p-2 font-mono text-xs text-gray-500">{{ new Date(log.created_at).toLocaleString() }}</td>
            <td class="p-2 font-bold">{{ log.username }}</td>
            <td class="p-2"><span class="bg-gray-100 px-2 py-0.5 rounded text-xs border">{{ log.action }}</span></td>
            <td class="p-2 text-gray-600 truncate max-w-xs" :title="log.details">{{ log.details }}</td>
            <td class="p-2 text-right" v-if="isSuperAdmin"><button @click="deleteLog(log.id)" class="text-red-400 hover:text-red-600">×</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="flex justify-between items-center mt-4 border-t pt-2 text-sm text-gray-600">
      <div>共 {{ logTotal }} 条</div>
      <div class="flex items-center gap-2">
        <button :disabled="logPage<=1" @click="logPage--" class="px-2 py-1 border rounded disabled:opacity-50">上一页</button>
        <span>第 {{ logPage }} 页</span>
        <button :disabled="logs.length<logLimit" @click="logPage++" class="px-2 py-1 border rounded disabled:opacity-50">下一页</button>
        <select v-model="logLimit" class="border rounded p-1 bg-white"><option :value="20">20条/页</option><option :value="50">50条/页</option><option :value="100">100条/页</option></select>
      </div>
    </div>
  </div>
</template>
