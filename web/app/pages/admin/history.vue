<script setup lang="ts">
import AdminPanel from '~/components/admin/Panel.vue'
import { useQuery } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox } from 'element-plus'
import DOMPurify from 'dompurify'
import { adminHistoryRowSchema, historyInputSchema } from '@guatswr/shared'
import type { AdminHistory } from '@guatswr/shared'
import { compressUploadImage } from '~/utils/compress-image'
import { getThumbUrl } from '~/utils/image-url'
import { changeHistoryPrecision, historyDatePrecision, historyPeriod } from '~/utils/admin-history'

definePageMeta({ layout: 'admin', middleware: 'admin' })
const api = useAdminApi()
const session = useBffSession()
const isSuperAdmin = session.isSuperAdmin
const showDeleted = ref(false)
const query = useQuery({ queryKey: computed(() => ['admin', 'history', showDeleted.value]), queryFn: ({ signal }) =>
  api.request({ resource: 'history', query: { includeDeleted: showDeleted.value }, signal }, value => {
    if (!Array.isArray(value)) throw new Error('群史响应无效')
    return value.map(row => adminHistoryRowSchema.parse(row))
  }) })
const historyList = computed(() => query.data.value ?? [])
const listLoading = query.isPending
watch(query.error, error => { if (error) ElMessage.error('加载群史失败') })
const submitLoading = ref(false)
const isEditingHistory = ref(false)
const processingId = ref<number | null>(null)
const isUploadingImage = ref(false)
const descRef = ref<HTMLTextAreaElement | null>(null)
const emptyForm = () => ({ id: null as number | null, date: '', title: '', description: '', image: '', sort_order: 0 })
const histForm = reactive(emptyForm())
const precision = ref<ReturnType<typeof historyDatePrecision>>('month')
const dateInputType = computed(() => precision.value === 'day' ? 'date' : precision.value === 'month' ? 'month' : 'text')
const selectedYear = ref('all'), selectedMonth = ref('all'), search = ref(''), page = ref(1)
const years = computed(() => [...new Set(historyList.value.map(item => historyPeriod(item.date).year))].sort().reverse())
const months = computed(() => [...new Set(historyList.value.filter(item => selectedYear.value === 'all' || historyPeriod(item.date).year === selectedYear.value).map(item => historyPeriod(item.date).month))].sort())
const filteredHistory = computed(() => historyList.value.filter(item => {
  const period = historyPeriod(item.date)
  return (selectedYear.value === 'all' || period.year === selectedYear.value) && (selectedMonth.value === 'all' || period.month === selectedMonth.value) && `${item.title} ${item.description} ${item.date}`.toLowerCase().includes(search.value.trim().toLowerCase())
}))
const pageCount = computed(() => Math.max(1, Math.ceil(filteredHistory.value.length / 20)))
const visibleHistory = computed(() => filteredHistory.value.slice((page.value - 1) * 20, page.value * 20))
watch([selectedYear, selectedMonth, search], () => { page.value = 1 })
watch(selectedYear, () => { selectedMonth.value = 'all' })
watch(pageCount, value => { page.value = Math.min(page.value, value) })
const pristine = ref(JSON.stringify(histForm)), lastSaved = ref('')
const dirty = computed(() => JSON.stringify(histForm) !== pristine.value)
async function allowDiscard() {
  if (!dirty.value) return true
  try { await ElMessageBox.confirm('当前记录有未保存修改，离开后将丢弃。', '未保存的群史', { confirmButtonText: '丢弃修改', cancelButtonText: '继续编辑', type: 'warning' }); return true }
  catch { return false }
}
onBeforeRouteLeave(allowDiscard)
const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))

const safeDescription = (text: string) => DOMPurify.sanitize(text, { USE_PROFILES: { html: true } })
function resetHistForm() { isEditingHistory.value = false; Object.assign(histForm, emptyForm()); precision.value = 'month'; pristine.value = JSON.stringify(histForm) }
async function cancelEdit() { if (await allowDiscard()) resetHistForm() }
async function editHistory(history: AdminHistory) {
  if (!await allowDiscard()) return
  isEditingHistory.value = true; Object.assign(histForm, history)
  precision.value = historyDatePrecision(history.date); pristine.value = JSON.stringify(histForm)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
async function handleHistImageUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || isUploadingImage.value) return
  isUploadingImage.value = true
  try { histForm.image = await api.upload(await compressUploadImage(file)) }
  catch { ElMessage.error('图片上传失败') }
  finally { isUploadingImage.value = false; input.value = '' }
}
async function submitHistory() {
  if (submitLoading.value || isUploadingImage.value) return
  if (precision.value === 'year' && (!/^\d{4}$/.test(histForm.date) || Number(histForm.date) < 1)) { ElMessage.warning('年份需填写四位数字'); return }
  const parsed = historyInputSchema.safeParse(histForm)
  if (!parsed.success) { ElMessage.warning(parsed.error.issues[0]?.message ?? '请检查群史信息'); return }
  submitLoading.value = true
  try {
    await api.request({ resource: 'history', method: isEditingHistory.value ? 'PUT' : 'POST', id: isEditingHistory.value ? histForm.id ?? undefined : undefined, body: parsed.data }, value => value)
    resetHistForm(); lastSaved.value = new Date().toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai' }); await query.refetch(); ElMessage.success('群史已保存')
  } catch { ElMessage.error('提交失败') }
  finally { submitLoading.value = false }
}
async function deleteHistory(id: number) {
  if (processingId.value) return
  try {
    await ElMessageBox.confirm('确定删除该记录吗？', '提示', { type: 'warning' })
    processingId.value = id
    await api.request({ resource: 'history', method: 'DELETE', id }, value => value)
    await query.refetch(); ElMessage.success('删除成功')
  } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error('删除失败') }
  finally { processingId.value = null }
}
async function restoreHistory(id: number) {
  if (processingId.value) return
  processingId.value = id
  try {
    await api.request({ resource: 'history', method: 'POST', id, action: 'restore' }, value => value)
    await query.refetch(); ElMessage.success('已恢复')
  } catch { ElMessage.error('恢复失败') }
  finally { processingId.value = null }
}
async function moveHistory(history: AdminHistory, direction: 'up' | 'down') {
  if (processingId.value) return
  processingId.value = history.id
  try {
    await api.request({ resource: 'history', method: 'PUT', id: history.id, body: historyInputSchema.parse({ ...history, sort_order: history.sort_order + (direction === 'up' ? -1 : 1) }) }, value => value)
    await query.refetch()
  } catch { ElMessage.error('排序失败') }
  finally { processingId.value = null }
}
async function wrapSelection(prefix: string, suffix = prefix) {
  const element = descRef.value
  if (!element) return
  const start = element.selectionStart || 0, end = element.selectionEnd || 0
  const selected = histForm.description.slice(start, end)
  histForm.description = `${histForm.description.slice(0, start)}${prefix}${selected}${suffix}${histForm.description.slice(end)}`
  await nextTick()
  const cursor = start + prefix.length + selected.length + suffix.length
  element.focus(); element.setSelectionRange(cursor, cursor)
}
async function applyAlign(align: string) { await wrapSelection(`<div style="text-align:${align}">`, '</div>') }
</script>
<template>
<div class="admin-split admin-split--balanced">
    <AdminPanel :title="isEditingHistory ? '编辑历史' : '记录新历史'" description="填写记录内容，可使用下方工具设置简单排版。">
      <template #actions><span v-if="dirty" class="admin-badge">未保存</span><button v-if="isEditingHistory || dirty" class="admin-button admin-button--quiet" @click="cancelEdit">取消编辑</button></template>
      <form class="admin-form-grid" @submit.prevent="submitHistory">
        <div class="admin-field"><label for="history-title">事件标题</label><input id="history-title" v-model="histForm.title" placeholder="例如：新成员加入" required ></div>
        <div class="admin-form-row"><div class="admin-field"><label for="history-precision">日期精度</label><select id="history-precision" v-model="precision" @change="histForm.date = changeHistoryPrecision(histForm.date, precision)"><option value="year">只记年份</option><option value="month">精确到月</option><option value="day">精确到日</option><option value="legacy">原日期文本</option></select></div><div class="admin-field"><label for="history-date">{{ precision === 'year' ? '年份' : precision === 'month' ? '年月' : '日期' }}</label><input id="history-date" v-model="histForm.date" :type="dateInputType" required :min="precision === 'year' ? 1 : undefined" :max="precision === 'year' ? 9999 : undefined"><small>只知道年月时无需补造具体日期；旧日期文本可以原样保留。</small></div></div>
        <details><summary>排序与高级设置</summary><div class="admin-field"><label for="history-order">排序值</label><input id="history-order" v-model.number="histForm.sort_order" type="number" step="1"><small>数值越小越靠前。</small></div></details>
        <div class="admin-field"><label for="history-description">事件描述</label><div class="admin-editor-tools" role="group" aria-label="描述格式"><button class="admin-button admin-button--secondary" type="button" @click="wrapSelection('<strong>', '</strong>')">加粗</button><button class="admin-button admin-button--secondary" type="button" @click="wrapSelection('<em>', '</em>')">斜体</button><button v-for="align in (['left', 'center', 'right'] as const)" :key="align" class="admin-button admin-button--quiet" type="button" @click="applyAlign(align)">{{ { left: '居左', center: '居中', right: '居右' }[align] }}</button></div><textarea id="history-description" ref="descRef" v-model="histForm.description" rows="8" placeholder="事件描述（支持 HTML 标签）..." /></div>
        <div class="admin-field"><label for="history-image">配图（可选）</label><img v-if="histForm.image" :src="histForm.image" alt="配图预览" class="admin-image-preview" ><input id="history-image" type="file" accept="image/*" :disabled="isUploadingImage || submitLoading" @change="handleHistImageUpload" ><small v-if="isUploadingImage" role="status">图片上传中…</small></div>
        <button class="admin-button admin-button--primary" type="submit" :disabled="submitLoading || isUploadingImage">{{ submitLoading ? '提交中…' : isEditingHistory ? '保存修改' : '提交记录' }}</button>
        <p v-if="lastSaved" class="admin-hint" role="status">上次保存于 {{ lastSaved }}</p>
      </form>
    </AdminPanel>
    <AdminPanel title="时间轴记录" :description="`共 ${historyList.length} 条记录`">
      <template #actions><button v-if="isSuperAdmin" class="admin-button admin-button--secondary" :aria-pressed="showDeleted" @click="showDeleted = !showDeleted">{{ showDeleted ? '隐藏已删除' : '显示已删除' }}</button></template>
      <div class="admin-filter-bar"><div class="admin-field"><label for="history-filter-year">按年份查看</label><select id="history-filter-year" v-model="selectedYear"><option value="all">全部年份</option><option v-for="year in years" :key="year" :value="year">{{ year === 'unknown' ? '未分类日期' : `${year} 年` }}</option></select></div><div class="admin-field"><label for="history-filter-month">按月份查看</label><select id="history-filter-month" v-model="selectedMonth"><option value="all">全部月份</option><option v-for="month in months" :key="month" :value="month">{{ month === 'unknown' ? '未注明月份' : `${Number(month)} 月` }}</option></select></div><div class="admin-field"><label for="history-search">搜索群史</label><input id="history-search" v-model="search" placeholder="标题、内容或日期"></div><button class="admin-button admin-button--quiet" @click="selectedYear='all';selectedMonth='all';search=''">重置筛选</button></div>
      <p class="admin-hint" aria-live="polite">筛选结果 {{ filteredHistory.length }} 条 · 共 {{ historyList.length }} 条</p>
      <div v-if="listLoading" class="admin-empty" role="status">正在加载历史记录…</div>
      <div v-else-if="query.isError.value" class="admin-notice admin-notice--error" role="alert">加载群史失败。<button class="admin-button" @click="query.refetch()">重试</button></div>
      <div v-else-if="!filteredHistory.length" class="admin-empty">没有匹配的群史，请调整年月或搜索条件。</div>
      <div v-else class="admin-stack"><article v-for="item in visibleHistory" :key="item.id" data-testid="admin-history-card" class="admin-resource-card"><div class="admin-resource-heading"><h3>{{ item.title }}</h3><time>{{ item.date }}</time></div><span v-if="item.deleted_at" class="admin-badge admin-badge--danger">已删除</span><div class="admin-html-preview" v-html="safeDescription(item.description)" /><img v-if="item.image" :src="getThumbUrl(item.image)" alt="记录配图" class="admin-image-preview" loading="lazy" ><div class="admin-row-actions"><template v-if="!item.deleted_at"><button class="admin-button admin-button--secondary" @click="editHistory(item)">编辑</button><button class="admin-button admin-button--quiet" :disabled="processingId !== null" @click="moveHistory(item, 'up')">上移</button><button class="admin-button admin-button--quiet" :disabled="processingId !== null" @click="moveHistory(item, 'down')">下移</button><button class="admin-button admin-button--danger" :disabled="processingId !== null" @click="deleteHistory(item.id)">删除</button></template><button v-else-if="isSuperAdmin" class="admin-button admin-button--secondary" :disabled="processingId !== null" @click="restoreHistory(item.id)">恢复</button></div></article></div>
      <nav class="admin-pagination" aria-label="群史分页"><button class="admin-button admin-button--secondary" :disabled="page <= 1" @click="page--">上一页</button><span>{{ page }} / {{ pageCount }}</span><button class="admin-button admin-button--secondary" :disabled="page >= pageCount" @click="page++">下一页</button></nav>
    </AdminPanel>
  </div>
</template>
