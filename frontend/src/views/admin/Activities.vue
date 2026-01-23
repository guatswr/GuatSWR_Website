<script setup>
import { ref, reactive, onMounted, computed, watch } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { compressImage, getThumbUrl } from '../../utils/image'
import ActivityEditor from '../../components/ActivityEditor.vue'
import { useUserStore } from '../../stores/user'

const loading = ref(false)
const activities = ref([])
const isEditing = ref(false)
const actForm = reactive({ id: null, title: '', tag: '', date: '', description: '', content: '', cover_image: '', images: [] })
const showDeleted = ref(false)
const userStore = useUserStore()
const isSuperAdmin = computed(() => userStore.isSuperAdmin)

const fetchActivities = async () => {
  try {
    let url = '/api/activities?all=1'
    if (showDeleted.value && isSuperAdmin.value) url += '&includeDeleted=1'
    const res = await axios.get(url)
    activities.value = res.data
  } catch (e) {
    ElMessage.error('加载活动失败')
  }
}

onMounted(() => {
  fetchActivities()
})

watch(showDeleted, () => {
  fetchActivities()
})

const ensureDraftId = async () => {
  if (actForm.id) return actForm.id
  const res = await axios.post('/api/activities/draft')
  actForm.id = res.data.id
  isEditing.value = true
  return actForm.id
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
  Object.assign(actForm, { id: null, title: '', tag: '', date: '', description: '', content: '', cover_image: '', images: [] })
}

const handleCoverUpload = async (e) => {
  if (e.target.files[0]) {
    try { actForm.cover_image = await uploadFile(e.target.files[0]) } catch (e) { ElMessage.error('封面上传失败') }
  }
}

const handleMultiUpload = async (e) => {
  const files = Array.from(e.target.files)
  for (const f of files) {
    try { actForm.images.push(await uploadFile(f)) } catch (e) { ElMessage.error('图片上传失败') }
  }
}

const editActivity = (act) => {
  isEditing.value = true
  Object.assign(actForm, act)
  window.scrollTo(0, 0)
}

const submitActivity = async () => {
  if (!actForm.tag?.trim()) {
    ElMessage.error('请填写活动标签')
    return
  }
  loading.value = true
  try {
    await ElMessageBox.confirm('确认提交并发布该活动？', '确认发布', { type: 'warning' })
    if (actForm.id) await axios.put(`/api/activities/${actForm.id}`, actForm)
    else await axios.post('/api/activities', actForm)
    resetActForm()
    await fetchActivities()
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
    await fetchActivities()
    ElMessage.success('删除成功')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
  }
}

const restoreActivity = async (id) => {
  try {
    await ElMessageBox.confirm('确认恢复该活动吗？', '恢复确认', { type: 'warning' })
    await axios.post(`/api/activities/${id}/restore`)
    await fetchActivities()
    ElMessage.success('已恢复')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('恢复失败')
  }
}
</script>

<template>
  <div class="grid lg:grid-cols-2 gap-8">
    <div class="bg-white p-6 rounded-xl border-t-4 border-red-500 shadow-sm h-fit">
      <div class="flex justify-between items-center mb-4">
        <h2 class="font-bold text-lg text-gray-800">{{ isEditing ? '✏️ 编辑异变' : '📝 发布新异变' }}</h2>
        <button v-if="isEditing" @click="resetActForm" class="text-xs text-red-500 underline">取消编辑</button>
      </div>
      <div class="space-y-4">
        <input v-model="actForm.title" class="w-full border rounded-lg px-3 py-2" placeholder="标题 (Title)">
        <input v-model="actForm.tag" class="w-full border rounded-lg px-3 py-2" placeholder="标签 (Tag) *" required>
        <input v-model="actForm.date" type="date" class="w-full border rounded-lg px-3 py-2">

        <div class="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:bg-gray-50 transition relative group">
          <input @change="handleCoverUpload" type="file" accept="image/*" class="absolute inset-0 opacity-0 cursor-pointer z-10">
          <div v-if="!actForm.cover_image" class="text-gray-400"><p class="text-sm">点击上传封面</p></div>
          <img v-else :src="actForm.cover_image" class="h-32 mx-auto object-cover rounded shadow-md">
        </div>

        <ActivityEditor v-model="actForm.content" :activityId="actForm.id" :getActivityId="ensureDraftId" @onSave="submitActivity" />

        <div class="border border-dashed border-gray-300 rounded-lg p-4">
          <div class="flex justify-between items-center mb-2">
            <span class="text-sm text-gray-500">活动相册</span>
            <input @change="handleMultiUpload" type="file" multiple accept="image/*" class="text-xs">
          </div>
          <div class="flex gap-2 overflow-x-auto pb-2">
            <div v-for="(img, idx) in actForm.images" :key="idx" class="relative shrink-0 group">
              <img :src="img" class="w-16 h-16 object-cover rounded shadow-sm">
              <button @click="actForm.images.splice(idx, 1)" class="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center shadow">×</button>
            </div>
          </div>
        </div>

        <button @click="submitActivity" :disabled="loading" class="w-full bg-red-600 text-white py-3 rounded-lg font-bold hover:bg-red-700 transition">
          {{ loading ? '提交中...' : '提交发布 (Ctrl+S)' }}
        </button>
      </div>
    </div>

    <div class="bg-white p-6 rounded-xl shadow-sm h-fit">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-lg font-bold">历史记录</h2>
        <button v-if="isSuperAdmin" @click="showDeleted = !showDeleted" class="text-xs px-2 py-1 rounded border">
          {{ showDeleted ? '隐藏已删除' : '显示已删除' }}
        </button>
      </div>
      <div class="space-y-3 max-h-[800px] overflow-y-auto pr-2 custom-scrollbar">
        <div v-for="act in activities" :key="act.id" class="flex gap-4 p-4 border rounded-xl hover:bg-gray-50 transition">
          <img
            :src="getThumbUrl(act.cover_image)"
            @error="(e) => (e.target.src = act.cover_image)"
            class="w-16 h-16 object-cover rounded bg-gray-100 shrink-0"
          >
          <div class="flex-grow min-w-0">
            <div class="font-bold text-gray-800 truncate">{{act.title}}</div>
            <div class="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-2">
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-50 text-gray-600 border border-gray-100">
                <span class="text-[10px]">📅</span>
                {{act.date}}
              </span>
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100">
                <span class="text-[10px]">🏷️</span>
                {{act.tag || '未标注'}}
              </span>
              <span v-if="act.deleted_at" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 border border-gray-300">
                🗑️ 已删除
              </span>
            </div>
            <div class="mt-2 flex gap-2">
              <button v-if="!act.deleted_at" @click="editActivity(act)" class="text-xs px-2 py-1 bg-blue-100 text-blue-600 rounded">编辑</button>
              <button v-if="!act.deleted_at" @click="deleteActivity(act.id)" class="text-xs px-2 py-1 bg-red-100 text-red-600 rounded">删除</button>
              <button v-if="act.deleted_at && isSuperAdmin" @click="restoreActivity(act.id)" class="text-xs px-2 py-1 bg-green-100 text-green-600 rounded">恢复</button>
            </div>
          </div>
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
