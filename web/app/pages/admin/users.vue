<script setup lang="ts">
import AdminPanel from '~/components/admin/Panel.vue'
import AdminAvatar from '~/components/admin/Avatar.vue'
import { useQuery } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminUserRowSchema, resetPasswordSchema } from '@guatswr/shared'
import { adminBanInputSchema, adminBanRowSchema, adminRegisterSchema } from '@guatswr/shared/admin-workflows'

definePageMeta({ layout: 'admin', middleware: 'admin', requiresSuperAdmin: true })
const api = useAdminApi()
const userQuery = useQuery({ queryKey: ['admin', 'users'], queryFn: ({ signal }) => api.request({ resource: 'users', signal }, value => {
  if (!Array.isArray(value)) throw new Error('账号列表无效')
  return value.map(user => adminUserRowSchema.parse(user))
}) })
const banQuery = useQuery({ queryKey: ['admin', 'bans'], queryFn: () => api.command('banList', undefined, value => {
  if (!value || typeof value !== 'object' || !('bans' in value) || !Array.isArray(value.bans)) throw new Error('封禁列表无效')
  return value.bans.map(ban => adminBanRowSchema.parse(ban))
}) })
const users = computed(() => userQuery.data.value ?? [])
const bans = computed(() => banQuery.data.value ?? [])

watch(userQuery.error, error => { if (error) ElMessage.error('加载管理员列表失败') })
watch(banQuery.error, error => { if (error) ElMessage.error('加载封禁列表失败') })
const addAdminLoading = ref(false), banLoading = ref(false), refreshSessionLoading = ref(false)
const processingId = ref<number | string | null>(null)
const adminForm = reactive({ username: '', password: '' })
const banForm = reactive({ ip: '', reason: '', minutes: 60 })
const fetchUsers = () => userQuery.refetch()
const fetchBans = () => banQuery.refetch()
function formatDate(value: string | number | null | undefined) {
  if (!value) return '永久'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
}
async function addAdmin() {
  if (addAdminLoading.value) return
  const parsed = adminRegisterSchema.safeParse(adminForm)
  if (!parsed.success) { ElMessage.warning(parsed.error.issues[0]?.message ?? '请输入账号和密码'); return }
  addAdminLoading.value = true
  try {
    await api.request({ resource: 'users', method: 'POST', body: parsed.data }, value => value)
    ElMessage.success(`管理员 ${adminForm.username} 添加成功`)
    adminForm.username = ''; adminForm.password = ''; await fetchUsers()
  } catch { ElMessage.error('添加失败') }
  finally { addAdminLoading.value = false }
}
async function deleteUser(id: number) {
  if (processingId.value !== null) return
  try {
    await ElMessageBox.confirm('确定永久删除该管理员账号吗？', '删除警告', { type: 'warning', confirmButtonText: '确定删除', confirmButtonClass: 'el-button--danger' })
    processingId.value = id
    await api.request({ resource: 'users', method: 'DELETE', id }, value => value)
    await fetchUsers(); ElMessage.success('删除成功')
  } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error('删除失败') }
  finally { processingId.value = null }
}
async function resetPassword(id: number) {
  if (processingId.value !== null) return
  try {
    const { value: password } = await ElMessageBox.prompt('请输入新密码', '重置密码', { inputType: 'password', inputPattern: /^[\s\S]{6,100}$/, inputErrorMessage: '密码长度须为 6 至 100 位' })
    const body = resetPasswordSchema.parse({ password })
    processingId.value = id
    await api.request({ resource: 'users', method: 'PUT', id, action: 'password', body }, value => value)
    ElMessage.success('密码重置成功')
  } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error('重置失败') }
  finally { processingId.value = null }
}
async function resetTwofa(id: number) {
  if (processingId.value !== null) return
  try {
    await ElMessageBox.confirm('确定重置该账号的二步验证状态吗？\n重置后该用户登录将不再需要二步密码。', '重置 2FA', { type: 'warning' })
    processingId.value = id
    await api.request({ resource: 'users', method: 'PUT', id, action: 'twofa-reset' }, value => value)
    ElMessage.success('二步验证已重置'); await fetchUsers()
  } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error('重置失败') }
  finally { processingId.value = null }
}
async function forceRefreshSessions() {
  if (refreshSessionLoading.value) return
  try {
    await ElMessageBox.confirm('⚠️ 高风险操作：\n这将强制系统内所有管理员（包括你自己）立即登出，必须重新登录。\n是否继续？', '强制刷新 Session', { type: 'warning', confirmButtonText: '强制登出所有人', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger' })
    refreshSessionLoading.value = true
    await api.command('tokenRefresh', {}, value => value)
    ElMessage.success('操作成功，即将跳转登录页...')
  } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error('操作失败') }
  finally { refreshSessionLoading.value = false }
}
async function addBan() {
  if (banLoading.value) return
  const parsed = adminBanInputSchema.safeParse(banForm)
  if (!parsed.success) { ElMessage.warning(parsed.error.issues[0]?.message ?? '请输入有效 IP 地址'); return }
  banLoading.value = true
  try {
    await api.command('banCreate', parsed.data, value => value)
    ElMessage.success(`IP ${banForm.ip} 已封禁`)
    Object.assign(banForm, { ip: '', reason: '', minutes: 60 }); await fetchBans()
  } catch { ElMessage.error('封禁失败') }
  finally { banLoading.value = false }
}
async function removeBan(ip: string) {
  if (processingId.value !== null) return
  processingId.value = ip
  try { await api.removeBan(ip); await fetchBans(); ElMessage.success('已解封') }
  catch { ElMessage.error('解封失败') }
  finally { processingId.value = null }
}
</script>
<template>
<div class="admin-stack">
    <div class="admin-split"><AdminPanel title="添加管理员" description="新账号为普通管理员；创建后请安全交付初始密码。"><form class="admin-form-grid" @submit.prevent="addAdmin"><div class="admin-field"><label for="admin-username">账号</label><input id="admin-username" v-model="adminForm.username" autocomplete="off" placeholder="Username" required ></div><div class="admin-field"><label for="admin-password">初始密码</label><input id="admin-password" v-model="adminForm.password" type="password" autocomplete="new-password" placeholder="Password" required minlength="6" maxlength="100" ></div><button class="admin-button admin-button--primary" type="submit" :disabled="addAdminLoading">{{ addAdminLoading ? '添加中…' : '添加管理员' }}</button></form></AdminPanel>
      <AdminPanel title="管理员账号" :description="`共 ${users.length} 个账号`"><template #actions><button class="admin-button admin-button--secondary" :disabled="userQuery.isFetching.value" @click="fetchUsers">刷新</button></template><div v-if="userQuery.isPending.value" class="admin-empty" role="status">正在加载账号…</div><div v-else-if="userQuery.isError.value" role="alert" class="admin-notice admin-notice--error">加载账号失败，请刷新重试。</div><div v-else class="admin-stack"><article v-for="user in users" :key="user.id" data-testid="admin-user-card" class="admin-resource-card"><div class="admin-member-summary"><AdminAvatar :src="user.avatar" :name="user.username" /><div><h3>{{ user.username }}</h3><div class="admin-tags"><span class="admin-badge">{{ user.role === 'super_admin' ? '超级管理员' : '管理员' }}</span><span class="admin-badge">{{ user.twofa_enabled ? '2FA 已开启' : '2FA 未开启' }}</span></div></div></div><div v-if="user.role !== 'super_admin'" class="admin-row-actions"><button class="admin-button admin-button--secondary" :disabled="processingId !== null" @click="resetPassword(user.id)">重置密码</button><button class="admin-button admin-button--secondary" :disabled="processingId !== null" @click="resetTwofa(user.id)">重置 2FA</button><button class="admin-button admin-button--danger" :disabled="processingId !== null" @click="deleteUser(user.id)">删除</button></div><p v-else class="admin-hint">超级管理员在此列表中受保护。</p></article></div></AdminPanel>
    </div>
    <AdminPanel title="IP 访问限制" description="支持 IPv4 与 IPv6，封禁后该地址无法访问 API。">
      <form class="admin-filter-bar" @submit.prevent="addBan"><div class="admin-field"><label for="ban-ip">目标 IP 地址</label><input id="ban-ip" v-model="banForm.ip" placeholder="x.x.x.x" required ></div><div class="admin-field"><label for="ban-reason">封禁原因</label><input id="ban-reason" v-model="banForm.reason" placeholder="例如：恶意扫描" ></div><div class="admin-field"><label for="ban-minutes">时长（分钟）</label><input id="ban-minutes" v-model.number="banForm.minutes" type="number" min="0" step="1" aria-describedby="ban-help" ></div><button class="admin-button admin-button--danger" type="submit" :disabled="banLoading">执行封禁</button></form><p id="ban-help" class="admin-hint">时长为 0 时永久封禁。</p>
      <div v-if="banQuery.isPending.value" class="admin-empty" role="status">正在加载封禁记录…</div><div v-else-if="banQuery.isError.value" class="admin-notice admin-notice--error" role="alert">加载封禁记录失败。<button class="admin-button" @click="fetchBans">重试</button></div><div v-else class="admin-table-scroll" role="region" aria-label="IP 封禁列表" tabindex="0"><table class="admin-table"><thead><tr><th scope="col">IP 地址</th><th scope="col">原因</th><th scope="col">操作人</th><th scope="col">到期时间</th><th scope="col">操作</th></tr></thead><tbody><tr v-for="ban in bans" :key="ban.ip"><td>{{ ban.ip }}</td><td>{{ ban.reason || '—' }}</td><td>{{ ban.created_by || 'System' }}</td><td>{{ formatDate(ban.expires_at) }}</td><td><button class="admin-button admin-button--secondary" :disabled="processingId !== null" @click="removeBan(ban.ip)">解封</button></td></tr><tr v-if="!bans.length"><td colspan="5" class="admin-empty">暂无封禁记录</td></tr></tbody></table></div>
    </AdminPanel>
    <AdminPanel title="登录安全控制" description="使全部管理员登录失效，包括当前账号。"><div class="admin-danger-zone"><p>仅在需要所有管理员重新验证身份时使用。</p><button class="admin-button admin-button--danger" :disabled="refreshSessionLoading" @click="forceRefreshSessions">强制刷新所有登录</button></div></AdminPanel>
  </div>
</template>
