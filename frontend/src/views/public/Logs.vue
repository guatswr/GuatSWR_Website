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

const logActions = [
  'LOGIN', 'UPLOAD', 'CREATE_ACTIVITY', 'UPDATE_ACTIVITY', 'DELETE_ACTIVITY',
  'CREATE_MEMBER', 'UPDATE_MEMBER', 'DELETE_MEMBER',
  'CREATE_HISTORY', 'UPDATE_HISTORY', 'DELETE_HISTORY',
  'UPDATE_CONFIG', 'CREATE_USER', 'DELETE_USER', 'RESET_PWD',
  'UPDATE_PROFILE'
]

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
  try {
    const params = { page: logPage.value, limit: logLimit.value, username: logFilter.username, action: logFilter.action }
    const res = await axios.get('/api/logs', { params })
    logs.value = res.data.logs || []
    logTotal.value = res.data.total || 0
  } catch (err) {
    errorMsg.value = '后端连接异常，请联系管理员Taropoi'
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
  <div class="min-h-screen bg-gray-50 font-sans py-10">
    <div class="max-w-6xl mx-auto px-4">
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-gray-800 font-serif">📜 近期日志</h1>
        <p class="text-sm text-gray-500 mt-1">Gensokyo Logbook</p>
      </div>

      <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-6">
        <h2 class="font-bold text-lg mb-4">🏅 有效编辑用户排名</h2>
        <div v-if="stats.length === 0" class="text-sm text-gray-400">暂无统计</div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div v-for="(s, idx) in stats" :key="idx" class="flex items-center gap-3 bg-gray-50 border rounded-lg p-3">
            <div class="w-10 h-10 rounded-full overflow-hidden bg-gray-200">
              <img v-if="s.user_avatar" :src="s.user_avatar" class="w-full h-full object-cover" alt="avatar">
              <div v-else class="w-full h-full flex items-center justify-center text-xs text-gray-500">ID</div>
            </div>
            <div class="flex-1">
              <div class="text-sm font-bold text-gray-800">{{ s.username || 'Unknown' }}</div>
              <div class="text-xs text-gray-500">ID: {{ s.user_id || '-' }}</div>
            </div>
            <div class="text-sm font-mono text-red-500">{{ s.count }}</div>
          </div>
        </div>
      </div>

      <div class="bg-white p-6 rounded-xl shadow-sm border-t-4 border-gray-500">
        <div class="flex flex-wrap items-center justify-between mb-4 gap-2">
          <h2 class="font-bold text-lg">🔍 日志明细</h2>
          <div class="flex gap-2 text-sm">
            <input v-model="logFilter.username" placeholder="操作人" class="border p-1 rounded w-24">
            <select v-model="logFilter.action" class="border p-1 rounded w-32 bg-white"><option value="">全部动作</option><option v-for="act in logActions" :key="act" :value="act">{{act}}</option></select>
            <button @click="handleSearch" class="bg-blue-500 text-white px-3 rounded">查询</button>
          </div>
        </div>

        <div v-if="errorMsg" class="text-center py-10 text-red-500">
          <p class="font-bold">{{ errorMsg }}</p>
        </div>
        <div v-else class="overflow-x-auto min-h-[300px]">
          <table class="w-full text-sm text-left">
            <thead class="bg-gray-50 text-gray-700"><tr><th class="p-2">时间</th><th class="p-2">操作人</th><th class="p-2">动作</th><th class="p-2">详情</th></tr></thead>
            <tbody>
              <tr v-for="log in logs" :key="log.id" class="border-b hover:bg-gray-50">
                <td class="p-2 font-mono text-xs text-gray-500">{{ new Date(log.created_at).toLocaleString() }}</td>
                <td class="p-2 font-bold">
                  <div class="flex items-center gap-2">
                    <img v-if="log.user_avatar" :src="log.user_avatar" class="w-6 h-6 rounded-full object-cover" alt="avatar">
                    <span>{{ log.username }}</span>
                  </div>
                </td>
                <td class="p-2"><span class="bg-gray-100 px-2 py-0.5 rounded text-xs border">{{ log.action }}</span></td>
                <td class="p-2 text-gray-600 truncate max-w-xs" :title="log.details">{{ log.details }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="flex justify-between items-center mt-4 border-t pt-2 text-sm text-gray-600">
          <div>共 {{ logTotal }} 条</div>
          <div class="flex items-center gap-2">
            <button :disabled="logPage<=1" @click="logPage--;fetchLogs()" class="px-2 py-1 border rounded disabled:opacity-50">上一页</button>
            <span>第 {{ logPage }} 页</span>
            <button :disabled="logs.length<logLimit" @click="logPage++;fetchLogs()" class="px-2 py-1 border rounded disabled:opacity-50">下一页</button>
            <select v-model="logLimit" @change="fetchLogs()" class="border rounded p-1 bg-white"><option :value="20">20条/页</option><option :value="50">50条/页</option><option :value="100">100条/页</option></select>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
