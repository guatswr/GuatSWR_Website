<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '../../stores/user'

const userStore = useUserStore()

// --- State ---
const pageLoading = ref(false)
const users = ref([])
const bans = ref([])

// Loading states for specific actions
const addAdminLoading = ref(false)
const banLoading = ref(false)
const refreshSessionLoading = ref(false)
const processingId = ref(null) // ID or IP being processed

const adminForm = reactive({ username: '', password: '' })
const banForm = reactive({ ip: '', reason: '', minutes: 60 })

// --- Helpers ---
const formatDate = (dateStr) => {
  if (!dateStr) return '永久'
  return new Date(dateStr).toLocaleString('zh-CN', { hour12: false })
}

// --- Data Fetching ---
const fetchUsers = async () => {
  try {
    const res = await axios.get('/api/admin/users')
    users.value = res.data || []
  } catch (e) {
    ElMessage.error('加载管理员列表失败')
  }
}

const fetchBans = async () => {
  try {
    const res = await axios.get('/api/admin/bans')
    bans.value = res.data?.bans || []
  } catch (e) {
    ElMessage.error('加载封禁列表失败')
  }
}

const initData = async () => {
  pageLoading.value = true
  try {
    await Promise.all([fetchUsers(), fetchBans()])
  } finally {
    pageLoading.value = false
  }
}

onMounted(() => {
  initData()
})

// --- Admin Management ---

const addAdmin = async () => {
  if (!adminForm.username || !adminForm.password) return ElMessage.warning('请输入账号和密码')
  
  addAdminLoading.value = true
  try {
    await axios.post('/api/auth/register', adminForm)
    ElMessage.success(`管理员 ${adminForm.username} 添加成功`)
    adminForm.username = ''
    adminForm.password = ''
    await fetchUsers()
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '添加失败')
  } finally {
    addAdminLoading.value = false
  }
}

const deleteUser = async (id) => {
  try {
    await ElMessageBox.confirm('确定永久删除该管理员账号吗？', '删除警告', { 
        type: 'warning', 
        confirmButtonText: '确定删除',
        confirmButtonClass: 'el-button--danger'
    })
    processingId.value = id
    await axios.delete(`/api/admin/users/${id}`)
    // Optimistic update
    users.value = users.value.filter(u => u.id !== id)
    ElMessage.success('删除成功')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
  } finally {
    processingId.value = null
  }
}

const resetPassword = async (id) => {
  try {
    const { value } = await ElMessageBox.prompt('请输入新密码', '重置密码', { 
        inputType: 'password',
        inputPattern: /.{6,}/,
        inputErrorMessage: '密码长度至少 6 位'
    })
    if (!value) return
    
    processingId.value = id
    await axios.put(`/api/admin/users/${id}/password`, { password: value })
    ElMessage.success('密码重置成功')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('重置失败')
  } finally {
    processingId.value = null
  }
}

const resetTwofa = async (id) => {
  try {
    await ElMessageBox.confirm('确定重置该账号的二步验证状态吗？\n重置后该用户登录将不再需要二步密码。', '重置 2FA', { type: 'warning' })
    processingId.value = id
    await axios.put(`/api/admin/users/${id}/twofa/reset`)
    ElMessage.success('二步验证已重置')
    await fetchUsers()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('重置失败')
  } finally {
    processingId.value = null
  }
}

const forceRefreshSessions = async () => {
  try {
    await ElMessageBox.confirm(
        '⚠️ 高风险操作：\n这将强制系统内所有管理员（包括你自己）立即登出，必须重新登录。\n是否继续？', 
        '强制刷新 Session', 
        { type: 'warning', confirmButtonText: '强制登出所有人', confirmButtonClass: 'el-button--danger' }
    )
    refreshSessionLoading.value = true
    await axios.post('/api/admin/token-version/refresh')
    ElMessage.success('操作成功，即将跳转登录页...')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('操作失败')
  } finally {
    refreshSessionLoading.value = false
  }
}

// --- Ban Management ---

const addBan = async () => {
  if (!banForm.ip) return ElMessage.warning('请输入 IP 地址')
  
  banLoading.value = true
  try {
    await axios.post('/api/admin/bans', banForm)
    ElMessage.success(`IP ${banForm.ip} 已封禁`)
    banForm.ip = ''
    banForm.reason = ''
    banForm.minutes = 60
    await fetchBans()
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '封禁失败')
  } finally {
    banLoading.value = false
  }
}

const removeBan = async (ip) => {
  try {
    // Encode IP to handle special characters if any (though usually fine in path)
    processingId.value = ip
    await axios.delete(`/api/admin/bans/${encodeURIComponent(ip)}`)
    
    bans.value = bans.value.filter(b => b.ip !== ip)
    ElMessage.success('已解封')
  } catch (e) {
    ElMessage.error('解封失败')
  } finally {
    processingId.value = null
  }
}
</script>

<template>
  <div class="space-y-8">
    
    <!-- Top Section: Admins & Add Admin -->
    <div class="grid lg:grid-cols-12 gap-8 items-start">
        
        <!-- Left: Add Admin & Controls (4 cols) -->
        <div class="lg:col-span-4 space-y-6">
            <!-- Add Admin Card -->
            <div class="bg-white p-6 rounded-xl border-t-4 border-gray-700 shadow-sm">
                <h2 class="text-lg font-bold mb-4 flex items-center gap-2">
                    🔑 添加管理员
                </h2>
                <div class="space-y-4">
                    <div>
                        <label class="text-xs text-gray-500 mb-1 block">账号</label>
                        <input v-model="adminForm.username" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-gray-200 outline-none" placeholder="Username">
                    </div>
                    <div>
                        <label class="text-xs text-gray-500 mb-1 block">初始密码</label>
                        <input v-model="adminForm.password" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-gray-200 outline-none" placeholder="Password">
                    </div>
                    <button 
                        @click="addAdmin" 
                        :disabled="addAdminLoading"
                        class="w-full bg-gray-800 text-white py-2.5 rounded-lg font-bold hover:bg-gray-900 transition flex items-center justify-center gap-2 disabled:opacity-70"
                    >
                        <span v-if="addAdminLoading" class="animate-spin">🔄</span>
                        添加管理员
                    </button>
                </div>
            </div>

            <!-- Security Controls Card -->
            <div class="bg-white p-6 rounded-xl border-t-4 border-red-500 shadow-sm">
                <h3 class="font-bold text-gray-800 mb-2 flex items-center gap-2">
                    🔒 安全控制
                </h3>
                <p class="text-xs text-gray-500 mb-4">
                    如果怀疑系统被入侵，可以使用此功能立即使所有已登录的管理员 Token 失效。
                </p>
                <button 
                    @click="forceRefreshSessions" 
                    :disabled="refreshSessionLoading"
                    class="w-full bg-red-50 text-red-600 border border-red-100 py-2.5 rounded-lg font-bold hover:bg-red-100 transition flex items-center justify-center gap-2"
                >
                    <span v-if="refreshSessionLoading" class="animate-spin">⚙️</span>
                    强制刷新所有登录
                </button>
            </div>
        </div>

        <!-- Right: Admin List (8 cols) -->
        <div class="lg:col-span-8 bg-white p-6 rounded-xl shadow-sm border border-gray-100 min-h-[300px] relative">
            <h2 class="text-lg font-bold mb-4 flex justify-between items-center">
                <span>👥 管理员列表 ({{ users.length }})</span>
                <button @click="fetchUsers" class="text-sm text-blue-600 hover:underline">刷新</button>
            </h2>

            <div v-if="pageLoading" class="absolute inset-0 bg-white/80 z-10 flex items-center justify-center">
                <div class="animate-spin text-3xl text-gray-400">⏳</div>
            </div>

            <div class="space-y-3">
                <div v-for="user in users" :key="user.id" class="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-xl bg-gray-50 hover:bg-white hover:shadow-md transition gap-4">
                    <!-- User Info -->
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center shrink-0 border border-white shadow-sm">
                            <img v-if="user.avatar" :src="user.avatar" class="w-full h-full object-cover">
                            <span v-else class="text-sm font-bold text-gray-500">{{ user.username.charAt(0).toUpperCase() }}</span>
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <span class="font-bold text-gray-800">{{ user.username }}</span>
                                <span v-if="user.role === 'super_admin'" class="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200">站长</span>
                                <span v-else class="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded border border-gray-300">管理员</span>
                            </div>
                            <div class="flex items-center gap-2 mt-1">
                                <span 
                                    class="text-[10px] px-1.5 rounded flex items-center gap-1"
                                    :class="user.twofa_enabled ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'"
                                >
                                    {{ user.twofa_enabled ? '🛡️ 2FA 已开启' : '⚠️ 2FA 未开启' }}
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Actions -->
                    <div class="flex items-center gap-2 self-end sm:self-auto" v-if="user.role !== 'super_admin'">
                        <button 
                            @click="resetPassword(user.id)" 
                            :disabled="processingId === user.id"
                            class="px-3 py-1.5 text-xs font-medium text-yellow-700 bg-yellow-50 hover:bg-yellow-100 rounded border border-yellow-200 transition"
                        >
                            重置密码
                        </button>
                        <button 
                            @click="resetTwofa(user.id)" 
                            :disabled="processingId === user.id"
                            class="px-3 py-1.5 text-xs font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 rounded border border-orange-200 transition"
                        >
                            重置 2FA
                        </button>
                        <button 
                            @click="deleteUser(user.id)" 
                            :disabled="processingId === user.id"
                            class="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded border border-red-200 transition"
                        >
                            {{ processingId === user.id ? '...' : '删除' }}
                        </button>
                    </div>
                    <div v-else class="text-xs text-gray-400 italic self-end sm:self-auto px-2">
                        不可操作
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Bottom Section: Ban Management -->
    <div class="bg-white p-6 rounded-xl shadow-sm border-t-4 border-red-600">
        <h2 class="text-lg font-bold mb-6 flex items-center gap-2 text-red-700">
            🚫 IP 封禁管理
        </h2>
        
        <!-- Ban Form -->
        <div class="bg-red-50 p-4 rounded-lg border border-red-100 mb-6">
            <div class="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div class="md:col-span-4">
                    <label class="text-xs text-red-500 mb-1 block font-bold">目标 IP 地址</label>
                    <input v-model="banForm.ip" class="w-full border border-red-200 rounded px-3 py-2 focus:ring-2 focus:ring-red-200 outline-none" placeholder="x.x.x.x">
                </div>
                <div class="md:col-span-4">
                    <label class="text-xs text-red-500 mb-1 block font-bold">封禁原因 (可选)</label>
                    <input v-model="banForm.reason" class="w-full border border-red-200 rounded px-3 py-2 focus:ring-2 focus:ring-red-200 outline-none" placeholder="例如：恶意扫描">
                </div>
                <div class="md:col-span-2">
                    <label class="text-xs text-red-500 mb-1 block font-bold">时长 (分钟)</label>
                    <input v-model.number="banForm.minutes" type="number" min="0" class="w-full border border-red-200 rounded px-3 py-2 focus:ring-2 focus:ring-red-200 outline-none" placeholder="0 = 永久">
                </div>
                <div class="md:col-span-2">
                    <button 
                        @click="addBan" 
                        :disabled="banLoading"
                        class="w-full bg-red-600 text-white py-2 rounded font-bold hover:bg-red-700 transition shadow-sm flex items-center justify-center gap-2"
                    >
                        <span v-if="banLoading" class="animate-spin">⏳</span>
                        执行封禁
                    </button>
                </div>
            </div>
            <p class="text-[10px] text-red-400 mt-2">
                * 设置时长为 0 即为永久封禁。封禁后该 IP 将无法访问 API 接口。
            </p>
        </div>

        <!-- Ban List -->
        <div class="overflow-x-auto rounded-lg border border-gray-100">
            <table class="w-full text-sm text-left">
                <thead class="bg-gray-50 text-gray-700 text-xs uppercase">
                    <tr>
                        <th class="p-3">IP 地址</th>
                        <th class="p-3">原因</th>
                        <th class="p-3">操作人</th>
                        <th class="p-3">到期时间</th>
                        <th class="p-3 text-right">操作</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    <tr v-for="ban in bans" :key="ban.ip" class="hover:bg-gray-50 transition">
                        <td class="p-3 font-mono font-bold text-gray-700">{{ ban.ip }}</td>
                        <td class="p-3 text-gray-600">{{ ban.reason || '-' }}</td>
                        <td class="p-3">
                             <span class="bg-gray-100 px-2 py-0.5 rounded text-xs text-gray-500">{{ ban.created_by || 'System' }}</span>
                        </td>
                        <td class="p-3">
                            <span 
                                class="text-xs px-2 py-0.5 rounded"
                                :class="ban.expires_at ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'"
                            >
                                {{ formatDate(ban.expires_at) }}
                            </span>
                        </td>
                        <td class="p-3 text-right">
                            <button 
                                @click="removeBan(ban.ip)" 
                                :disabled="processingId === ban.ip"
                                class="text-xs text-green-600 hover:text-green-800 font-bold border border-green-200 bg-green-50 px-3 py-1 rounded hover:bg-green-100 transition"
                            >
                                {{ processingId === ban.ip ? '...' : '解封' }}
                            </button>
                        </td>
                    </tr>
                    <tr v-if="bans.length === 0">
                        <td colspan="5" class="p-8 text-center text-gray-400">暂无封禁记录</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
  </div>
</template>