<script setup>
import { computed } from 'vue'
import ClubIcon from '../ClubIcon.vue'
import {
  eventContent,
  eventRoutes,
  eventSummary,
  eventTime,
  formatClubDate
} from '../../utils/community'
const props = defineProps({ event: { type: Object, required: true } })
const content = computed(() => eventContent(props.event))
</script>

<template>
  <RouterLink
    :to="eventRoutes[event.type] || '/events'"
    class="club-event-card group flex h-full flex-col border-t border-slate-300 py-6 dark:border-slate-700"
  >
    <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
      <span class="font-medium text-sky-700 dark:text-sky-300">{{
        event.type
      }}</span
      ><span
        class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400"
        ><span class="h-1.5 w-1.5 rounded-full bg-emerald-500" />{{
          event.status === 'ongoing' ? '进行中' : '已发布'
        }}</span
      >
    </div>
    <h3
      class="mt-5 text-xl font-semibold leading-7 text-slate-800 group-hover:text-sky-700 dark:text-slate-100 dark:group-hover:text-sky-300"
    >
      {{ event.title || '同好活动' }}
    </h3>
    <p
      class="mt-3 line-clamp-2 text-sm leading-7 text-slate-500 dark:text-slate-400"
    >
      {{ eventSummary(event) }}
    </p>
    <div
      class="mb-5 mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400"
    >
      <span class="flex items-center gap-1.5"
        ><ClubIcon name="calendar" class="h-4 w-4" />{{
          formatClubDate(eventTime(event))
        }}</span
      ><span v-if="content.location" class="max-w-full truncate">{{
        content.location
      }}</span>
    </div>
    <div
      class="mt-auto flex items-center justify-between border-t border-slate-100 pt-4 text-sm font-medium text-sky-700 dark:border-slate-800 dark:text-sky-300"
    >
      查看活动与参与方式
      <ClubIcon
        name="arrow"
        class="h-4 w-4 transition-transform motion-safe:group-hover:translate-x-1"
      />
    </div>
  </RouterLink>
</template>
