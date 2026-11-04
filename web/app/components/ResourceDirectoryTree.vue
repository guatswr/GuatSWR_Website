<script setup lang="ts">
import type { ResourceDirectoryResponse, ResourceItem } from '#shared/resources'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ClubIcon from '~/components/ClubIcon.vue'
import { mergeResourcePages, sortResources } from '~/utils/resource-browser'

const props = defineProps<{
  path: string
  name: string
  currentPath: string
  directory?: ResourceDirectoryResponse
}>()
const emit = defineEmits<{ navigate: [path: string] }>()
const onCurrentBranch = () => props.path === '/' || props.currentPath === props.path || props.currentPath.startsWith(props.path + '/')
const expanded = ref(onCurrentBranch())
const entries = ref<ResourceItem[]>([])
const loaded = ref(false)
const pending = ref(false)
const failed = ref(false)
const total = ref(0)
const page = ref(1)
const exhausted = ref(false)
const folders = computed(() => sortResources(entries.value.filter(item => item.is_dir), 'name', 'asc'))
const hasMore = computed(() => entries.value.length < total.value && !exhausted.value && page.value < 100)
const canExpand = computed(() => !loaded.value || folders.value.length > 0 || hasMore.value)
let controller: AbortController | undefined
let version = 0

// Reuse the page's already-fetched directory, including during direct deep links.
watch(() => props.directory, (directory) => {
  if (!directory || directory.path !== props.path) return
  version++
  controller?.abort()
  entries.value = [...directory.items]
  total.value = directory.total
  loaded.value = true
  pending.value = false
  failed.value = false
  page.value = 1
  exhausted.value = false
}, { immediate: true })

async function load(nextPage = 1) {
  if (pending.value) return
  const requestVersion = ++version
  controller = new AbortController()
  pending.value = true
  failed.value = false
  try {
    const directory = await $fetch<ResourceDirectoryResponse>('/api/resources/list', {
      query: { path: props.path, page: nextPage }, signal: controller.signal,
    })
    if (requestVersion !== version) return
    const merged = nextPage === 1 ? [...directory.items] : mergeResourcePages(entries.value, directory.items)
    exhausted.value = nextPage > 1 && merged.length === entries.value.length
    entries.value = merged
    total.value = directory.total
    page.value = nextPage
    loaded.value = true
  } catch {
    if (requestVersion === version) failed.value = true
  } finally {
    if (requestVersion === version) pending.value = false
  }
}
function toggle() {
  expanded.value = !expanded.value
  if (expanded.value && !loaded.value) void load()
}
watch(() => props.currentPath, () => {
  if (onCurrentBranch()) {
    expanded.value = true
    if (!loaded.value) void load()
  }
})
onMounted(() => { if (expanded.value && !loaded.value) void load() })
onBeforeUnmount(() => { version++; controller?.abort() })
</script>

<template>
  <li class="resources-tree-node">
    <div class="resources-tree-row" :class="{ 'is-current': currentPath === path }">
      <button v-if="canExpand" type="button" class="resources-tree-disclosure" :aria-expanded="expanded" :aria-label="(expanded ? '收起 ' : '展开 ') + name" @click="toggle">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 4 4 4-4 4" /></svg>
      </button>
      <span v-else class="resources-tree-spacer" />
      <button type="button" class="resources-tree-link" :aria-current="currentPath === path ? 'page' : undefined" :title="path" @click="emit('navigate', path)">
        <ClubIcon name="folder" /><span>{{ name }}</span>
      </button>
    </div>
    <Transition name="resources-branch">
      <div v-if="loaded || expanded" v-show="expanded && (canExpand || failed)" class="resources-tree-branch">
        <ul class="resources-tree-children">
      <ResourceDirectoryTree v-for="folder in folders" :key="folder.path" :path="folder.path" :name="folder.name" :current-path="currentPath" :directory="directory" @navigate="emit('navigate', $event)" />
      <li v-if="pending || (!loaded && !failed)" class="resources-tree-status" role="status">加载中…</li>
      <li v-else-if="failed" class="resources-tree-status"><button type="button" @click="load(loaded ? page + 1 : 1)">加载失败，重试</button></li>
      <li v-else-if="hasMore" class="resources-tree-status"><button type="button" @click="load(page + 1)">加载更多目录</button></li>
        </ul>
      </div>
    </Transition>
  </li>
</template>
