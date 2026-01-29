<script setup>
import { ref, reactive, onMounted, computed, watch } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { compressImage, getThumbUrl } from '../../utils/image'
import ActivityEditor from '../../components/ActivityEditor.vue'
import { useUserStore } from '../../stores/user'

// --- 状态定义 ---
const loading = ref(false) // 提交/操作 loading
const listLoading = ref(false) // 列表加载 loading
const activities = ref([])
const isEditing = ref(false)
const actForm = reactive({ id: null, title: '', tag: '', date: '', description: '', content: '', cover_image: '', images: [] })
const showDeleted = ref(false)
const page = ref(1)
// 优化点 1: 降低单页数量，减少DOM和图片内存压力
const limit = ref(15) 
const total = ref(0)
const userStore = useUserStore()

// --- 计算属性 ---
const isSuperAdmin = computed(() => userStore.isSuperAdmin)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit.value)))

// --- 数据获取 ---
const fetchActivities = async () => {
  listLoading.value = true
  try {
    let url = `/api/activities?all=1&page=${page.value}&limit=${limit.value}`
    if (showDeleted.value && isSuperAdmin.value) url += '&includeDeleted=1'
    const res = await axios.get(url)
    activities.value = res.data?.items || []
    total.value = res.data?.total || 0
  } catch (e) {
    ElMessage.error('加载活动失败')
  } finally {
    listLoading.value = false
  }
}

onMounted(() => {
  fetchActivities()
})

// 优化点 2: 删除了不必要的 onUnmounted 手动清理代码，Vue 会自动回收局部变量

watch(showDeleted, () => {
  page.value = 1
  fetchActivities()
})

// --- 业务逻辑 ---

let draftPromise = null // 优化点 3: 防止并发创建草稿
const ensureDraftId = async () => {
  if (actForm.id) return actForm.id
  
  // 如果正在请求中，返回同一个 promise
  if (draftPromise) return draftPromise

  draftPromise = axios.post('/api/activities/draft').then(res => {
    actForm.id = res.data.id
    isEditing.value = true
    return res.data.id
  }).catch(e => {
    ElMessage.error('创建草稿失败')
    throw e
  }).finally(() => {
    draftPromise = null
  })
  
  return draftPromise
}

const uploadFile = async (file) => {
  const activityId = await ensureDraftId()
  const compressed = await compressImage(file)
  const d = new FormData()
  d.append('file', compressed)
  const r = await axios.post(`/api/upload?activityId=${activityId}`, d)
  return r.data.url
}

const resetActForm = () => {
  isEditing.value = false
  // 保持响应式引用的正确重置方式
  Object.assign(actForm, { 
    id: null, title: '', tag: '', date: '', description: '', 
    content: '', cover_image: '', images: [] 
  })
  // 如果是编辑模式切回新建，不需要滚动到顶部，体验更好
}

const handleCoverUpload = async (e) => {
  if (e.target.files[0]) {
    try { 
      // 封面图单独处理，显示 loading 状态建议在 UI 上体现（此处略）
      actForm.cover_image = await uploadFile(e.target.files[0]) 
    } catch (e) { 
      ElMessage.error('封面上传失败') 
    }
  }
}

// 优化点 4: 并发上传图片
const handleMultiUpload = async (e) => {
  const files = Array.from(e.target.files)
  if (files.length === 0) return

  const uploadPromise = files.map(file => uploadFile(file).catch(err => {
    console.error('单张上传失败', err)
    return null // 失败返回 null，不阻断其他上传
  }))

  try {
    const results = await Promise.all(uploadPromise)
    const successUrls = results.filter(url => url !== null)
    actForm.images.push(...successUrls)
    if (successUrls.length < files.length) {
      ElMessage.warning(`成功上传 ${successUrls.length} 张，失败 ${files.length - successUrls.length} 张`)
    } else {
      ElMessage.success(`成功上传 ${files.length} 张图片`)
    }
  } catch (e) {
    ElMessage.error('批量上传发生错误')
  }
  // 清空 input 允许重复选择同一文件
  e.target.value = '' 
}

const editActivity = (act) => {
  isEditing.value = true
  // 深拷贝防止修改表单时直接影响列表显示（虽然修改后会刷新列表，但为了 UI 稳定性）
  Object.assign(actForm, JSON.parse(JSON.stringify(act)))
  
  // 优化点 5: 只滚动到左侧顶部，而不是整个窗口，体验更好 (假设左侧容器有 ID 或 ref，这里暂用 window)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const submitActivity = async () => {
  if (!actForm.tag?.trim()) {
    ElMessage.error('请填写活动标签')
    return
  }
  loading.value = true
  try {
    // 移除 confirm，提高发布效率，或者保留视业务需求而定
    // await ElMessageBox.confirm('确认提交并发布该活动？', '确认发布', { type: 'warning' })
    
    if (actForm.id) await axios.put(`/api/activities/${actForm.id}`, actForm)
    else await axios.post('/api/activities', actForm)
    
    resetActForm()
    await fetchActivities() // 刷新列表
    ElMessage.success('提交成功')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('提交失败: ' + (e.response?.data?.message || e.message))
  } finally {
    loading.value = false
  }
}

const deleteActivity = async (id) => {
  try {
    await ElMessageBox.confirm('确定删除该活动吗？', '提示', { type: 'warning' })
    await axios.delete(`/api/activities/${id}`)
    // 本地移除，减少 API 请求
    activities.value = activities.value.filter(a => a.id !== id)
    total.value--
    ElMessage.success('删除成功')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
  }
}

const restoreActivity = async (id) => {
  try {
    await axios.post(`/api/activities/${id}/restore`)
    await fetchActivities()
    ElMessage.success('已恢复')
  } catch (e) {
    ElMessage.error('恢复失败')
  }
}

const changePage = async (nextPage) => {
  if (nextPage < 1 || nextPage > totalPages.value) return
  page.value = nextPage
  await fetchActivities()
}
</script>

<template>
  <div class="grid lg:grid-cols-2 gap-8 items-start">
    <!-- 左侧编辑区 -->
    <div class="bg-white p-6 rounded-xl border-t-4 border-red-500 shadow-sm sticky top-24">
      <div class="flex justify-between items-center mb-4">
        <h2 class="font-bold text-lg text-gray-800">{{ isEditing ? '✏️ 编辑异变' : '📝 发布新异变' }}</h2>
        <button v-if="isEditing" @click="resetActForm" class="text-xs text-red-500 underline">取消编辑</button>
      </div>
      
      <div class="space-y-4">
        <input v-model="actForm.title" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-200 outline-none transition" placeholder="标题 (Title)">
        <div class="grid grid-cols-2 gap-4">
            <input v-model="actForm.tag" class="w-full border rounded-lg px-3 py-2" placeholder="标签 (Tag) *" required>
            <input v-model="actForm.date" type="date" class="w-full border rounded-lg px-3 py-2">
        </div>

        <!-- 封面上传 -->
        <div class="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:bg-gray-50 transition relative group min-h-[120px] flex items-center justify-center">
          <input @change="handleCoverUpload" type="file" accept="image/*" class="absolute inset-0 opacity-0 cursor-pointer z-10">
          <div v-if="!actForm.cover_image" class="text-gray-400 pointer-events-none">
             <p class="text-sm">点击上传封面</p>
          </div>
          <div v-else class="relative w-full h-full">
             <img :src="actForm.cover_image" class="h-40 w-full object-cover rounded shadow-md pointer-events-none">
             <div class="absolute inset-0 bg-black/30 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition">更换封面</div>
          </div>
        </div>

        <ActivityEditor v-model="actForm.content" :activityId="actForm.id" :getActivityId="ensureDraftId" @onSave="submitActivity" />

        <!-- 相册区域 -->
        <div class="border border-dashed border-gray-300 rounded-lg p-4">
          <div class="flex justify-between items-center mb-2">
            <span class="text-sm text-gray-500">活动相册 ({{actForm.images.length}})</span>
            <div class="relative">
                <button class="text-xs bg-gray-100 px-2 py-1 rounded hover:bg-gray-200">添加图片</button>
                <input @change="handleMultiUpload" type="file" multiple accept="image/*" class="absolute inset-0 opacity-0 cursor-pointer">
            </div>
          </div>
          <div class="flex gap-2 overflow-x-auto pb-2 custom-scrollbar min-h-[4rem]">
             <div v-if="actForm.images.length === 0" class="text-xs text-gray-400 w-full text-center py-2">暂无图片</div>
            <div v-for="(img, idx) in actForm.images" :key="idx" class="relative shrink-0 group">
              <img :src="img" class="w-16 h-16 object-cover rounded shadow-sm">
              <button @click="actForm.images.splice(idx, 1)" class="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center shadow hover:bg-red-600 transition">×</button>
            </div>
          </div>
        </div>

        <button @click="submitActivity" :disabled="loading" class="w-full bg-red-600 text-white py-3 rounded-lg font-bold hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2">
          <span v-if="loading" class="animate-spin text-white">⏳</span>
          {{ loading ? '处理中...' : (isEditing ? '保存修改' : '提交发布') }}
        </button>
      </div>
    </div>

    <!-- 右侧列表区 -->
    <div class="bg-white p-6 rounded-xl shadow-sm h-fit">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-lg font-bold">历史记录</h2>
        <button v-if="isSuperAdmin" @click="showDeleted = !showDeleted" class="text-xs px-2 py-1 rounded border hover:bg-gray-50 transition">
          {{ showDeleted ? '👁️ 隐藏已删除' : '🚫 显示已删除' }}
        </button>
      </div>
      
      <!-- 列表加载状态 -->
      <div v-if="listLoading" class="py-10 text-center text-gray-400">
        <div class="animate-spin text-2xl mb-2">☯️</div>
        <p>加载中...</p>
      </div>

      <div v-else class="space-y-3 max-h-[800px] overflow-y-auto pr-2 custom-scrollbar">
        <div v-if="activities.length === 0" class="text-center py-8 text-gray-400 text-sm">暂无数据</div>
        
        <div v-for="act in activities" :key="act.id" class="flex gap-4 p-4 border rounded-xl hover:bg-gray-50 transition group">
          <!-- 优化点 6: 图片加载失败不显示原图，显示占位色块，防止内存暴涨 -->
          <img 
            :src="getThumbUrl(act.cover_image)" 
            @error="(e) => (e.target.style.display='none', e.target.nextElementSibling.style.display='flex')"
            class="w-16 h-16 object-cover rounded bg-gray-100 shrink-0"
            loading="lazy"
          >
          <div class="w-16 h-16 rounded bg-gray-200 shrink-0 hidden items-center justify-center text-xs text-gray-400">无图</div>

          <div class="flex-grow min-w-0">
            <div class="font-bold text-gray-800 truncate">{{act.title || '无标题'}}</div>
            <div class="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-2">
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-50 text-gray-600 border border-gray-100">
                📅 {{act.date}}
              </span>
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100">
                🏷️ {{act.tag || '未标注'}}
              </span>
              <span v-if="act.deleted_at" class="bg-gray-200 text-gray-700 px-2 py-0.5 rounded text-[10px]">已删除</span>
            </div>
            
            <!-- 操作按钮 -->
            <div class="mt-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button v-if="!act.deleted_at" @click="editActivity(act)" class="text-xs px-2 py-1 bg-blue-100 text-blue-600 rounded hover:bg-blue-200">编辑</button>
              <button v-if="!act.deleted_at" @click="deleteActivity(act.id)" class="text-xs px-2 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200">删除</button>
              <button v-if="act.deleted_at && isSuperAdmin" @click="restoreActivity(act.id)" class="text-xs px-2 py-1 bg-green-100 text-green-600 rounded hover:bg-green-200">恢复</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 分页 -->
      <div v-if="total > 0" class="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
        <span>{{ page }} / {{ totalPages }} 页 (共 {{ total }} 条)</span>
        <div class="flex gap-2">
          <button class="px-2 py-1 rounded border disabled:opacity-50 hover:bg-gray-50" :disabled="page <= 1" @click="changePage(page - 1)">上一页</button>
          <button class="px-2 py-1 rounded border disabled:opacity-50 hover:bg-gray-50" :disabled="page >= totalPages" @click="changePage(page + 1)">下一页</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 3px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #d1d5db; }
</style>