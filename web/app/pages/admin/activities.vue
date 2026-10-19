<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox } from 'element-plus'
import { activityInputSchema, activityListResponseSchema } from '@guatswr/shared'
import type { AdminActivity } from '@guatswr/shared'
import { z } from 'zod'
import AdminPanel from '~/components/admin/Panel.vue'
import { compressUploadImage } from '~/utils/compress-image'

definePageMeta({ layout: 'admin', middleware: 'admin' })
const api = useAdminApi(), session = useBffSession()
const page = ref(1), showDeleted = ref(false), search = ref(''), editorVisible = ref(false)
const saving = ref(false), assetUploading = ref(false), editorUploading = ref(false), processingId = ref<number | null>(null)
const busy = computed(() => saving.value || assetUploading.value || editorUploading.value)
const query = useQuery({ queryKey: computed(() => ['admin', 'activities', page.value, showDeleted.value]), queryFn: ({ signal }) =>
  api.request({ resource: 'activities', query: { page: page.value, limit: 15, includeDeleted: showDeleted.value }, signal }, value => activityListResponseSchema.parse(value)) })
const items = computed(() => query.data.value?.items ?? [])
const filtered = computed(() => items.value.filter(row => `${row.title} ${row.tag}`.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())))
const total = computed(() => query.data.value?.total ?? 0), totalPages = computed(() => Math.max(1, Math.ceil(total.value / 15)))
watch(showDeleted, () => { page.value = 1 })
const empty = () => ({ title: '', tag: '', date: '', description: '', content: '', cover_image: '', images: [] as string[] })
const form = reactive(empty()), activityId = ref<number | null>(null), editingStatus = ref<'draft' | 'published'>('draft')
const snapshot = () => JSON.stringify(form)
const baseline = ref(snapshot()), dirty = computed(() => editorVisible.value && snapshot() !== baseline.value)
let generation = 0, draftPromise: Promise<number> | undefined
function clearEditor() {
  generation++; draftPromise = undefined; activityId.value = null
  Object.assign(form, empty()); baseline.value = snapshot(); editorVisible.value = false
}
const unregister = session.registerPrivateCleanup(clearEditor)
onBeforeUnmount(() => { unregister(); generation++; window.removeEventListener('beforeunload', beforeUnload) })
function beforeUnload(event: BeforeUnloadEvent) { if (dirty.value || busy.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
async function permitDiscard() {
  if (!dirty.value && !busy.value) return true
  try { await ElMessageBox.confirm('未发布的修改将不会保存，确定离开编辑吗？', '离开编辑', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }); return true }
  catch { return false }
}
onBeforeRouteLeave(permitDiscard)
async function closeEditor() { if (!busy.value && await permitDiscard()) clearEditor() }
function startEditor(row?: AdminActivity) {
  if (busy.value) return
  clearEditor()
  if (row) { activityId.value = row.id; editingStatus.value = row.status; Object.assign(form, { title: row.title, tag: row.tag, date: row.date, description: row.description, content: row.content, cover_image: row.cover_image, images: [...row.images] }) }
  else editingStatus.value = 'draft'
  baseline.value = snapshot(); editorVisible.value = true
  void nextTick(() => document.getElementById('article-title')?.focus())
}
async function ensureDraftId(): Promise<number> {
  if (activityId.value) return activityId.value
  if (draftPromise) return draftPromise
  const version = generation
  draftPromise = api.command('activityDraft', {}, value => z.object({ id: z.number().int().positive() }).parse(value).id).then(id => {
    if (version !== generation) throw new Error('Editor changed')
    activityId.value = id; return id
  }).finally(() => { if (version === generation) draftPromise = undefined })
  return draftPromise
}
async function uploadFile(file: File) {
  const version = generation, id = await ensureDraftId()
  const url = await api.upload(await compressUploadImage(file), id)
  if (version !== generation) throw new Error('Editor changed')
  return url
}
async function uploadAssets(event: Event, cover: boolean) {
  const input = event.target as HTMLInputElement, files = [...(input.files ?? [])]
  input.value = ''
  if (!files.length || busy.value) return
  if (files.length > 20) { ElMessage.warning('每次最多上传 20 张图片'); return }
  assetUploading.value = true
  let successes = 0
  try {
    for (const file of files) {
      const url = await uploadFile(file)
      if (cover) form.cover_image = url
      else form.images.push(url)
      successes++
    }
    ElMessage.success('图片已上传，发布后生效')
  } catch { ElMessage.error(`上传未完成，已保留 ${successes} 张成功的图片`) }
  finally { assetUploading.value = false }
}
async function publish() {
  if (busy.value) return
  const parsed = activityInputSchema.safeParse(form)
  if (!parsed.success) { ElMessage.warning(parsed.error.issues[0]?.message ?? '请检查文章内容'); return }
  saving.value = true
  try {
    await api.request({ resource: 'activities', method: activityId.value ? 'PUT' : 'POST', id: activityId.value ?? undefined, body: parsed.data }, value => value)
    clearEditor(); await query.refetch(); ElMessage.success('文章已发布')
  } catch { ElMessage.error('发布未完成，请检查列表后再决定是否重试') }
  finally { saving.value = false }
}
async function remove(row: AdminActivity) {
  if (processingId.value !== null) return
  try {
    await ElMessageBox.confirm(`将“${row.title || '未命名文章'}”移入回收站？`, '删除文章', { confirmButtonText: '移入回收站', cancelButtonText: '取消', type: 'warning' })
    processingId.value = row.id
    await api.request({ resource: 'activities', method: 'DELETE', id: row.id }, value => value)
    if (items.value.length === 1 && page.value > 1) page.value--
    else await query.refetch()
    ElMessage.success('已移入回收站')
  } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error('删除失败') }
  finally { processingId.value = null }
}
async function restore(row: AdminActivity) {
  if (processingId.value !== null) return
  processingId.value = row.id
  try { await api.request({ resource: 'activities', method: 'POST', id: row.id, action: 'restore' }, value => value); await query.refetch(); ElMessage.success('文章已恢复') }
  catch { ElMessage.error('恢复失败') }
  finally { processingId.value = null }
}
</script>
<template>
  <AdminPanel v-if="editorVisible" :title="activityId ? '编辑文章' : '新建文章'" description="提交后将直接发布到公开页面；未提交的修改不会保存。">
    <template #actions><div class="admin-row-actions"><span v-if="dirty" class="admin-badge">有未发布修改</span><button class="admin-button admin-button--secondary" :disabled="busy" @click="closeEditor">返回列表</button><button class="admin-button admin-button--primary" :disabled="busy" @click="publish">{{ saving ? '发布中…' : editingStatus === 'published' ? '保存并发布' : '发布文章' }}</button></div></template>
    <form class="admin-form-grid" @submit.prevent="publish"><fieldset :disabled="busy" class="admin-form-grid"><div class="admin-form-row"><div class="admin-field"><label for="article-title">标题</label><input id="article-title" v-model="form.title" required maxlength="200" ></div><div class="admin-form-row"><div class="admin-field"><label for="article-tag">标签</label><input id="article-tag" v-model="form.tag" required maxlength="50" ></div><div class="admin-field"><label for="article-date">日期</label><input id="article-date" v-model="form.date" placeholder="YYYY-MM-DD" required maxlength="50" ></div></div></div><div class="admin-field"><label for="article-summary">简短介绍</label><textarea id="article-summary" v-model="form.description" rows="2" maxlength="2000" /></div><div class="admin-form-row"><div class="admin-field"><label for="article-cover">封面图片</label><img v-if="form.cover_image" :src="form.cover_image" alt="封面预览" class="admin-image-preview" ><input id="article-cover" type="file" accept="image/*" @change="uploadAssets($event, true)" ><button v-if="form.cover_image" class="admin-button admin-button--quiet" type="button" @click="form.cover_image = ''">移除封面</button></div><div class="admin-field"><label for="article-gallery">活动照片</label><input id="article-gallery" type="file" accept="image/*" multiple @change="uploadAssets($event, false)" ><small>每次最多 20 张；可以分多次添加。</small><div class="admin-gallery"><figure v-for="(url, index) in form.images" :key="`${index}-${url}`"><img :src="url" :alt="`照片 ${index + 1}`" ><button class="admin-button admin-button--danger" type="button" :aria-label="`移除照片 ${index + 1}`" @click="form.images.splice(index, 1)">移除</button></figure></div></div></div></fieldset><p v-if="assetUploading" class="admin-hint" role="status">图片上传中…</p><Suspense><LazyAdminArticleEditor v-model="form.content" :disabled="saving || assetUploading" :upload-image="uploadFile" @save="publish" @busy="editorUploading = $event" /><template #fallback><div class="admin-empty" role="status">正在加载编辑器…</div></template></Suspense></form>
  </AdminPanel>
  <AdminPanel v-else title="文章列表" :description="`共 ${total} 篇文章，包括未发布草稿。`"><template #actions><div class="admin-row-actions"><button v-if="session.isSuperAdmin.value" class="admin-button admin-button--secondary" :aria-pressed="showDeleted" @click="showDeleted = !showDeleted">{{ showDeleted ? '隐藏已删除' : '显示已删除' }}</button><button class="admin-button admin-button--primary" @click="startEditor()">新建文章</button></div></template><div class="admin-field admin-list-search"><label for="article-search">搜索当前页</label><input id="article-search" v-model="search" type="search" placeholder="搜索标题或标签" ></div><p v-if="query.isPending.value" class="admin-empty" role="status">正在加载文章…</p><div v-else-if="query.isError.value" class="admin-notice admin-notice--error" role="alert">文章加载失败。<button class="admin-button" @click="query.refetch()">重试</button></div><div v-else class="admin-stack"><p v-if="!filtered.length" class="admin-empty">{{ search ? '当前页没有匹配的文章' : '暂无文章' }}</p><article v-for="row in filtered" :key="row.id" data-testid="admin-article-card" class="admin-resource-card"><div class="admin-resource-heading"><div><h3>{{ row.title || '未命名草稿' }}</h3><div class="admin-tags"><span class="admin-badge">{{ row.date || '未设置日期' }}</span><span v-if="row.tag" class="admin-badge">{{ row.tag }}</span><span class="admin-badge" :class="{ 'admin-badge--danger': row.deleted_at }">{{ row.deleted_at ? '已删除' : row.status === 'draft' ? '草稿' : '已发布' }}</span></div></div><div class="admin-row-actions"><template v-if="!row.deleted_at"><NuxtLink v-if="row.status === 'published'" class="admin-button admin-button--quiet" :to="`/activity/${row.id}`" target="_blank">查看公开页</NuxtLink><button class="admin-button admin-button--secondary" :disabled="processingId !== null" @click="startEditor(row)">编辑</button><button class="admin-button admin-button--danger" :disabled="processingId !== null" @click="remove(row)">删除</button></template><button v-else-if="session.isSuperAdmin.value" class="admin-button admin-button--secondary" :disabled="processingId !== null" @click="restore(row)">恢复</button></div></div><p v-if="row.description" class="admin-resource-description">{{ row.description }}</p></article></div><nav class="admin-pagination" aria-label="文章分页"><span>{{ page }} / {{ totalPages }}</span><div class="admin-row-actions"><button class="admin-button admin-button--secondary" :disabled="page <= 1 || query.isPending.value" @click="page--">上一页</button><button class="admin-button admin-button--secondary" :disabled="page >= totalPages || query.isPending.value" @click="page++">下一页</button></div></nav></AdminPanel>
</template>
