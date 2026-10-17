<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'

const props = defineProps({
  src: { type: String, default: '' },
  fallbackSrc: { type: String, default: '' },
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
const thumbFailed = ref(false)
const retryCount = ref(0)
const loadVersion = ref(0)
const activeSrc = ref(props.src || props.fallbackSrc)
const fallbackUsed = ref(!props.src && !!props.fallbackSrc)
const maxRetry = 3
let observer = null
let pendingImage = null
let retryTimer = null
let mounted = false
let disposed = false

// 相同地址仅作为目标图加载，避免重复加载和不必要的模糊。
const placeholderSrc = computed(() => !thumbFailed.value && props.thumb !== activeSrc.value ? props.thumb : '')

const displaySrc = computed(() => {
  if (fullLoaded.value && activeSrc.value) return activeSrc.value
  return placeholderSrc.value || ''
})

const shouldBlur = computed(() => !!activeSrc.value && !fullLoaded.value && !hasError.value && !!placeholderSrc.value)

const clearPendingLoad = () => {
  if (retryTimer !== null) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
  if (pendingImage) {
    pendingImage.onload = null
    pendingImage.onerror = null
    pendingImage = null
  }
}

const scheduleRetry = (version) => {
  if (retryCount.value >= maxRetry || retryTimer !== null) return
  const delay = 1500 * (retryCount.value + 1)
  retryCount.value += 1
  retryTimer = setTimeout(() => {
    retryTimer = null
    if (!disposed && version === loadVersion.value && !fullLoaded.value && activeSrc.value) {
      hasError.value = false
      startLoad(true)
    }
  }, delay)
}

const handleLoadFailure = (version) => {
  if (disposed || version !== loadVersion.value) return
  // 旧上传资源不一定有缩略图：首次失败直接回退，不重试缺失的缩略图。
  if (!fallbackUsed.value && props.fallbackSrc && props.fallbackSrc !== activeSrc.value) {
    clearPendingLoad()
    loadVersion.value += 1
    fallbackUsed.value = true
    activeSrc.value = props.fallbackSrc
    fullLoaded.value = false
    hasError.value = false
    retryCount.value = 0
    startLoad()
    return
  }
  hasError.value = true
  scheduleRetry(version)
}

const startLoad = (force = false) => {
  if (disposed || !activeSrc.value || pendingImage || fullLoaded.value || (hasError.value && !force)) return
  const version = loadVersion.value
  const img = new Image()
  pendingImage = img
  // 优先级必须先于 src 设置；真正发起原图请求的是这个预加载对象。
  img.fetchPriority = props.eager ? 'high' : 'auto'
  img.loading = 'eager'
  img.decoding = 'async'
  img.onload = () => {
    if (disposed || version !== loadVersion.value || pendingImage !== img) return
    img.onload = null
    img.onerror = null
    pendingImage = null
    fullLoaded.value = true
    hasError.value = false
  }
  img.onerror = () => {
    if (disposed || version !== loadVersion.value || pendingImage !== img) return
    img.onload = null
    img.onerror = null
    pendingImage = null
    handleLoadFailure(version)
  }
  img.src = activeSrc.value
}

const onDisplayError = (event) => {
  const img = event.currentTarget
  if (Number(img.dataset.loadVersion) !== loadVersion.value) return
  const source = img.getAttribute('src')
  if (source === placeholderSrc.value) {
    thumbFailed.value = true
  } else if (source === activeSrc.value) {
    fullLoaded.value = false
    handleLoadFailure(loadVersion.value)
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
  mounted = true
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
  disposed = true
  loadVersion.value += 1
  clearPendingLoad()
  if (observer) observer.disconnect()
})

watch([() => props.src, () => props.fallbackSrc], () => {
  loadVersion.value += 1
  clearPendingLoad()
  fullLoaded.value = false
  hasError.value = false
  thumbFailed.value = false
  retryCount.value = 0
  activeSrc.value = props.src || props.fallbackSrc
  fallbackUsed.value = !props.src && !!props.fallbackSrc
  if (mounted && (isInView.value || props.eager)) startLoad()
}, { flush: 'sync' })

watch(() => props.thumb, () => {
  thumbFailed.value = false
}, { flush: 'sync' })

watch(() => props.eager, (eager) => {
  if (mounted && eager) {
    isInView.value = true
    observer?.disconnect()
    if (pendingImage) pendingImage.fetchPriority = 'high'
    startLoad()
  }
})
</script>

<template>
  <div ref="wrapperRef" :class="wrapperClass">
    <img
      v-if="displaySrc"
      :key="`${loadVersion}:${displaySrc}`"
      :data-load-version="loadVersion"
      :loading="eager ? 'eager' : 'lazy'"
      :fetchpriority="eager && fullLoaded ? 'high' : 'auto'"
      :src="displaySrc"
      :alt="alt"
      :class="[
        'transition duration-700 ease-out',
        shouldBlur ? 'blur-md scale-105' : 'blur-0 scale-100',
        imgClass
      ]"
      :style="{ objectFit: fit }"
      decoding="async"
      @error="onDisplayError"
    >
    <div
      v-else
      class="w-full h-full bg-gray-100 dark:bg-slate-800"
      :class="activeSrc && !hasError ? 'motion-safe:animate-pulse' : ''"
      :role="alt ? 'img' : undefined"
      :aria-label="alt ? `${alt}${hasError ? '（暂时无法加载）' : activeSrc ? '（加载中）' : '（暂无图片）'}` : undefined"
    ></div>
  </div>
</template>
