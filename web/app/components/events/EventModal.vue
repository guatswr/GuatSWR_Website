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
      class="event-modal-panel overflow-hidden rounded-xl bg-white dark:bg-slate-950"
      :style="{ maxWidth }"
    >
      <header
        class="event-modal-header flex items-center justify-between border-b border-sky-100 bg-sky-50 px-6 py-4 dark:border-slate-800 dark:bg-[#0b1220]"
      >
        <h2 :id="titleId" class="text-[1.1rem] font-semibold leading-6 text-sky-700 dark:text-sky-200">
          {{ title }}
        </h2>
        <button
          type="button"
          class="rounded text-sky-700/70 transition-colors hover:text-sky-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700 dark:text-sky-200/70 dark:hover:text-sky-100"
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
  /* The UA stylesheet caps a dialog at `calc(100% - 6px - 2em)`; the archived
     Element Plus dialog is a plain 92vw box centred in the viewport, so the
     panel must be centred on the viewport (not on a shrunken dialog) for the
     body region to land on the archived box. */
  max-width: none;
  max-height: 92vh;
  /* Element Plus's `.el-dialog` is top-anchored, not centred:
     `margin: var(--el-dialog-margin-top, 15vh) auto 50px`. The visual spec
     compares the modal body box, and a different vertical position changes the
     device-pixel phase the element screenshot is snapped to (the text rasterises
     one row lower), so the archived rule is reproduced verbatim. */
  margin: 15vh auto 50px;
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
  /* `.el-dialog` pads its content box by 16px, so the archived
     `.el-dialog__body` is 92vw - 32px wide in both themes. The event visual spec
     compares that body box against `[data-region="modal-body"]`, so the panel
     reproduces it. */
  padding: 16px;
  box-shadow: 0 24px 64px rgb(2 6 23 / 0.28);
}
/*
 * No dark border: the archived `:deep(.dark .touhou-dialog) { border: 1px solid
 * #1e293b }` compiles to `[data-v-bd090f2b] .dark .touhou-dialog`, and Element
 * Plus teleports the dialog to <body>, so the archived dialog never has that
 * ancestor and renders borderless in both themes. Reproducing it keeps the body
 * box identical (verified: the dark body box is 347.03 x 565, the same as light).
 */
/*
 * `.el-dialog__header` is a 58px box (16px padding + the 24px title line + the
 * 1px bottom border). The body's y is `dialog.y + 16px panel padding + header`,
 * so a header of a different height moves the body's device-pixel phase and the
 * text rasterises on a different row than the archived capture.
 */
.event-modal-header {
  height: 58px;
}
</style>
