<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'

const props = defineProps({
  src: { type: String, default: '' },
  thumb: { type: String, default: '' },
  alt: { type: String, default: '' },
  imgClass: { type: String, default: '' },
  wrapperClass: { type: String, default: '' },
  fit: { type: String, default: 'cover' },
  eager: { type: Boolean, default: false }
})

const wrapperRef = ref(null)
const isInView = ref(false)
const fullLoaded = ref(false)
const hasError = ref(false)
const retryCount = ref(0)
const maxRetry = 3
let observer = null

const placeholderSrc = computed(() => props.thumb || '')

const displaySrc = computed(() => {
  if (!isInView.value && !props.eager) return placeholderSrc.value || ''
  if (fullLoaded.value && props.src) return props.src
  if (placeholderSrc.value) return placeholderSrc.value
  if (hasError.value) return ''
  return props.src || ''
})

const shouldBlur = computed(() => !fullLoaded.value && !!placeholderSrc.value)

const scheduleRetry = () => {
  if (retryCount.value >= maxRetry) return
  const delay = 1500 * (retryCount.value + 1)
  retryCount.value += 1
  setTimeout(() => {
    if (!fullLoaded.value && props.src) {
      hasError.value = false
      startLoad(true)
    }
  }, delay)
}

const startLoad = (force = false) => {
  if (!props.src || fullLoaded.value || (hasError.value && !force)) return
  const img = new Image()
  img.src = props.src
  img.onload = () => {
    fullLoaded.value = true
    hasError.value = false
  }
  img.onerror = () => {
    hasError.value = true
    scheduleRetry()
  }
}

const onIntersect = (entries) => {
  if (entries.some(entry => entry.isIntersecting)) {
    isInView.value = true
    startLoad()
    if (observer) observer.disconnect()
  }
}

onMounted(() => {
  if (props.eager) {
    isInView.value = true
    startLoad()
    return
  }
  if (typeof window !== 'undefined' && 'IntersectionObserver' in window) {
    observer = new IntersectionObserver(onIntersect, { rootMargin: '200px' })
    if (wrapperRef.value) observer.observe(wrapperRef.value)
  } else {
    isInView.value = true
    startLoad()
  }
})

onBeforeUnmount(() => {
  if (observer) observer.disconnect()
})

watch(() => props.src, () => {
  fullLoaded.value = false
  hasError.value = false
  retryCount.value = 0
  if (isInView.value) startLoad()
})
</script>

<template>
  <div ref="wrapperRef" :class="wrapperClass">
    <img
      v-if="displaySrc"
      :src="displaySrc"
      :alt="alt"
      :class="[
        'transition duration-700 ease-out',
        shouldBlur ? 'blur-md scale-105' : 'blur-0 scale-100',
        imgClass
      ]"
      :style="{ objectFit: fit }"
      loading="lazy"
      decoding="async"
    >
    <div v-else class="w-full h-full bg-gray-100 dark:bg-slate-800 animate-pulse"></div>
  </div>
</template>
