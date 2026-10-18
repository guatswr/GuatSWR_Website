<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getThumbUrl } from '../utils/image-url'

const props = defineProps({
  src: { type: String, default: '' },
  preferOriginal: { type: Boolean, default: false }
})
const attempt = ref(0)
const candidates = computed(() => [
  ...new Set(
    [
      ...(props.preferOriginal
        ? [props.src, getThumbUrl(props.src)]
        : [getThumbUrl(props.src), props.src]),
      '/brand/group-avatar.webp'
    ].filter(Boolean)
  )
])
const source = computed(
  () => candidates.value[Math.min(attempt.value, candidates.value.length - 1)]
)
watch(
  () => [props.src, props.preferOriginal],
  () => {
    attempt.value = 0
  }
)
</script>

<template>
  <img
    :src="source"
    alt="桂航绯想天群头像"
    width="64"
    height="64"
    decoding="async"
    class="shrink-0 rounded-full bg-white object-contain"
    @error="attempt = Math.min(attempt + 1, candidates.length - 1)"
  >
</template>
