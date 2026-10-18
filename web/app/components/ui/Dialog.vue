<script setup lang="ts">
import { onBeforeUnmount, shallowRef, type Component } from 'vue'

defineProps<{ title: string, description: string, triggerClass?: string }>()

// The trigger is an ordinary server-rendered button, so its ARIA contract,
// keyboard activation and focus return work before and without the dialog
// runtime. Only the Reka primitives are loaded, lazily, on intent or on
// activation; the first activation waits for that load.
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
const loading = shallowRef(false)
const error = shallowRef('')
const trigger = shallowRef<HTMLButtonElement | null>(null)
const contentId = useId()
let disposed = false
let pending: Promise<void> | undefined

async function ensureReka() {
  if (parts.value) return
  if (!pending) {
    pending = import('~/utils/dialog-reka').then((reka) => {
      if (disposed) return
      parts.value = {
        Root: reka.DialogRoot, Portal: reka.DialogPortal,
        Overlay: reka.DialogOverlay, Content: reka.DialogContent,
        Title: reka.DialogTitle, Description: reka.DialogDescription,
        Close: reka.DialogClose,
      }
    }).finally(() => { pending = undefined })
  }
  await pending
}

function prefetch() {
  void ensureReka().catch(() => { /* Activation surfaces the recoverable error. */ })
}

async function openDialog() {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    await ensureReka()
    if (!disposed) open.value = true
  }
  catch {
    if (!disposed) error.value = '弹窗组件加载失败，请刷新页面后重试。'
  }
  finally { if (!disposed) loading.value = false }
}

function onCloseAutoFocus(event: Event) {
  event.preventDefault()
  if (trigger.value?.isConnected) trigger.value.focus({ preventScroll: true })
}

onBeforeUnmount(() => { disposed = true })
</script>

<template>
  <button
    ref="trigger"
    type="button"
    :class="triggerClass"
    aria-haspopup="dialog"
    :aria-expanded="open"
    :aria-controls="open ? contentId : undefined"
    :aria-busy="loading || undefined"
    :disabled="loading"
    @pointerenter="prefetch"
    @focus="prefetch"
    @click="openDialog"
  >
    <slot name="trigger" />
  </button>
  <p v-if="error" role="alert" class="mt-3 text-sm text-red-700 dark:text-red-300">{{ error }}</p>
  <template v-if="parts">
    <component :is="parts.Root" :open="open" @update:open="open = $event">
      <component :is="parts.Portal">
        <component :is="parts.Overlay" class="fixed inset-0 z-[60] bg-slate-950/55" />
        <component
          :is="parts.Content"
          :id="contentId"
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
