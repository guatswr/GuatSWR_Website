<script setup lang="ts">
import { onMounted, shallowRef, watch, type Component } from 'vue'

defineProps<{ title: string, description: string }>()

// Reka's dialog runtime (~12 KB gzip) is only needed once the dialog is
// actually opened. It is imported on first activation instead of shipping in
// the initial page load, and prefetched while the browser is idle so the
// first open stays instant. The trigger remains a normal SSR button, so
// hydration and the first activation behave exactly as before.
type DialogParts = {
  Root: Component
  Portal: Component
  Overlay: Component
  Content: Component
  Title: Component
  Description: Component
  Close: Component
}

const parts = shallowRef<DialogParts | null>(null)
const open = shallowRef(false)
const wrap = shallowRef<HTMLElement | null>(null)

async function ensureReka() {
  if (parts.value) return
  const reka = await import('~/utils/dialog-reka')
  parts.value = {
    Root: reka.DialogRoot,
    Portal: reka.DialogPortal,
    Overlay: reka.DialogOverlay,
    Content: reka.DialogContent,
    Title: reka.DialogTitle,
    Description: reka.DialogDescription,
    Close: reka.DialogClose,
  }
}

async function openDialog() {
  await ensureReka()
  open.value = true
}

function triggerButton() {
  return wrap.value?.querySelector('button') ?? null
}

function onClosed() {
  open.value = false
  // The unmounting content re-focuses its close button and focus guards while
  // closing; restore focus to the original trigger once that sequence has
  // settled. (The E2E contract is: focus is back on the trigger after close.)
  window.setTimeout(() => { triggerButton()?.focus() }, 60)
}

function onCloseAutoFocus(event: Event) {
  // Focus return is done explicitly on the original trigger button above.
  event.preventDefault()
}

onMounted(() => {
  const button = triggerButton()
  button?.setAttribute('aria-haspopup', 'dialog')
  button?.setAttribute('aria-expanded', 'false')
  // Warm the dialog runtime after the page has settled; a user who never
  // opens the dialog never downloads it.
  window.setTimeout(() => { void ensureReka() }, 2000)
})

watch(open, (value) => {
  triggerButton()?.setAttribute('aria-expanded', String(value))
})
</script>

<template>
  <span ref="wrap" style="display: contents" @click="openDialog"><slot name="trigger" /></span>
  <template v-if="open && parts">
    <component :is="parts.Root" :open="true" @update:open="onClosed">
      <component :is="parts.Portal">
        <component :is="parts.Overlay" class="fixed inset-0 z-[60] bg-slate-950/55" />
        <component
          :is="parts.Content"
          class="club-paper fixed left-1/2 top-1/2 z-[61] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded p-6 shadow-xl focus:outline-none"
          @close-auto-focus="onCloseAutoFocus"
        >
          <component :is="parts.Title" class="club-section-title pr-8">{{ title }}</component>
          <component :is="parts.Description" class="mt-3 text-sm leading-7 text-slate-500">{{ description }}</component>
          <div class="mt-5"><slot /></div>
          <component :is="parts.Close" aria-label="关闭对话框" class="absolute right-3 top-3 grid size-11 place-items-center text-xl">×</component>
        </component>
      </component>
    </component>
  </template>
</template>
