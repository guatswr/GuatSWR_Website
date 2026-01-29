<script setup>
import { ref, reactive, onMounted, computed, watch, nextTick } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { compressImage, getThumbUrl } from '../../utils/image'
import { useUserStore } from '../../stores/user'

const userStore = useUserStore()
const isSuperAdmin = computed(() => userStore.isSuperAdmin)

// --- 状态定义 ---
const historyList = ref([])
const listLoading = ref(false)
const submitLoading = ref(false)
const isEditingHistory = ref(false)
const showDeleted = ref(false)

// 表单数据
const histForm = reactive({ id: null, date: '', title: '', description: '', image: '', sort_order: 0 })

// 编辑器 Ref
const descRef = ref(null)
// 正在操作的 Item ID (用于排序/删除时的局部 loading)
const processingId = ref(null)
// 图片上传状态
const isUploadingImage = ref(false)

// --- 样式常量 (替代 CSS @apply) ---
const editorBtnClass = "px-2 py-1 text-xs rounded hover:bg-gray-200 text-gray-700 min-w-[24px] flex items-center justify-center transition-colors bg-transparent border-0 cursor-pointer"

const fetchHistory = async () => {
  listLoading.value = true
  try {
    let url = '/api/history'
    if (showDeleted.value && isSuperAdmin.value) url += '?includeDeleted=1'
    const res = await axios.get(url)
    historyList.value = res.data || []
  } catch (e) {
    ElMessage.error('加载群史失败')
  } finally {
    listLoading.value = false
  }
}

onMounted(() => {
  fetchHistory()
})

watch(showDeleted, () => {
  fetchHistory()
})

// --- 核心业务逻辑 ---

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
  const file = e.target.files[0]
  if (file) {
    try { 
      isUploadingImage.value = true
      histForm.image = await uploadFile(file) 
    } catch (e) { 
      ElMessage.error('图片上传失败') 
    } finally {
      isUploadingImage.value = false
      // 清空 input 允许重复上传
      e.target.value = ''
    }
  }
}

const editHistory = (h) => {
  isEditingHistory.value = true
  // 深拷贝防止直接修改列表数据
  Object.assign(histForm, JSON.parse(JSON.stringify(h)))
  // 平滑滚动到顶部
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const submitHistory = async () => {
  if (!histForm.title || !histForm.date) {
    ElMessage.warning('标题和日期为必填项')
    return
  }

  try {
    submitLoading.value = true
    if (isEditingHistory.value) {
        await axios.put(`/api/history/${histForm.id}`, histForm)
    } else {
        await axios.post('/api/history', histForm)
    }
    
    resetHistForm()
    await fetchHistory()
    ElMessage.success('提交成功')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('提交失败: ' + (e.response?.data?.message || e.message))
  } finally {
    submitLoading.value = false
  }
}

const deleteHistory = async (id) => {
  try {
    await ElMessageBox.confirm('确定删除该记录吗？', '提示', { type: 'warning' })
    processingId.value = id
    await axios.delete(`/api/history/${id}`)
    
    // 乐观更新
    const idx = historyList.value.findIndex(h => h.id === id)
    if (idx !== -1) historyList.value.splice(idx, 1)
    
    ElMessage.success('删除成功')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
  } finally {
    processingId.value = null
  }
}

const restoreHistory = async (id) => {
  try {
    processingId.value = id
    await axios.post(`/api/history/${id}/restore`)
    await fetchHistory()
    ElMessage.success('已恢复')
  } catch (e) {
    ElMessage.error('恢复失败')
  } finally {
    processingId.value = null
  }
}

const moveHistory = async (item, dir) => {
  if (processingId.value) return 
  processingId.value = item.id
  
  const ord = dir === 'up' ? (item.sort_order || 0) - 1 : (item.sort_order || 0) + 1
  
  try {
    await axios.put(`/api/history/${item.id}`, { ...item, sort_order: ord })
    item.sort_order = ord
    historyList.value.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    fetchHistory() 
  } catch (e) {
    ElMessage.error('排序失败')
  } finally {
    processingId.value = null
  }
}

// --- 编辑器逻辑 ---
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
  
  const tagStart = `<div style="text-align:${align}">`
  const tagEnd = `</div>`
  
  const selected = histForm.description.slice(start, end)
  histForm.description = `${histForm.description.slice(0, start)}${tagStart}${selected}${tagEnd}${histForm.description.slice(end)}`
  
  await nextTick()
  el.focus()
}
</script>

<template>
  <div class="grid lg:grid-cols-2 gap-8 items-start">
    <!-- 左侧：编辑表单 -->
    <div class="bg-white p-6 rounded-xl shadow-sm border-t-4 border-yellow-500 h-fit sticky top-24">
      <div class="flex justify-between items-center mb-4">
        <h2 class="font-bold text-lg text-gray-800">{{ isEditingHistory ? '✏️ 编辑历史' : '📜 记录新历史' }}</h2>
        <button v-if="isEditingHistory" @click="resetHistForm" class="text-xs text-red-500 underline hover:text-red-700">取消编辑，返回新增</button>
      </div>

      <div class="space-y-4">
        <div class="grid grid-cols-3 gap-4">
          <div class="col-span-1">
            <label class="text-xs text-gray-500 block mb-1">日期</label>
            <input v-model="histForm.date" type="date" class="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-yellow-200 outline-none">
          </div>
          <div class="col-span-2">
            <label class="text-xs text-gray-500 block mb-1">事件标题</label>
            <input v-model="histForm.title" type="text" class="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-yellow-200 outline-none font-bold" placeholder="例如：新成员加入">
          </div>
        </div>

        <!-- 图片上传 -->
        <div class="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-gray-50 hover:bg-white transition relative group">
          <div class="flex items-center gap-4">
            <div class="w-20 h-14 bg-gray-200 rounded shrink-0 overflow-hidden relative flex items-center justify-center">
               <img v-if="histForm.image" :src="histForm.image" class="w-full h-full object-cover">
               <span v-else class="text-xs text-gray-400">无图</span>
               <div v-if="isUploadingImage" class="absolute inset-0 bg-black/50 flex items-center justify-center">
                 <span class="animate-spin text-white text-xs">⏳</span>
               </div>
            </div>
            <div class="flex-grow">
               <p class="text-sm text-gray-600 mb-1">配图 (可选)</p>
               <input @change="handleHistImageUpload" type="file" accept="image/*" class="text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-yellow-100 file:text-yellow-700 hover:file:bg-yellow-200">
            </div>
          </div>
        </div>

        <!-- 简易编辑器工具栏 -->
        <div class="space-y-1">
            <div class="flex flex-wrap gap-1 items-center bg-gray-100 p-1 rounded-t-lg border-b border-gray-200">
              <button type="button" @click="wrapSelection('<strong>', '</strong>')" :class="[editorBtnClass, 'font-bold']">B</button>
              <button type="button" @click="wrapSelection('<em>', '</em>')" :class="[editorBtnClass, 'italic']">I</button>
              <div class="w-px h-4 bg-gray-300 mx-1"></div>
              <button type="button" @click="applyAlign('left')" :class="editorBtnClass">⇤ 左</button>
              <button type="button" @click="applyAlign('center')" :class="editorBtnClass">↔ 中</button>
              <button type="button" @click="applyAlign('right')" :class="editorBtnClass">右 ⇥</button>
            </div>
            <textarea 
                ref="descRef" 
                v-model="histForm.description" 
                rows="6" 
                class="w-full border rounded-b-lg px-3 py-2 focus:ring-2 focus:ring-yellow-200 outline-none text-sm font-mono" 
                placeholder="事件描述（支持 HTML 标签）..."
            ></textarea>
        </div>

        <div class="flex items-center gap-3">
            <label class="text-sm text-gray-600 whitespace-nowrap">排序值:</label>
            <input v-model.number="histForm.sort_order" type="number" class="w-20 border rounded px-2 py-1 text-center" placeholder="0">
            <span class="text-xs text-gray-400">数值越小越靠前</span>
        </div>

        <button 
            @click="submitHistory" 
            :disabled="submitLoading"
            class="w-full bg-yellow-600 text-white py-2.5 rounded-lg shadow hover:bg-yellow-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
        >
          <span v-if="submitLoading" class="animate-spin">🔄</span>
          {{ isEditingHistory ? '保存修改' : '提交记录' }}
        </button>
      </div>
    </div>

    <!-- 右侧：时间轴预览 -->
    <div class="bg-white p-6 rounded-xl shadow-sm h-fit">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-lg font-bold">时间轴预览 ({{ historyList.length }})</h2>
        <button v-if="isSuperAdmin" @click="showDeleted = !showDeleted" class="text-xs px-2 py-1 rounded border hover:bg-gray-50 transition">
          {{ showDeleted ? '👁️ 隐藏已删除' : '🚫 显示已删除' }}
        </button>
      </div>

      <div v-if="listLoading" class="py-10 text-center text-gray-400">
        <div class="animate-spin text-2xl mb-2">⏳</div>
        <p>加载历史记录...</p>
      </div>

      <div v-else class="space-y-4 max-h-[800px] overflow-y-auto pr-2 custom-scrollbar">
        <div v-if="historyList.length === 0" class="text-center py-8 text-gray-400 text-sm">暂无历史记录</div>

        <div v-for="item in historyList" :key="item.id" class="flex gap-4 p-4 border-l-4 border-yellow-400 bg-yellow-50/50 rounded-r-lg group hover:bg-yellow-100/50 transition relative">
          
          <!-- 排序控制 -->
          <div class="flex flex-col items-center justify-center gap-1 w-6 shrink-0">
            <button 
                v-if="!item.deleted_at" 
                @click="moveHistory(item, 'up')" 
                class="text-xs text-gray-400 hover:text-yellow-700 disabled:opacity-30"
                :disabled="processingId === item.id"
            >▲</button>
            <span class="text-[10px] font-mono text-gray-400">{{ item.sort_order || 0 }}</span>
            <button 
                v-if="!item.deleted_at" 
                @click="moveHistory(item, 'down')" 
                class="text-xs text-gray-400 hover:text-yellow-700 disabled:opacity-30"
                :disabled="processingId === item.id"
            >▼</button>
          </div>

          <!-- 内容主体 -->
          <div class="flex-grow min-w-0">
            <div class="flex flex-wrap justify-between items-start gap-2">
                <h3 class="font-bold text-gray-800 break-words">{{ item.title }}</h3>
                <span class="text-xs bg-white px-2 py-1 rounded border shadow-sm font-mono whitespace-nowrap text-gray-600">{{ item.date }}</span>
            </div>
            
            <div class="text-sm text-gray-600 mt-2 line-clamp-3 prose prose-sm max-w-none" v-html="item.description"></div>
            
            <!-- 操作栏 (悬停显示) -->
            <div class="mt-3 flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <template v-if="!item.deleted_at">
                <button @click="editHistory(item)" class="text-xs text-blue-600 hover:underline font-medium">编辑</button>
                <button 
                    @click="deleteHistory(item.id)" 
                    class="text-xs text-red-600 hover:underline font-medium"
                    :disabled="processingId === item.id"
                >
                    {{ processingId === item.id ? '删除中...' : '删除' }}
                </button>
              </template>
              <button 
                v-else-if="isSuperAdmin" 
                @click="restoreHistory(item.id)" 
                class="text-xs text-green-600 hover:underline font-medium"
                :disabled="processingId === item.id"
              >
                恢复
              </button>
            </div>
            
            <div v-if="item.deleted_at" class="absolute top-2 right-2 px-2 py-0.5 bg-red-100 text-red-600 text-[10px] rounded">🗑️ 已删除</div>
          </div>

          <!-- 图片展示 -->
          <div class="shrink-0">
             <img
                v-if="item.image"
                :src="getThumbUrl(item.image)"
                loading="lazy"
                @error="(e) => (e.target.style.display='none', e.target.nextElementSibling.style.display='flex')"
                class="w-20 h-20 object-cover rounded border bg-white"
            >
            <div class="w-20 h-20 rounded border bg-gray-100 hidden items-center justify-center text-xs text-gray-400">
                无图
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 3px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #d1d5db; }
</style>