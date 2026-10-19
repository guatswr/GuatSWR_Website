<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Accessible, dependency-free modal for the event forms.
 *
 * A native `<dialog>` opened with `showModal()` gives the archived Element Plus
 * dialog its required behavior without adding that library to the public bundle:
 * the rest of the page becomes inert, focus is trapped, Escape is a native
 * `cancel` event, and the opener gets focus back on close. Scroll lock and
 * cleanup are explicit; nothing here uses timers.
 */
// Declared for the template bindings (`title` / `maxWidth`); the script itself
// never reads them, so the call is intentionally not assigned.
defineProps({
  title: { type: String, required: true },
  maxWidth: { type: String, default: '640px' }
})
const emit = defineEmits<{ close: [] }>()

const dialog = ref<HTMLDialogElement | null>(null)
const titleId = `event-modal-title-${Math.random().toString(36).slice(2, 9)}`
let previousFocus: HTMLElement | null = null
let previousOverflow = ''

const focusables = (element: HTMLElement): HTMLElement[] =>
  [...element.querySelectorAll<HTMLElement>(
    'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
  )].filter((node) => node.offsetParent !== null || node === document.activeElement)

onMounted(() => {
  const element = dialog.value
  if (!element) return
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  if (typeof element.showModal === 'function') element.showModal()
  else element.setAttribute('open', '')
  const [first] = focusables(element)
  ;(first ?? element).focus({ preventScroll: true })
})

function close(): void {
  emit('close')
}

onBeforeUnmount(() => {
  const element = dialog.value
  if (element?.open) element.close()
  document.body.style.overflow = previousOverflow
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
  previousFocus = null
})
</script>

<template>
  <dialog
    ref="dialog"
    class="event-modal"
    :aria-labelledby="titleId"
    data-testid="event-modal"
    @cancel.prevent="close"
  >
    <div
      class="event-modal-panel overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
      :style="{ maxWidth }"
    >
      <header
        class="flex items-center justify-between border-b border-sky-100 bg-sky-50 px-6 py-4 dark:border-slate-800 dark:bg-[#0b1220]"
      >
        <h2 :id="titleId" class="text-[1.1rem] font-semibold text-sky-700 dark:text-sky-200">
          {{ title }}
        </h2>
        <button
          type="button"
          class="min-h-11 min-w-11 rounded text-sky-700/70 transition-colors hover:text-sky-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700 dark:text-sky-200/70 dark:hover:text-sky-100"
          aria-label="关闭对话框"
          @click="close"
        >
          <span aria-hidden="true" class="text-xl leading-none">×</span>
        </button>
      </header>
      <div data-region="modal-body" class="max-h-[70vh] overflow-y-auto overscroll-contain px-6 py-5">
        <slot />
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.event-modal {
  z-index: 60;
  width: 92vw;
  max-height: 92vh;
  margin: auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  overflow: visible;
}
.event-modal::backdrop {
  background: rgb(2 6 23 / 0.55);
}
.event-modal-panel {
  width: 92vw;
  margin-inline: auto;
  box-shadow: 0 24px 64px rgb(2 6 23 / 0.28);
}
</style>
