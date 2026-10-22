<script setup lang="ts">
const route = useRoute()
const pageTransition = usePublicPageTransition()
</script>

<template>
  <NuxtRouteAnnouncer />
  <NuxtLayout>
    <NuxtPage :transition="route.meta.layout === 'admin' ? false : pageTransition" />
  </NuxtLayout>
</template>
