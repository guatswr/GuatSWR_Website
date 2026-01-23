<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '../../stores/user'

const router = useRouter()
const userStore = useUserStore()
const username = ref('')
const password = ref('')
const twofa = ref('')
const loading = ref(false)
const verifying = ref(false)
const verifyMsg = ref('')
const errorMsg = ref('')
const currentBg = ref('')


const bgModules = import.meta.glob('../../bg/login/*.{png,jpg,jpeg,webp,gif}', { eager: true })

const initBackground = () => {
  const images = Object.values(bgModules).map(mod => mod.default)
  if (images.length > 0) {
    const randomIndex = Math.floor(Math.random() * images.length)
    currentBg.value = images[randomIndex]
  } else {
    currentBg.value = ''
  }
}

const handleLogin = async () => {
  loading.value = true
  errorMsg.value = ''
  
  try {
    const res = await axios.post('/api/auth/login', {
      username: username.value,
      password: password.value,
      twofa: twofa.value || undefined
    })
    
    // 保存 Token、用户名、角色
    userStore.setAuth({
      token: res.data.token,
      username: res.data.username,
      role: res.data.role,
      avatar: res.data.avatar
    })
    
    await ElMessageBox.alert(
      '数据无价，谨慎操作。',
      '提示',
      { confirmButtonText: '进入管理端', type: 'warning' }
    )
    router.push('/admin')
  } catch (err) {
    console.error(err)
    if (err.response) {
      errorMsg.value = err.response.data.message || '登录失败'
    } else {
      errorMsg.value = '服务器连接失败，请检查网络或后端状态'
    }
    ElMessage.error(errorMsg.value)
  } finally {
    loading.value = false
  }
}

const verifyExistingSession = async () => {
  if (!userStore.token) {
    userStore.initFromStorage()
  }
  if (!userStore.token) return

  verifying.value = true
  verifyMsg.value = '检测到登录状态，正在验证...'

  try {
    const res = await axios.get('/api/auth/me')
    userStore.setAuth({
      token: userStore.token,
      username: res.data.username,
      role: res.data.role,
      avatar: res.data.avatar
    })
    verifyMsg.value = '验证通过，正在跳转...'
    router.replace('/admin')
  } catch (err) {
    userStore.clearAuth()
    verifyMsg.value = ''
  } finally {
    verifying.value = false
  }
}

onMounted(() => {
  initBackground()
  verifyExistingSession()
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-900 relative overflow-hidden">
    <!-- 背景层 -->
    <div v-if="currentBg"
      class="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-40 transition-all duration-1000 ease-in-out"
      :style="{ backgroundImage: `url('${currentBg}')` }"
    ></div>
    
    <div class="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/80 to-transparent"></div>

    <div class="relative z-10 w-full max-w-md p-8 bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl animate-[fadeIn_0.5s_ease-out]">
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-white font-serif tracking-widest">博丽神社办事处</h1>
        <p class="text-gray-400 text-sm mt-2">GuatSWR Administration</p>
      </div>

      <form @submit.prevent="handleLogin" class="space-y-6">
        <div>
          <label class="block text-gray-300 text-sm font-bold mb-2">Username</label>
          <input 
            v-model="username" 
            type="text" 
            class="w-full px-4 py-3 rounded-lg bg-gray-800/50 border border-gray-600 text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition placeholder-gray-500"
            placeholder="请输入管理员账号"
            required
          >
        </div>

        <div>
          <label class="block text-gray-300 text-sm font-bold mb-2">Password</label>
          <input 
            v-model="password" 
            type="password" 
            class="w-full px-4 py-3 rounded-lg bg-gray-800/50 border border-gray-600 text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition placeholder-gray-500"
            placeholder="请输入密码"
            required
          >
        </div>

        <div>
          <label class="block text-gray-300 text-sm font-bold mb-2">二步密码 (可选)</label>
          <input 
            v-model="twofa" 
            type="password" 
            class="w-full px-4 py-3 rounded-lg bg-gray-800/50 border border-gray-600 text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition placeholder-gray-500"
            placeholder="已启用二步密码时必填"
          >
        </div>

        <div v-if="errorMsg" class="text-red-400 text-sm text-center bg-red-900/20 py-2 rounded border border-red-900/50 animate-pulse font-bold">
          ⚠️ {{ errorMsg }}
        </div>

        <div v-if="verifyMsg" class="text-amber-200 text-xs text-center bg-amber-900/20 py-2 rounded border border-amber-900/50">
          {{ verifyMsg }}
        </div>

        <button 
          type="submit" 
          :disabled="loading || verifying"
          class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg transition transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center shadow-lg shadow-red-900/50"
        >
          <span v-if="loading" class="animate-spin mr-2">☯</span>
          {{ loading ? '正在穿越隙间...' : '登录系统' }}
        </button>
      </form>
      
      <div class="mt-6 text-center text-xs text-gray-500">
        需要管理员账号？请联系Taropoi。
      </div>
    </div>
  </div>
</template>

<style>
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
