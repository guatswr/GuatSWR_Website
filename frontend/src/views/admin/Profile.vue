<script setup>
import { reactive, ref, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '../../stores/user'
import { compressImage } from '../../utils/image'

const userStore = useUserStore()

// --- 状态定义 ---
const pageLoading = ref(false)
const saveLoading = ref(false)
const isUploadingAvatar = ref(false)
const showPassword = ref(false)
const showTwoFaPassword = ref(false)
const initialTwofaEnabled = ref(false)

const profileForm = reactive({
  avatar: userStore.avatar || '',
  password: '',
  twofa_password: '',
  twofa_enabled: false
})

const fetchProfile = async () => {
  pageLoading.value = true
  try {
    const res = await axios.get('/api/auth/me')
    // 同步后端最新状态
    profileForm.twofa_enabled = !!res.data?.twofa_enabled
    initialTwofaEnabled.value = profileForm.twofa_enabled
    if (res.data?.avatar) {
        profileForm.avatar = res.data.avatar
        // 同时更新 store 保持一致
        userStore.setAvatar(res.data.avatar) 
    }
  } catch (e) {
    console.error('获取个人信息失败', e)
  } finally {
    pageLoading.value = false
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
  const file = e.target.files[0]
  if (file) {
    isUploadingAvatar.value = true
    try {
      const url = await uploadFile(file)
      profileForm.avatar = url
      // 立即更新 Store，让 Header 的头像也能即时变化
      userStore.setAvatar(url)
      ElMessage.success('头像上传成功')
    } catch (e) {
      ElMessage.error('头像上传失败')
    } finally {
      isUploadingAvatar.value = false
      e.target.value = '' // 清空 input 防止重复选择无响应
    }
  }
}

const updateProfile = async () => {
  const trimmedPassword = profileForm.password.trim()
  const trimmedTwofaPassword = profileForm.twofa_password.trim()
  const isTwofaToggled = profileForm.twofa_enabled !== initialTwofaEnabled.value

  // 如果是新开启 2FA，提示必须设置二步密码
  if (profileForm.twofa_enabled && isTwofaToggled && !trimmedTwofaPassword) {
    ElMessage.warning('开启二步验证需要设置二步密码')
    return
  }

  const payload = {
    avatar: profileForm.avatar
  }

  if (trimmedPassword) payload.password = trimmedPassword
  if (trimmedTwofaPassword) payload.twofa_password = trimmedTwofaPassword
  if (isTwofaToggled) payload.twofa_enabled = profileForm.twofa_enabled

  try {
    // 个人资料修改频率低，保留确认框防止误触
    // await ElMessageBox.confirm('确认保存当前修改的资料？', '保存确认', { type: 'warning' })
    
    saveLoading.value = true
    await axios.put('/api/auth/profile', payload)
    
    // 更新成功后重置密码框
    userStore.setAvatar(profileForm.avatar)
    profileForm.password = ''
    profileForm.twofa_password = ''
    
    ElMessage.success('个人资料已更新')
    await fetchProfile() // 重新拉取以确认状态
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('更新失败: ' + (e.response?.data?.message || e.message))
  } finally {
    saveLoading.value = false
  }
}

onMounted(() => {
  fetchProfile()
})
</script>

<template>
  <div class="max-w-md mx-auto bg-white p-8 rounded-xl shadow-sm border-t-4 border-indigo-500 relative">
    <div v-if="pageLoading" class="absolute inset-0 bg-white/80 z-10 flex items-center justify-center rounded-xl">
        <span class="animate-spin text-indigo-500 text-2xl">⏳</span>
    </div>

    <h2 class="font-bold mb-6 text-lg text-gray-800 flex items-center gap-2">
        👤 个人资料设置
    </h2>

    <div class="space-y-6">
      <!-- 头像区域 -->
      <div class="flex flex-col items-center">
        <div class="w-24 h-24 rounded-full bg-gray-100 overflow-hidden mb-4 border-4 border-indigo-50 shadow-sm relative group cursor-pointer">
          <img 
            v-if="profileForm.avatar" 
            :src="profileForm.avatar" 
            class="w-full h-full object-cover transition duration-300 group-hover:scale-105"
            @error="(e) => (e.target.style.display='none', e.target.nextElementSibling.style.display='flex')"
          >
          <!-- 兜底显示 -->
          <div class="w-full h-full hidden items-center justify-center text-gray-300 text-3xl font-bold bg-gray-50">
             {{ userStore.username ? userStore.username.charAt(0).toUpperCase() : '?' }}
          </div>
          <div v-if="!profileForm.avatar" class="absolute inset-0 flex items-center justify-center text-gray-300 text-3xl font-bold bg-gray-50">
             {{ userStore.username ? userStore.username.charAt(0).toUpperCase() : '?' }}
          </div>

          <!-- 上传遮罩 -->
          <label class="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white text-xs opacity-0 group-hover:opacity-100 transition duration-200 cursor-pointer backdrop-blur-[1px]">
            <span v-if="isUploadingAvatar" class="animate-spin text-xl mb-1">⏳</span>
            <span>{{ isUploadingAvatar ? '上传中...' : '点击更换' }}</span>
            <input @change="handleProfileAvatarUpload" type="file" class="hidden" accept="image/*">
          </label>
        </div>
        
        <p class="font-bold text-gray-800">{{ userStore.username }}</p>
        <p class="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full mt-1">
            {{ userStore.isSuperAdmin ? '站长 (Super Admin)' : '管理员 (Admin)' }}
        </p>
      </div>

      <!-- 修改密码 -->
      <div>
        <label class="block text-sm font-bold text-gray-700 mb-1">修改登录密码</label>
        <div class="relative">
            <input 
                v-model="profileForm.password" 
                :type="showPassword ? 'text' : 'password'" 
                class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-200 outline-none transition text-sm pr-10" 
                placeholder="如果不修改，请留空"
            >
            <button 
                @click="showPassword = !showPassword"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs focus:outline-none"
                tabindex="-1"
            >
                {{ showPassword ? '🙈' : '👁️' }}
            </button>
        </div>
      </div>

      <!-- 二步验证设置 -->
      <div class="border-t border-gray-100 pt-5 mt-2">
        <div class="flex items-center justify-between mb-3">
          <label class="block text-sm font-bold text-gray-700">二步验证 (2FA)</label>
          <label class="inline-flex items-center cursor-pointer">
            <input type="checkbox" v-model="profileForm.twofa_enabled" class="sr-only peer">
            <div class="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            <span class="ms-3 text-sm font-medium text-gray-600 select-none">{{ profileForm.twofa_enabled ? '已开启' : '已关闭' }}</span>
          </label>
        </div>
        
        <div v-if="profileForm.twofa_enabled" class="animate-fadeIn">
             <div class="relative">
                <input
                    v-model="profileForm.twofa_password"
                    :type="showTwoFaPassword ? 'text' : 'password'"
                    class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-200 outline-none transition text-sm pr-10"
                    placeholder="设置新的二步验证密码"
                >
                 <button 
                    @click="showTwoFaPassword = !showTwoFaPassword"
                    class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs focus:outline-none"
                    tabindex="-1"
                >
                    {{ showTwoFaPassword ? '🙈' : '👁️' }}
                </button>
            </div>
            <p class="text-[10px] text-gray-500 mt-1.5 flex items-start gap-1">
                <span class="text-indigo-500">ℹ️</span> 
                启用后，登录及进行敏感操作（如删除数据）时需输入此密码。
            </p>
        </div>
        <div v-else class="text-xs text-gray-400 bg-gray-50 p-2 rounded">
            未启用二步验证。建议开启以提高账户安全性。
        </div>
      </div>

      <button 
        @click="updateProfile" 
        :disabled="saveLoading"
        class="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-bold hover:bg-indigo-700 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <span v-if="saveLoading" class="animate-spin text-white">🔄</span>
        {{ saveLoading ? '保存中...' : '保存修改' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.animate-fadeIn {
  animation: fadeIn 0.3s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>