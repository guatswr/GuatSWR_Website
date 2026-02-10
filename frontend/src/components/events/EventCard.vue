<script setup>
import { computed } from 'vue'
import { getThumbUrl } from '../../utils/image'

const props = defineProps({
  event: {
    type: Object,
    required: true
  },
  compact: {
    type: Boolean,
    default: false
  },
  clickable: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['preview'])

const handleClick = () => {
  if (props.clickable) emit('preview')
}

const content = computed(() => props.event?.content || {})
const type = computed(() => props.event?.type || 'general')
const status = computed(() => props.event?.status || 'draft')

const statusLabel = computed(() => {
  const map = {
    draft: '草稿',
    pending: '待审核',
    published: '已发布',
    ongoing: '进行中',
    ended: '已结束',
    settled: '已验收',
    rejected: '已驳回'
  }
  if (type.value === 'match' || type.value === 'stg') {
    if (status.value === 'published') return '报名中'
  }
  if (type.value === 'gathering' && status.value === 'published') return '倒计时'
  return map[status.value] || status.value
})

const coverUrl = computed(() => {
  const direct = content.value.cover || content.value.cover_image || content.value.image || content.value.proof_image
  return direct || ''
})

const deadlineValue = computed(() => content.value.deadline || content.value.time || content.value.end_time)

const deadlineText = computed(() => {
  if (!deadlineValue.value) return ''
  const date = new Date(deadlineValue.value)
  if (Number.isNaN(date.getTime())) return String(deadlineValue.value)
  return date.toLocaleString()
})

const countdown = computed(() => {
  if (!deadlineValue.value) return ''
  const date = new Date(deadlineValue.value)
  if (Number.isNaN(date.getTime())) return ''
  const diff = date.getTime() - Date.now()
  if (diff <= 0) return '已截止'
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(hours / 24)
  const remainHours = hours % 24
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  if (days > 0) return `${days}天 ${remainHours}小时`
  if (hours > 0) return `${hours}小时 ${minutes}分钟`
  return `${minutes}分钟`
})

const topResults = computed(() => {
  const list = Array.isArray(content.value.results) ? content.value.results : []
  return list.slice(0, 3)
})
</script>

<template>
  <article
    class="relative overflow-hidden rounded-2xl border border-gray-200/80 dark:border-white/10 bg-white dark:bg-[#202225] shadow-sm w-full max-w-[420px] justify-self-center"
    :class="clickable ? 'cursor-pointer hover:ring-2 hover:ring-emerald-300/40' : ''"
    @click="handleClick"
  >
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,116,144,0.08),transparent_55%)]" />
    <div class="relative p-6 space-y-4">
      <header class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-300">
            <span>{{ type }}</span>
            <span class="h-1 w-1 rounded-full bg-slate-300"></span>
            <span>{{ statusLabel }}</span>
          </div>
          <h3 class="text-xl font-semibold text-slate-900 dark:text-white mt-2">
            {{ event.title || '未命名活动' }}
          </h3>
        </div>
        <div v-if="countdown" class="px-3 py-1 rounded-full text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-900/30 dark:text-rose-200">
          {{ countdown }}
        </div>
      </header>

      <div v-if="coverUrl" class="relative rounded-xl overflow-hidden border border-gray-100 dark:border-white/5">
        <img :src="getThumbUrl(coverUrl)" alt="cover" class="w-full h-44 object-cover" />
      </div>

      <div class="grid gap-3 text-sm text-slate-600 dark:text-slate-200">
        <div v-if="deadlineText" class="flex items-center gap-2">
          <span class="text-xs text-slate-400">时间</span>
          <span>{{ deadlineText }}</span>
        </div>

        <template v-if="type === 'bounty'">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs text-slate-400">发起人</span>
            <div class="flex items-center gap-2">
              <img v-if="content.initiator?.avatar" :src="content.initiator.avatar" class="w-6 h-6 rounded-full object-cover" />
              <span>{{ content.initiator?.id || '匿名' }}</span>
            </div>
          </div>
          <div><span class="text-xs text-slate-400">挑战形式</span> {{ content.challenge || '未填写' }}</div>
          <div><span class="text-xs text-slate-400">要求</span> {{ content.requirements || '未填写' }}</div>
          <div class="font-semibold text-amber-600 dark:text-amber-300">奖励：{{ content.reward || '待定' }}</div>
          <div v-if="content.completion?.id" class="flex items-center gap-2 text-emerald-600 dark:text-emerald-300">
            <span>已验收</span>
            <img v-if="content.completion?.avatar" :src="content.completion.avatar" class="w-5 h-5 rounded-full object-cover" />
            <span>{{ content.completion.id }}</span>
          </div>
        </template>

        <template v-else-if="type === 'bet'">
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-2">
              <img v-if="content.a?.avatar" :src="content.a.avatar" class="w-6 h-6 rounded-full object-cover" />
              <span>{{ content.a?.id || '发起者' }}</span>
              <span class="text-xs text-slate-400">目标</span>
              <span>{{ content.a?.goal || '未填写' }}</span>
            </div>
            <div v-if="content.b?.id" class="flex items-center gap-2">
              <img v-if="content.b?.avatar" :src="content.b.avatar" class="w-6 h-6 rounded-full object-cover" />
              <span>{{ content.b?.id }}</span>
              <span class="text-xs text-slate-400">目标</span>
              <span>{{ content.b?.goal || '未填写' }}</span>
            </div>
          </div>
          <div><span class="text-xs text-slate-400">惩罚</span> {{ content.penalty || '未填写' }}</div>
          <div v-if="content.result" class="font-semibold text-emerald-600 dark:text-emerald-300">结果：{{ content.result }}</div>
        </template>

        <template v-else-if="type === 'match' || type === 'stg'">
          <div>{{ content.copy || '暂无活动文案' }}</div>
          <div><span class="text-xs text-slate-400">规则</span> {{ content.rules || '未填写' }}</div>
          <div><span class="text-xs text-slate-400">奖品</span> {{ content.prizes || '未填写' }}</div>
          <div v-if="topResults.length" class="flex items-center gap-2">
            <span class="text-xs text-slate-400">前三名</span>
            <div class="flex items-center gap-2">
              <div v-for="row in topResults" :key="row.rank" class="flex items-center gap-2 bg-slate-50 dark:bg-white/5 px-2 py-1 rounded-full">
                <img v-if="row.avatar" :src="row.avatar" class="w-5 h-5 rounded-full object-cover" />
                <span>#{{ row.rank || '?' }} {{ row.id || row.player_id || '匿名' }}</span>
              </div>
            </div>
          </div>
        </template>

        <template v-else-if="type === 'gathering'">
          <div><span class="text-xs text-slate-400">地点</span> {{ content.location || '待定' }}</div>
          <div><span class="text-xs text-slate-400">类型</span> {{ content.gather_type || '未填写' }}</div>
        </template>
      </div>

      <div v-if="$slots.actions" class="pt-2">
        <slot name="actions" />
      </div>
    </div>
  </article>
</template>
