<script setup>
import { ref, reactive, onMounted, computed, watch, nextTick } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { compressImage, getThumbUrl } from '../../utils/image'
import { useUserStore } from '../../stores/user'

const historyList = ref([])
const isEditingHistory = ref(false)
const histForm = reactive({ id: null, date: '', title: '', description: '', image: '', sort_order: 0 })
const showDeleted = ref(false)
const userStore = useUserStore()
const isSuperAdmin = computed(() => userStore.isSuperAdmin)
const descRef = ref(null)

const fetchHistory = async () => {
  try {
    let url = '/api/history'
    if (showDeleted.value && isSuperAdmin.value) url += '?includeDeleted=1'
    const res = await axios.get(url)
    historyList.value = res.data
  } catch (e) {
    ElMessage.error('加载群史失败')
  }
}

onMounted(() => {
  fetchHistory()
})

watch(showDeleted, () => {
  fetchHistory()
})

const uploadFile = async (file) => {
  const compressed = await compressImage(file)
  const d = new FormData()
  d.append('file', compressed)
  const r = await axios.post('/api/upload', d)
  return r.data.url
}

const resetHistForm = () => {
  isEditingHistory.value = false
  Object.assign(histForm, { id: null, date: '', title: '', description: '', image: '', sort_order: 0 })
}

const handleHistImageUpload = async (e) => {
  if (e.target.files[0]) {
    try { histForm.image = await uploadFile(e.target.files[0]) } catch (e) { ElMessage.error('图片上传失败') }
  }
}

const editHistory = (h) => {
  isEditingHistory.value = true
  Object.assign(histForm, h)
  window.scrollTo(0, 0)
}

const submitHistory = async () => {
  try {
    await ElMessageBox.confirm('确认提交该群史记录？', '确认提交', { type: 'warning' })
    if (isEditingHistory.value) await axios.put(`/api/history/${histForm.id}`, histForm)
    else await axios.post('/api/history', histForm)
    resetHistForm()
    await fetchHistory()
    ElMessage.success('提交成功')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('提交失败')
  }
}

const deleteHistory = async (id) => {
  try {
    await ElMessageBox.confirm('确定删除该记录吗？', '提示', { type: 'warning' })
    await axios.delete(`/api/history/${id}`)
    await fetchHistory()
    ElMessage.success('删除成功')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
  }
}

const restoreHistory = async (id) => {
  try {
    await ElMessageBox.confirm('确认恢复该记录吗？', '恢复确认', { type: 'warning' })
    await axios.post(`/api/history/${id}/restore`)
    await fetchHistory()
    ElMessage.success('已恢复')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('恢复失败')
  }
}

const moveHistory = async (item, dir) => {
  const ord = dir === 'up' ? (item.sort_order || 0) - 1 : (item.sort_order || 0) + 1
  try {
    await axios.put(`/api/history/${item.id}`, { ...item, sort_order: ord })
    await fetchHistory()
  } catch (e) {
    ElMessage.error('排序失败')
  }
}

const wrapSelection = async (prefix, suffix = prefix) => {
  const el = descRef.value
  if (!el) return
  const start = el.selectionStart || 0
  const end = el.selectionEnd || 0
  const selected = histForm.description.slice(start, end)
  histForm.description = `${histForm.description.slice(0, start)}${prefix}${selected}${suffix}${histForm.description.slice(end)}`
  await nextTick()
  const cursor = start + prefix.length + selected.length + suffix.length
  el.focus()
  el.setSelectionRange(cursor, cursor)
}

const applyAlign = async (align) => {
  const el = descRef.value
  if (!el) return
  const start = el.selectionStart || 0
  const end = el.selectionEnd || 0
  if (start === end) {
    histForm.description = `<div style="text-align:${align}">${histForm.description}</div>`
  } else {
    const selected = histForm.description.slice(start, end)
    histForm.description = `${histForm.description.slice(0, start)}<div style="text-align:${align}">${selected}</div>${histForm.description.slice(end)}`
  }
  await nextTick()
  el.focus()
}
</script>

<template>
  <div class="grid lg:grid-cols-2 gap-8">
    <div class="bg-white p-6 rounded-xl shadow-sm border-t-4 border-yellow-500 h-fit">
      <h2 class="font-bold text-lg text-gray-800 mb-4">{{ isEditingHistory ? '✏️ 编辑历史' : '📜 记录新历史' }}</h2>
      <div class="space-y-4">
        <div class="grid grid-cols-3 gap-4">
          <div class="col-span-1"><input v-model="histForm.date" type="date" class="w-full border rounded px-3 py-2"></div>
          <div class="col-span-2"><input v-model="histForm.title" type="text" class="w-full border rounded px-3 py-2" placeholder="事件标题"></div>
        </div>
        <div class="flex items-center gap-4 border p-2 rounded border-dashed bg-gray-50">
          <img v-if="histForm.image" :src="histForm.image" class="w-16 h-10 object-cover rounded bg-gray-200">
          <input @change="handleHistImageUpload" type="file" accept="image/*" class="text-sm">
        </div>
        <div class="flex flex-wrap gap-2 items-center">
          <span class="text-xs text-gray-500">正文格式：</span>
          <button type="button" @click="wrapSelection('<strong>', '</strong>')" class="text-xs px-2 py-1 rounded border bg-white hover:bg-gray-50">加粗</button>
          <button type="button" @click="wrapSelection('<em>', '</em>')" class="text-xs px-2 py-1 rounded border bg-white hover:bg-gray-50">斜体</button>
          <button type="button" @click="applyAlign('left')" class="text-xs px-2 py-1 rounded border bg-white hover:bg-gray-50">左对齐</button>
          <button type="button" @click="applyAlign('center')" class="text-xs px-2 py-1 rounded border bg-white hover:bg-gray-50">居中</button>
          <button type="button" @click="applyAlign('right')" class="text-xs px-2 py-1 rounded border bg-white hover:bg-gray-50">右对齐</button>
        </div>
        <textarea ref="descRef" v-model="histForm.description" rows="6" class="w-full border rounded px-3 py-2" placeholder="描述（支持基础 HTML 格式）"></textarea>
        <input v-model.number="histForm.sort_order" type="number" class="w-20 border rounded px-2 py-1" placeholder="排序">
        <button @click="submitHistory" class="w-full bg-yellow-600 text-white py-2 rounded shadow-md">提交</button>
        <button v-if="isEditingHistory" @click="resetHistForm" class="w-full text-xs text-gray-500 mt-1">取消</button>
      </div>
    </div>
    <div class="bg-white p-6 rounded-xl shadow-sm h-fit">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-lg font-bold">时间轴预览</h2>
        <button v-if="isSuperAdmin" @click="showDeleted = !showDeleted" class="text-xs px-2 py-1 rounded border">
          {{ showDeleted ? '隐藏已删除' : '显示已删除' }}
        </button>
      </div>
      <div class="space-y-3 max-h-[800px] overflow-y-auto custom-scrollbar">
        <div v-for="item in historyList" :key="item.id" class="flex gap-4 p-4 border-l-4 border-yellow-200 bg-yellow-50/30 rounded-r-lg">
          <div class="flex flex-col items-center gap-1">
            <button v-if="!item.deleted_at" @click="moveHistory(item, 'up')" class="text-xs">▲</button>
            <span class="text-xs font-mono text-gray-400">{{ item.sort_order || 0 }}</span>
            <button v-if="!item.deleted_at" @click="moveHistory(item, 'down')" class="text-xs">▼</button>
          </div>
          <div class="flex-grow min-w-0">
            <div class="flex justify-between"><h3 class="font-bold">{{ item.title }}</h3><span class="text-xs bg-white px-2 py-1 rounded border">{{ item.date }}</span></div>
            <div class="text-xs text-gray-600 mt-1 line-clamp-2" v-html="item.description"></div>
            <div class="mt-2 flex gap-3">
              <button v-if="!item.deleted_at" @click="editHistory(item)" class="text-xs text-blue-600 font-bold">编辑</button>
              <button v-if="!item.deleted_at" @click="deleteHistory(item.id)" class="text-xs text-red-600 font-bold">删除</button>
              <button v-if="item.deleted_at && isSuperAdmin" @click="restoreHistory(item.id)" class="text-xs text-green-600 font-bold">恢复</button>
            </div>
            <div v-if="item.deleted_at" class="text-[10px] text-gray-600 mt-2">🗑️ 已删除</div>
          </div>
          <img
            v-if="item.image"
            :src="getThumbUrl(item.image)"
            @error="(e) => (e.target.src = item.image)"
            class="w-16 h-16 object-cover rounded border bg-white shrink-0"
          >
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-track { background: #f1f1f1; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
</style>
