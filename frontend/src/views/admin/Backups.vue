<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '../../stores/user'

const userStore = useUserStore()
const isSuperAdmin = computed(() => userStore.isSuperAdmin)

const settings = reactive({ enabled: false, time: '02:30', lastRun: '', lastError: '' })
const dbBackups = ref([])
const uploadsBackups = ref([])
const loading = ref(false)
const download = reactive({
  active: false,
  percent: 0,
  name: ''
})

const formatSize = (size) => {
  if (size == null) return '-'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`
}

const formatTime = (ms) => {
  if (!ms) return '-'
  return new Date(ms).toLocaleString()
}

const fetchSettings = async () => {
  try {
    const res = await axios.get('/api/admin/backups/settings')
    Object.assign(settings, res.data || {})
  } catch (e) {
    const msg = e?.response?.data?.error || e?.response?.data?.message || '加载备份设置失败'
    ElMessage.error(msg)
  }
}

const fetchBackups = async () => {
  try {
    const res = await axios.get('/api/admin/backups')
    dbBackups.value = res.data?.db || []
    uploadsBackups.value = res.data?.uploads || []
  } catch (e) {
    const msg = e?.response?.data?.error || e?.response?.data?.message || '加载备份列表失败'
    ElMessage.error(msg)
  }
}

const runBackup = async () => {
  try {
    await ElMessageBox.confirm('确认立即执行一次数据库与上传文件备份？', '手动备份', { type: 'warning' })
    loading.value = true
    await axios.post('/api/admin/backups/run')
    ElMessage.success('备份完成')
    await Promise.all([fetchSettings(), fetchBackups()])
  } catch (e) {
    if (e !== 'cancel') {
      const msg = e?.response?.data?.error || e?.response?.data?.message || '备份失败'
      ElMessage.error(msg)
    }
  } finally {
    loading.value = false
  }
}

const saveSettings = async () => {
  try {
    await ElMessageBox.confirm('确认保存自动备份设置？', '确认保存', { type: 'warning' })
    await axios.post('/api/admin/backups/settings', { enabled: settings.enabled, time: settings.time })
    ElMessage.success('已保存')
    fetchSettings()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('保存失败')
  }
}

const downloadBackup = async (item) => {
  try {
    loading.value = true
    download.active = true
    download.percent = 0
    download.name = item.name
    const res = await axios.get('/api/admin/backups/download', {
      params: { type: item.type, file: item.name },
      responseType: 'blob',
      onDownloadProgress: (event) => {
        if (!event.total) return
        download.percent = Math.min(100, Math.round((event.loaded / event.total) * 100))
      }
    })
    const blob = new Blob([res.data])
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = item.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  } catch (e) {
    ElMessage.error('下载失败')
  } finally {
    loading.value = false
    download.active = false
    download.name = ''
    download.percent = 0
  }
}

const deleteBackup = async (item) => {
  try {
    await ElMessageBox.confirm(`确认删除备份 ${item.name}？`, '删除确认', { type: 'warning' })
    await axios.delete('/api/admin/backups', { params: { type: item.type, file: item.name } })
    ElMessage.success('已删除')
    fetchBackups()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
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
    <div class="bg-white p-6 rounded-xl shadow-sm border-t-4 border-emerald-500">
      <h2 class="font-bold mb-4 text-lg">🗄️ 自动备份设置</h2>
      <div class="space-y-4 text-sm">
        <div class="flex items-center gap-3">
          <label class="font-semibold">自动备份</label>
          <input v-model="settings.enabled" type="checkbox" class="w-4 h-4">
          <span class="text-gray-500">开启后每天按设定时间执行</span>
        </div>
        <div class="flex items-center gap-3">
          <label class="font-semibold">执行时间</label>
          <input v-model="settings.time" type="time" class="border rounded px-2 py-1">
          <span class="text-gray-500">当前：{{ settings.time }}</span>
        </div>
        <div class="text-gray-500">上次执行：{{ settings.lastRun || '暂无' }}</div>
        <div v-if="settings.lastError" class="text-xs text-red-600">上次错误：{{ settings.lastError }}</div>
        <div class="flex flex-wrap gap-2">
          <button @click="saveSettings" class="bg-emerald-600 text-white px-6 py-2 rounded">保存设置</button>
          <button @click="runBackup" class="bg-blue-600 text-white px-6 py-2 rounded" :disabled="loading">手动备份</button>
        </div>
        <div v-if="download.active" class="mt-3">
          <div class="text-xs text-gray-500 mb-1">下载中：{{ download.name }}</div>
          <div class="w-full h-2 bg-gray-200 rounded">
            <div class="h-2 bg-blue-500 rounded" :style="{ width: download.percent + '%' }"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="bg-white p-6 rounded-xl shadow-sm border-t-4 border-blue-500">
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-bold text-lg">📦 数据库备份</h2>
        <button @click="fetchBackups" class="text-sm text-blue-600 hover:text-blue-800">刷新</button>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm text-left">
          <thead class="bg-gray-50 text-gray-700">
            <tr>
              <th class="p-2">文件名</th>
              <th class="p-2">大小</th>
              <th class="p-2">时间</th>
              <th class="p-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in dbBackups" :key="item.name" class="border-b hover:bg-gray-50">
              <td class="p-2 font-mono text-xs">{{ item.name }}</td>
              <td class="p-2">{{ formatSize(item.size) }}</td>
              <td class="p-2">{{ formatTime(item.mtime) }}</td>
              <td class="p-2 text-right space-x-2">
                <button @click="downloadBackup(item)" class="text-blue-600 hover:text-blue-800" :disabled="download.active">下载</button>
                <button @click="deleteBackup(item)" class="text-red-500 hover:text-red-700">删除</button>
              </td>
            </tr>
            <tr v-if="dbBackups.length === 0">
              <td class="p-2 text-gray-500" colspan="4">暂无备份</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="bg-white p-6 rounded-xl shadow-sm border-t-4 border-purple-500">
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-bold text-lg">🧳 上传文件备份</h2>
        <button @click="fetchBackups" class="text-sm text-purple-600 hover:text-purple-800">刷新</button>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm text-left">
          <thead class="bg-gray-50 text-gray-700">
            <tr>
              <th class="p-2">文件名</th>
              <th class="p-2">大小</th>
              <th class="p-2">时间</th>
              <th class="p-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in uploadsBackups" :key="item.name" class="border-b hover:bg-gray-50">
              <td class="p-2 font-mono text-xs">{{ item.name }}</td>
              <td class="p-2">{{ formatSize(item.size) }}</td>
              <td class="p-2">{{ formatTime(item.mtime) }}</td>
              <td class="p-2 text-right space-x-2">
                <button @click="downloadBackup(item)" class="text-blue-600 hover:text-blue-800" :disabled="download.active">下载</button>
                <button @click="deleteBackup(item)" class="text-red-500 hover:text-red-700">删除</button>
              </td>
            </tr>
            <tr v-if="uploadsBackups.length === 0">
              <td class="p-2 text-gray-500" colspan="4">暂无备份</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <div v-else class="bg-white p-6 rounded-xl shadow-sm border-t-4 border-gray-400">
    <p class="text-gray-600">仅站长可访问备份管理。</p>
  </div>
</template>
