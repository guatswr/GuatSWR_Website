<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { PublicEvent, PublicEventParticipant, PublicEventsPage } from '@guatswr/shared'
import EventCard from './EventCard.vue'
import ClubIcon from '~/components/ClubIcon.vue'
import ImageLightbox from '~/components/ImageLightbox.vue'
import EventModal from './EventModal.vue'
import {
  eventAcceptingParticipants,
  eventCategory,
  eventSupportsSignup,
} from '~/utils/event-center'
import { parsePageParam } from '~/utils/public-query'
import { eventSeoNode } from '#shared/seo'
import { useSchemaOrg } from '#schema-org/app'

const props = defineProps({
  type: { type: String, default: '' },
  title: { type: String, default: '全部活动' },
  enableSignup: { type: Boolean, default: false },
  allowCreateMode: { type: String, default: 'visitor' },
  admin: { type: Boolean, default: false },
})
const EventForm = defineAsyncComponent({
  loader: () => import('./EventForm.vue'),
  suspensible: false,
})
const EventSignup = defineAsyncComponent({
  loader: () => import('./EventSignup.vue'),
  suspensible: false,
})
const route = useRoute()
const page = computed(() => parsePageParam(route.query.page) ?? 1)
const now = useState('event-center-now', () => Date.now())
const boardEntered = ref(false)
let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  now.value = Date.now()
  clock = setInterval(() => {
    now.value = Date.now()
  }, 30_000)
  requestAnimationFrame(() => {
    boardEntered.value = true
  })
})
const { data, error, pending, refresh } = await useFetch<PublicEventsPage>('/api/event', {
  key: () => `event-board:${props.type}:${page.value}`,
  query: computed(() => ({
    ...(props.type ? { type: props.type } : {}),
    page: page.value,
    limit: 50,
  })),
  default: () => ({ total: 0, page: 1, limit: 50, items: [] }),
})
const items = computed(() => data.value.items)
const currentCategory = computed(() => eventCategory(props.type))
const filter = ref('all')
const activeCount = computed(
  () => items.value.filter(event => eventAcceptingParticipants(event, now.value)).length
)
const endedCount = computed(() => items.value.length - activeCount.value)
const filters = computed(() => [
  { value: 'all', label: '全部', count: items.value.length },
  { value: 'active', label: '进行中', count: activeCount.value },
  { value: 'ended', label: '已结束', count: endedCount.value },
])
const visibleItems = computed(() =>
  items.value
    .filter(
      event =>
        filter.value === 'all' ||
        eventAcceptingParticipants(event, now.value) === (filter.value === 'active')
    )
    .toSorted(
      (a, b) =>
        Number(eventAcceptingParticipants(b, now.value)) -
        Number(eventAcceptingParticipants(a, now.value))
    )
)
const pageCount = computed(() => Math.ceil(data.value.total / 50))
const pageLink = (value: number) => ({
  path: route.path,
  query: { ...route.query, page: value > 1 ? String(value) : undefined },
})
watch(page, () => {
  filter.value = 'all'
})
usePublicSeo({
  title: props.type ? props.title : '活动中心',
  description: '桂航绯想天的赛事、挑战与线下聚会。',
  path: route.path,
})
if (import.meta.server) {
  useSchemaOrg(items.value.map(event => eventSeoNode(event, route.path, useSiteConfig().url)))
}

const formOpen = ref(false)
const signupOpen = ref(false)
const previewOpen = ref(false)
const selected = ref<PublicEvent | null>(null)
const previewLoading = ref(false)
const previewError = ref('')
const previewItems = ref<PublicEventParticipant[]>([])
let previewVersion = 0

const lightboxOpen = ref(false)
const lightboxSrc = ref('')
const lightboxAlt = ref('')

const canCreate = computed(
  () => props.allowCreateMode === 'visitor' || (props.allowCreateMode === 'admin' && props.admin)
)
const formTypes = computed(() => (props.type ? [props.type] : ['悬赏令', '对赌协议']))
const signupDisabled = computed(
  () => !selected.value || !eventAcceptingParticipants(selected.value, now.value)
)
const supportsSignup = (event: PublicEvent) => props.enableSignup || eventSupportsSignup(event)

function openSignup(event: PublicEvent): void {
  selected.value = event
  signupOpen.value = true
}

function openImagePreview(payload: { src: string; alt: string }): void {
  lightboxSrc.value = payload.src
  lightboxAlt.value = payload.alt
  lightboxOpen.value = true
}

async function openPreview(event: PublicEvent): Promise<void> {
  selected.value = event
  previewOpen.value = true
  const version = ++previewVersion
  previewLoading.value = true
  previewError.value = ''
  previewItems.value = []
  try {
    const response = await $fetch<PublicEventParticipant[]>(
      `/api/event/${event.id}/participants/public`,
      { retry: 0 }
    )
    if (version !== previewVersion) return
    previewItems.value = Array.isArray(response) ? response : []
  } catch {
    if (version === previewVersion) previewError.value = '参赛名单读取失败，请重试'
  } finally {
    if (version === previewVersion) previewLoading.value = false
  }
}
onBeforeUnmount(() => {
  previewVersion += 1
  if (clock) clearInterval(clock)
})
</script>

<template>
  <section
    class="events-board"
    :class="{ 'is-board-entered': boardEntered }"
    aria-labelledby="events-board-title"
    :style="{
      '--board-color': currentCategory.color,
      '--board-dark-color': currentCategory.darkColor,
    }"
  >
    <header class="events-board-header">
      <div class="events-board-title">
        <span class="events-board-seal" aria-hidden="true">{{ currentCategory.seal }}</span>
        <h2 id="events-board-title">{{ title }}</h2>
        <span v-if="!pending && !error" class="events-total">共 {{ data.total }} 项</span>
      </div>

      <div class="events-board-controls">
        <div v-if="items.length && !error" class="events-filterbar">
          <div class="events-filters" aria-label="活动状态">
            <button
              v-for="(item, i) in filters"
              :key="item.value"
              type="button"
              :style="{ '--filter-index': i }"
              :aria-pressed="filter === item.value"
              @click="filter = item.value"
            >
              {{ item.label }}<span>{{ item.count }}</span>
            </button>
          </div>
          <span v-if="pageCount > 1" class="events-page-hint">第 {{ page }} / {{ pageCount }} 页</span>
        </div>

        <button v-if="canCreate" type="button" class="events-publish" @click="formOpen = true">
          <span aria-hidden="true">＋</span>发布活动
        </button>
      </div>
    </header>

    <div v-if="pending" class="events-loading" role="status" aria-label="正在加载活动">
      <span v-for="item in 2" :key="item" />
    </div>
    <div v-else-if="error" class="events-empty" role="alert">
      <div class="events-empty-symbol" aria-hidden="true"><ClubIcon name="calendar" /></div>
      <h3>活动暂时无法加载</h3>
      <button type="button" class="events-inline-link" @click="refresh()">
        重新加载 <span aria-hidden="true">↻</span>
      </button>
    </div>
    <template v-else>
      <div v-if="visibleItems.length" :key="`${props.type || 'all'}-${filter}-${page}`" class="events-grid">
        <EventCard
          v-for="(event, index) in visibleItems"
          :key="event.id"
          :event="event"
          :now="now"
          :style="{ '--card-index': Math.min(index, 10) }"
          @preview-image="openImagePreview"
        >
          <template #actions>
            <template v-if="supportsSignup(event)">
              <button type="button" class="events-inline-link" @click="openPreview(event)">
                参赛名单 <span aria-hidden="true">↗</span>
              </button>
              <button
                type="button"
                class="events-signup"
                :disabled="!eventAcceptingParticipants(event, now)"
                @click="openSignup(event)"
              >
                {{ eventAcceptingParticipants(event, now) ? '我要参加' : '报名已结束' }}
              </button>
            </template>
            <NuxtLink v-else-if="!type" :to="eventCategory(event.type).path" class="events-inline-link">
              查看{{ eventCategory(event.type).label }} <span aria-hidden="true">→</span>
            </NuxtLink>
          </template>
        </EventCard>
      </div>
      <div v-else class="events-empty">
        <div class="events-empty-symbol" aria-hidden="true"><ClubIcon name="calendar" /></div>
        <h3>
          {{
            filter === 'active'
              ? '暂无进行中的活动'
              : filter === 'ended'
                ? '暂无已结束的活动'
                : '暂无公开活动'
          }}
        </h3>
        <p class="events-empty-desc">
          {{
            filter === 'all'
              ? '当前分类尚未收录公开条目，不妨翻阅社团往期记录，或加入同好群获取最新情报。'
              : '可切换筛选条件查看其他状态的活动条目。'
          }}
        </p>
        <div class="events-empty-links">
          <button
            v-if="filter !== 'all'"
            type="button"
            class="events-inline-link"
            @click="filter = 'all'"
          >
            查看全部活动 <span aria-hidden="true">→</span>
          </button>
          <NuxtLink to="/activities" class="events-inline-link">
            往期回顾 <span aria-hidden="true">↗</span>
          </NuxtLink>
          <NuxtLink to="/join" class="events-inline-link">
            加入同好群 <span aria-hidden="true">↗</span>
          </NuxtLink>
        </div>
      </div>

      <nav v-if="pageCount > 1" class="events-pagination" aria-label="活动分页">
        <NuxtLink v-if="page > 1" :to="pageLink(page - 1)" class="events-inline-link">
          ← 上一页
        </NuxtLink>
        <span>{{ page }} / {{ pageCount }}</span>
        <NuxtLink v-if="page < pageCount" :to="pageLink(page + 1)" class="events-inline-link">
          下一页 →
        </NuxtLink>
      </nav>
    </template>

    <!-- 弹窗组件（表单/上传等交互依赖按需加载） -->
    <EventModal
      v-if="formOpen"
      title="发布新活动"
      max-width="45rem"
      @close="formOpen = false"
    >
      <EventForm
        :allowed-types="formTypes"
        :is-admin="admin && allowCreateMode === 'admin'"
        :submit-label="admin && allowCreateMode === 'admin' ? '发布活动' : '提交审核'"
        @submitted="
          () => {
            formOpen = false
            refresh()
          }
        "
      />
    </EventModal>

    <EventModal
      v-if="signupOpen && selected"
      title="活动报名"
      max-width="40rem"
      @close="signupOpen = false"
    >
      <EventSignup :event="selected" :disabled="signupDisabled" />
    </EventModal>

    <EventModal
      v-if="previewOpen && selected"
      title="参赛名单"
      max-width="40rem"
      @close="previewOpen = false"
    >
      <div
        v-if="previewLoading"
        class="py-6 text-center text-sm text-slate-500 dark:text-slate-400"
        role="status"
      >
        正在读取...
      </div>
      <div
        v-else-if="previewError"
        class="py-6 text-center text-sm text-rose-600 dark:text-rose-300"
        role="alert"
      >
        <p>{{ previewError }}</p>
        <button type="button" class="club-text-link mt-2 min-h-11" @click="openPreview(selected)">
          重新读取
        </button>
      </div>
      <div
        v-else-if="!previewItems.length"
        class="py-6 text-center text-sm text-slate-500 dark:text-slate-400"
      >
        暂无报名人员
      </div>
      <div
        v-else
        class="max-h-[60vh] space-y-3 overflow-y-auto pr-2 text-sm text-slate-700 dark:text-slate-200"
      >
        <div class="mb-2 flex items-center justify-between border-b border-slate-200/80 pb-2 dark:border-slate-800">
          <span
            class="inline-flex items-center border border-sky-200 bg-sky-50/80 px-2.5 py-0.5 text-xs font-bold text-sky-800 dark:border-sky-800/60 dark:bg-sky-950/50 dark:text-sky-200"
          >
            共 {{ previewItems.length }} 人
          </span>
        </div>
        <div class="grid gap-2.5">
          <div
            v-for="item in previewItems"
            :key="item.id"
            class="flex items-center gap-3.5 border border-slate-200/90 border-l-2 border-l-sky-600 bg-white/90 p-3 transition-colors hover:border-sky-300 dark:border-slate-800 dark:border-l-sky-400 dark:bg-slate-900/70 dark:hover:border-sky-700"
          >
            <div class="relative shrink-0">
              <img
                v-if="item.avatar"
                :src="item.avatar"
                alt=""
                class="h-10 w-10 rounded-full border border-slate-200 object-cover dark:border-slate-700"
              >
              <div
                v-else
                class="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xs font-serif text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
              >
                无
              </div>
            </div>
            <div class="min-w-0 flex-1">
              <div class="truncate font-serif font-semibold text-slate-900 dark:text-slate-100">
                {{ item.common_id || '用户' }}
              </div>
              <div class="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                QQ：{{ item.qq || '未公开' }}
              </div>
            </div>
            <div class="space-y-0.5 text-right text-xs">
              <div
                class="inline-block border border-sky-200/80 bg-sky-50/70 px-2 py-0.5 font-medium text-sky-800 dark:border-sky-800/60 dark:bg-sky-950/50 dark:text-sky-200"
              >
                {{ item.pilot_source || '未知来源' }}
              </div>
              <div class="text-slate-500 dark:text-slate-400">
                {{ item.machine_sign || '-' }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </EventModal>

    <ImageLightbox
      :open="lightboxOpen"
      :src="lightboxSrc"
      :alt="lightboxAlt"
      @update:open="lightboxOpen = $event"
    />
  </section>
</template>
