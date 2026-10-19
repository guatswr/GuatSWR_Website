<script setup lang="ts">
/**
 * Accessible image lightbox for the activity gallery and the history timeline.
 *
 * Built on a **native modal `<dialog>`** (`showModal()`): the browser puts it in
 * the top layer, makes the rest of the page inert for pointer, keyboard and
 * assistive navigation, handles Escape, and returns focus to the element that
 * opened it. A hand-rolled overlay cannot provide that inertness, which is why
 * the earlier control-only trap was replaced.
 *
 * Nothing is rendered while closed, so it contributes no SSR markup and no
 * image request; the gallery itself stays a real anchor, so the full-size image
 * is reachable without JavaScript. The Reka dialog runtime is not imported.
 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  src: string
  alt?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const dialog = ref<HTMLDialogElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
let previousOverflow = ''
let scrollLocked = false
let disposed = false

const requestClose = (): void => {
  if (props.open) emit('update:open', false)
}

/** Escape (native `cancel`) and the element's own `close` both sync state. */
const onClose = (): void => requestClose()

const onBackdropClick = (event: MouseEvent): void => {
  if (event.target === dialog.value) requestClose()
}

const lockScroll = (): void => {
  if (!import.meta.client || scrollLocked) return
  scrollLocked = true
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
}

const unlockScroll = (): void => {
  if (!import.meta.client || !scrollLocked) return
  scrollLocked = false
  document.body.style.overflow = previousOverflow
}

const closeElement = (element: HTMLDialogElement | null): void => {
  if (element?.open && typeof element.close === 'function') element.close()
}

watch(
  () => props.open,
  async (open) => {
    if (!import.meta.client || disposed) return
    if (open) {
      lockScroll()
      await nextTick()
      // A rapid open/close/unmount must not show a dialog for a stale state.
      if (disposed || !props.open) return
      const element = dialog.value
      if (!element) return
      if (typeof element.showModal === 'function') {
        if (!element.open) element.showModal()
      }
      else {
        // Very old engines: keep the image reachable without modality.
        element.setAttribute('open', '')
      }
      closeButton.value?.focus()
      return
    }
    unlockScroll()
    closeElement(dialog.value)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  disposed = true
  unlockScroll()
  closeElement(dialog.value)
})
</script>

<template>
  <Teleport to="body">
    <dialog
      v-if="open"
      ref="dialog"
      class="public-lightbox"
      aria-label="图片预览"
      @close="onClose"
      @click="onBackdropClick"
    >
      <div class="public-lightbox__stage">
        <img
          :src="src"
          :alt="alt || '大图预览'"
          class="public-lightbox__image"
          @click.stop
        >
        <button
          ref="closeButton"
          type="button"
          class="public-lightbox__close"
          aria-label="关闭图片预览"
          @click.stop="requestClose"
        >
          &times;
        </button>
        <p class="public-lightbox__hint">
          点击任意处关闭
        </p>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.public-lightbox {
  position: fixed;
  inset: 0;
  width: 100%;
  max-width: none;
  height: 100%;
  max-height: none;
  margin: 0;
  padding: 0.5rem;
  border: none;
  background-color: rgb(0 0 0 / 0.95);
  backdrop-filter: blur(12px);
  color: #fff;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.3s;
}

.public-lightbox::backdrop {
  background: transparent;
}

.public-lightbox__stage {
  position: relative;
  width: 100%;
  height: 100%;
  max-width: 80rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.public-lightbox__image {
  max-width: 100%;
  max-height: 85vh;
  object-fit: contain;
  border-radius: 0.5rem;
  box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25);
  user-select: none;
  animation: lightbox-zoom-in 0.3s ease-out;
}

.public-lightbox__close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background-color: rgb(0 0 0 / 0.2);
  color: rgb(255 255 255 / 0.7);
  font-size: 2.25rem;
  font-weight: 300;
  line-height: 1;
  transition: color 0.15s;
}

.public-lightbox__close:hover {
  color: #fff;
}

.public-lightbox__hint {
  margin-top: 1rem;
  color: rgb(255 255 255 / 0.5);
  font-size: 0.875rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  display: none;
}

@media (min-width: 768px) {
  .public-lightbox {
    padding: 1rem;
  }

  .public-lightbox__close {
    top: -0.5rem;
    right: -3rem;
    background-color: transparent;
  }

  .public-lightbox__hint {
    display: block;
  }
}

@keyframes lightbox-zoom-in {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
</style>
