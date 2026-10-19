<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
const headingId = useId()
</script>
<template>
  <section class="admin-panel" :aria-labelledby="headingId"><header class="admin-panel-heading"><div><h2 :id="headingId">{{ title }}</h2><p v-if="description">{{ description }}</p></div><slot name="actions" /></header><div class="admin-panel-body"><slot /></div></section>
</template>
