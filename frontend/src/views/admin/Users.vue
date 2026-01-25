<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const users = ref([])
const adminForm = ref({ username: '', password: '' })
const bans = ref([])
const banForm = ref({ ip: '', reason: '', minutes: 60 })

const fetchUsers = async () => {
  try {
    const res = await axios.get('/api/admin/users')
    users.value = res.data
  } catch (e) {
    ElMessage.error('加载管理员失败')
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

onMounted(() => {
  fetchUsers()
  fetchBans()
})

const addAdmin = async () => {
  if (!adminForm.value.username) return ElMessage.warning('请输入账号')
  try {
    await axios.post('/api/auth/register', adminForm.value)
    ElMessage.success('添加成功')
    adminForm.value = { username: '', password: '' }
    fetchUsers()
  } catch (e) {
    ElMessage.error('添加失败')
  }
}

const deleteUser = async (id) => {
  try {
    await ElMessageBox.confirm('确定删除该管理员吗？', '提示', { type: 'warning' })
    await axios.delete(`/api/admin/users/${id}`)
    fetchUsers()
    ElMessage.success('删除成功')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
  }
}

const resetPassword = async (id) => {
  try {
    const { value } = await ElMessageBox.prompt('请输入新密码', '重置密码', { inputType: 'password' })
    if (!value) return
    await axios.put(`/api/admin/users/${id}/password`, { password: value })
    ElMessage.success('重置成功')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('重置失败')
  }
}

const resetTwofa = async (id) => {
  try {
    await ElMessageBox.confirm('确定重置该账号的二步密码吗？', '重置二步密码', { type: 'warning' })
    await axios.put(`/api/admin/users/${id}/twofa/reset`)
    ElMessage.success('已重置二步密码')
    fetchUsers()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('重置失败')
  }
}

const forceRefreshSessions = async () => {
  try {
    await ElMessageBox.confirm('将强制所有管理员重新登录，是否继续？', '强制刷新登录', { type: 'warning' })
    await axios.post('/api/admin/token-version/refresh')
    ElMessage.success('已强制刷新登录状态')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('操作失败')
  }
}

const addBan = async () => {
  if (!banForm.value.ip) return ElMessage.warning('请输入 IP')
  try {
    await ElMessageBox.confirm('确认封禁该 IP？', '封禁确认', { type: 'warning' })
    await axios.post('/api/admin/bans', banForm.value)
    ElMessage.success('已封禁')
    banForm.value = { ip: '', reason: '', minutes: 60 }
    fetchBans()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.response?.data?.message || '封禁失败')
  }
}

const removeBan = async (ip) => {
  try {
    await ElMessageBox.confirm('确认解封该 IP？', '解封确认', { type: 'warning' })
    await axios.delete(`/api/admin/bans/${encodeURIComponent(ip)}`)
    ElMessage.success('已解封')
    fetchBans()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('解封失败')
  }
}
</script>

<template>
  <div class="grid lg:grid-cols-2 gap-8">
    <div class="bg-white p-6 rounded-xl border-t-4 border-gray-600 h-fit">
      <h2 class="text-lg font-bold mb-6">🔑 添加管理员</h2>
      <div class="space-y-4">
        <input v-model="adminForm.username" class="w-full border p-2 rounded" placeholder="账号">
        <input v-model="adminForm.password" class="w-full border p-2 rounded" placeholder="密码">
        <button @click="addAdmin" class="w-full bg-gray-800 text-white py-2 rounded">添加</button>
      </div>
      <div class="mt-6 pt-4 border-t border-gray-100">
        <h3 class="text-sm font-bold mb-2">🔒 登录控制</h3>
        <button @click="forceRefreshSessions" class="w-full bg-red-600 text-white py-2 rounded hover:bg-red-700 transition">
          强制刷新所有管理员登录
        </button>
        <p class="text-xs text-gray-500 mt-2">执行后所有管理员需重新登录。</p>
      </div>
    </div>
    <div class="bg-white p-6 rounded-xl shadow-sm">
      <h2 class="text-lg font-bold mb-4">现有管理员</h2>
      <div class="space-y-2">
        <div v-for="user in users" :key="user.id" class="flex justify-between items-center p-3 border rounded bg-gray-50">
          <div class="flex items-center gap-2">
            <img v-if="user.avatar" :src="user.avatar" class="w-6 h-6 rounded-full object-cover">
            <span class="font-bold">{{ user.username }}</span>
            <span class="text-xs px-2 rounded-full" :class="user.role==='super_admin'?'bg-blue-100 text-blue-600':'bg-gray-200'">{{ user.role }}</span>
            <span v-if="user.twofa_enabled" class="text-xs px-2 rounded-full bg-green-100 text-green-700">2FA</span>
            <span v-else class="text-xs px-2 rounded-full bg-gray-200 text-gray-600">2FA关</span>
          </div>
          <div class="flex gap-2" v-if="user.role !== 'super_admin'">
            <button @click="resetPassword(user.id)" class="text-xs text-yellow-600">重置密码</button>
            <button @click="resetTwofa(user.id)" class="text-xs text-orange-600">重置2FA</button>
            <button @click="deleteUser(user.id)" class="text-xs text-red-600">删除</button>
          </div>
        </div>
      </div>
    </div>
    <div class="bg-white p-6 rounded-xl shadow-sm lg:col-span-2">
      <h2 class="text-lg font-bold mb-4">🚫 IP 封禁管理</h2>
      <div class="grid md:grid-cols-4 gap-3 mb-4">
        <input v-model="banForm.ip" class="border p-2 rounded" placeholder="IP 地址">
        <input v-model="banForm.reason" class="border p-2 rounded" placeholder="封禁原因 (可选)">
        <input v-model.number="banForm.minutes" type="number" min="0" class="border p-2 rounded" placeholder="封禁分钟 (0=永久)">
        <button @click="addBan" class="bg-red-600 text-white py-2 rounded">封禁</button>
      </div>
      <div class="space-y-2">
        <div v-for="ban in bans" :key="ban.ip" class="flex flex-wrap items-center justify-between gap-2 p-3 border rounded bg-gray-50">
          <div class="flex flex-wrap items-center gap-3 text-sm">
            <span class="font-bold">{{ ban.ip }}</span>
            <span v-if="ban.reason" class="text-gray-600">{{ ban.reason }}</span>
            <span class="text-xs text-gray-500">操作人：{{ ban.created_by || 'ATRI' }}</span>
            <span class="text-xs text-gray-500" v-if="ban.expires_at">到期：{{ new Date(ban.expires_at).toLocaleString() }}</span>
            <span class="text-xs text-gray-500" v-else>永久</span>
          </div>
          <button @click="removeBan(ban.ip)" class="text-xs text-green-600">解封</button>
        </div>
        <div v-if="bans.length === 0" class="text-sm text-gray-500">暂无封禁记录</div>
      </div>
    </div>
  </div>
</template>
