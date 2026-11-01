<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { ElMessage } from 'element-plus'
import { z } from 'zod'
import AdminPanel from '~/components/admin/Panel.vue'
import ClubIcon from '~/components/ClubIcon.vue'
import ResourceFileIcon from '~/components/ResourceFileIcon.vue'
import ResourceDirectoryTree from '~/components/ResourceDirectoryTree.vue'
import { resourceAdminPathSchema, resourceAdminResponseSchema, resourceAdminItemSchema, resourceMutationSchema, resourceMutationResultSchema, resourceNameSchema, RESOURCE_UPLOAD_LIMIT } from '#shared/resource-admin'
import type { ResourceItem, ResourceFileKind } from '#shared/resources'
import { formatResourceSize, normalizeResourcePath, parentResourcePath, resourceBreadcrumbs } from '#shared/resources'
import { resourceMatches, resourceWebUrl, sortResources } from '~/utils/resource-browser'
import type { ResourceSort } from '~/utils/resource-browser'
import { queryValue } from '~/utils/public-query'

definePageMeta({ layout: 'admin', middleware: 'admin' })
const api = useAdminApi()
const route = useRoute()
const router = useRouter()
const path = computed(() => normalizeResourcePath(queryValue(route.query.path)))
const page = computed(() => Math.max(1, Math.min(100, Number.parseInt(queryValue(route.query.page) || '1', 10) || 1)))
const query = useQuery({
  queryKey: computed(() => ['admin', 'resource-files', path.value, page.value]),
  queryFn: ({ signal }) => api.resourceFiles(path.value, page.value, value => resourceAdminResponseSchema.parse(value), signal),
  retry: false,
})
const data = query.data
const pending = query.isFetching
const connection = computed(() => data.value?.connection)
const writable = computed(() => Boolean(connection.value?.writable) && !query.isError.value && !pending.value)
const breadcrumbs = computed(() => resourceBreadcrumbs(path.value))
const items = computed(() => data.value?.directory.items || [])
const total = computed(() => data.value?.directory.total || 0)
const pathInput = ref(path.value)
const pathError = ref('')
const search = ref('')
const kind = ref('all')
const sortBy = ref<ResourceSort>('name')
const sortOrder = ref<'asc' | 'desc'>('asc')
const selected = ref(new Set<string>())
const mutating = ref(false)
const uploading = ref(false)
const locked = computed(() => mutating.value || uploading.value)
const labels: Record<ResourceFileKind, string> = { folder: '文件夹', archive: '压缩包', game: '程序', audio: '音频', image: '图片', video: '视频', document: '文档', code: '配置与代码', other: '其他' }
const visibleItems = computed(() => sortResources(items.value.filter(item => resourceMatches(item, search.value) && (kind.value === 'all' || item.kind === kind.value)), sortBy.value, sortOrder.value))
const kinds = computed(() => [...new Set(items.value.map(item => item.kind))])
const selectedItems = computed(() => items.value.filter(item => selected.value.has(item.path)))
const allSelected = computed(() => visibleItems.value.length > 0 && visibleItems.value.every(item => selected.value.has(item.path)))
const someSelected = computed(() => !allSelected.value && visibleItems.value.some(item => selected.value.has(item.path)))
const publicPath = computed(() => '/resources' + (path.value === '/' ? '' : '?' + new URLSearchParams({ path: path.value })))
watch([path, page], () => {
  pathInput.value = path.value
  pathError.value = ''
  search.value = ''
  kind.value = 'all'
  selected.value = new Set()
  closeOperation()
})
watch([search, kind], () => { selected.value = new Set() })
watch(query.dataUpdatedAt, () => { selected.value = new Set() })

function navigate(pathValue: string, pageValue = 1) {
  if (locked.value) return
  const valid = resourceAdminPathSchema.safeParse(pathValue)
  if (!valid.success) { pathError.value = valid.error.issues[0]?.message || '目录路径无效'; return }
  void router.push({ path: '/admin/resources', query: { ...(valid.data === '/' ? {} : { path: valid.data }), ...(pageValue === 1 ? {} : { page: String(pageValue) }) } })
}
function toggleItem(item: ResourceItem, checked: boolean) {
  const next = new Set(selected.value)
  if (checked) next.add(item.path)
  else next.delete(item.path)
  selected.value = next
}
function toggleAll() {
  const next = new Set(selected.value)
  for (const item of visibleItems.value) { if (allSelected.value) next.delete(item.path); else next.add(item.path) }
  selected.value = next
}
async function refresh() {
  if (locked.value) return
  selected.value = new Set()
  await query.refetch()
}
function formatDate(value: string) { return value ? value.slice(0, 16).replace('T', ' ') : '—' }

type Operation = 'mkdir' | 'rename' | 'move' | 'remove'
const operation = ref<Operation | null>(null)
const operationDialog = ref<HTMLDialogElement | null>(null)
const operationItems = ref<ResourceItem[]>([])
const operationName = ref('')
const destination = ref('/')
const operationError = ref('')
const operationPath = ref('/')
const confirmRemove = ref(false)
const titles = { mkdir: '新建文件夹', rename: '重命名', move: '移动项目', remove: '删除项目' }
async function openOperation(action: Operation, targets: ResourceItem[] = selectedItems.value) {
  if (!writable.value || locked.value) return
  if (action !== 'mkdir' && !targets.length) return
  operation.value = action
  operationItems.value = targets.map(item => ({ ...item }))
  operationName.value = action === 'rename' ? targets[0]?.name || '' : ''
  destination.value = '/'
  operationPath.value = path.value
  confirmRemove.value = false
  operationError.value = ''
  await nextTick()
  operationDialog.value?.showModal()
}
function closeOperation() {
  if (mutating.value) return
  operationDialog.value?.close()
  operation.value = null
  operationItems.value = []
  operationError.value = ''
}
async function submitOperation() {
  if (!operation.value || !writable.value || locked.value) return
  const action = operation.value
  const common = { path: operationPath.value }
  const candidate = action === 'mkdir' ? { ...common, action, name: operationName.value }
    : action === 'rename' ? { ...common, action, name: operationItems.value[0]?.name, newName: operationName.value }
      : action === 'move' ? { ...common, action, names: operationItems.value.map(item => item.name), destination: destination.value }
        : { ...common, action, names: operationItems.value.map(item => item.name), confirmed: confirmRemove.value }
  const parsed = resourceMutationSchema.safeParse(candidate)
  if (!parsed.success) { operationError.value = action === 'remove' ? '请确认删除所选项目及文件夹中的内容' : parsed.error.issues[0]?.message || '请检查输入'; return }
  const body = parsed.data
  if (body.action === 'rename' && body.newName === body.name) { operationError.value = '请输入不同的新名称'; return }
  if (body.action === 'move' && (body.destination === body.path || body.names.some(name => body.destination === (body.path === '/' ? '' : body.path) + '/' + name || body.destination.startsWith((body.path === '/' ? '' : body.path) + '/' + name + '/')))) {
    operationError.value = '不能移动到原目录或项目自身的子目录'; return
  }
  mutating.value = true
  operationError.value = ''
  try {
    const result = await api.resourceMutation(body, value => resourceMutationResultSchema.parse(value))
    mutating.value = false
    closeOperation()
    selected.value = new Set()
    await query.refetch()
    ElMessage.success(result.submitted ? '移动任务已提交，请刷新查看最终结果' : '操作成功')
  } catch {
    operationError.value = '操作未完成，部分项目可能已变更。请检查目录与权限后重试。'
    await query.refetch()
  } finally { mutating.value = false }
}

interface UploadRow { id: number; name: string; size: number; state: 'waiting' | 'uploading' | 'done' | 'failed' | 'cancelled'; error?: string }
const uploadInput = ref<HTMLInputElement | null>(null)
const uploadRows = ref<UploadRow[]>([])
let uploadController: AbortController | undefined
let uploadSequence = 0
function cancelUpload() { uploadController?.abort() }
async function uploadFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files || [])]
  input.value = ''
  if (!files.length || !writable.value || locked.value) return
  if (files.length > 20) { ElMessage.warning('每次最多上传 20 个文件'); return }
  const uploadPath = path.value
  uploadRows.value = files.map(file => ({ id: ++uploadSequence, name: file.name, size: file.size, state: 'waiting' }))
  uploadController = new AbortController()
  uploading.value = true
  for (let index = 0; index < files.length; index++) {
    const file = files[index]!, row = uploadRows.value[index]!
    if (uploadController.signal.aborted) { row.state = 'cancelled'; continue }
    if (!resourceNameSchema.safeParse(file.name).success || file.size > RESOURCE_UPLOAD_LIMIT) {
      row.state = 'failed'; row.error = file.size > RESOURCE_UPLOAD_LIMIT ? '超过 50 MiB 限制' : '文件名包含不支持的字符'; continue
    }
    row.state = 'uploading'
    try { await api.resourceUpload(uploadPath, file, value => resourceMutationResultSchema.parse(value), uploadController.signal); row.state = 'done' }
    catch { row.state = uploadController.signal.aborted ? 'cancelled' : 'failed'; row.error = '未确认上传结果，请刷新目录后再试；同名文件不会覆盖' }
  }
  uploading.value = false
  selected.value = new Set()
  await query.refetch()
  if (uploadRows.value.every(row => row.state === 'done')) ElMessage.success('文件上传完成')
}
const uploadLabels = { waiting: '等待上传', uploading: '上传中…', done: '已上传', failed: '失败', cancelled: '已取消' }

const detailDialog = ref<HTMLDialogElement | null>(null)
const detailItem = ref<ResourceItem | null>(null)
const detailUrl = ref('')
const detailPreview = ref('')
const detailPending = ref(false)
const detailError = ref(false)
const detailFeedback = ref('')
let detailController: AbortController | undefined
let detailVersion = 0
const detailSchema = z.object({ item: resourceAdminItemSchema, raw_url: z.string(), source: z.enum(['mock', 'openlist']), textPreview: z.string().optional() })
async function showItem(item: ResourceItem) {
  if (locked.value) return
  if (item.is_dir) { navigate(item.path); return }
  const version = ++detailVersion
  detailController?.abort()
  detailController = new AbortController()
  detailItem.value = item
  detailUrl.value = ''
  detailPreview.value = ''
  detailError.value = false
  detailFeedback.value = ''
  detailPending.value = true
  await nextTick()
  if (version !== detailVersion) return
  if (!detailDialog.value?.open) detailDialog.value?.showModal()
  try {
    const result = await api.resourceDetail(item.path, value => detailSchema.parse(value), detailController.signal)
    if (version !== detailVersion) return
    detailItem.value = { ...item, ...result.item }
    detailUrl.value = result.source === 'openlist' ? resourceWebUrl(result.raw_url) : ''
    detailPreview.value = result.textPreview || ''
  } catch { if (version === detailVersion) detailError.value = true }
  finally { if (version === detailVersion) detailPending.value = false }
}
function closeDetail() {
  detailVersion++
  detailController?.abort()
  detailDialog.value?.close()
  detailItem.value = null
}
async function copyDownload() {
  try { await navigator.clipboard.writeText(detailUrl.value); detailFeedback.value = '链接已复制' }
  catch { detailFeedback.value = '复制失败，请手动复制下方链接' }
}
function allowNavigation() {
  if (locked.value) { ElMessage.warning('请等待当前操作完成，或先取消上传'); return false }
  return true
}
onBeforeRouteLeave(allowNavigation)
onBeforeRouteUpdate(allowNavigation)
onBeforeUnmount(() => { uploadController?.abort(); detailController?.abort(); operationDialog.value?.close(); detailDialog.value?.close() })
</script>

<template>
  <div class="admin-stack">
    <AdminPanel title="资源文件" class="admin-resource-panel">
      <template #actions><div class="admin-row-actions"><NuxtLink :to="publicPath" target="_blank" class="admin-button admin-button--secondary">查看公开页 <ClubIcon name="external" /></NuxtLink><button type="button" class="admin-button admin-button--secondary" :disabled="pending || locked" @click="refresh">刷新</button></div></template>
      <div v-if="query.isPending.value" class="admin-empty" role="status">正在读取资源目录…</div>
      <div v-else-if="query.isError.value" class="admin-notice admin-notice--error" role="alert">无法读取资源目录，请检查后端登录状态与 OpenList 连接。<button type="button" class="admin-button" @click="refresh">重试</button></div>
      <template v-else-if="data">
        <div v-if="connection?.mode === 'openlist'" class="admin-resource-status">
          <span class="admin-badge">OpenList</span>
          <span>{{ data.directory.provider }}</span>
          <span class="admin-badge">{{ connection?.writable ? '可管理' : '只读' }}</span>
        </div>
        <p v-if="connection?.reason !== 'ready'" class="admin-notice" role="status">
          {{ connection?.reason === 'demo' ? '演示目录只读。配置 OpenList 后可上传、新建文件夹、重命名、移动和删除。' : connection?.reason === 'missing_token' ? '尚未配置 OpenList 管理凭据，当前只允许浏览。' : '当前目录没有写入权限，请检查 OpenList 用户权限或进入可写的挂载目录。' }}
        </p>
        <div class="admin-resource-path">
          <nav aria-label="资源目录路径"><button v-if="path !== '/'" type="button" :disabled="locked" @click="navigate(parentResourcePath(path))">↑ 上级</button><template v-for="(crumb, index) in breadcrumbs" :key="crumb.path"><span v-if="index" aria-hidden="true">/</span><button type="button" :disabled="locked" :aria-current="index === breadcrumbs.length - 1 ? 'page' : undefined" @click="navigate(crumb.path)">{{ index === 0 ? '全部资源' : crumb.name }}</button></template></nav>
          <form class="admin-resource-address" @submit.prevent="navigate(pathInput)"><label class="sr-only" for="resource-address">目录路径</label><input id="resource-address" v-model="pathInput" :disabled="locked" placeholder="/目录路径"><button type="submit" class="admin-button admin-button--secondary" :disabled="locked">前往</button></form>
        </div>
        <p v-if="pathError" class="admin-notice admin-notice--error" role="alert">{{ pathError }}</p>
        <details class="admin-resource-navigation"><summary>目录导航</summary><nav aria-label="资源目录树"><ul><ResourceDirectoryTree path="/" name="全部资源" :current-path="path" :directory="data.directory" @navigate="navigate" /></ul></nav></details>

        <div class="admin-filter-bar">
          <div class="admin-field"><label for="resource-search">筛选本页文件</label><input id="resource-search" v-model="search" type="search" placeholder="文件名、版本或说明" :disabled="locked"></div>
          <div class="admin-field"><label for="resource-kind">类型</label><select id="resource-kind" v-model="kind" :disabled="locked"><option value="all">全部类型</option><option v-for="value in kinds" :key="value" :value="value">{{ labels[value] }}</option></select></div>
          <div class="admin-field"><label for="resource-sort">排序</label><select id="resource-sort" v-model="sortBy"><option value="name">名称</option><option value="modified">修改日期</option><option value="size">大小</option></select></div>
          <button type="button" class="admin-button admin-button--secondary" @click="sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'">{{ sortOrder === 'asc' ? '升序 ↑' : '降序 ↓' }}</button>
        </div>
        <div class="admin-resource-toolbar">
          <div class="admin-row-actions"><button type="button" class="admin-button admin-button--primary" :disabled="!writable || locked" @click="uploadInput?.click()"><ClubIcon name="download" />上传文件</button><input ref="uploadInput" type="file" multiple class="sr-only" :disabled="!writable || locked" aria-label="选择上传文件" @change="uploadFiles"><button type="button" class="admin-button admin-button--secondary" :disabled="!writable || locked" @click="openOperation('mkdir')">新建文件夹</button></div>
          <div class="admin-row-actions"><span>{{ selectedItems.length ? '已选择 ' + selectedItems.length + ' 项' : '共 ' + total + ' 项' }}</span><button type="button" class="admin-button admin-button--secondary" :disabled="!writable || locked || !selectedItems.length" @click="openOperation('move')">移动</button><button type="button" class="admin-button admin-button--danger" :disabled="!writable || locked || !selectedItems.length" @click="openOperation('remove')">删除</button><button v-if="selectedItems.length" type="button" class="admin-button admin-button--quiet" :disabled="locked" @click="selected = new Set()">取消选择</button></div>
        </div>
        <p class="admin-hint">单个文件最大 50 MiB，每次最多 20 个，同名文件不覆盖。更大文件请使用 OpenList 管理端上传。</p>

        <div class="admin-table-scroll">
          <table class="admin-table admin-resource-table" aria-label="资源文件列表">
            <thead><tr><th class="admin-resource-checkbox"><input type="checkbox" aria-label="选择本页显示的全部项目" :checked="allSelected" :indeterminate="someSelected" :disabled="locked || !visibleItems.length" @change="toggleAll"></th><th scope="col">名称</th><th scope="col">类型</th><th scope="col">大小</th><th scope="col">修改日期</th><th scope="col">操作</th></tr></thead>
            <tbody><tr v-for="item in visibleItems" :key="item.path" :class="{ 'is-selected': selected.has(item.path) }"><td class="admin-resource-checkbox"><input type="checkbox" :aria-label="'选择 ' + item.name" :checked="selected.has(item.path)" :disabled="locked" @change="toggleItem(item, ($event.target as HTMLInputElement).checked)"></td><td><button type="button" class="admin-resource-file" :disabled="locked" @click="showItem(item)"><ResourceFileIcon :name="item.name" :is-dir="item.is_dir" :kind="item.kind" /><span><strong>{{ item.name }}</strong><small v-if="item.version">{{ item.version }}</small></span></button></td><td>{{ labels[item.kind] }}</td><td>{{ item.is_dir ? '—' : formatResourceSize(item.size) }}</td><td><time :datetime="item.modified || undefined">{{ formatDate(item.modified) }}</time></td><td><div class="admin-row-actions"><button type="button" class="admin-button admin-button--quiet" :disabled="locked" @click="showItem(item)">{{ item.is_dir ? '打开' : '详情' }}</button><button type="button" class="admin-button admin-button--quiet" :disabled="!writable || locked" @click="openOperation('rename', [item])">重命名</button><button type="button" class="admin-button admin-button--danger" :disabled="!writable || locked" @click="openOperation('remove', [item])">删除</button></div></td></tr><tr v-if="!visibleItems.length"><td colspan="6" class="admin-empty">{{ search || kind !== 'all' ? '本页没有匹配的文件' : '此目录为空' }}</td></tr></tbody>
          </table>
        </div>
        <div class="admin-resource-pagination"><span>第 {{ page }} 页 · 本页 {{ items.length }} 项 · 总计 {{ total }} 项</span><div class="admin-row-actions"><button type="button" class="admin-button admin-button--secondary" :disabled="page <= 1 || locked || pending" @click="navigate(path, page - 1)">上一页</button><button type="button" class="admin-button admin-button--secondary" :disabled="page * 100 >= total || page >= 100 || locked || pending" @click="navigate(path, page + 1)">下一页</button></div></div>
      </template>
    </AdminPanel>

    <AdminPanel v-if="uploadRows.length" title="上传队列"><template #actions><button v-if="uploading" type="button" class="admin-button admin-button--secondary" @click="cancelUpload">取消剩余上传</button><button v-else type="button" class="admin-button admin-button--quiet" @click="uploadRows = []">清除记录</button></template><ul class="admin-resource-uploads"><li v-for="row in uploadRows" :key="row.id"><span>{{ row.name }} <small>{{ formatResourceSize(row.size) }}</small></span><span :class="{ 'admin-badge--danger': row.state === 'failed' }">{{ uploadLabels[row.state] }}</span><p v-if="row.error" role="status">{{ row.error }}</p></li></ul></AdminPanel>
    <details class="admin-resource-configuration"><summary>OpenList 连接配置</summary><p>连接信息由服务端环境变量配置，访问令牌不会发送到浏览器。配置后重启 Web 服务，再点击“刷新”。</p><pre>NUXT_OPENLIST_BASE_URL=https://你的网盘地址
NUXT_OPENLIST_PUBLIC_URL=https://你的公开网盘地址
NUXT_OPENLIST_TOKEN=具有文件管理权限的访问令牌
NUXT_OPENLIST_ROOT_PATH=/共享目录</pre><p>配置的根目录之外不会显示或管理。当前根目录：<code>{{ connection?.rootPath || '/' }}</code></p></details>

    <dialog ref="operationDialog" class="admin-resource-dialog" aria-labelledby="resource-operation-title" @cancel.prevent="closeOperation">
      <form v-if="operation" @submit.prevent="submitOperation"><header><h2 id="resource-operation-title">{{ titles[operation] }}</h2><button type="button" class="admin-icon-button" aria-label="关闭操作窗口" :disabled="mutating" @click="closeOperation">×</button></header>
        <p class="admin-hint">当前目录：{{ operationPath }}</p>
        <div v-if="operation === 'mkdir' || operation === 'rename'" class="admin-field"><label for="resource-operation-name">{{ operation === 'mkdir' ? '文件夹名称' : '新名称' }}</label><input id="resource-operation-name" v-model="operationName" autofocus maxlength="128" :disabled="mutating" required autocomplete="off"><small v-if="operation === 'rename'">重命名文件时请保留需要的扩展名。</small></div>
        <template v-else><p>已选择 {{ operationItems.length }} 项：</p><ul class="admin-resource-targets"><li v-for="item in operationItems" :key="item.path">{{ item.name }}{{ item.is_dir ? '（文件夹）' : '' }}</li></ul></template>
        <template v-if="operation === 'move'"><div class="admin-field"><label for="resource-destination">目标目录</label><input id="resource-destination" v-model="destination" :disabled="mutating" required placeholder="/目标目录"></div><details class="admin-resource-navigation"><summary>选择目标目录</summary><ul><ResourceDirectoryTree path="/" name="全部资源" :current-path="destination" :directory="data?.directory" @navigate="value => { if (!mutating) destination = value }" /></ul></details><p class="admin-hint">目标目录必须已存在；同名文件不覆盖。部分存储驱动会将移动操作加入后台任务。</p></template>
        <label v-if="operation === 'remove'" class="admin-check-label admin-notice admin-notice--error"><input v-model="confirmRemove" type="checkbox" :disabled="mutating">确认删除以上项目，包含所选文件夹中的全部内容。此页面不提供恢复功能。</label>
        <p v-if="operationError" class="admin-notice admin-notice--error" role="alert">{{ operationError }}</p>
        <footer><button type="button" class="admin-button admin-button--secondary" :disabled="mutating" @click="closeOperation">取消</button><button type="submit" class="admin-button" :class="operation === 'remove' ? 'admin-button--danger' : 'admin-button--primary'" :disabled="mutating || pending || (operation === 'remove' && !confirmRemove)">{{ mutating ? '正在处理…' : operation === 'remove' ? '确认删除' : '确定' }}</button></footer>
      </form>
    </dialog>

    <dialog ref="detailDialog" class="admin-resource-dialog" aria-labelledby="admin-resource-detail-title" @cancel.prevent="closeDetail">
      <template v-if="detailItem"><header><h2 id="admin-resource-detail-title">文件详情</h2><button type="button" class="admin-icon-button" autofocus aria-label="关闭文件详情" @click="closeDetail">×</button></header><div class="admin-resource-detail-name"><ResourceFileIcon :name="detailItem.name" :kind="detailItem.kind" /><h3>{{ detailItem.name }}</h3></div><p v-if="detailPending" role="status">正在读取文件信息…</p><div v-else-if="detailError" class="admin-notice admin-notice--error" role="alert">文件信息加载失败。<button type="button" class="admin-button" @click="showItem(detailItem)">重试</button></div><dl class="admin-resource-meta"><div><dt>路径</dt><dd>{{ detailItem.path }}</dd></div><div><dt>大小</dt><dd>{{ formatResourceSize(detailItem.size) }}</dd></div><div><dt>修改日期</dt><dd>{{ formatDate(detailItem.modified) }}</dd></div><div v-if="detailItem.sha256"><dt>SHA-256</dt><dd>{{ detailItem.sha256 }}</dd></div></dl><template v-if="detailUrl && !detailPending && !detailError"><div class="admin-row-actions"><a :href="detailUrl" target="_blank" rel="noopener noreferrer" class="admin-button admin-button--primary">下载文件</a><button type="button" class="admin-button admin-button--secondary" @click="copyDownload">复制下载链接</button></div><input readonly :value="detailUrl" aria-label="下载链接" class="admin-resource-link"><p v-if="detailFeedback" role="status">{{ detailFeedback }}</p></template><pre v-if="detailPreview" class="admin-resource-preview">{{ detailPreview }}</pre></template>
    </dialog>
  </div>
</template>

<style scoped>
.admin-resource-status { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; color: var(--admin-muted); font-size: 12px; }
.admin-resource-path { display: grid; grid-template-columns: minmax(0, 1fr) minmax(220px, .85fr); align-items: center; gap: 12px; margin-block: 14px; }
.admin-resource-path nav { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.admin-resource-path nav button { border: 0; background: transparent; color: var(--admin-primary); padding: 5px 0; font-size: 12px; overflow-wrap: anywhere; text-align: left; }
.admin-resource-path nav button[aria-current] { color: var(--admin-text); font-weight: 600; }
.admin-resource-address { display: flex; gap: 8px; }
.admin-resource-address input { min-width: 0; flex: 1; padding: 9px 12px; border: 1px solid var(--admin-border); border-radius: 6px; background: var(--admin-surface); color: var(--admin-text); font-size: 12px; }
.admin-resource-navigation { margin-block: 8px 12px; padding: 8px 12px; border: 1px solid var(--admin-border); border-radius: 6px; }
.admin-resource-navigation summary, .admin-resource-configuration summary { color: var(--admin-primary); cursor: pointer; font-size: 12px; }
.admin-resource-navigation nav, .admin-resource-navigation > ul { margin-top: 10px; max-height: 260px; overflow: auto; }
.admin-resource-navigation ul { list-style: none; padding: 0; }
.admin-resource-navigation :deep(.resources-tree-children) { border-left: 1px solid var(--admin-border); padding-left: 10px; margin-left: 12px; }
.admin-resource-navigation :deep(.resources-tree-row) { display: flex; align-items: flex-start; border-radius: 4px; }
.admin-resource-navigation :deep(.resources-tree-row.is-current) { background: var(--admin-active); color: var(--admin-primary); }
.admin-resource-navigation :deep(.resources-tree-disclosure), .admin-resource-navigation :deep(.resources-tree-spacer) { display: grid; place-items: center; width: 24px; height: 32px; flex-shrink: 0; border: 0; background: transparent; color: var(--admin-muted); }
.admin-resource-navigation :deep(.resources-tree-disclosure svg) { width: 12px; height: 12px; }
.admin-resource-navigation :deep(.resources-tree-disclosure[aria-expanded='true'] svg) { transform: rotate(90deg); }
.admin-resource-navigation :deep(.resources-tree-link) { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 7px 5px 7px 0; border: 0; background: transparent; color: inherit; text-align: left; font-size: 12px; overflow-wrap: anywhere; }
.admin-resource-navigation :deep(.resources-tree-link svg) { width: 15px; height: 15px; flex-shrink: 0; }
.admin-resource-navigation :deep(.resources-tree-status) { color: var(--admin-muted); padding-left: 24px; font-size: 11px; }
.admin-resource-toolbar, .admin-resource-pagination { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-block: 12px; }
.admin-resource-toolbar span, .admin-resource-pagination > span { color: var(--admin-muted); font-size: 12px; }
.admin-resource-table { min-width: 760px; }
.admin-resource-panel .admin-filter-bar { margin-block: 12px; }
.admin-resource-panel :deep(.admin-table-scroll) { margin-top: 10px; }
.admin-resource-table .admin-resource-checkbox { min-width: 0; width: 42px; padding-right: 0; }
.admin-resource-checkbox input { width: 15px; height: 15px; }
.admin-resource-table tr.is-selected { background: var(--admin-active); }
.admin-resource-file { display: flex; align-items: center; gap: 12px; min-width: 190px; width: 100%; padding: 0; border: 0; background: transparent; color: var(--admin-text); text-align: left; }
.admin-resource-file :deep(img) { width: 25px; height: 32px; object-fit: contain; flex-shrink: 0; }
.admin-resource-file strong { display: block; font-size: 12px; font-weight: 500; overflow-wrap: anywhere; }
.admin-resource-file small { display: block; color: var(--admin-muted); font-size: 10px; margin-top: 4px; }
.admin-resource-configuration { border: 1px solid var(--admin-border); padding: 16px 20px; border-radius: 8px; background: var(--admin-surface); font-size: 12px; line-height: 1.8; }
.admin-resource-configuration pre, .admin-resource-preview { white-space: pre-wrap; overflow-wrap: anywhere; padding: 14px; background: var(--admin-soft); border-radius: 6px; font: 11px/1.9 ui-monospace, monospace; max-height: 320px; overflow: auto; margin-block: 12px; }
.admin-resource-uploads { list-style: none; padding: 0; margin: 0; }
.admin-resource-uploads li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 5px 16px; padding-block: 10px; border-bottom: 1px solid var(--admin-border); font-size: 12px; overflow-wrap: anywhere; }
.admin-resource-uploads small { color: var(--admin-muted); }
.admin-resource-uploads li p { grid-column: 1 / -1; color: var(--admin-danger); font-size: 11px; }
.admin-resource-dialog { --res-accent: var(--admin-primary); width: min(560px, calc(100vw - 32px)); max-height: calc(100dvh - 40px); overflow: auto; border: 1px solid var(--admin-border); border-radius: 10px; padding: 24px; color: var(--admin-text); background: var(--admin-surface); }
.admin-resource-dialog::backdrop { background: rgb(0 0 0 / .4); }
.admin-resource-dialog header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.admin-resource-dialog h2 { font-size: 18px; font-weight: 600; }
.admin-resource-dialog footer { display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid var(--admin-border); margin-top: 20px; padding-top: 18px; }
.admin-resource-targets { max-height: 180px; overflow: auto; padding-left: 20px; list-style: disc; margin-block: 10px; font-size: 12px; overflow-wrap: anywhere; }
.admin-resource-dialog .admin-field { margin-block: 14px; }
.admin-resource-detail-name { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
.admin-resource-detail-name :deep(img) { width: 32px; height: 42px; flex-shrink: 0; }
.admin-resource-detail-name h3 { font-size: 15px; overflow-wrap: anywhere; }
.admin-resource-meta { margin-block: 16px; font-size: 12px; }
.admin-resource-meta > div { display: grid; grid-template-columns: 65px minmax(0, 1fr); gap: 12px; padding-block: 10px; border-bottom: 1px solid var(--admin-border); }
.admin-resource-meta dt { color: var(--admin-muted); }
.admin-resource-meta dd { margin: 0; overflow-wrap: anywhere; }
.admin-resource-link { width: 100%; padding: 10px; border: 1px solid var(--admin-border); border-radius: 5px; background: var(--admin-soft); color: var(--admin-muted); font-size: 11px; margin-top: 12px; }
@media (max-width: 900px) { .admin-resource-path { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .admin-resource-dialog { padding: 18px; } .admin-resource-address { flex-wrap: wrap; } }
</style>
