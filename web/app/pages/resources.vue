<script setup lang="ts">
import type { ResourceDetailResponse, ResourceDirectoryResponse, ResourceFileKind, ResourceItem, ResourceSearchResponse } from '#shared/resources'
import { formatResourceSize, normalizeResourcePath, parentResourcePath, resourceBreadcrumbs } from '#shared/resources'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { START_LOCATION } from 'vue-router'
import ClubIcon from '~/components/ClubIcon.vue'
import ResourceFileIcon from '~/components/ResourceFileIcon.vue'
import ResourceDirectoryTree from '~/components/ResourceDirectoryTree.vue'
import SafeMarkdown from '~/components/SafeMarkdown.vue'
import { usePublicPageSeo } from '~/composables/usePublicPageSeo'
import { queryValue } from '~/utils/public-query'
import { mergeResourcePages, paginateResources, resourceMatches, resourceWebUrl, sortResources } from '~/utils/resource-browser'
import type { ResourceSort } from '~/utils/resource-browser'
import '~/assets/css/resources.css'
import { vReveal } from '~/utils/motion'

definePageMeta({
  key: route => route.path,
  scrollToTop(to, from) {
    if (from === START_LOCATION) return Boolean(to.hash) || typeof window === 'undefined' || window.scrollY === 0
    return to.path !== from.path
  },
})

const route = useRoute()
const router = useRouter()
const currentPath = computed(() => normalizeResourcePath(queryValue(route.query.path)))
const breadcrumbs = computed(() => resourceBreadcrumbs(currentPath.value))
const directoryName = computed(() => currentPath.value === '/' ? '全部资源' : breadcrumbs.value.at(-1)?.name || '资源目录')

const { data: dirData, status: dirStatus, error: dirError, refresh: refreshDir } = await useFetch<ResourceDirectoryResponse>('/api/resources/list', {
  key: () => 'resource-directory-' + currentPath.value,
  query: computed(() => ({ path: currentPath.value })),
  default: (): ResourceDirectoryResponse => ({ path: currentPath.value, readme: '', header: '', provider: '', total: 0, write: false, source: 'mock', items: [], stats: { totalFiles: 0, totalFolders: 0, totalSize: 0 } }),
})
usePublicPageSeo(() => ({
  title: directoryName.value + ' · 资源下载',
  description: '桂航绯想天共享资源：联机工具、东方 STG 补丁、同人音乐与社团资料。',
  path: '/resources',
  query: currentPath.value !== '/' ? { path: currentPath.value } : {},
}))

const kindLabels: Record<ResourceFileKind, string> = { folder: '文件夹', archive: '压缩包', game: '程序', document: '文档', audio: '音频', image: '图片', video: '视频', code: '配置与代码', other: '其他' }
const searchQuery = ref('')
const searchScope = ref<'directory' | 'all'>('directory')
const submittedQuery = ref('')
const searchItems = ref<ResourceItem[]>([])
const searchTotal = ref(0)
const searchPending = ref(false)
const searchError = ref(false)
const hasSearched = ref(false)
const selectedKind = ref<'all' | ResourceFileKind>('all')
const sortBy = ref<ResourceSort>('name')
const sortOrder = ref<'asc' | 'desc'>('asc')
const viewMode = ref<'list' | 'grid'>('list')
const extraItems = ref<ResourceItem[]>([])
const directoryPage = ref(1)
const searchPage = ref(1)
const viewPage = ref(1)
const currentPage = computed(() => isGlobalSearch.value ? searchPage.value : directoryPage.value)
const morePending = ref(false)
const moreError = ref(false)
const moreExhausted = ref(false)
const isGlobalSearch = computed(() => searchScope.value === 'all')
let searchController: AbortController | undefined
let moreController: AbortController | undefined
let searchVersion = 0
let moreVersion = 0

function invalidateSearch() {
  searchVersion++
  searchController?.abort()
  moreVersion++
  moreController?.abort()
  searchPending.value = false
  morePending.value = false
  searchItems.value = []
  searchTotal.value = 0
  searchError.value = false
  hasSearched.value = false
  submittedQuery.value = ''
  selectedKind.value = 'all'
  searchPage.value = 1
  viewPage.value = 1
  moreError.value = false
  moreExhausted.value = false
}
watch([searchQuery, searchScope], invalidateSearch, { flush: 'sync' })
watch(currentPath, () => {
  if (drawer.value?.open) closeDrawer()
  searchQuery.value = ''
  searchScope.value = 'directory'
  invalidateSearch()
  extraItems.value = []
  directoryPage.value = 1
  viewPage.value = 1
  closeDrawer()
})
function clearSearch() {
  searchQuery.value = ''
  searchScope.value = 'directory'
  invalidateSearch()
}

async function submitSearch() {
  if (!isGlobalSearch.value || !searchQuery.value.trim()) return
  invalidateSearch()
  const version = ++searchVersion
  searchController = new AbortController()
  submittedQuery.value = searchQuery.value.trim()
  hasSearched.value = true
  searchPending.value = true
  try {
    const result = await $fetch<ResourceSearchResponse>('/api/resources/search', { query: { q: submittedQuery.value, path: '/' }, signal: searchController.signal })
    if (version !== searchVersion) return
    searchItems.value = [...result.items]
    searchTotal.value = result.total
  } catch {
    if (version === searchVersion) searchError.value = true
  } finally {
    if (version === searchVersion) searchPending.value = false
  }
}
const directoryItems = computed(() => mergeResourcePages(dirData.value.items, extraItems.value))
const sourceItems = computed(() => isGlobalSearch.value ? searchItems.value : directoryItems.value)
const matchingItems = computed(() => isGlobalSearch.value ? sourceItems.value : sourceItems.value.filter(item => resourceMatches(item, searchQuery.value)))
const kindOptions = computed(() => {
  const counts = new Map<ResourceFileKind, number>()
  for (const item of matchingItems.value) counts.set(item.kind, (counts.get(item.kind) || 0) + 1)
  return [...counts].map(([value, count]) => ({ value, count, label: kindLabels[value] }))
})
const filteredItems = computed(() => sortResources(matchingItems.value.filter(item => selectedKind.value === 'all' || item.kind === selectedKind.value), sortBy.value, sortOrder.value))
const paginationResult = computed(() => paginateResources(filteredItems.value, viewPage.value, 100))
const displayedItems = computed(() => paginationResult.value.items)
const totalViewPages = computed(() => paginationResult.value.totalPages)
const currentViewPage = computed(() => paginationResult.value.currentPage)
watch(selectedKind, () => { viewPage.value = 1 })
const mobileTreeOpen = ref(false)
const totalCount = computed(() => isGlobalSearch.value ? searchTotal.value : dirData.value.total)
const loadedCount = computed(() => sourceItems.value.length)
const canLoadMore = computed(() => loadedCount.value < totalCount.value && !moreExhausted.value && currentPage.value < 100)
const busy = computed(() => isGlobalSearch.value ? searchPending.value : dirStatus.value === 'pending')
const hasError = computed(() => isGlobalSearch.value ? searchError.value : Boolean(dirError.value))
const globalSearchIdle = computed(() => isGlobalSearch.value && !hasSearched.value)
const hasFilters = computed(() => Boolean(searchQuery.value.trim()) || selectedKind.value !== 'all')
const activeFolderCount = computed(() => filteredItems.value.filter(item => item.is_dir).length)

async function loadMore() {
  if (!canLoadMore.value || morePending.value) return
  morePending.value = true
  moreError.value = false
  const version = ++moreVersion
  moreController = new AbortController()
  const nextPage = currentPage.value + 1
  try {
    if (isGlobalSearch.value) {
      const result = await $fetch<ResourceSearchResponse>('/api/resources/search', { query: { q: submittedQuery.value, path: '/', page: nextPage }, signal: moreController.signal })
      if (version !== moreVersion) return
      const merged = mergeResourcePages(searchItems.value, result.items)
      moreExhausted.value = merged.length === searchItems.value.length
      searchItems.value = merged
      searchTotal.value = result.total
    } else {
      const result = await $fetch<ResourceDirectoryResponse>('/api/resources/list', { query: { path: currentPath.value, page: nextPage }, signal: moreController.signal })
      if (version !== moreVersion) return
      const previousCount = directoryItems.value.length
      extraItems.value = mergeResourcePages(extraItems.value, result.items)
      moreExhausted.value = directoryItems.value.length === previousCount
    }
    if (isGlobalSearch.value) searchPage.value = nextPage
    else directoryPage.value = nextPage
  } catch {
    if (version === moreVersion) moreError.value = true
  } finally {
    if (version === moreVersion) morePending.value = false
  }
}
async function refreshDirectory() {
  invalidateSearch()
  extraItems.value = []
  directoryPage.value = 1
  if (isGlobalSearch.value) await submitSearch()
  else await refreshDir()
}
function navigateToPath(path: string) {
  mobileTreeOpen.value = false
  clearSearch()
  void router.push({ path: '/resources', query: path === '/' ? {} : { path: normalizeResourcePath(path) } })
}
function changeSort(field: ResourceSort) {
  viewPage.value = 1
  if (sortBy.value === field) sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  else { sortBy.value = field; sortOrder.value = field === 'name' ? 'asc' : 'desc' }
}
function fileDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10).replaceAll('-', '.') : '—'
}
function absoluteUrl(value: string): string {
  const safe = resourceWebUrl(value)
  if (!safe) return ''
  return safe.startsWith('/') && typeof window !== 'undefined' ? new URL(safe, window.location.origin).href : safe
}
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined
async function copyText(value: string, label: string) {
  if (!value) return
  try { await navigator.clipboard.writeText(value); toast.value = label + '已复制' }
  catch { toast.value = '复制失败，请手动复制下方链接' }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, 2800)
}

// The native modal provides focus containment, Escape, and focus restoration.
const drawer = ref<HTMLDialogElement | null>(null)
const activeItem = ref<ResourceItem | null>(null)
const activeDetail = ref<ResourceDetailResponse | null>(null)
const detailPending = ref(false)
const detailError = ref(false)
let detailController: AbortController | undefined
let detailVersion = 0
let drawerClearTimer: ReturnType<typeof setTimeout> | undefined
let disposed = false
const displayItem = computed(() => activeDetail.value?.item || activeItem.value)
const downloadUrl = computed(() => absoluteUrl(activeDetail.value?.raw_url || ''))
const isDemoDetail = computed(() => activeDetail.value?.source === 'mock')
const canDownload = computed(() => Boolean(downloadUrl.value) && !detailPending.value && !detailError.value && !isDemoDetail.value)
const aria2Command = computed(() => {
  if (!displayItem.value || !canDownload.value) return ''
  // A single-quoted POSIX shell argument preserves spaces, quotes and substitutions.
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'"
  return 'aria2c -x 8 -s 8 -o ' + quote(displayItem.value.name) + ' ' + quote(downloadUrl.value)
})
async function openItem(item: ResourceItem) {
  if (item.is_dir) { navigateToPath(item.path); return }
  clearTimeout(drawerClearTimer)
  const version = ++detailVersion
  detailController?.abort()
  detailController = new AbortController()
  activeItem.value = item
  activeDetail.value = null
  detailPending.value = true
  detailError.value = false
  await nextTick()
  if (version !== detailVersion) return
  if (drawer.value && !drawer.value.open) drawer.value.showModal()
  try {
    const result = await $fetch<ResourceDetailResponse>('/api/resources/detail', { query: { path: item.path }, signal: detailController.signal })
    if (version === detailVersion) activeDetail.value = result
  } catch {
    if (version === detailVersion) detailError.value = true
  } finally {
    if (version === detailVersion) detailPending.value = false
  }
}
function closeDrawer() {
  detailVersion++
  detailController?.abort()
  drawer.value?.close()
}
function onDrawerClosed() {
  if (disposed || drawer.value?.open) return
  clearTimeout(drawerClearTimer)
  const clear = () => {
    if (drawer.value?.open) return
    activeItem.value = null
    activeDetail.value = null
    detailPending.value = false
    detailError.value = false
  }
  // Keep content during the native dialog's discrete exit transition.
  const animate = typeof CSS !== 'undefined' && CSS.supports('transition-behavior', 'allow-discrete')
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (animate) drawerClearTimer = setTimeout(clear, 230)
  else clear()
}
onMounted(() => {
  try {
    const saved = localStorage.getItem('guatswr-resource-view')
    if (saved === 'list' || saved === 'grid') viewMode.value = saved
  } catch { /* View switching still works without local storage. */ }
})
watch(viewMode, value => { try { localStorage.setItem('guatswr-resource-view', value) } catch { /* Optional preference. */ } })
onBeforeUnmount(() => {
  disposed = true
  searchVersion++
  moreVersion++
  detailVersion++
  searchController?.abort()
  moreController?.abort()
  detailController?.abort()
  clearTimeout(toastTimer)
  clearTimeout(drawerClearTimer)
  drawer.value?.close()
})
</script>

<template>
  <div class="resources-stage">
    <div class="resources-container">
      <header class="resources-header club-hero-step">
        <h1>资源下载</h1>
        <div class="resources-header-actions">
          <button type="button" class="resources-action-btn resources-tree-toggle" :aria-expanded="mobileTreeOpen" aria-controls="resource-directory-panel" @click="mobileTreeOpen = !mobileTreeOpen"><ClubIcon name="folder" />目录</button>
          <span v-if="dirData.source === 'mock'" class="resources-node-status"><span class="resources-status-dot is-mock" />演示模式</span>
        </div>
      </header>

      <div class="resources-workspace">
        <aside id="resource-directory-panel" class="resources-sidebar" :class="{ 'is-open': mobileTreeOpen }" aria-label="目录导航">
          <h2 class="resources-tree-heading">目录</h2>
          <nav v-reveal aria-label="资源目录树">
            <ul class="resources-tree">
              <ResourceDirectoryTree path="/" name="全部资源" :current-path="currentPath" :directory="dirError ? undefined : dirData" @navigate="navigateToPath" />
            </ul>
          </nav>
        </aside>

        <div class="resources-main">
          <section v-reveal="{ variant: 'scale' }" class="resources-file-panel" aria-label="资源文件浏览器" :aria-busy="busy || undefined">
            <div class="resources-pathbar">
              <nav class="resources-breadcrumbs" aria-label="当前目录路径">
                <button v-if="currentPath !== '/'" type="button" class="resources-icon-btn" aria-label="返回上级目录" @click="navigateToPath(parentResourcePath(currentPath))">↰</button>
                <template v-for="(crumb, index) in breadcrumbs" :key="crumb.path">
                  <span v-if="index" class="resources-crumb-sep" aria-hidden="true">/</span>
                  <button type="button" :aria-current="index === breadcrumbs.length - 1 ? 'page' : undefined" class="resources-crumb-btn" @click="navigateToPath(crumb.path)">
                    <ClubIcon v-if="index === 0" name="archive" />
                    {{ index === 0 ? '全部资源' : crumb.name }}
                  </button>
                </template>
              </nav>
              <div class="resources-path-actions">
                <button type="button" class="resources-action-btn" aria-label="复制目录链接" title="复制目录链接" @click="copyText(absoluteUrl(route.fullPath), '目录链接')"><ClubIcon name="copy" /><span>复制目录链接</span></button>
                <button type="button" class="resources-icon-btn" :disabled="busy" aria-label="刷新文件列表" title="刷新文件列表" @click="refreshDirectory"><svg class="resources-refresh-icon" :class="{ 'is-refreshing': busy }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M5.5 7a7 7 0 0 1 12-2L20 8M4 16l2.5 3a7 7 0 0 0 12-2" /></svg></button>
              </div>
            </div>

            <div class="resources-toolbar">
              <form class="resources-search" role="search" @submit.prevent="submitSearch">
                <svg class="resources-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
                <input v-model="searchQuery" type="search" maxlength="80" aria-label="搜索资源" :placeholder="isGlobalSearch ? '输入文件名或关键词' : '筛选此目录的名称、版本或说明'" class="resources-search-input">
                <label class="resources-search-scope"><span class="sr-only">搜索范围</span><select v-model="searchScope" aria-label="搜索范围"><option value="directory">当前目录</option><option value="all">全部资源</option></select></label>
                <button v-if="isGlobalSearch" type="submit" class="resources-search-submit" :disabled="!searchQuery.trim() || searchPending">{{ searchPending ? '搜索中…' : '搜索' }}</button>
                <button v-if="hasFilters || isGlobalSearch" type="button" class="resources-icon-btn" aria-label="清除搜索与筛选" title="清除搜索与筛选" @click="clearSearch">×</button>
              </form>
              <div class="resources-view-group" role="group" aria-label="视图模式">
                <button type="button" class="resources-view-tab" :class="{ 'is-active': viewMode === 'list' }" :aria-pressed="viewMode === 'list'" aria-label="列表视图" title="列表视图" @click="viewMode = 'list'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1" /></svg></button>
                <button type="button" class="resources-view-tab" :class="{ 'is-active': viewMode === 'grid' }" :aria-pressed="viewMode === 'grid'" aria-label="网格视图" title="网格视图" @click="viewMode = 'grid'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg></button>
              </div>
            </div>

            <div class="resources-heading-row">
              <div class="resources-directory-heading">
                <h2>{{ isGlobalSearch ? hasSearched ? '“' + submittedQuery + '” 的搜索结果' : '搜索全部资源' : directoryName }}</h2>
                <span v-if="!busy && !globalSearchIdle && !hasError" role="status">{{ filteredItems.length }} 项{{ hasFilters && !isGlobalSearch ? '匹配' : '' }}</span>
              </div>
              <label class="resources-sort"><span class="sr-only">排序方式</span><select v-model="sortBy"><option value="name">按名称</option><option value="modified">按修改日期</option><option value="size">按大小</option></select></label>
              <button type="button" class="resources-icon-btn" :aria-label="sortOrder === 'asc' ? '切换为降序' : '切换为升序'" @click="sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'">{{ sortOrder === 'asc' ? '↑' : '↓' }}</button>
            </div>
            <div v-if="!globalSearchIdle && !hasError" class="resources-type-filters" role="group" aria-label="文件类型筛选">
              <button type="button" :aria-pressed="selectedKind === 'all'" @click="selectedKind = 'all'">全部 <span>{{ matchingItems.length }}</span></button>
              <button v-for="option in kindOptions" :key="option.value" type="button" :aria-pressed="selectedKind === option.value" @click="selectedKind = option.value">{{ option.label }} <span>{{ option.count }}</span></button>
            </div>

            <div v-if="busy" class="resources-state" role="status"><span class="resources-loading-mark" /><p>{{ isGlobalSearch ? '正在搜索资源…' : '正在读取目录…' }}</p></div>
            <div v-else-if="hasError" class="resources-state resources-state-error" role="alert"><ClubIcon name="server" /><h3>{{ isGlobalSearch ? '搜索失败' : '暂时无法读取此目录' }}</h3><p>{{ isGlobalSearch ? '请稍后重试，或切换到当前目录筛选。' : '请检查网络，或返回根目录继续浏览。' }}</p><div><button type="button" class="resources-primary-btn" @click="isGlobalSearch ? submitSearch() : refreshDirectory()">重新尝试</button><button type="button" class="resources-action-btn" @click="navigateToPath('/')">返回根目录</button></div></div>
            <div v-else-if="globalSearchIdle" class="resources-state"><ClubIcon name="book" /><h3>搜索全部资源</h3><p>输入名称、版本或工具关键词，按回车搜索所有目录。</p></div>
            <div v-else-if="!filteredItems.length" class="resources-state"><ClubIcon name="folder" /><h3>{{ hasFilters ? '没有找到匹配的文件' : '这里还没有文件' }}</h3><p>{{ canLoadMore ? '可以继续加载目录，或切换到全部资源搜索。' : '请更换关键词或清除筛选。' }}</p><button v-if="hasFilters" type="button" class="resources-action-btn" @click="clearSearch(); selectedKind = 'all'">清除搜索与筛选</button></div>

            <table v-else-if="viewMode === 'list'" class="resources-table" aria-label="目录文件清单">
              <thead><tr>
                <th :aria-sort="sortBy === 'name' ? sortOrder === 'asc' ? 'ascending' : 'descending' : 'none'" scope="col"><button type="button" @click="changeSort('name')">名称 <span v-if="sortBy === 'name'" aria-hidden="true">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span></button></th>
                <th scope="col" class="resources-size-col" :aria-sort="sortBy === 'size' ? sortOrder === 'asc' ? 'ascending' : 'descending' : 'none'"><button type="button" @click="changeSort('size')">大小 <span v-if="sortBy === 'size'" aria-hidden="true">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span></button></th>
                <th scope="col" class="resources-date-col" :aria-sort="sortBy === 'modified' ? sortOrder === 'asc' ? 'ascending' : 'descending' : 'none'"><button type="button" @click="changeSort('modified')">修改日期 <span v-if="sortBy === 'modified'" aria-hidden="true">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span></button></th>
                <th scope="col" class="resources-actions-col"><span class="sr-only">操作</span></th>
              </tr></thead>
              <TransitionGroup name="resources-item" tag="tbody"><tr v-for="(item, index) in displayedItems" :key="item.path" class="resources-entry" :style="{ '--resource-order': Math.min(index, 7) }">
                <td><button type="button" class="resources-item-main" @click="openItem(item)"><span class="resources-item-icon" :data-kind="item.kind"><ResourceFileIcon :name="item.name" :is-dir="item.is_dir" :kind="item.kind" /></span><span class="resources-item-text"><span class="resources-item-title"><span class="resources-item-name">{{ item.name }}</span><span v-if="item.version" class="resources-version-pill">{{ item.version }}</span></span><span v-if="item.summary && !isGlobalSearch" class="resources-item-summary">{{ item.summary }}</span></span></button>
                  <button v-if="isGlobalSearch" type="button" class="resources-location" :aria-label="'打开所在目录 ' + parentResourcePath(item.path)" @click="navigateToPath(parentResourcePath(item.path))">所在目录：{{ parentResourcePath(item.path) }} ↗</button>
                </td>
                <td class="resources-size-col">{{ item.is_dir ? '—' : formatResourceSize(item.size) }}</td>
                <td class="resources-date-col"><time :datetime="item.modified || undefined">{{ fileDate(item.modified) }}</time></td>
                <td class="resources-actions-col"><button type="button" class="resources-row-action" :aria-label="(item.is_dir ? '进入 ' : '查看详情 ') + item.name" @click="openItem(item)"><span>{{ item.is_dir ? '进入' : '详情' }}</span><span aria-hidden="true">↗</span></button></td>
              </tr></TransitionGroup>
            </table>

            <TransitionGroup v-else name="resources-item" tag="div" class="resources-grid" role="list" aria-label="目录文件网格">
              <article v-for="(item, index) in displayedItems" :key="item.path" role="listitem" class="resources-card resources-entry" :style="{ '--resource-order': Math.min(index, 7) }">
                <button type="button" class="resources-card-main" @click="openItem(item)"><span class="resources-card-top"><span class="resources-item-icon" :data-kind="item.kind"><ResourceFileIcon :name="item.name" :is-dir="item.is_dir" :kind="item.kind" /></span><span class="resources-file-kind">{{ kindLabels[item.kind] }}</span></span><span class="resources-item-name">{{ item.name }}</span><span class="resources-item-summary">{{ item.summary || (item.is_dir ? '打开文件夹继续浏览' : '查看详情与下载') }}</span></button>
                <button v-if="isGlobalSearch" type="button" class="resources-location" @click="navigateToPath(parentResourcePath(item.path))">所在目录：{{ parentResourcePath(item.path) }} ↗</button>
                <div class="resources-card-meta"><span>{{ item.is_dir ? '文件夹' : formatResourceSize(item.size) }}</span><span>{{ item.version || fileDate(item.modified) }}</span></div>
              </article>
            </TransitionGroup>

            <footer v-if="!busy && !globalSearchIdle && !hasError" class="resources-list-footer">
              <span>{{ activeFolderCount }} 个文件夹 · {{ filteredItems.length - activeFolderCount }} 个文件<span v-if="loadedCount < totalCount"> · 已载入 {{ loadedCount }} / {{ totalCount }} 项</span></span>
              <nav v-if="totalViewPages > 1" class="resources-pagination" aria-label="文件分页导航">
                <button type="button" class="resources-action-btn" :disabled="currentViewPage <= 1" aria-label="上一页" @click="viewPage = currentViewPage - 1">上一页</button>
                <span class="resources-page-indicator" aria-current="page">第 {{ currentViewPage }} / {{ totalViewPages }} 页</span>
                <button type="button" class="resources-action-btn" :disabled="currentViewPage >= totalViewPages" aria-label="下一页" @click="viewPage = currentViewPage + 1">下一页</button>
              </nav>
              <button v-if="canLoadMore" type="button" class="resources-action-btn" :disabled="morePending" @click="loadMore">{{ morePending ? '加载中…' : moreError ? '加载失败，重试' : '加载更多' }}</button>
              <span v-else-if="!hasFilters && !isGlobalSearch">目录已展示完毕</span>
              <span v-if="moreExhausted || currentPage >= 100" role="status">此页已到加载上限，请缩小搜索范围或进入子目录。</span>
            </footer>
          </section>

          <div v-if="dirData.source === 'mock'" class="resources-demo-note"><span class="resources-status-dot is-mock" /><p>演示模式：示例文件仅供预览，不提供下载。</p></div>
          <section v-if="dirData.readme && !isGlobalSearch && !dirError" v-reveal class="resources-readme" aria-label="目录说明">
            <header><ClubIcon name="book" /><h2>目录说明</h2><span>README.md</span></header>
            <div class="resources-readme-body"><SafeMarkdown v-if="dirData.readmeBody" :nodes="dirData.readmeBody" inherit-typography /><p v-else class="resources-plain-readme">{{ dirData.readme }}</p></div>
          </section>
        </div>
      </div>
      <Transition name="resources-notice"><div v-if="toast && !activeItem" class="resources-toast" role="status"><ClubIcon name="check" />{{ toast }}</div></Transition>

      <dialog ref="drawer" class="resources-drawer" aria-labelledby="resource-detail-title" @cancel.prevent="closeDrawer" @close="onDrawerClosed" @click="event => { if (event.target === drawer) closeDrawer() }">
        <template v-if="displayItem">
          <Transition name="resources-notice"><div v-if="toast" class="resources-toast" role="status"><ClubIcon name="check" />{{ toast }}</div></Transition>
          <header class="resources-drawer-header"><p class="resources-detail-heading">文件详情</p><button type="button" autofocus class="resources-icon-btn" aria-label="关闭文件详情" @click="closeDrawer">×</button></header>
          <div class="resources-drawer-body">
            <span class="resources-item-icon resources-detail-icon" :data-kind="displayItem.kind"><ResourceFileIcon :name="displayItem.name" :is-dir="displayItem.is_dir" :kind="displayItem.kind" /></span>
            <h2 id="resource-detail-title">{{ displayItem.name }}</h2>
            <p v-if="activeItem?.summary" class="resources-detail-summary">{{ activeItem.summary }}</p>
            <div v-if="detailPending" class="resources-detail-state" role="status">正在获取文件信息…</div>
            <div v-else-if="detailError" class="resources-detail-state" role="alert"><p>文件信息加载失败，暂时无法获取下载链接。</p><button type="button" class="resources-primary-btn" @click="activeItem && openItem(activeItem)">重试</button></div>
            <div v-else class="resources-download-block">
              <p v-if="isDemoDetail" class="resources-demo-detail">这是演示文件，可查看示例信息；真实文件下载尚未开放。</p>
              <div v-if="canDownload" class="resources-download-actions"><a :href="downloadUrl" target="_blank" rel="noopener noreferrer" class="resources-primary-btn"><ClubIcon name="download" />下载文件</a><button type="button" class="resources-secondary-btn" @click="copyText(downloadUrl, '下载链接')"><ClubIcon name="copy" />复制链接</button></div>
              <p v-else-if="!isDemoDetail" role="status">此文件暂时没有可用的下载链接。</p>
              <label v-if="canDownload" class="resources-download-url">下载链接<input readonly :value="downloadUrl" aria-label="下载链接" @focus="($event.target as HTMLInputElement).select()"></label>
            </div>
            <dl class="resources-meta-list">
              <div><dt>文件类型</dt><dd>{{ kindLabels[displayItem.kind] }}</dd></div>
              <div><dt>文件大小</dt><dd>{{ formatResourceSize(displayItem.size) }}</dd></div>
              <div><dt>修改日期</dt><dd>{{ fileDate(displayItem.modified) }}</dd></div>
              <div><dt>所在目录</dt><dd><button type="button" @click="navigateToPath(parentResourcePath(displayItem.path)); closeDrawer()">{{ parentResourcePath(displayItem.path) }} ↗</button></dd></div>
              <div v-if="displayItem.sha256" class="resources-hash"><dt>SHA-256 <button type="button" @click="copyText(displayItem.sha256 || '', '校验值')">复制</button></dt><dd>{{ displayItem.sha256 }}</dd></div>
            </dl>
            <section v-if="activeDetail?.textPreview" class="resources-text-preview"><header><h3>文本预览</h3><button type="button" @click="copyText(activeDetail.textPreview || '', '预览文本')">复制文本</button></header><pre>{{ activeDetail.textPreview }}</pre></section>
            <details v-if="canDownload" class="resources-advanced"><summary>使用下载工具</summary><p>在支持 POSIX shell 的终端使用 aria2 下载。</p><pre>{{ aria2Command }}</pre><button type="button" class="resources-action-btn" @click="copyText(aria2Command, '下载命令')">复制命令</button></details>
          </div>
        </template>
      </dialog>
    </div>
  </div>
</template>
