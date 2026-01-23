<script setup>
import { reactive, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '../../stores/user'
import { compressImage } from '../../utils/image'

const userStore = useUserStore()
const profileForm = reactive({
  avatar: userStore.avatar || '',
  password: '',
  twofa_password: '',
  twofa_enabled: false
})

const fetchProfile = async () => {
  try {
    const res = await axios.get('/api/auth/me')
    profileForm.twofa_enabled = !!res.data?.twofa_enabled
  } catch (e) {
    // ignore
  }
}

const uploadFile = async (file) => {
  const compressed = await compressImage(file)
  const d = new FormData()
  d.append('file', compressed)
  const r = await axios.post('/api/upload', d)
  return r.data.url
}

const handleProfileAvatarUpload = async (e) => {
  if (e.target.files[0]) {
    try {
      const url = await uploadFile(e.target.files[0])
      profileForm.avatar = url
    } catch (e) {
      ElMessage.error('头像上传失败')
    }
  }
}

const updateProfile = async () => {
  try {
    await ElMessageBox.confirm('确认更新个人资料？', '确认保存', { type: 'warning' })
    await axios.put('/api/auth/profile', profileForm)
    userStore.setAvatar(profileForm.avatar)
    profileForm.password = ''
    profileForm.twofa_password = ''
    ElMessage.success('个人资料已更新')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('更新失败: ' + (e.response?.data?.message || e.message))
  }
}

onMounted(() => {
  fetchProfile()
})
</script>

<template>
  <div class="max-w-md mx-auto bg-white p-8 rounded-xl shadow-sm border-t-4 border-indigo-500">
    <h2 class="font-bold mb-6 text-lg">👤 个人资料设置</h2>
    <div class="space-y-6">
      <div class="flex flex-col items-center">
        <div class="w-24 h-24 rounded-full bg-gray-200 overflow-hidden mb-4 border-2 border-indigo-100 shadow-sm relative group">
          <img v-if="profileForm.avatar" :src="profileForm.avatar" class="w-full h-full object-cover">
          <div v-else class="w-full h-full flex items-center justify-center text-gray-400 text-2xl">?</div>
          <label class="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-xs opacity-0 group-hover:opacity-100 cursor-pointer transition">
            更换头像
            <input @change="handleProfileAvatarUpload" type="file" class="hidden" accept="image/*">
          </label>
        </div>
        <p class="text-sm text-gray-500">{{ userStore.username }}</p>
      </div>

      <div>
        <label class="block text-sm font-bold text-gray-700 mb-1">修改密码</label>
        <input v-model="profileForm.password" type="password" class="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="不修改请留空">
      </div>

      <div class="border-t pt-4">
        <div class="flex items-center justify-between mb-2">
          <label class="block text-sm font-bold text-gray-700">二步密码</label>
          <label class="inline-flex items-center gap-2 text-sm text-gray-600">
            <input v-model="profileForm.twofa_enabled" type="checkbox" class="rounded border-gray-300">
            启用
          </label>
        </div>
        <input
          v-if="profileForm.twofa_enabled"
          v-model="profileForm.twofa_password"
          type="password"
          class="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-indigo-200 outline-none"
          placeholder="设置/更新二步密码"
        >
        <p class="text-xs text-gray-500 mt-2">启用后，登录时需额外输入二步密码。</p>
      </div>

      <button @click="updateProfile" class="w-full bg-indigo-600 text-white py-2 rounded font-bold hover:bg-indigo-700 transition">
        保存修改
      </button>
    </div>
  </div>
</template>
