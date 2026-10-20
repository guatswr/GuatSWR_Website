<script setup lang="ts">
const route = useRoute()
</script>

<template>
  <NuxtRouteAnnouncer />
  <NuxtLayout>
    <div v-if="route.meta.layout !== 'admin'" class="club-page-stack">
      <NuxtPage :transition="{ name: 'club-page' }" />
    </div>
    <NuxtPage v-else />
  </NuxtLayout>
</template>
