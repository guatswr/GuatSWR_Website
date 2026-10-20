<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox } from 'element-plus'
import { z } from 'zod'
import { EVENT_TYPES, createEventFormState, eventStatusLabel, getEventFields } from '@guatswr/shared'
import { ADMIN_EVENT_STATUSES, adminEventPageSchema, adminEventRowSchema, adminEventParticipantSchema, adminEventResultsSchema } from '@guatswr/shared/admin-workflows'
import type { AdminEvent } from '@guatswr/shared/admin-workflows'
import AdminPanel from '~/components/admin/Panel.vue'
import AdminEventEditor from '~/components/admin/EventEditor.vue'
import AdminAvatar from '~/components/admin/Avatar.vue'
import { compressUploadImage } from '~/utils/compress-image'

definePageMeta({ layout: 'admin', middleware: 'admin' })
const api = useAdminApi(), session = useBffSession()
const page = ref(1), status = ref('pending'), type = ref(''), search = ref('')
const query = useQuery({ queryKey: computed(() => ['admin', 'events', page.value, status.value, type.value]), queryFn: ({ signal }) =>
  api.request({ resource: 'events', query: { page: page.value, limit: 20, status: status.value || undefined, type: type.value || undefined }, signal }, value => adminEventPageSchema.parse(value)) })
watch([status, type], () => { page.value = 1 })
const items = computed(() => query.data.value?.items ?? []), total = computed(() => query.data.value?.total ?? 0)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / 20)))
const filtered = computed(() => items.value.filter(row => `${row.title} ${row.created_by}`.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())))
type Panel = 'edit' | 'details' | 'participants' | 'results' | 'settle'
const panel = ref<Panel | null>(null), selected = ref<AdminEvent | null>(null), selection = ref(0)
const loading = ref(false), mutating = ref(false), editorBusy = ref(false), dirty = ref(false)
const busy = computed(() => loading.value || mutating.value || editorBusy.value)
const results = ref<{ rank: number; id: string; avatar: string }[]>([])
const settlement = reactive({ id: '', avatar: '', time: '', result: '' })
const uploading = ref<number | 'settlement' | null>(null)
const participants = useQuery({ queryKey: computed(() => ['admin', 'events', 'participants', selected.value?.id, selection.value]),
  enabled: computed(() => panel.value === 'participants' && Boolean(selected.value)), queryFn: ({ signal }) =>
    api.request({ resource: 'events', id: selected.value!.id, action: 'participants', signal }, value => z.object({ items: z.array(adminEventParticipantSchema) }).parse(value).items) })
const detailFields = computed(() => selected.value ? getEventFields(createEventFormState(selected.value)) : [])
const detailState = computed(() => createEventFormState(selected.value))
const publicStatuses = ['published', 'ongoing', 'ended', 'settled']
function label(row: AdminEvent) { return row.status === 'deleted' ? '已删除' : eventStatusLabel(row.type, row.status) }
function clearPanel() {
  selection.value++; panel.value = null; selected.value = null; dirty.value = false; editorBusy.value = false
  results.value = []; Object.assign(settlement, { id: '', avatar: '', time: '', result: '' })
}
const unregister = session.registerPrivateCleanup(clearPanel)
function beforeUnload(event: BeforeUnloadEvent) { if (dirty.value || busy.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => { unregister(); selection.value++; window.removeEventListener('beforeunload', beforeUnload) })
async function permitDiscard() {
  if (!dirty.value && !busy.value) return true
  try { await ElMessageBox.confirm('未保存的修改将不会保留，确定离开吗？', '离开活动编辑', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }); return true }
  catch { return false }
}
onBeforeRouteLeave(permitDiscard)
async function closePanel() { if (!busy.value && await permitDiscard()) clearPanel() }
async function openPanel(mode: Panel, row?: AdminEvent) {
  if (busy.value || !await permitDiscard()) return
  clearPanel()
  if (!row) { panel.value = mode; return }
  const version = selection.value
  loading.value = true
  try {
    // Even drafts use the authenticated detail endpoint, never a public read.
    const record = await api.request({ resource: 'events', id: row.id }, value => adminEventRowSchema.parse(value))
    if (version !== selection.value) return
    selected.value = record
    if (mode === 'results') {
      const parsed = adminEventResultsSchema.safeParse({ results: record.content.results ?? [] })
      results.value = parsed.success && parsed.data.results.length ? parsed.data.results : [{ rank: 1, id: '', avatar: '' }]
    }
    if (mode === 'settle') {
      const completion = z.object({ id: z.unknown().optional(), avatar: z.unknown().optional(), time: z.unknown().optional() }).safeParse(record.content.completion)
      Object.assign(settlement, { id: String(completion.success ? completion.data.id ?? '' : ''), avatar: String(completion.success ? completion.data.avatar ?? '' : ''), time: String(completion.success ? completion.data.time ?? '' : ''), result: String(record.content.result ?? '') })
    }
    panel.value = mode
    await nextTick(); document.getElementById('admin-event-panel')?.focus()
  } catch { ElMessage.error('活动读取失败，请重试') }
  finally { loading.value = false }
}
async function saved(created = false) {
  clearPanel()
  if (created) { status.value = ''; type.value = ''; search.value = ''; page.value = 1; await nextTick() }
  await query.refetch()
}
async function confirmAction(message: string, title = '确认操作') {
  try { await ElMessageBox.confirm(message, title, { confirmButtonText: '确认执行', cancelButtonText: '取消', type: 'warning' }); return true }
  catch { return false }
}
async function operate(row: AdminEvent, action: 'approve' | 'reject' | 'status' | 'delete', nextStatus?: string) {
  if (busy.value) return
  const message = action === 'approve' ? '审核通过后，活动将对外公开。' : action === 'reject' ? '驳回后，活动将从公开列表隐藏。'
    : action === 'delete' ? '删除后，活动将从公开列表隐藏，可在已删除筛选中调整状态。' : `将“${row.title}”改为${nextStatus === 'deleted' ? '已删除' : eventStatusLabel(row.type, nextStatus)}？`
  if (!await confirmAction(message)) return
  mutating.value = true
  try {
    await api.request({ resource: 'events', id: row.id, method: action === 'delete' ? 'DELETE' : 'POST', action: action === 'delete' ? undefined : action, body: action === 'status' ? { status: nextStatus } : undefined }, value => value)
    await query.refetch(); ElMessage.success('活动状态已更新')
  } catch { ElMessage.error('操作未完成，请刷新列表后再决定是否重试') }
  finally { mutating.value = false }
}
async function changeStatus(event: Event, row: AdminEvent) {
  const input = event.target as HTMLSelectElement, value = input.value
  input.value = row.status
  if (value !== row.status) await operate(row, 'status', value)
}
async function uploadResult(event: Event, index: number | 'settlement') {
  const input = event.target as HTMLInputElement, file = input.files?.[0]
  input.value = ''
  if (!file || busy.value || !selected.value) return
  if (!publicStatuses.includes(selected.value.status)) { ElMessage.warning('活动公开后才可上传排名或结算头像'); return }
  const id = selected.value.id, version = selection.value
  uploading.value = index; mutating.value = true
  try {
    const url = await api.uploadEventAvatar(await compressUploadImage(file), id)
    if (version !== selection.value) return
    if (index === 'settlement') settlement.avatar = url
    else if (results.value[index]) results.value[index]!.avatar = url
    dirty.value = true
  } catch { ElMessage.error('头像上传未完成，请重试') }
  finally { uploading.value = null; mutating.value = false }
}
async function saveResults() {
  if (busy.value || !selected.value) return
  const rows = results.value.filter(row => row.id.trim())
  const parsed = adminEventResultsSchema.safeParse({ results: rows })
  if (!parsed.success || rows.some(row => !row.avatar.trim())) { ElMessage.warning('请填写有效名次、参赛者 ID 和头像'); return }
  if (new TextEncoder().encode(JSON.stringify(parsed.data)).byteLength > 64 * 1024) { ElMessage.warning('排名资料过长，请减少条目或头像地址长度'); return }
  if (!await confirmAction(rows.length ? '保存排名后活动将变为已结束，活动与排名会对外展示。' : '将清空排名，活动变为已结束并对外展示。', '保存比赛排名')) return
  mutating.value = true
  try { await api.request({ resource: 'events', id: selected.value.id, action: 'results', method: 'PUT', body: parsed.data }, value => value); await saved(); ElMessage.success('排名已保存，活动已结束') }
  catch { ElMessage.error('排名保存未完成，输入已保留，请检查活动后手动重试') }
  finally { mutating.value = false }
}
async function settle() {
  if (busy.value || !selected.value) return
  if (!await confirmAction('保存结算结果并标记已验收，活动与结算结果将对外展示。', '结算活动')) return
  const payload = selected.value.type === '悬赏令' ? { completion: { id: settlement.id, avatar: settlement.avatar, time: settlement.time } } : { result: settlement.result }
  mutating.value = true
  try { await api.request({ resource: 'events', id: selected.value.id, action: 'settle', method: 'POST', body: { payload, status: 'settled' } }, value => value); await saved(); ElMessage.success('活动已结算') }
  catch { ElMessage.error('结算未完成，输入已保留，请检查活动后手动重试') }
  finally { mutating.value = false }
}
</script>

<template>
  <AdminPanel v-if="panel" :title="panel === 'edit' ? selected ? '编辑活动' : '发布新活动' : panel === 'participants' ? '报名名单' : panel === 'results' ? '比赛排名' : panel === 'settle' ? '活动结算' : '活动详情'" :description="selected ? `${selected.title} · #${selected.id}` : '选择活动类型并填写资料。'">
    <template #actions><button class="admin-button admin-button--secondary" :disabled="busy" @click="closePanel">返回活动列表</button></template>
    <div id="admin-event-panel" tabindex="-1">
      <p v-if="selected && ['results', 'settle'].includes(panel) && !publicStatuses.includes(selected.status)" class="admin-notice">活动公开后可上传排名或结算头像；当前可填写已有图片地址。</p>
      <AdminEventEditor v-if="panel === 'edit'" :key="selection" :initial-data="selected" @saved="saved" @busy="editorBusy = $event" @dirty="dirty = $event" />
      <template v-else-if="panel === 'details' && selected"><div class="admin-tags"><span class="admin-badge">{{ selected.type }}</span><span class="admin-badge">{{ label(selected) }}</span><span class="admin-badge">{{ selected.created_by || 'Visitor' }}</span></div><dl class="admin-event-details"><template v-for="field in detailFields" :key="field.key"><dt>{{ field.label }}</dt><dd><img v-if="field.kind === 'image' && detailState[field.key]" :src="detailState[field.key]" :alt="field.label" class="admin-image-preview" ><span v-else>{{ detailState[field.key] || '未填写' }}</span></dd></template></dl><details><summary>完整活动资料</summary><pre class="admin-event-json">{{ JSON.stringify(selected.content, null, 2) }}</pre></details></template>
      <template v-else-if="panel === 'participants'"><p class="admin-notice">公开活动的参赛名单也包含 QQ、机签和来源。</p><p v-if="participants.isPending.value" class="admin-empty" role="status">正在读取报名…</p><div v-else-if="participants.isError.value" class="admin-notice admin-notice--error" role="alert">报名读取失败。<button class="admin-button" @click="participants.refetch()">重试读取名单</button></div><p v-else-if="!participants.data.value?.length" class="admin-empty">暂无报名成员</p><div v-else class="admin-table-scroll"><table class="admin-table"><caption>共 {{ participants.data.value.length }} 位报名成员</caption><thead><tr><th scope="col">参赛者</th><th scope="col">QQ</th><th scope="col">机签</th><th scope="col">来源</th><th scope="col">报名时间</th></tr></thead><tbody><tr v-for="person in participants.data.value" :key="person.id"><td><div class="admin-row-actions"><AdminAvatar :src="person.avatar" :name="person.common_id" /><span>{{ person.common_id }}</span></div></td><td>{{ person.qq }}</td><td>{{ person.machine_sign || '—' }}</td><td>{{ person.pilot_source || '—' }}</td><td>{{ person.created_at }}</td></tr></tbody></table></div></template>
      <form v-else-if="panel === 'results'" class="admin-form-grid" @submit.prevent="saveResults"><p class="admin-hint">保存会将活动改为已结束；不填写 ID 的空行不会保存。可移除全部条目后清空排名。</p><fieldset :disabled="busy" class="admin-stack"><div v-for="(row, index) in results" :key="index" class="admin-resource-card admin-form-grid"><div class="admin-form-row"><div class="admin-field"><label :for="`result-rank-${index}`">名次 {{ index + 1 }}</label><input :id="`result-rank-${index}`" v-model.number="row.rank" type="number" min="1" max="1000" @input="dirty = true" ></div><div class="admin-field"><label :for="`result-id-${index}`">参赛者 ID {{ index + 1 }}</label><input :id="`result-id-${index}`" v-model="row.id" maxlength="120" @input="dirty = true" ></div></div><div class="admin-field"><label :for="`result-avatar-${index}`">头像地址 {{ index + 1 }}</label><input :id="`result-avatar-${index}`" v-model="row.avatar" maxlength="500" @input="dirty = true" ><img v-if="row.avatar" :src="row.avatar" alt="排名头像预览" class="admin-image-preview" ><label :for="`result-upload-${index}`" class="admin-hint">上传排名头像 {{ index + 1 }}</label><input :id="`result-upload-${index}`" type="file" :disabled="Boolean(selected && !publicStatuses.includes(selected.status))" accept="image/*" @change="uploadResult($event, index)" ></div><button class="admin-button admin-button--danger" type="button" :aria-label="`移除排名 ${index + 1}`" @click="results.splice(index, 1); dirty = true">移除此排名</button></div></fieldset><div class="admin-row-actions"><button class="admin-button admin-button--secondary" type="button" :disabled="busy || results.length >= 1000" @click="results.push({ rank: results.length + 1, id: '', avatar: '' }); dirty = true">添加排名</button><button class="admin-button admin-button--primary" type="submit" :disabled="busy">保存排名并结束活动</button></div></form>
      <form v-else-if="panel === 'settle' && selected" class="admin-form-grid" @submit.prevent="settle"><fieldset :disabled="busy" class="admin-form-grid"><template v-if="selected.type === '悬赏令'"><div class="admin-field"><label for="settle-id">完成人 ID</label><input id="settle-id" v-model="settlement.id" maxlength="120" @input="dirty = true" ></div><div class="admin-field"><label for="settle-avatar">完成人头像地址</label><input id="settle-avatar" v-model="settlement.avatar" maxlength="500" @input="dirty = true" ><img v-if="settlement.avatar" :src="settlement.avatar" alt="完成人头像预览" class="admin-image-preview" ><label for="settle-upload" class="admin-hint">上传完成人头像</label><input id="settle-upload" type="file" :disabled="Boolean(selected && !publicStatuses.includes(selected.status))" accept="image/*" @change="uploadResult($event, 'settlement')" ></div><div class="admin-field"><label for="settle-time">完成时间</label><input id="settle-time" v-model="settlement.time" maxlength="200" placeholder="北京时间或原有文字时间" @input="dirty = true" ></div></template><div v-else class="admin-field"><label for="settle-result">胜败结果</label><textarea id="settle-result" v-model="settlement.result" maxlength="2000" rows="5" @input="dirty = true" /></div></fieldset><button class="admin-button admin-button--primary" type="submit" :disabled="busy">保存结算并标记已验收</button></form>
      <p v-if="uploading !== null" role="status" class="admin-hint">头像上传中…</p>
    </div>
  </AdminPanel>
  <AdminPanel v-else title="活动管理" :description="`共 ${total} 项活动，审核与管理在这里完成。`"><template #actions><button class="admin-button admin-button--primary" :disabled="busy" @click="openPanel('edit')">发布新活动</button></template><p class="admin-hint">已发布、进行中、已结束和已验收的活动会对外展示；其余状态仅管理端可见。</p><div class="admin-form-row"><div class="admin-field"><label for="event-filter-status">筛选状态</label><select id="event-filter-status" v-model="status" :disabled="busy"><option value="">全部状态</option><option v-for="value in ADMIN_EVENT_STATUSES" :key="value" :value="value">{{ value === 'deleted' ? '已删除' : eventStatusLabel('', value) }}</option></select></div><div class="admin-field"><label for="event-filter-type">筛选活动类型</label><select id="event-filter-type" v-model="type" :disabled="busy"><option value="">全部类型</option><option v-for="value in EVENT_TYPES" :key="value">{{ value }}</option></select></div><div class="admin-field"><label for="event-search">搜索当前页活动</label><input id="event-search" v-model="search" type="search" placeholder="标题或发布者" ></div></div><p v-if="query.isPending.value || loading" class="admin-empty" role="status">正在读取活动…</p><div v-else-if="query.isError.value" class="admin-notice admin-notice--error" role="alert">活动加载失败。<button class="admin-button" @click="query.refetch()">重试活动列表</button></div><div v-else class="admin-stack"><p v-if="!filtered.length" class="admin-empty">{{ status === 'pending' ? '没有待审核活动' : '当前筛选下暂无活动' }}</p><article v-for="row in filtered" :key="row.id" data-testid="admin-event-card" class="admin-resource-card"><div class="admin-resource-heading"><div><h3>{{ row.title || '未命名活动' }}</h3><div class="admin-tags"><span class="admin-badge">{{ row.type }}</span><span class="admin-badge" :class="{ 'admin-badge--danger': ['deleted', 'rejected'].includes(row.status) }">{{ label(row) }}</span><span class="admin-badge">#{{ row.id }} · {{ row.created_by }}</span></div></div><div class="admin-row-actions"><button class="admin-button admin-button--secondary" :disabled="busy" @click="openPanel('details', row)">查看详情</button><button class="admin-button admin-button--secondary" :disabled="busy" @click="openPanel('edit', row)">编辑</button></div></div><div class="admin-row-actions admin-event-actions"><template v-if="row.status === 'pending'"><button class="admin-button admin-button--primary" :disabled="busy" @click="operate(row, 'approve')">审核通过</button><button class="admin-button admin-button--danger" :disabled="busy" @click="operate(row, 'reject')">驳回</button></template><template v-if="['STG', '则则'].includes(row.type)"><button class="admin-button admin-button--quiet" :disabled="busy" @click="openPanel('participants', row)">报名名单</button><button class="admin-button admin-button--quiet" :disabled="busy" @click="openPanel('results', row)">录入排名</button></template><button v-if="['悬赏令', '对赌协议'].includes(row.type)" class="admin-button admin-button--quiet" :disabled="busy" @click="openPanel('settle', row)">结算</button><div class="admin-field"><label :for="`event-status-${row.id}`">调整状态</label><select :id="`event-status-${row.id}`" :value="row.status" :disabled="busy" @change="changeStatus($event, row)"><option v-for="value in ADMIN_EVENT_STATUSES" :key="value" :value="value">{{ value === 'deleted' ? '已删除' : eventStatusLabel(row.type, value) }}</option></select></div><button v-if="row.status !== 'deleted'" class="admin-button admin-button--danger" :disabled="busy" @click="operate(row, 'delete')">删除活动</button><NuxtLink v-if="publicStatuses.includes(row.status)" class="admin-button admin-button--quiet" to="/events" target="_blank">公开活动页</NuxtLink></div></article></div><nav class="admin-pagination" aria-label="活动分页"><span>{{ page }} / {{ totalPages }}</span><div class="admin-row-actions"><button class="admin-button admin-button--secondary" :disabled="page <= 1 || query.isPending.value || busy" @click="page--">上一页</button><button class="admin-button admin-button--secondary" :disabled="page >= totalPages || query.isPending.value || busy" @click="page++">下一页</button></div></nav></AdminPanel>
</template>
<style scoped>
.admin-event-actions { margin-top: 20px; align-items: end; }
.admin-event-actions .admin-field { min-width: 150px; }
.admin-event-details { display: grid; grid-template-columns: minmax(100px, 150px) minmax(0, 1fr); gap: 16px 24px; margin-block: 28px; }
.admin-event-details dt { color: var(--admin-muted); }
.admin-event-details dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.admin-event-json { max-width: 100%; max-height: 480px; overflow: auto; padding: 20px; margin-top: 16px; background: var(--admin-soft); border-radius: 8px; font-size: 12px; }
@media (max-width: 639px) {
  .admin-event-details { grid-template-columns: minmax(0, 1fr); gap: 6px; }
  .admin-event-details dd { margin-bottom: 16px; }
  .admin-event-actions .admin-field { flex: 1 1 140px; }
}
</style>
