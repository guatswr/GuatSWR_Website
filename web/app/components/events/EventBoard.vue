<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, ref } from 'vue'
import type { PublicEvent, PublicEventParticipant, PublicEventsPage } from '@guatswr/shared'
import EventCard from './EventCard.vue'
import EventModal from './EventModal.vue'

/**
 * Public event board. Titles, copy, statuses and the card layout are the archived
 * ones; the three dialogs are native and the interactive forms load on intent, so
 * the public route never imports form/upload code eagerly.
 */
const props = defineProps({
  type: { type: String, required: true },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  enableSignup: { type: Boolean, default: false },
  allowCreateMode: { type: String, default: 'visitor' },
  /**
   * UI hint only, supplied by the future admin route from its BFF session. The
   * backend stays the authority for publishing.
   */
  admin: { type: Boolean, default: false }
})

const EventForm = defineAsyncComponent({
  loader: () => import('./EventForm.vue'),
  suspensible: false
})
const EventSignup = defineAsyncComponent({
  loader: () => import('./EventSignup.vue'),
  suspensible: false
})

const { data, error, pending, refresh } = await useFetch<PublicEventsPage>('/api/event', {
  key: `event-board:${props.type}`,
  query: { type: props.type, limit: 50 },
  default: () => ({ total: 0, page: 1, limit: 50, items: [] })
})
const items = computed<PublicEvent[]>(() => data.value.items)

const formOpen = ref(false)
const signupOpen = ref(false)
const previewOpen = ref(false)
const selected = ref<PublicEvent | null>(null)
const previewLoading = ref(false)
const previewError = ref('')
const previewItems = ref<PublicEventParticipant[]>([])
let previewVersion = 0

const canCreate = computed(
  () =>
    props.allowCreateMode === 'visitor' ||
    (props.allowCreateMode === 'admin' && props.admin)
)
const formTypes = computed(() => [props.type])
const signupDisabled = computed(
  () => !selected.value || !['published', 'ongoing'].includes(selected.value.status)
)

function openSignup(event: PublicEvent): void {
  selected.value = event
  signupOpen.value = true
}

async function openPreview(event: PublicEvent): Promise<void> {
  selected.value = event
  previewOpen.value = true
  const version = ++previewVersion
  previewLoading.value = true
  previewError.value = ''
  previewItems.value = []
  try {
    // `retry: 0` — ofetch (Nuxt's `$fetch`) retries a failed GET once by default,
    // and with the default `retryDelay` of 0 that retry is immediate. The archived
    // page used axios and surfaced the first failure so the visitor could retry by
    // hand; a transparent retry hides it and drops the archived error state.
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
})
</script>

<template>
  <div class="space-y-8 relative">
    <!-- 顶部横幅：琪露诺(Cirno) 冰雪主题风格 -->
    <header class="border-b border-slate-200 pb-8 dark:border-slate-800">
      <p class="club-eyebrow">LET'S MEET</p>
      <!--
        `md:leading-10` reproduces the archived cascade: Tailwind 3 emitted
        `md:text-4xl{font-size:2.25rem;line-height:2.5rem}` after `.leading-relaxed`
        so the variant's own line-height won from `md` up. Tailwind 4 routes the
        line height through `--tw-leading`, which `leading-relaxed` sets, so
        `leading-relaxed` would otherwise win at every breakpoint (1.625 x 2.25rem
        = 58.5px instead of 40px) and shift the whole board.
      -->
      <h1 class="mt-4 font-serif text-3xl font-semibold leading-relaxed md:text-4xl md:leading-10">
        {{ title }}
      </h1>
      <p class="mt-4 max-w-2xl text-sm leading-8 text-slate-500 dark:text-slate-400">
        {{ subtitle }}
      </p>
    </header>

    <!-- 加载状态 -->
    <div v-if="pending" class="flex justify-center py-12">
      <div
        class="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500 dark:border-sky-400"
        role="status"
        aria-label="正在加载活动"
      />
    </div>

    <div v-else-if="error" class="club-empty" role="alert">
      <p>活动列表暂时没有加载出来。</p>
      <button type="button" class="club-text-link mt-3 min-h-11" @click="refresh()">
        重新加载
      </button>
    </div>

    <!-- 内容列表 -->
    <div
      v-else
      class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),1fr))] gap-6 items-start relative z-0"
    >
      <EventCard
        v-for="event in items"
        :key="event.id"
        :event="event"
        :clickable="enableSignup"
        class="group border-t border-slate-300 dark:border-slate-700"
        @preview="openPreview(event)"
      >
        <template v-if="enableSignup" #actions>
          <div
            class="flex flex-wrap gap-2 items-center justify-between w-full mt-3 pt-3 border-t border-slate-50 dark:border-slate-800"
          >
            <span class="text-xs text-slate-500 dark:text-slate-400">活动参与</span>
            <button
              class="relative px-5 py-1.5 rounded-full text-sm font-medium transition-all duration-300"
              :class="
                ['published', 'ongoing'].includes(event.status)
                  ? 'bg-sky-50 text-sky-600 hover:bg-sky-500 hover:text-white dark:bg-sky-900/40 dark:text-sky-200 dark:hover:bg-sky-600'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500'
              "
              :disabled="!['published', 'ongoing'].includes(event.status)"
              @click.stop="openSignup(event)"
            >
              <span>{{
                ['published', 'ongoing'].includes(event.status) ? '我要参加' : '已结束'
              }}</span>
            </button>
          </div>
        </template>
      </EventCard>

      <div v-if="!items.length" class="col-span-full py-12 text-center">
        <div class="text-sky-200 text-4xl mb-2 dark:text-sky-400">❄</div>
        <p class="text-slate-400 text-sm dark:text-slate-500">
          这里冷冷清清的，什么都没有发生呢...
        </p>
      </div>
    </div>

    <!-- 弹窗组件（表单/上传等交互依赖按需加载） -->
    <EventModal
      v-if="formOpen"
      title="发布新活动"
      max-width="720px"
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
      max-width="640px"
      @close="signupOpen = false"
    >
      <EventSignup :event="selected" :disabled="signupDisabled" />
    </EventModal>

    <EventModal
      v-if="previewOpen && selected"
      title="参赛名单"
      max-width="640px"
      @close="previewOpen = false"
    >
      <div v-if="previewLoading" class="text-sm text-slate-400 text-center py-4 dark:text-slate-500" role="status">
        正在读取...
      </div>
      <div v-else-if="previewError" class="py-4 text-center text-sm text-rose-600 dark:text-rose-300" role="alert">
        <p>{{ previewError }}</p>
        <button type="button" class="club-text-link mt-2 min-h-11" @click="openPreview(selected)">
          重新读取
        </button>
      </div>
      <div
        v-else-if="!previewItems.length"
        class="text-sm text-slate-400 text-center py-4 dark:text-slate-500"
      >
        暂无报名人员
      </div>
      <div
        v-else
        class="space-y-3 text-sm text-slate-700 max-h-[60vh] overflow-y-auto pr-2 dark:text-slate-200"
      >
        <div class="flex items-center justify-between px-1 mb-2">
          <span
            class="text-xs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded dark:bg-sky-900/40 dark:text-sky-200"
            >Total: {{ previewItems.length }}</span
          >
        </div>
        <div class="grid gap-3">
          <div
            v-for="item in previewItems"
            :key="item.id"
            class="flex items-center gap-3 rounded-lg border border-slate-100 bg-white p-3 hover:border-sky-200 transition-colors dark:bg-slate-900/60 dark:border-slate-800 dark:hover:border-sky-700"
          >
            <div class="relative">
              <img
                v-if="item.avatar"
                :src="item.avatar"
                alt=""
                class="w-10 h-10 rounded-full object-cover border border-slate-100 dark:border-slate-800"
              />
              <div
                v-else
                class="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 text-xs dark:bg-slate-800 dark:text-slate-500"
              >
                无
              </div>
            </div>
            <div class="flex-1 min-w-0">
              <div class="font-semibold truncate text-slate-700 dark:text-slate-100">
                {{ item.common_id || '用户' }}
              </div>
              <div class="text-xs text-slate-400 dark:text-slate-500">
                QQ: {{ item.qq || '未公开' }}
              </div>
            </div>
            <div class="text-xs text-right space-y-0.5">
              <div
                class="text-sky-600 bg-sky-50 px-2 py-0.5 rounded inline-block dark:bg-sky-900/40 dark:text-sky-200"
              >
                {{ item.pilot_source || '未知来源' }}
              </div>
              <div class="text-slate-400 dark:text-slate-500">
                {{ item.machine_sign || '-' }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </EventModal>

    <!-- 悬浮发布按钮 -->
    <div v-if="canCreate" class="sticky bottom-8 z-40 flex justify-end">
      <button
        type="button"
        class="mr-8 flex items-center gap-2 px-6 py-3 rounded-full shadow-lg shadow-sky-500/20 transition-all duration-300 bg-gradient-to-r from-sky-400 to-blue-500 text-white hover:brightness-105 hover:-translate-y-0.5 active:scale-95 dark:from-sky-600 dark:to-blue-700 dark:shadow-sky-900/40"
        @click="formOpen = true"
      >
        <span class="text-xl leading-none font-light" aria-hidden="true">＋</span>
        <span class="font-medium text-sm">发布活动</span>
      </button>
    </div>
  </div>
</template>
