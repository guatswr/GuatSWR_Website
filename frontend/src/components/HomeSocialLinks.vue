<script setup>
import { vReveal } from '../directives/motion'
import ClubIcon from './ClubIcon.vue'
defineProps({ links: { type: Array, default: () => [] } })
</script>

<template>
  <div class="grid gap-x-8 sm:grid-cols-2">
    <a
      v-for="(link, index) in links"
      :key="link.url"
      v-reveal="index * 60"
      :href="link.url"
      target="_blank"
      rel="noopener noreferrer"
      class="group grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)_1rem] items-start gap-4 border-t border-slate-200 py-6 dark:border-slate-700"
    >
      <span
        class="flex h-10 w-10 items-center justify-center rounded-sm bg-sky-700 text-lg font-semibold text-white"
        :style="{
          backgroundColor: link.iconBg || undefined,
          color: link.iconColor || undefined
        }"
        aria-hidden="true"
      >
        <img
          v-if="link.iconUrl"
          :src="link.iconUrl"
          alt=""
          loading="lazy"
          decoding="async"
          class="h-6 w-6 object-contain"
        /><span v-else>{{ link.iconText || '↗' }}</span>
      </span>
      <span class="min-w-0 break-words">
        <span
          class="block text-sm font-semibold leading-6 text-slate-800 group-hover:text-sky-700 dark:text-slate-100 dark:group-hover:text-sky-300"
          >{{ link.title }}</span
        >
        <span
          v-if="link.subtitle"
          class="mt-1 block text-xs leading-6 text-slate-500 dark:text-slate-400"
          >{{ link.subtitle }}</span
        >
        <span
          v-if="link.extra"
          class="mt-2 block text-xs leading-6 text-slate-500 dark:text-slate-400"
          >{{ link.extra }}</span
        >
      </span>
      <ClubIcon
        name="external"
        class="mt-1 h-4 w-4 text-slate-400 transition-transform motion-safe:group-hover:-translate-y-0.5 dark:text-slate-500"
      />
    </a>
  </div>
</template>
