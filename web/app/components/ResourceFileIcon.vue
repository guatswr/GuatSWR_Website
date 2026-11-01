<script setup lang="ts">
import type { ResourceFileKind } from '#shared/resources'
import { computed } from 'vue'
import { resourceIconUrl } from '~/utils/resource-icons'

const props = withDefaults(defineProps<{
  name: string
  isDir?: boolean
  kind?: ResourceFileKind
}>(), { isDir: false, kind: 'other' })
const source = computed(() => resourceIconUrl(props.name, props.isDir, props.kind))
</script>

<template>
  <img :src="source" class="resource-file-icon" width="28" height="32" alt="" aria-hidden="true" decoding="async" :draggable="false">
</template>
