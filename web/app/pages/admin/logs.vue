<script setup lang="ts">
import AdminPanel from '~/components/admin/Panel.vue'
import { useQuery } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox } from 'element-plus'
import { auditLogListResponseSchema } from '@guatswr/shared'

definePageMeta({ layout: 'admin', middleware: 'admin' })
const api = useAdminApi()
const session = useBffSession()
const isSuperAdmin = session.isSuperAdmin
const logPage = ref(1), logLimit = ref(20)
const logFilter = reactive({ username: '', action: '' })
const applied = reactive({ username: '', action: '' })
const selectedLogIds = ref(new Set<number>())
const deleteLoading = ref(false)
const query = useQuery({ queryKey: computed(() => ['admin', 'logs', logPage.value, logLimit.value, applied.username, applied.action]), queryFn: ({ signal }) => api.request({ resource: 'logs', query: { page: logPage.value, limit: logLimit.value, username: applied.username || undefined, action: applied.action || undefined }, signal }, value => auditLogListResponseSchema.parse(value)) })
const logs = computed(() => query.data.value?.logs ?? [])
const logTotal = computed(() => query.data.value?.total ?? 0)
const loading = query.isPending
watch(query.error, error => { if (error) ElMessage.error('日志加载失败') })
watch(query.data, () => selectedLogIds.value.clear())
watch(logLimit, () => { logPage.value = 1 })
const totalPages = computed(() => Math.ceil(logTotal.value / logLimit.value) || 1)
const isAllSelected = computed(() => logs.value.length > 0 && logs.value.every(log => selectedLogIds.value.has(log.id)))
const logActions = ['LOGIN', 'UPLOAD', 'CREATE_ACTIVITY', 'UPDATE_ACTIVITY', 'DELETE_ACTIVITY', 'CREATE_MEMBER', 'UPDATE_MEMBER', 'DELETE_MEMBER', 'CREATE_HISTORY', 'UPDATE_HISTORY', 'DELETE_HISTORY', 'UPDATE_CONFIG', 'CREATE_USER', 'DELETE_USER', 'RESET_PWD', 'UPDATE_PROFILE']
async function fetchLogs() { Object.assign(applied, logFilter); await nextTick(); await query.refetch() }
function formatTime(value: string) {
  if (!value) return '-'
  // SQLite CURRENT_TIMESTAMP is UTC; explicit offsets remain authoritative.
  const time = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(' ', 'T')}Z` : value
  const date = new Date(time)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function toggleLogSelect(id: number) { if (selectedLogIds.value.has(id)) selectedLogIds.value.delete(id); else selectedLogIds.value.add(id) }
function toggleAllLogs() {
  const selected = isAllSelected.value
  for (const log of logs.value) { if (selected) selectedLogIds.value.delete(log.id); else selectedLogIds.value.add(log.id) }
}
async function batchDeleteLogs() {
  if (deleteLoading.value) return
  const ids = [...selectedLogIds.value]
  if (!ids.length) { ElMessage.warning('未选择日志'); return }
  try {
    await ElMessageBox.confirm(`确定永久删除选中的 ${ids.length} 条日志吗？`, '批量删除', { type: 'warning', confirmButtonClass: 'el-button--danger' })
    deleteLoading.value = true
    let successes = 0
    for (const id of ids) {
      try { await api.request({ resource: 'logs', method: 'DELETE', id }, value => value); successes++ }
      catch { if (!session.isAuthenticated.value) break }
    }
    if (successes === ids.length) ElMessage.success('删除成功')
    else ElMessage.warning(`删除完成，但有 ${ids.length - successes} 条失败`)
    selectedLogIds.value.clear(); await query.refetch()
  } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error('操作已取消或出错') }
  finally { deleteLoading.value = false }
}
async function deleteLog(id: number) {
  if (deleteLoading.value) return
  try {
    await ElMessageBox.confirm('确定删除该日志吗？', '提示', { type: 'warning' })
    deleteLoading.value = true
    await api.request({ resource: 'logs', method: 'DELETE', id }, value => value)
    ElMessage.success('已删除')
    if (logs.value.length === 1 && logPage.value > 1) logPage.value--
    else await query.refetch()
  } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error('删除失败') }
  finally { deleteLoading.value = false }
}
</script>
<template>
<AdminPanel title="操作记录" :description="`共 ${logTotal} 条记录`">
    <form class="admin-filter-bar" @submit.prevent="logPage = 1; fetchLogs()"><div class="admin-field"><label for="logs-username">操作人</label><input id="logs-username" v-model="logFilter.username" placeholder="按操作人搜索..." ></div><div class="admin-field"><label for="logs-action">动作类型</label><select id="logs-action" v-model="logFilter.action"><option value="">所有动作类型</option><option v-for="act in logActions" :key="act" :value="act">{{ act }}</option></select></div><button class="admin-button admin-button--primary" type="submit" :disabled="loading">查询</button><button v-if="isSuperAdmin && selectedLogIds.size" type="button" class="admin-button admin-button--danger" :disabled="deleteLoading" @click="batchDeleteLogs">批量删除 ({{ selectedLogIds.size }})</button></form>
    <div v-if="loading" class="admin-empty" role="status">正在加载日志…</div>
    <div v-else-if="query.isError.value" class="admin-notice admin-notice--error" role="alert">日志加载失败。<button class="admin-button" @click="query.refetch()">重试</button></div>
    <div v-else class="admin-table-scroll" role="region" aria-label="操作日志列表" tabindex="0"><table class="admin-table"><thead><tr><th v-if="isSuperAdmin" scope="col"><input type="checkbox" aria-label="选择本页全部日志" :checked="isAllSelected" :indeterminate="selectedLogIds.size > 0 && !isAllSelected" @change="toggleAllLogs" ></th><th scope="col">时间 / 操作人</th><th scope="col">动作类型</th><th scope="col">详情</th><th v-if="isSuperAdmin" scope="col">操作</th></tr></thead><tbody><tr v-for="log in logs" :key="log.id"><td v-if="isSuperAdmin"><input type="checkbox" :aria-label="`选择日志 ${log.id}`" :checked="selectedLogIds.has(log.id)" @change="toggleLogSelect(log.id)" ></td><td><time>{{ formatTime(log.created_at) }}</time><p>{{ log.username || '未知用户' }}</p></td><td><span class="admin-badge">{{ log.action }}</span></td><td class="admin-log-details">{{ log.details || '—' }}</td><td v-if="isSuperAdmin"><button class="admin-button admin-button--danger" :disabled="deleteLoading" :aria-label="`删除日志 ${log.id}`" @click="deleteLog(log.id)">删除</button></td></tr><tr v-if="!logs.length"><td :colspan="isSuperAdmin ? 5 : 3" class="admin-empty">暂无日志数据</td></tr></tbody></table></div>
    <nav class="admin-pagination" aria-label="日志分页"><span class="admin-hint">当前 {{ logs.length }} 条 / 共 {{ logTotal }} 条</span><div class="admin-row-actions"><button class="admin-button admin-button--secondary" :disabled="logPage <= 1 || loading" @click="logPage--">上一页</button><span aria-live="polite">{{ logPage }} / {{ totalPages }}</span><button class="admin-button admin-button--secondary" :disabled="logPage >= totalPages || loading" @click="logPage++">下一页</button><select v-model="logLimit" aria-label="每页日志数量"><option :value="20">20 条/页</option><option :value="50">50 条/页</option><option :value="100">100 条/页</option></select></div></nav>
  </AdminPanel>
</template>
