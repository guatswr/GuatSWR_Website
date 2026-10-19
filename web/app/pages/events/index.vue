<script setup lang="ts">
/**
 * The archived router redirects `/events` to `/events/bounty`. Keep that as a real
 * server redirect (302) instead of rendering an empty board first.
 */
await navigateTo('/events/bounty', { redirectCode: 302, replace: true })
</script>

<template>
  <p class="py-12 text-center text-sm text-slate-500 dark:text-slate-400">正在前往活动页…</p>
</template>
