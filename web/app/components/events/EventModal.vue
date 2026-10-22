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
    <div class="event-modal-panel" :style="{ maxWidth }">
      <header class="event-modal-header">
        <div class="event-modal-title-wrap">
          <span class="event-modal-seal" aria-hidden="true">牒</span>
          <h2 :id="titleId">{{ title }}</h2>
        </div>
        <button type="button" aria-label="关闭对话框" @click="close">
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <div data-region="modal-body" class="event-modal-body">
        <slot />
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.event-modal {
  z-index: 60;
  width: min(92vw, 48rem);
  max-width: none;
  max-height: 90svh;
  margin: 7svh auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  overflow: visible;
}
.event-modal::backdrop {
  background: rgb(8 15 26 / 0.62);
  backdrop-filter: blur(4px);
}
.event-modal-panel {
  position: relative;
  width: 100%;
  margin-inline: auto;
  border: 1px solid #d5dfe7;
  border-top: 2px solid #0369a1;
  background: #fbfbf8;
  color: #1e293b;
  box-shadow: 0 24px 64px rgb(8 15 26 / 0.28);
}
.event-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #e2e8f0;
  background: rgb(255 255 255 / 0.65);
}
.event-modal-title-wrap {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}
.event-modal-seal {
  display: inline-grid;
  place-items: center;
  width: 1.4rem;
  height: 1.4rem;
  border: 1px solid rgb(163 78 71 / 0.45);
  background: rgb(163 78 71 / 0.08);
  color: #a34e47;
  font-family: var(--club-serif);
  font-size: 0.72rem;
  font-weight: 700;
}
.event-modal-header h2 {
  margin: 0;
  font-family: var(--club-serif);
  font-size: 1.2rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.event-modal-header button {
  display: grid;
  place-items: center;
  min-height: 2.5rem;
  min-width: 2.5rem;
  border: 1px solid transparent;
  color: #475569;
  font-size: 1.4rem;
  line-height: 1;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease;
}
.event-modal-header button:hover {
  border-color: #cbd5e1;
  background: #f1f5f9;
  color: #0f172a;
}
.event-modal-header button:focus-visible {
  outline: 2px solid #0369a1;
  outline-offset: 2px;
}
.event-modal-body {
  max-height: 72svh;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 1.35rem 1.5rem;
}
:global(html.dark .event-modal-panel) {
  background: #131e2a;
  border-color: #293849;
  border-top-color: #38bdf8;
  color: #e2e8f0;
}
:global(html.dark .event-modal-header) {
  border-color: #263545;
  background: rgb(15 23 34 / 0.65);
}
:global(html.dark .event-modal-seal) {
  border-color: rgb(251 113 133 / 0.45);
  background: rgb(251 113 133 / 0.12);
  color: #fda4af;
}
:global(html.dark .event-modal-header button) {
  color: #94a3b8;
}
:global(html.dark .event-modal-header button:hover) {
  border-color: #334155;
  background: #1e293b;
  color: #f8fafc;
}
@media (max-width: 640px) {
  .event-modal {
    margin-block: 4svh;
  }
  .event-modal-header {
    padding: 0.85rem 1.1rem;
  }
  .event-modal-body {
    padding: 1.1rem;
    max-height: 75svh;
  }
}
</style>
