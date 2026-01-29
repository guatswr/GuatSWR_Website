<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '../../stores/user'

const userStore = useUserStore()
const isSuperAdmin = computed(() => userStore.isSuperAdmin)

// Data
const settings = reactive({ enabled: false, time: '02:30', lastRun: '', lastError: '' })
// 初始化为空数组避免 undefined 报错
const dbBackups = ref([])
const uploadsBackups = ref([])

// 页面级 Loading (用于全量刷新、手动备份等互斥操作)
const pageLoading = ref(false)
// 列表项级 Loading (用于单个下载/删除，避免阻塞其他操作)
// 存储格式: `${type}-${name}`
const processingItems = reactive(new Set()) 

const download = reactive({
  active: false,
  percent: 0,
  name: ''
})

// Formatters
const formatSize = (size) => {
  if (size == null) return '-'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`
}

const formatTime = (ms) => {
  if (!ms) return '-'
  // 使用统一的中文时间格式
  return new Date(ms).toLocaleString('zh-CN', { hour12: false }) 
}

const getUniqueId = (item) => `${item.type}-${item.name}`
const isItemProcessing = (item) => processingItems.has(getUniqueId(item))

// API Interactions
const fetchSettings = async () => {
  try {
    const res = await axios.get('/api/admin/backups/settings')
    Object.assign(settings, res.data || {})
  } catch (e) {
    console.error('加载设置失败', e)
    // 设置加载失败不阻断页面渲染
  }
}

const fetchBackups = async () => {
  try {
    const res = await axios.get('/api/admin/backups')
    dbBackups.value = res.data?.db || []
    uploadsBackups.value = res.data?.uploads || []
  } catch (e) {
    ElMessage.error('加载备份列表失败')
  }
}

const runBackup = async () => {
  try {
    await ElMessageBox.confirm('确认立即执行一次数据库与上传文件备份？\n这可能需要几分钟时间，请勿关闭页面。', '手动备份', { 
      type: 'warning',
      confirmButtonText: '立即执行',
      cancelButtonText: '取消'
    })
    
    pageLoading.value = true
    // 备份可能耗时较长，设置 5 分钟超时
    await axios.post('/api/admin/backups/run', {}, { timeout: 300000 }) 
    ElMessage.success('备份任务已完成')
    await Promise.all([fetchSettings(), fetchBackups()])
  } catch (e) {
    if (e !== 'cancel') {
      const msg = e?.response?.data?.error || e?.response?.data?.message || '备份失败，请检查服务器日志'
      ElMessage.error(msg)
    }
  } finally {
    pageLoading.value = false
  }
}

const saveSettings = async () => {
  // 保存设置通常很快且风险低，移除 confirm 提升体验
  try {
    pageLoading.value = true
    await axios.post('/api/admin/backups/settings', { enabled: settings.enabled, time: settings.time })
    ElMessage.success('自动备份设置已更新')
    await fetchSettings()
  } catch (e) {
    ElMessage.error('保存设置失败')
  } finally {
    pageLoading.value = false
  }
}

const downloadBackup = async (item) => {
  const uid = getUniqueId(item)
  if (isItemProcessing(item) || download.active) return

  try {
    processingItems.add(uid)
    download.active = true
    download.percent = 0
    download.name = item.name

    const res = await axios.get('/api/admin/backups/download', {
      params: { type: item.type, file: item.name },
      responseType: 'blob', // 关键：二进制流
      timeout: 600000, // 下载大文件给予 10 分钟超时
      onDownloadProgress: (event) => {
        if (!event.total) return
        download.percent = Math.min(100, Math.round((event.loaded / event.total) * 100))
      }
    })

    // 创建 Blob URL 并触发下载
    const blob = new Blob([res.data])
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = item.name
    document.body.appendChild(a)
    a.click()
    
    // 延时清理，确保下载触发
    setTimeout(() => {
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    }, 1000)
    
  } catch (e) {
    ElMessage.error('下载失败：文件可能过大或网络连接中断')
  } finally {
    processingItems.delete(uid)
    download.active = false
    download.name = ''
    download.percent = 0
  }
}

const deleteBackup = async (item) => {
  const uid = getUniqueId(item)
  if (isItemProcessing(item)) return

  try {
    await ElMessageBox.confirm(`确认永久删除备份文件 "${item.name}"？`, '删除警告', { 
      type: 'warning', 
      confirmButtonText: '确定删除',
      confirmButtonClass: 'el-button--danger'
    })
    
    processingItems.add(uid)
    await axios.delete('/api/admin/backups', { params: { type: item.type, file: item.name } })
    ElMessage.success('已删除')
    
    // 乐观更新：先从界面移除，无需等待列表接口刷新
    if (item.type === 'db') {
      dbBackups.value = dbBackups.value.filter(b => b.name !== item.name)
    } else {
      uploadsBackups.value = uploadsBackups.value.filter(b => b.name !== item.name)
    }
    
    // 后台静默同步
    fetchBackups()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
  } finally {
    processingItems.delete(uid)
  }
}

onMounted(() => {
  if (isSuperAdmin.value) {
    fetchSettings()
    fetchBackups()
  }
})
</script>

<template>
  <div v-if="isSuperAdmin" class="space-y-6">
    <!-- 自动备份设置卡片 -->
    <div class="bg-white p-6 rounded-xl shadow-sm border-t-4 border-emerald-500 relative">
      <div v-if="pageLoading" class="absolute inset-0 bg-white/50 z-10 flex items-center justify-center rounded-xl">
        <span class="animate-spin text-2xl">⏳</span>
      </div>

      <h2 class="font-bold mb-4 text-lg flex items-center gap-2">
        🗄️ 自动备份设置
      </h2>
      
      <div class="space-y-4 text-sm">
        <div class="flex items-center gap-3">
          <label class="font-semibold select-none cursor-pointer flex items-center gap-2">
            <input v-model="settings.enabled" type="checkbox" class="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500">
            启用每日自动备份
          </label>
        </div>
        
        <div class="flex items-center gap-3">
          <label class="font-semibold">执行时间</label>
          <input v-model="settings.time" type="time" class="border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-emerald-200 outline-none">
        </div>
        
        <div class="flex gap-6 text-gray-500 bg-gray-50 p-3 rounded-lg">
           <div>
             <span class="block text-xs uppercase text-gray-400 font-bold">上次执行</span>
             {{ settings.lastRun ? formatTime(settings.lastRun) : '暂无记录' }}
           </div>
           <div v-if="settings.lastError">
             <span class="block text-xs uppercase text-red-400 font-bold">上次错误</span>
             <span class="text-red-600">{{ settings.lastError }}</span>
           </div>
        </div>

        <div class="flex flex-wrap gap-3 pt-2">
          <button 
            @click="saveSettings" 
            :disabled="pageLoading"
            class="bg-emerald-600 text-white px-6 py-2 rounded hover:bg-emerald-700 transition disabled:opacity-50 font-medium"
          >
            保存设置
          </button>
          <button 
            @click="runBackup" 
            :disabled="pageLoading"
            class="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition disabled:opacity-50 font-medium flex items-center gap-2"
          >
            <span v-if="pageLoading" class="animate-spin">🔄</span>
            手动立即备份
          </button>
        </div>
        
        <!-- 下载进度条 (全局) -->
        <div v-if="download.active" class="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
          <div class="flex justify-between text-xs text-blue-700 mb-2 font-medium">
            <span>📥 下载中: {{ download.name }}</span>
            <span>{{ download.percent }}%</span>
          </div>
          <div class="w-full h-2 bg-blue-200 rounded-full overflow-hidden">
            <div class="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out" :style="{ width: download.percent + '%' }"></div>
          </div>
          <div class="text-[10px] text-blue-400 mt-1 text-center">请保持网络连接，不要关闭页面</div>
        </div>
      </div>
    </div>

    <!-- 数据库备份列表 -->
    <div class="bg-white p-6 rounded-xl shadow-sm border-t-4 border-blue-500">
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-bold text-lg flex items-center gap-2">📦 数据库备份 <span class="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{{ dbBackups.length }}</span></h2>
        <button @click="fetchBackups" class="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1">
            刷新
        </button>
      </div>

      <!-- 响应式表格 -->
      <div class="overflow-x-auto">
        <table class="w-full text-sm text-left">
          <thead class="bg-gray-50 text-gray-700 uppercase text-xs">
            <tr>
              <th class="p-3 rounded-l-lg">文件名</th>
              <th class="p-3 w-24">大小</th>
              <th class="p-3 w-40">时间</th>
              <th class="p-3 text-right w-32 rounded-r-lg">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="item in dbBackups" :key="item.name" class="hover:bg-gray-50 transition group">
              <td class="p-3 font-mono text-xs text-gray-600">{{ item.name }}</td>
              <td class="p-3 text-gray-800">{{ formatSize(item.size) }}</td>
              <td class="p-3 text-gray-500 whitespace-nowrap">{{ formatTime(item.mtime) }}</td>
              <td class="p-3 text-right">
                <div class="flex items-center justify-end gap-3">
                    <button 
                        @click="downloadBackup({...item, type: 'db'})" 
                        :disabled="download.active || isItemProcessing({...item, type: 'db'})"
                        class="text-blue-600 hover:text-blue-800 disabled:opacity-30 disabled:cursor-not-allowed font-medium"
                    >
                        {{ isItemProcessing({...item, type: 'db'}) && download.name === item.name ? '下载中' : '下载' }}
                    </button>
                    <button 
                        @click="deleteBackup({...item, type: 'db'})" 
                        :disabled="isItemProcessing({...item, type: 'db'})"
                        class="text-red-500 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        {{ isItemProcessing({...item, type: 'db'}) && download.name !== item.name ? '...' : '删除' }}
                    </button>
                </div>
              </td>
            </tr>
            <tr v-if="dbBackups.length === 0">
              <td class="p-8 text-center text-gray-400" colspan="4">暂无数据库备份</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 上传文件备份列表 -->
    <div class="bg-white p-6 rounded-xl shadow-sm border-t-4 border-purple-500">
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-bold text-lg flex items-center gap-2">🧳 附件备份 <span class="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{{ uploadsBackups.length }}</span></h2>
        <button @click="fetchBackups" class="text-sm text-purple-600 hover:text-purple-800">刷新</button>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm text-left">
          <thead class="bg-gray-50 text-gray-700 uppercase text-xs">
            <tr>
              <th class="p-3 rounded-l-lg">文件名</th>
              <th class="p-3 w-24">大小</th>
              <th class="p-3 w-40">时间</th>
              <th class="p-3 text-right w-32 rounded-r-lg">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="item in uploadsBackups" :key="item.name" class="hover:bg-gray-50 transition">
              <td class="p-3 font-mono text-xs text-gray-600">{{ item.name }}</td>
              <td class="p-3 text-gray-800">{{ formatSize(item.size) }}</td>
              <td class="p-3 text-gray-500 whitespace-nowrap">{{ formatTime(item.mtime) }}</td>
              <td class="p-3 text-right">
                <div class="flex items-center justify-end gap-3">
                    <button 
                        @click="downloadBackup({...item, type: 'uploads'})" 
                        :disabled="download.active || isItemProcessing({...item, type: 'uploads'})"
                        class="text-blue-600 hover:text-blue-800 disabled:opacity-30 disabled:cursor-not-allowed font-medium"
                    >
                         {{ isItemProcessing({...item, type: 'uploads'}) && download.name === item.name ? '下载中' : '下载' }}
                    </button>
                    <button 
                        @click="deleteBackup({...item, type: 'uploads'})" 
                        :disabled="isItemProcessing({...item, type: 'uploads'})"
                        class="text-red-500 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                         {{ isItemProcessing({...item, type: 'uploads'}) && download.name !== item.name ? '...' : '删除' }}
                    </button>
                </div>
              </td>
            </tr>
            <tr v-if="uploadsBackups.length === 0">
              <td class="p-8 text-center text-gray-400" colspan="4">暂无附件备份</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <div v-else class="bg-white p-8 rounded-xl shadow-sm border-t-4 border-gray-400 text-center">
    <div class="text-4xl mb-4">🚫</div>
    <h3 class="text-lg font-bold text-gray-800">权限不足</h3>
    <p class="text-gray-600 mt-2">备份与恢复功能仅限站长（Super Admin）使用。</p>
  </div>
</template>