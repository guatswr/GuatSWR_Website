<script setup lang="ts">
import { computed } from 'vue'
import type { PublicEvent } from '@guatswr/shared'
import {
  eventCountdown,
  eventCoverThumb,
  eventCoverUrl,
  eventDeadlineText,
  eventDeadlineValue,
  eventStatusText,
  eventTopResults
} from '~/utils/event-display'

const props = defineProps({
  event: { type: Object as () => PublicEvent, required: true },
  compact: { type: Boolean, default: false },
  clickable: { type: Boolean, default: false }
})
const emit = defineEmits<{ preview: [] }>()

const handleClick = (): void => {
  if (props.clickable) emit('preview')
}

const content = computed(() => props.event.content)
const type = computed(() => props.event.type || 'general')
const statusLabel = computed(() => eventStatusText(props.event))
const coverUrl = computed(() => eventCoverUrl(content.value))
const coverThumb = computed(() => eventCoverThumb(content.value))
const deadlineText = computed(() => eventDeadlineText(eventDeadlineValue(content.value)))
const countdown = computed(() => eventCountdown(eventDeadlineValue(content.value)))
const topResults = computed(() => eventTopResults(content.value))
</script>

<template>
  <article
    class="group relative w-full min-w-0 border-t border-slate-300 dark:border-slate-700"
    :class="clickable ? 'cursor-pointer' : ''"
    @click="handleClick"
  >
    <div class="relative space-y-4 py-6">
      <header class="flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span
              class="px-2 py-0.5 rounded text-[11px] font-bold tracking-wider bg-sky-50 text-sky-600 border border-sky-100 dark:bg-sky-900/40 dark:text-sky-200 dark:border-sky-800"
            >
              {{ type }}
            </span>
            <span
              class="text-[11px] text-slate-400 font-medium flex items-center gap-1 dark:text-slate-500"
            >
              <span
                class="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600"
              />
              {{ statusLabel }}
            </span>
          </div>
          <div
            v-if="countdown"
            class="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-pink-500 bg-pink-50 border border-pink-100 shadow-sm dark:bg-rose-950/40 dark:border-rose-900/60"
          >
            <span class="animate-pulse">剩余：</span> {{ countdown }}
          </div>
        </div>

        <h3
          class="text-lg font-bold text-slate-800 leading-snug break-words group-hover:text-sky-600 transition-colors dark:text-slate-100 dark:group-hover:text-sky-300"
        >
          {{ event.title || '未命名活动' }}
        </h3>
      </header>

      <div
        v-if="coverUrl"
        class="relative rounded-xl overflow-hidden shadow-sm group-hover:shadow-md transition-shadow"
      >
        <div
          class="absolute inset-0 bg-sky-900/0 group-hover:bg-sky-900/5 transition-colors z-10"
        />
        <img
          :src="coverThumb"
          alt="cover"
          class="w-full h-40 object-cover transform group-hover:scale-105 transition-transform duration-700"
        />
      </div>

      <div
        class="grid gap-2 text-sm text-slate-600 leading-relaxed dark:text-slate-300"
      >
        <div v-if="deadlineText" class="flex items-start gap-2">
          <span
            class="text-xs text-sky-500 font-bold shrink-0 mt-0.5 dark:text-sky-300"
            >时间</span
          >
          <span class="font-medium text-slate-700 dark:text-slate-200">{{
            deadlineText
          }}</span>
        </div>

        <!-- 悬赏令 -->
        <template v-if="type === '悬赏令'">
          <div class="flex items-center gap-2">
            <span
              class="text-xs text-sky-500 font-bold shrink-0 dark:text-sky-300"
              >发起</span
            >
            <div
              class="flex items-center gap-1.5 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100 dark:bg-slate-800 dark:border-slate-700"
            >
              <img
                v-if="content.initiator?.avatar"
                :src="content.initiator.avatar"
                class="w-4 h-4 rounded-full object-cover"
              />
              <span
                class="text-xs font-medium text-slate-700 dark:text-slate-200"
                >{{ content.initiator?.id || '匿名' }}</span
              >
            </div>
          </div>
          <div class="flex gap-2">
            <span
              class="text-xs text-sky-500 font-bold shrink-0 mt-0.5 dark:text-sky-300"
              >挑战</span
            >
            <span class="line-clamp-2">{{
              content.challenge || '未填写'
            }}</span>
          </div>
          <div class="flex gap-2">
            <span
              class="text-xs text-sky-500 font-bold shrink-0 mt-0.5 dark:text-sky-300"
              >要求</span
            >
            <span class="line-clamp-2">{{
              content.requirements || '未填写'
            }}</span>
          </div>
          <div
            class="mt-1 flex items-center gap-2 bg-amber-50 px-3 py-2 rounded-lg border border-amber-100 border-dashed dark:bg-amber-950/30 dark:border-amber-900/50"
          >
            <span class="text-amber-500 text-xs font-bold dark:text-amber-300"
              >REWARD</span
            >
            <span class="font-bold text-amber-600 dark:text-amber-200">{{
              content.reward || '待定'
            }}</span>
          </div>
          <div
            v-if="content.completion?.id"
            class="flex items-center gap-2 mt-1 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900/50 dark:text-emerald-200"
          >
            <span class="text-xs font-bold">✅ 已验收</span>
            <div class="flex items-center gap-1">
              <img
                v-if="content.completion?.avatar"
                :src="content.completion.avatar"
                class="w-4 h-4 rounded-full object-cover"
              />
              <span class="text-xs font-medium">{{
                content.completion.id
              }}</span>
            </div>
          </div>
        </template>

        <!-- 对赌协议 -->
        <template v-else-if="type === '对赌协议'">
          <div
            class="bg-slate-50 rounded-lg p-2 border border-slate-100 space-y-2 dark:bg-slate-800 dark:border-slate-700"
          >
            <div class="flex items-center justify-between text-xs">
              <div class="flex items-center gap-1">
                <img
                  v-if="content.a?.avatar"
                  :src="content.a.avatar"
                  class="w-5 h-5 rounded-full ring-1 ring-slate-200 dark:ring-slate-700"
                />
                <span class="font-bold text-slate-700 dark:text-slate-200">{{
                  content.a?.id || 'A'
                }}</span>
              </div>
              <span class="text-sky-400 font-black italic text-sm">VS</span>
              <div class="flex items-center gap-1">
                <span class="font-bold text-slate-700 dark:text-slate-200">{{
                  content.b?.id || 'B'
                }}</span>
                <img
                  v-if="content.b?.avatar"
                  :src="content.b.avatar"
                  class="w-5 h-5 rounded-full ring-1 ring-slate-200 dark:ring-slate-700"
                />
              </div>
            </div>
            <div
              class="text-xs text-slate-600 border-t border-slate-200 pt-2 mt-1 flex gap-1 dark:text-slate-300 dark:border-slate-700"
            >
              <span class="text-sky-500 font-bold shrink-0 dark:text-sky-300"
                >目标:</span
              >
              <span
                >{{ content.a?.goal || '?' }} /
                {{ content.b?.goal || '?' }}</span
              >
            </div>
          </div>
          <div class="flex gap-2">
            <span
              class="text-xs text-sky-500 font-bold shrink-0 mt-0.5 dark:text-sky-300"
              >惩罚</span
            >
            <span class="text-rose-500 font-medium dark:text-rose-300">{{
              content.penalty || '未填写'
            }}</span>
          </div>
          <div
            v-if="content.result"
            class="font-medium text-emerald-600 dark:text-emerald-300"
          >
            结果：{{ content.result }}
          </div>
        </template>

        <!-- STG / 则则 -->
        <template v-else-if="type === 'STG' || type === '则则'">
          <div
            class="text-slate-600 line-clamp-3 text-xs leading-5 bg-slate-50 p-2 rounded border border-slate-100/50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
          >
            {{ content.copy || '暂无活动文案' }}
          </div>
          <div class="flex gap-2">
            <span
              class="text-xs text-sky-500 font-bold shrink-0 mt-0.5 dark:text-sky-300"
              >规则</span
            >
            <span class="line-clamp-1">{{ content.rules || '未填写' }}</span>
          </div>
          <div class="flex gap-2">
            <span
              class="text-xs text-sky-500 font-bold shrink-0 mt-0.5 dark:text-sky-300"
              >奖品</span
            >
            <span
              class="line-clamp-1 text-amber-600 font-medium dark:text-amber-200"
              >{{ content.prizes || '未填写' }}</span
            >
          </div>
          <div v-if="topResults.length" class="mt-2 space-y-1">
            <div
              class="text-[10px] text-sky-400 uppercase tracking-wider font-bold dark:text-sky-300"
            >
              Top Rankers
            </div>
            <div class="flex flex-wrap gap-1">
              <div
                v-for="row in topResults"
                :key="String(row.rank)"
                class="flex items-center gap-1 bg-sky-50 text-sky-700 px-2 py-0.5 rounded-full border border-sky-100 text-xs dark:bg-sky-900/40 dark:text-sky-200 dark:border-sky-800"
              >
                <span class="font-bold text-[10px] opacity-70"
                  >#{{ row.rank }}</span
                >
                <img
                  v-if="row.avatar"
                  :src="row.avatar"
                  class="w-3 h-3 rounded-full"
                />
                <span class="truncate max-w-[60px] font-medium">{{
                  row.id || row.player_id
                }}</span>
              </div>
            </div>
          </div>
        </template>

        <!-- 线下聚会 -->
        <template v-else-if="type === '线下聚会'">
          <div class="flex items-center gap-2">
            <span class="text-xs text-sky-500 font-bold dark:text-sky-300"
              >地点</span
            >
            <span
              class="font-medium text-slate-700 bg-orange-50 px-2 py-0.5 rounded text-orange-700 dark:bg-orange-950/30 dark:text-orange-200"
              >{{ content.location || '待定' }}</span
            >
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-sky-500 font-bold dark:text-sky-300"
              >类型</span
            >
            <span>{{ content.gather_type || '未填写' }}</span>
          </div>
        </template>
      </div>

      <div v-if="$slots.actions" class="pt-1">
        <slot name="actions" />
      </div>
    </div>
  </article>
</template>
