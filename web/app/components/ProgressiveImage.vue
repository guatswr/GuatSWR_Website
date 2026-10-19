<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CSSProperties, PropType } from 'vue'
import { createImageLoader } from '~/utils/image-loader'
import type {
  ImageLoader,
  ImageLoaderConfig,
  ImageLoaderEnvironment,
  ImageLoaderState
} from '~/utils/image-loader'

const props = defineProps({
  src: { type: String, default: '' },
  fallbackSrc: { type: String, default: '' },
  thumb: { type: String, default: '' },
  alt: { type: String, default: '' },
  imgClass: { type: String, default: '' },
  wrapperClass: { type: String, default: '' },
  fit: { type: String as PropType<CSSProperties['objectFit']>, default: 'cover' },
  eager: { type: Boolean, default: false },
  preloadMargin: { type: String, default: '600px 0px' },
  rise: { type: Boolean, default: false },
  width: { type: Number, default: undefined },
  height: { type: Number, default: undefined }
})

const wrapperRef = ref<HTMLElement | null>(null)
const imageRef = ref<HTMLImageElement | null>(null)
const entered = ref(false)
const thumbFailed = ref(false)
/**
 * `managed` turns the progressive presentation on, and it can only be turned on
 * by a working client loader. Server-rendered HTML (and every no-JS visitor)
 * therefore keeps a fully visible image with usable alt text and no placeholder
 * covering it.
 */
const managed = ref(false)
const image = ref<ImageLoaderState>({
  source: '',
  status: 'idle',
  slow: false,
  retries: 0,
  width: 0,
  height: 0
})

const config = computed<ImageLoaderConfig>(() => ({
  src: props.src,
  fallbackSrc: props.fallbackSrc,
  eager: props.eager
}))
/** Template style bindings widen string literals, so the fit is typed here. */
const fitStyle = computed<CSSProperties>(() => ({ objectFit: props.fit }))
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
/** The one source the request already knows, so it can be rendered on the server. */
const source = computed(() => image.value.source || props.src || props.fallbackSrc)

const browserEnvironment = (): ImageLoaderEnvironment => ({
  image: () => imageRef.value,
  setTimeout: (handler, delay) => window.setTimeout(handler, delay),
  clearTimeout: (handle) => window.clearTimeout(handle),
  addEventListener: (type, listener) => window.addEventListener(type, listener),
  removeEventListener: (type, listener) => window.removeEventListener(type, listener)
})

let loader: ImageLoader | undefined
let observer: IntersectionObserver | undefined

function enter(): void {
  entered.value = true
  observer?.disconnect()
  observer = undefined
  loader?.enter()
}

onMounted(() => {
  const element = imageRef.value
  // Never hide an image the browser already painted from the server HTML.
  const painted = !!element && element.complete && element.naturalWidth > 0
  // The browser may also have already finished the server-rendered source with a
  // failure (a missing thumbnail) before this observer existed. That element
  // never fires `error` again and the observer's margin may never reach it, so
  // adopt the settled failure now and let the loader fall back to the original.
  const broken = !!element && element.complete && !element.naturalWidth
  loader = createImageLoader(browserEnvironment(), (state) => {
    image.value = state
  })
  managed.value = !painted
  loader.configure(config.value)
  if (props.eager || painted || broken) enter()
  else if ('IntersectionObserver' in window) {
    try {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) enter()
        },
        { rootMargin: props.preloadMargin }
      )
      const wrapper = wrapperRef.value
      if (wrapper) observer.observe(wrapper)
      else enter()
    } catch {
      enter()
    }
  } else enter()
})

watch(
  [() => props.src, () => props.fallbackSrc, () => props.eager],
  () => {
    thumbFailed.value = false
    loader?.configure(config.value)
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
  observer = undefined
  loader?.dispose()
  loader = undefined
})
</script>

<template>
  <div
    ref="wrapperRef"
    class="progressive-image"
    :class="wrapperClass"
    :data-image-state="image.status"
    :data-image-managed="managed ? 'true' : 'false'"
    :aria-busy="managed && busy ? 'true' : undefined"
    :style="{
      aspectRatio: width && height ? `${width} / ${height}` : undefined,
      minHeight: fit === 'contain' && !ready ? '12rem' : undefined
    }"
  >
    <div
      class="pi-surface"
      :class="{
        'is-managed': managed,
        'is-ready': managed && ready,
        'has-rise': rise,
        'is-eager': eager
      }"
    >
      <div v-if="managed" class="pi-placeholder" aria-hidden="true">
        <img
          v-if="placeholder"
          :src="placeholder"
          alt=""
          aria-hidden="true"
          decoding="async"
          class="pi-preview"
          :style="fitStyle"
          @error="thumbFailed = true"
        />
        <div v-else class="pi-poster">
          <svg viewBox="0 0 48 36" fill="none" class="pi-poster-icon">
            <rect x="1" y="1" width="46" height="34" rx="3" />
            <circle cx="15" cy="12" r="3" />
            <path d="m2 28 13-10 10 8 9-13 12 16" />
          </svg>
        </div>
        <span v-if="busy" class="pi-shimmer" />
        <span v-if="message" class="pi-message">{{ message }}</span>
      </div>
      <img
        v-if="source"
        ref="imageRef"
        :src="source"
        :alt="alt"
        :width="width || image.width || undefined"
        :height="height || image.height || undefined"
        :loading="eager ? 'eager' : 'lazy'"
        :fetchpriority="eager ? 'high' : 'auto'"
        decoding="async"
        :class="['pi-full', imgClass]"
        :style="fitStyle"
      />
      <span
        v-if="managed && message"
        class="sr-only"
        role="status"
        aria-live="polite"
        >{{ message }}</span
      >
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
/* Visible by default: the archived presentation is opt-in for managed images. */
.pi-full {
  display: block;
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
.pi-surface.is-managed .pi-full {
  opacity: 0;
  transition:
    opacity 950ms cubic-bezier(0.22, 1, 0.36, 1),
    translate 1050ms cubic-bezier(0.22, 1, 0.36, 1),
    scale 1050ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 500ms ease;
}
.pi-surface.is-managed.has-rise .pi-full {
  translate: 0 14px;
  scale: 1.025;
}
.pi-surface.is-ready .pi-full {
  opacity: 1;
  translate: none;
  scale: 1;
}
.pi-surface.is-ready .pi-placeholder {
  opacity: 0;
  pointer-events: none;
}
.pi-surface.is-managed.is-eager .pi-full {
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
  .pi-surface.is-managed.has-rise .pi-full {
    translate: 0 8px;
    scale: 1.015;
  }
  .pi-surface.is-ready .pi-full {
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
