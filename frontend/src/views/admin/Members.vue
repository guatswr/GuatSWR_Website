<script setup>
import { ref, reactive, onMounted, computed, watch } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { compressImage, getThumbUrl } from '../../utils/image'
import { useUserStore } from '../../stores/user'

const members = ref([])
const isEditingMember = ref(false)
const memForm = reactive({ id: null, name: '', role: '', bio: '', avatar: '', school: '', sort_order: 0 })
const showDeleted = ref(false)
const userStore = useUserStore()
const isSuperAdmin = computed(() => userStore.isSuperAdmin)

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
  try {
    let url = '/api/members'
    if (showDeleted.value && isSuperAdmin.value) url += '?includeDeleted=1'
    const res = await axios.get(url)
    members.value = res.data
  } catch (e) {
    ElMessage.error('加载成员失败')
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
  if (e.target.files[0]) {
    try { memForm.avatar = await uploadFile(e.target.files[0]) } catch (e) { ElMessage.error('头像上传失败') }
  }
}

const editMember = (m) => {
  isEditingMember.value = true
  Object.assign(memForm, m, { sort_order: m.sort_order || 0 })
  window.scrollTo(0, 0)
}

const updateOrder = async (m, dir) => {
  const next = dir === 'up' ? (m.sort_order || 0) - 1 : (m.sort_order || 0) + 1
  try {
    await axios.put(`/api/members/${m.id}`, { ...m, sort_order: next })
    await fetchMembers()
  } catch (e) {
    ElMessage.error('排序失败')
  }
}

const submitMember = async () => {
  try {
    await ElMessageBox.confirm('确认提交该成员信息？', '确认提交', { type: 'warning' })
    if (isEditingMember.value) await axios.put(`/api/members/${memForm.id}`, memForm)
    else await axios.post('/api/members', memForm)
    resetMemForm()
    await fetchMembers()
    ElMessage.success('提交成功')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('提交失败')
  }
}

const deleteMember = async (id) => {
  try {
    await ElMessageBox.confirm('确定删除该成员吗？', '提示', { type: 'warning' })
    await axios.delete(`/api/members/${id}`)
    await fetchMembers()
    ElMessage.success('删除成功')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
  }
}

const restoreMember = async (id) => {
  try {
    await ElMessageBox.confirm('确认恢复该成员吗？', '恢复确认', { type: 'warning' })
    await axios.post(`/api/members/${id}/restore`)
    await fetchMembers()
    ElMessage.success('已恢复')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('恢复失败')
  }
}

const getSchoolColor = (n) => {
  const s = schoolOptions.find(o => o.value === n)
  return s ? s.color : '#9ca3af'
}
</script>

<template>
  <div class="grid lg:grid-cols-2 gap-8">
    <div class="bg-white p-6 rounded-xl shadow-sm border-t-4 border-blue-500 h-fit">
      <h2 class="text-lg font-bold mb-4">{{ isEditingMember ? '👤 编辑成员' : '👤 添加成员' }}</h2>
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <input v-model="memForm.name" class="w-full border rounded px-3 py-2" placeholder="昵称">
          <select v-model="memForm.school" class="w-full border rounded px-3 py-2 bg-white">
            <option value="">-- 学校 --</option>
            <option v-for="s in schoolOptions" :key="s.value" :value="s.value">{{s.label}}</option>
          </select>
        </div>
        <input v-model="memForm.role" class="w-full border rounded px-3 py-2" placeholder="身份">
        <div class="flex items-center gap-2">
          <label class="text-xs text-gray-500">排序</label>
          <input v-model.number="memForm.sort_order" type="number" class="w-24 border rounded px-3 py-2" placeholder="排序">
        </div>
        <textarea v-model="memForm.bio" class="w-full border rounded px-3 py-2" placeholder="简介"></textarea>
        <div class="flex items-center gap-4 border p-2 rounded border-dashed">
          <img v-if="memForm.avatar" :src="memForm.avatar" class="w-16 h-16 rounded-full object-cover shadow">
          <input @change="handleAvatarUpload" type="file" class="text-sm">
        </div>
        <button @click="submitMember" class="w-full bg-blue-600 text-white py-2 rounded shadow-md">提交</button>
        <button v-if="isEditingMember" @click="resetMemForm" class="w-full text-xs text-gray-500 mt-1">取消</button>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div class="col-span-2 flex justify-end">
        <button v-if="isSuperAdmin" @click="showDeleted = !showDeleted" class="text-xs px-2 py-1 rounded border">
          {{ showDeleted ? '隐藏已删除' : '显示已删除' }}
        </button>
      </div>
      <div v-for="mem in members" :key="mem.id" class="bg-white p-4 rounded shadow-sm border text-center relative group">
        <span v-if="mem.school" class="absolute top-1 right-1 text-[10px] text-white px-1.5 rounded-full" :style="{background: getSchoolColor(mem.school)}">{{ mem.school }}</span>
        <img
          :src="getThumbUrl(mem.avatar)"
          @error="(e) => (e.target.src = mem.avatar)"
          class="w-16 h-16 rounded-full object-cover bg-gray-100 border-2 border-white shadow-sm mb-2 mx-auto"
        >
        <div class="font-bold text-sm">{{ mem.name }}</div>
        <div class="text-xs text-gray-500 mb-2">{{ mem.role }}</div>
        <div v-if="mem.deleted_at" class="text-[10px] text-gray-600 mb-2">🗑️ 已删除</div>
        <div class="flex justify-center gap-2">
          <button v-if="!mem.deleted_at" @click="editMember(mem)" class="text-xs text-blue-500">Edit</button>
          <button v-if="!mem.deleted_at" @click="updateOrder(mem, 'up')" class="text-xs text-gray-500">▲</button>
          <button v-if="!mem.deleted_at" @click="updateOrder(mem, 'down')" class="text-xs text-gray-500">▼</button>
          <button v-if="!mem.deleted_at" @click="deleteMember(mem.id)" class="text-xs text-red-500">Del</button>
          <button v-if="mem.deleted_at && isSuperAdmin" @click="restoreMember(mem.id)" class="text-xs text-green-600">恢复</button>
        </div>
      </div>
    </div>
  </div>
</template>
