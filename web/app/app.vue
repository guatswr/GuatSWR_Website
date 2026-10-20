<script setup lang="ts">
const route = useRoute()
const pageTransition = usePublicPageTransition()
</script>

<template>
  <NuxtRouteAnnouncer />
  <NuxtLayout>
    <div v-if="route.meta.layout !== 'admin'" class="club-page-stack">
      <NuxtPage :transition="pageTransition" />
    </div>
    <NuxtPage v-else />
  </NuxtLayout>
</template>
