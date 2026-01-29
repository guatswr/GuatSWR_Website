<script setup>
import { ref, reactive, onMounted, computed, watch } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { compressImage, getThumbUrl } from '../../utils/image'
import { useUserStore } from '../../stores/user'

const userStore = useUserStore()
const isSuperAdmin = computed(() => userStore.isSuperAdmin)

// --- 状态 ---
const members = ref([])
const listLoading = ref(false)
const submitLoading = ref(false)
const isEditingMember = ref(false)
const showDeleted = ref(false)

// 正在操作的 ID (排序/删除)
const processingId = ref(null)
// 头像上传状态
const isUploadingAvatar = ref(false)

const memForm = reactive({ id: null, name: '', role: '', bio: '', avatar: '', school: '', sort_order: 0 })

const schoolOptions = [
  { label: '桂航', value: '桂航', color: '#0047BA' },
  { label: '桂电', value: '桂电', color: '#0050A1' },
  { label: '师大', value: '师大', color: '#722E87' },
  { label: '桂师', value: '桂师', color: '#E60012' },
  { label: '桂信', value: '桂信', color: '#F39C12' },
  { label: '桂理', value: '桂理', color: '#006400' },
  { label: '桂旅', value: '桂旅', color: '#20B2AA' },
  { label: '漓院', value: '漓院', color: '#00BFFF' },
  { label: '桂医', value: '桂医', color: '#2E8B57' },
  { label: '联外', value: '联外', color: '#800000' }
]

const fetchMembers = async () => {
  listLoading.value = true
  try {
    let url = '/api/members'
    if (showDeleted.value && isSuperAdmin.value) url += '?includeDeleted=1'
    const res = await axios.get(url)
    members.value = res.data || []
  } catch (e) {
    ElMessage.error('加载成员失败')
  } finally {
    listLoading.value = false
  }
}

onMounted(() => {
  fetchMembers()
})

watch(showDeleted, () => {
  fetchMembers()
})

const uploadFile = async (file) => {
  const compressed = await compressImage(file)
  const d = new FormData()
  d.append('file', compressed)
  const r = await axios.post('/api/upload', d)
  return r.data.url
}

const resetMemForm = () => {
  isEditingMember.value = false
  Object.assign(memForm, { id: null, name: '', role: '', bio: '', avatar: '', school: '', sort_order: 0 })
}

const handleAvatarUpload = async (e) => {
  const file = e.target.files[0]
  if (file) {
    try { 
      isUploadingAvatar.value = true
      memForm.avatar = await uploadFile(file) 
    } catch (e) { 
      ElMessage.error('头像上传失败') 
    } finally {
      isUploadingAvatar.value = false
      e.target.value = ''
    }
  }
}

const editMember = (m) => {
  isEditingMember.value = true
  Object.assign(memForm, JSON.parse(JSON.stringify(m)))
  // 确保 sort_order 有值
  if (memForm.sort_order === undefined || memForm.sort_order === null) {
      memForm.sort_order = 0
  }
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const updateOrder = async (m, dir) => {
  if (processingId.value) return
  processingId.value = m.id

  const next = dir === 'up' ? (m.sort_order || 0) - 1 : (m.sort_order || 0) + 1
  try {
    await axios.put(`/api/members/${m.id}`, { ...m, sort_order: next })
    // 本地即时更新，提升体验
    m.sort_order = next
    members.value.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    // 异步刷新
    fetchMembers()
  } catch (e) {
    ElMessage.error('排序失败')
  } finally {
    processingId.value = null
  }
}

const submitMember = async () => {
  if (!memForm.name) return ElMessage.warning('请填写昵称')

  try {
    // 移除 confirm 弹窗，减少操作步骤
    // await ElMessageBox.confirm('确认提交该成员信息？', '确认提交', { type: 'warning' })
    
    submitLoading.value = true
    if (isEditingMember.value) await axios.put(`/api/members/${memForm.id}`, memForm)
    else await axios.post('/api/members', memForm)
    
    resetMemForm()
    await fetchMembers()
    ElMessage.success('提交成功')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('提交失败')
  } finally {
    submitLoading.value = false
  }
}

const deleteMember = async (id) => {
  try {
    await ElMessageBox.confirm('确定删除该成员吗？', '提示', { type: 'warning' })
    processingId.value = id
    await axios.delete(`/api/members/${id}`)
    
    // 乐观更新
    const idx = members.value.findIndex(m => m.id === id)
    if (idx !== -1) members.value.splice(idx, 1)
    
    ElMessage.success('删除成功')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
  } finally {
    processingId.value = null
  }
}

const restoreMember = async (id) => {
  try {
    processingId.value = id
    await axios.post(`/api/members/${id}/restore`)
    await fetchMembers()
    ElMessage.success('已恢复')
  } catch (e) {
    ElMessage.error('恢复失败')
  } finally {
    processingId.value = null
  }
}

const getSchoolColor = (n) => {
  const s = schoolOptions.find(o => o.value === n)
  return s ? s.color : '#9ca3af'
}
</script>

<template>
  <div class="grid lg:grid-cols-12 gap-8 items-start">
    <!-- 左侧编辑表单 (占 4 列) -->
    <div class="lg:col-span-4 bg-white p-6 rounded-xl shadow-sm border-t-4 border-blue-500 sticky top-24">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-lg font-bold text-gray-800">{{ isEditingMember ? '👤 编辑成员' : '👤 添加成员' }}</h2>
        <button v-if="isEditingMember" @click="resetMemForm" class="text-xs text-red-500 underline hover:text-red-700">取消编辑</button>
      </div>

      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2 sm:col-span-1">
             <label class="text-xs text-gray-500 block mb-1">昵称 *</label>
             <input v-model="memForm.name" class="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-100 outline-none" placeholder="用户昵称">
          </div>
          <div class="col-span-2 sm:col-span-1">
             <label class="text-xs text-gray-500 block mb-1">所属学校</label>
             <select v-model="memForm.school" class="w-full border rounded px-3 py-2 bg-white focus:ring-2 focus:ring-blue-100 outline-none">
                <option value="">-- 未选择 --</option>
                <option v-for="s in schoolOptions" :key="s.value" :value="s.value">{{s.label}}</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-3">
             <div class="col-span-2">
                <label class="text-xs text-gray-500 block mb-1">外号</label>
                <input v-model="memForm.role" class="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-100 outline-none" placeholder="e.g. 芋泥头">
             </div>
             <div class="col-span-1">
                <label class="text-xs text-gray-500 block mb-1">排序值（仅方便标记，实际排序按名字首字母）</label>
                <input v-model.number="memForm.sort_order" type="number" class="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-100 outline-none text-center" placeholder="0">
             </div>
        </div>
        
        <div>
            <label class="text-xs text-gray-500 block mb-1">简介</label>
            <textarea v-model="memForm.bio" class="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-100 outline-none text-sm" rows="3" placeholder="一句话介绍..."></textarea>
        </div>

        <!-- 头像上传 -->
        <div class="flex items-center gap-4 border border-dashed border-gray-300 p-3 rounded-lg bg-gray-50 hover:bg-white transition relative">
          <div class="w-16 h-16 rounded-full bg-gray-200 shrink-0 overflow-hidden relative border border-gray-100 flex items-center justify-center">
             <img v-if="memForm.avatar" :src="memForm.avatar" class="w-full h-full object-cover">
             <span v-else class="text-2xl text-gray-300">👤</span>
             
             <div v-if="isUploadingAvatar" class="absolute inset-0 bg-black/50 flex items-center justify-center">
                 <span class="animate-spin text-white text-xs">⏳</span>
             </div>
          </div>
          <div class="flex-grow">
             <p class="text-xs text-gray-500 mb-1">头像 (建议正方形)</p>
             <input @change="handleAvatarUpload" type="file" accept="image/*" class="w-full text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer">
          </div>
        </div>

        <button 
            @click="submitMember" 
            :disabled="submitLoading"
            class="w-full bg-blue-600 text-white py-2.5 rounded-lg shadow hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
        >
          <span v-if="submitLoading" class="animate-spin">🔄</span>
          {{ isEditingMember ? '保存修改' : '添加成员' }}
        </button>
      </div>
    </div>

    <!-- 右侧列表 (占 8 列) -->
    <div class="lg:col-span-8">
        <div class="flex justify-between items-center mb-4 px-1">
            <h2 class="font-bold text-gray-700">成员列表 ({{ members.length }})</h2>
            <button v-if="isSuperAdmin" @click="showDeleted = !showDeleted" class="text-xs px-3 py-1.5 rounded-lg bg-white border hover:bg-gray-50 transition shadow-sm">
                {{ showDeleted ? '👁️ 隐藏已删除' : '🚫 显示已删除' }}
            </button>
        </div>

        <div v-if="listLoading" class="py-12 text-center text-gray-400">
            <div class="animate-spin text-3xl mb-3">⏳</div>
            <p>加载住民数据...</p>
        </div>

        <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-4">
             <div v-if="members.length === 0" class="col-span-full text-center py-10 text-gray-400 border-2 border-dashed rounded-xl">
                 暂无成员数据
             </div>

            <div v-for="mem in members" :key="mem.id" class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 text-center relative group hover:shadow-md transition-all duration-200">
                <!-- 学校标签 -->
                <span 
                    v-if="mem.school" 
                    class="absolute top-2 right-2 text-[10px] text-white px-2 py-0.5 rounded-full shadow-sm z-10" 
                    :style="{background: getSchoolColor(mem.school)}"
                >
                    {{ mem.school }}
                </span>

                <!-- 头像 -->
                <div class="relative w-16 h-16 mx-auto mb-3">
                    <img
                        :src="getThumbUrl(mem.avatar)"
                        @error="(e) => (e.target.style.display='none', e.target.nextElementSibling.style.display='flex')"
                        class="w-full h-full rounded-full object-cover bg-gray-50 border-2 border-white shadow-sm"
                        loading="lazy"
                    >
                    <div class="w-full h-full rounded-full bg-gray-100 border-2 border-white hidden items-center justify-center text-xs text-gray-400">
                        ?
                    </div>
                    
                    <div v-if="mem.deleted_at" class="absolute inset-0 bg-white/70 rounded-full flex items-center justify-center">
                        <span class="text-xs font-bold text-red-500">已删</span>
                    </div>
                </div>

                <div class="font-bold text-gray-800 text-sm truncate px-1">{{ mem.name }}</div>
                <div class="text-xs text-gray-500 mb-3 truncate px-1">{{ mem.role || '成员' }}</div>

                <!-- 悬浮操作栏 -->
                <div class="flex justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur-sm absolute bottom-2 left-2 right-2 py-1 rounded-lg shadow-sm border border-gray-100">
                    <template v-if="!mem.deleted_at">
                        <button @click="editMember(mem)" class="w-6 h-6 flex items-center justify-center rounded hover:bg-blue-50 text-blue-500 text-xs" title="编辑">✎</button>
                        <div class="w-px bg-gray-200 h-4 my-auto"></div>
                        <button @click="updateOrder(mem, 'up')" :disabled="processingId === mem.id" class="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-600 text-[10px]" title="上移">▲</button>
                        <button @click="updateOrder(mem, 'down')" :disabled="processingId === mem.id" class="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-600 text-[10px]" title="下移">▼</button>
                        <div class="w-px bg-gray-200 h-4 my-auto"></div>
                        <button @click="deleteMember(mem.id)" :disabled="processingId === mem.id" class="w-6 h-6 flex items-center justify-center rounded hover:bg-red-50 text-red-500 text-xs" title="删除">×</button>
                    </template>
                    <button 
                        v-else-if="isSuperAdmin" 
                        @click="restoreMember(mem.id)" 
                        :disabled="processingId === mem.id"
                        class="text-xs text-green-600 font-bold w-full"
                    >
                        恢复
                    </button>
                </div>
            </div>
        </div>
    </div>
  </div>
</template>