<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { createImageLoader } from '../utils/imageLoader'

const props = defineProps({
  src: { type: String, default: '' },
  fallbackSrc: { type: String, default: '' },
  thumb: { type: String, default: '' },
  alt: { type: String, default: '' },
  imgClass: { type: String, default: '' },
  wrapperClass: { type: String, default: '' },
  fit: { type: String, default: 'cover' },
  eager: { type: Boolean, default: false },
  preloadMargin: { type: String, default: '600px 0px' },
  rise: { type: Boolean, default: false },
  width: { type: Number, default: undefined },
  height: { type: Number, default: undefined }
})
const wrapperRef = ref(null)
const entered = ref(false)
const thumbFailed = ref(false)
const image = ref({
  source: '',
  status: 'idle',
  slow: false,
  width: 0,
  height: 0
})
const ready = computed(() => image.value.status === 'ready')
const busy = computed(() =>
  ['loading', 'decoding', 'retrying'].includes(image.value.status)
)
const placeholder = computed(() =>
  entered.value && !thumbFailed.value && props.thumb !== image.value.source
    ? props.thumb
    : ''
)
const message = computed(() => {
  if (image.value.status === 'error') return '图片暂未加载'
  if (!props.src && !props.fallbackSrc) return '暂无图片'
  if (image.value.slow) return '图片仍在加载，请稍候'
  if (image.value.status === 'retrying') return '正在重新加载图片'
  return ''
})
let loader, observer
function enter() {
  entered.value = true
  observer?.disconnect()
  loader?.enter()
}
onMounted(() => {
  loader = createImageLoader(window, (state) => {
    image.value = state
  })
  loader.configure(props)
  if (props.eager) enter()
  else if ('IntersectionObserver' in window) {
    try {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) enter()
        },
        { rootMargin: props.preloadMargin }
      )
      observer.observe(wrapperRef.value)
    } catch {
      enter()
    }
  } else enter()
})
watch(
  [() => props.src, () => props.fallbackSrc, () => props.eager],
  () => {
    thumbFailed.value = false
    loader?.configure(props)
    if (props.eager) enter()
  },
  { flush: 'sync' }
)
watch(
  () => props.thumb,
  () => {
    thumbFailed.value = false
  }
)
onBeforeUnmount(() => {
  observer?.disconnect()
  loader?.dispose()
})
</script>

<template>
  <div
    ref="wrapperRef"
    :class="['progressive-image', wrapperClass]"
    :data-image-state="image.status"
    :aria-busy="busy ? 'true' : undefined"
    :style="{
      aspectRatio: width && height ? `${width} / ${height}` : undefined,
      minHeight: fit === 'contain' && !ready ? '12rem' : undefined
    }"
  >
    <div
      class="pi-surface"
      :class="{
        'is-ready': ready,
        'is-busy': busy,
        'has-rise': rise,
        'is-eager': eager
      }"
    >
      <div
        class="pi-placeholder"
        :role="!ready && alt ? 'img' : undefined"
        :aria-label="
          !ready && alt ? `${alt}（${message || '加载中'}）` : undefined
        "
        :aria-hidden="ready ? 'true' : undefined"
      >
        <img
          v-if="placeholder"
          :src="placeholder"
          alt=""
          aria-hidden="true"
          decoding="async"
          class="pi-preview"
          :style="{ objectFit: fit }"
          @error="thumbFailed = true"
        />
        <div v-else class="pi-poster" aria-hidden="true">
          <svg viewBox="0 0 48 36" fill="none" class="pi-poster-icon">
            <rect x="1" y="1" width="46" height="34" rx="3" />
            <circle cx="15" cy="12" r="3" />
            <path d="m2 28 13-10 10 8 9-13 12 16" />
          </svg>
        </div>
        <span v-if="busy" class="pi-shimmer" aria-hidden="true" />
        <span v-if="message" class="pi-message" aria-hidden="true">{{
          message
        }}</span>
      </div>
      <img
        v-if="entered && image.source"
        :key="`${image.source}:${image.requestId}`"
        :src="image.source"
        :alt="alt"
        :aria-hidden="ready ? undefined : 'true'"
        :width="width || image.width || undefined"
        :height="height || image.height || undefined"
        loading="eager"
        :fetchpriority="eager ? 'high' : 'auto'"
        decoding="async"
        :class="['pi-full', imgClass]"
        :style="{ objectFit: fit }"
      />
    </div>
  </div>
</template>

<style scoped>
.progressive-image {
  overflow: hidden;
  isolation: isolate;
  container-type: inline-size;
  background: #e9edf1;
}
html.dark .progressive-image {
  background: #1e2a38;
}
.pi-surface {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: inherit;
}
.pi-placeholder {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: linear-gradient(135deg, #e6edf4, #f1f4f6 55%, #e2eaf1);
  transition: opacity 750ms ease;
}
html.dark .pi-placeholder {
  background: linear-gradient(135deg, #1d2c3d, #243546 55%, #192839);
}
.pi-preview {
  width: 100%;
  height: 100%;
  filter: blur(8px);
  transform: scale(1.06);
}
.pi-poster {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #94a8bb;
}
.pi-poster-icon {
  width: 2.25rem;
  height: auto;
  stroke: currentColor;
  stroke-width: 1;
  opacity: 0.5;
}
.pi-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    105deg,
    transparent 30%,
    rgb(255 255 255 / 0.32) 48%,
    transparent 68%
  );
  transform: translateX(-100%);
  animation: pi-shimmer 2.2s ease-in-out infinite;
}
html.dark .pi-shimmer {
  opacity: 0.15;
}
.pi-message {
  position: absolute;
  inset-inline: 0.75rem;
  bottom: 1rem;
  color: #536a7f;
  font-size: 0.7rem;
  line-height: 1.7;
  text-align: center;
  text-wrap: balance;
}
html.dark .pi-message {
  color: #b1c2d2;
}
.pi-full {
  display: block;
  opacity: 0;
  transition:
    opacity 950ms cubic-bezier(0.22, 1, 0.36, 1),
    translate 1050ms cubic-bezier(0.22, 1, 0.36, 1),
    scale 1050ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 500ms ease;
}
.has-rise .pi-full {
  translate: 0 14px;
  scale: 1.025;
}
.is-ready .pi-full {
  opacity: 1;
  translate: none;
  scale: 1;
}
.is-ready .pi-placeholder {
  opacity: 0;
  pointer-events: none;
}
.is-eager .pi-full {
  transition-duration: 600ms;
}
@keyframes pi-shimmer {
  to {
    transform: translateX(100%);
  }
}
@container (max-width: 96px) {
  .pi-message,
  .pi-poster-icon {
    display: none;
  }
}
@media (max-width: 639px) {
  .has-rise .pi-full {
    translate: 0 8px;
    scale: 1.015;
  }
  .is-ready .pi-full {
    translate: none;
    scale: 1;
  }
}
@media (prefers-reduced-motion: reduce), print {
  .pi-full,
  .pi-placeholder {
    transition: none !important;
    translate: none !important;
    scale: none !important;
  }
  .pi-shimmer {
    animation: none;
    display: none;
  }
}
</style>
