<script setup lang="ts">
const props = defineProps<{ src?: string | null; name?: string }>()
const failed = ref(false)
watch(() => props.src, () => { failed.value = false })
</script>
<template>
  <span class="admin-avatar"><img v-if="src && !failed" :src="src" alt="" @error="failed = true" ><span v-else>{{ (name || '?').slice(0, 1).toUpperCase() }}</span></span>
</template>
