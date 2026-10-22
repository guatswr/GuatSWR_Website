<script setup lang="ts">
import AdminPanel from '~/components/admin/Panel.vue'
import { useQuery } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox } from 'element-plus'
import { backupRowSchema, backupSettingsInputSchema, backupSettingsSchema } from '@guatswr/shared/admin-workflows'
import type { AdminBackup } from '@guatswr/shared/admin-workflows'
import { backupDownloadUrl, downloadBufferedBackup, MAX_BUFFERED_BACKUP_BYTES } from '~/utils/admin-download'

definePageMeta({ layout: 'admin', middleware: 'admin', requiresSuperAdmin: true })
const api = useAdminApi(), session = useBffSession()
const isSuperAdmin = session.isSuperAdmin
const settings = reactive({ enabled: false, time: '02:30', lastRun: '', lastError: '' })
const settingQuery = useQuery({ queryKey: ['admin', 'backup-settings'], queryFn: ({ signal }) => api.command('backupSettings', undefined, value => backupSettingsSchema.parse(value), signal) })
const listQuery = useQuery({ queryKey: ['admin', 'backups'], queryFn: ({ signal }) => api.command('backupList', undefined, value => {
  if (!value || typeof value !== 'object' || !('full' in value) || !Array.isArray(value.full)) throw new Error('备份列表无效')
  return value.full.map(row => backupRowSchema.parse(row))
}, signal) })
const backups = computed(() => listQuery.data.value ?? [])
const busy = ref(false)
const pageLoading = computed(() => busy.value || settingQuery.isPending.value || listQuery.isPending.value)
watch(settingQuery.data, value => { if (value) Object.assign(settings, value) }, { immediate: true })
watch(settingQuery.error, error => { if (error) ElMessage.error('加载设置失败') })
watch(listQuery.error, error => { if (error) ElMessage.error('加载备份列表失败') })
const processingItems = reactive(new Set<string>())
const download = reactive({ active: false, percent: 0, name: '' })
const downloadLifetime = new AbortController()
const objectUrls = new Set<string>(), timers = new Set<ReturnType<typeof setTimeout>>()
const unregister = session.registerPrivateCleanup(() => downloadLifetime.abort())
onBeforeUnmount(() => {
  unregister(); downloadLifetime.abort()
  for (const timer of timers) clearTimeout(timer)
  for (const url of objectUrls) URL.revokeObjectURL(url)
})
const getUniqueId = (item: AdminBackup) => `${item.type}-${item.name}`
const isItemProcessing = (item: AdminBackup) => processingItems.has(getUniqueId(item))
function formatSize(size: number | null | undefined) {
  if (size == null) return '-'
  if (size < 1024) return `${size} B`
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`
  return `${(size / 1024 ** 3).toFixed(2)} GB`
}
function formatTime(value: string | number) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
}
const fetchSettings = () => settingQuery.refetch()
const fetchBackups = () => listQuery.refetch()
async function runBackup() {
  if (pageLoading.value) return
  try {
    await ElMessageBox.confirm('确认立即执行一次完整备份并打包下载文件？\n这可能需要几分钟时间，请勿关闭页面。', '手动备份', { type: 'warning', confirmButtonText: '立即执行', cancelButtonText: '取消' })
    busy.value = true
    await api.command('backupRun', {}, value => value)
    ElMessage.success('备份任务已完成'); await Promise.all([fetchSettings(), fetchBackups()])
  } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error('备份失败，请检查服务器日志') }
  finally { busy.value = false }
}
async function saveSettings() {
  if (pageLoading.value || settingQuery.error.value) return
  const parsed = backupSettingsInputSchema.safeParse(settings)
  if (!parsed.success) { ElMessage.warning('请输入有效的备份时间'); return }
  busy.value = true
  try { await api.command('backupConfigure', parsed.data, value => value); await fetchSettings(); ElMessage.success('自动备份设置已更新') }
  catch { ElMessage.error('保存设置失败') }
  finally { busy.value = false }
}
async function downloadBackup(item: AdminBackup) {
  if (isItemProcessing(item) || download.active) return
  const uid = getUniqueId(item)
  processingItems.add(uid)
  Object.assign(download, { active: true, percent: 0, name: item.name })
  const anchor = document.createElement('a')
  anchor.download = item.name
  try {
    if (item.size > MAX_BUFFERED_BACKUP_BYTES) {
      // Do not buffer a multi-gigabyte backup into the browser heap. Native
      // downloads retain progress/cancellation in the browser's download list.
      // This is a handoff, never an assertion that the download has completed.
      await session.refresh()
      if (!session.isAuthenticated.value || !session.isSuperAdmin.value || downloadLifetime.signal.aborted) return
      anchor.href = backupDownloadUrl(item.name)
      document.body.appendChild(anchor); anchor.click()
      ElMessage.info('下载已交给浏览器，请在浏览器下载列表查看进度')
    } else {
      const blob = await session.performMutation({ send: () => downloadBufferedBackup(item.name, { signal: downloadLifetime.signal, onProgress: percent => { download.percent = percent } }) })
      const url = URL.createObjectURL(blob)
      objectUrls.add(url); anchor.href = url
      document.body.appendChild(anchor); anchor.click()
      const timer = setTimeout(() => { URL.revokeObjectURL(url); objectUrls.delete(url); timers.delete(timer) }, 1000)
      timers.add(timer)
    }
  } catch { ElMessage.error('下载失败：文件可能过大或网络连接中断') }
  finally { anchor.remove(); processingItems.delete(uid); Object.assign(download, { active: false, percent: 0, name: '' }) }
}
async function deleteBackup(item: AdminBackup) {
  if (isItemProcessing(item)) return
  const uid = getUniqueId(item)
  try {
    await ElMessageBox.confirm(`确认永久删除备份文件 "${item.name}"？`, '删除警告', { type: 'warning', confirmButtonText: '确定删除', confirmButtonClass: 'el-button--danger' })
    processingItems.add(uid)
    await api.deleteBackup(item.name); await fetchBackups(); ElMessage.success('已删除')
  } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error('删除失败') }
  finally { processingItems.delete(uid) }
}
</script>
<template>
<div v-if="isSuperAdmin" class="admin-stack">
    <AdminPanel title="自动备份设置" description="执行时间遵循现有后端的备份时区设置。">
      <p v-if="settingQuery.isPending.value" class="admin-empty" role="status">正在加载设置…</p><div v-else-if="settingQuery.isError.value" class="admin-notice admin-notice--error" role="alert">加载设置失败。<button class="admin-button" @click="fetchSettings">重试</button></div>
      <form v-else class="admin-form-grid" @submit.prevent="saveSettings"><label class="admin-check-label"><input v-model="settings.enabled" type="checkbox" :disabled="busy" >启用每日自动备份</label><div class="admin-field admin-time-field"><label for="backup-time">执行时间</label><input id="backup-time" v-model="settings.time" type="time" :disabled="busy" required ></div><div class="admin-notice"><p>上次执行：{{ settings.lastRun ? formatTime(settings.lastRun) : '暂无记录' }}</p><p v-if="settings.lastError" role="alert">上次错误：{{ settings.lastError }}</p></div><div class="admin-row-actions"><button class="admin-button admin-button--primary" type="submit" :disabled="pageLoading">保存设置</button><button class="admin-button admin-button--secondary" type="button" :disabled="pageLoading" @click="runBackup">手动立即备份</button><span v-if="busy" class="admin-hint" role="status">操作处理中，请稍候…</span></div></form>
      <div v-if="download.active" class="admin-notice admin-download-status" role="status"><p>下载中：{{ download.name }} · {{ download.percent }}%</p><progress :value="download.percent" max="100" aria-label="备份下载进度" /></div>
    </AdminPanel>
    <AdminPanel title="完整备份" :description="`共 ${backups.length} 个文件`"><template #actions><button class="admin-button admin-button--secondary" :disabled="listQuery.isFetching.value" @click="fetchBackups">刷新</button></template><div v-if="listQuery.isPending.value" class="admin-empty" role="status">正在加载备份…</div><div v-else-if="listQuery.isError.value" role="alert" class="admin-notice admin-notice--error">加载备份失败，请刷新重试。</div><div v-else class="admin-table-scroll" role="region" aria-label="备份文件列表" tabindex="0"><table class="admin-table"><thead><tr><th scope="col">文件名</th><th scope="col">大小</th><th scope="col">时间</th><th scope="col">操作</th></tr></thead><tbody><tr v-for="item in backups" :key="item.name"><td class="admin-filename">{{ item.name }}</td><td>{{ formatSize(item.size) }}</td><td>{{ formatTime(item.mtime) }}</td><td><div class="admin-row-actions"><button class="admin-button admin-button--secondary" :disabled="download.active || isItemProcessing(item)" @click="downloadBackup(item)">{{ download.name === item.name ? '下载中' : '下载' }}</button><button class="admin-button admin-button--danger" :disabled="isItemProcessing(item)" @click="deleteBackup(item)">删除</button></div></td></tr><tr v-if="!backups.length"><td colspan="4" class="admin-empty">暂无备份</td></tr></tbody></table></div></AdminPanel>
  </div>
</template>
