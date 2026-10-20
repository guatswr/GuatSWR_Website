<script setup lang="ts">
/**
 * Code block chrome: the archived language bar and copy control, reimplemented
 * natively so no editor runtime reaches public pages.
 *
 * The block itself is rendered by the parent renderer and passed through the
 * default slot, so the highlighting colours have already been sanitized. Copy
 * prefers the Clipboard API and falls back to a selection command; the status
 * shown is the *actual* outcome (`app/utils/clipboard.ts`), reported through a
 * polite live region. Timers and callbacks are dropped after unmount.
 */
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { copyText } from '~/utils/clipboard'
import type { ClipboardAdapter } from '~/utils/clipboard'

const props = withDefaults(defineProps<{
  language?: string | null
  rawCode?: string
}>(), {
  language: null,
  rawCode: '',
})

const pre = ref<HTMLPreElement | null>(null)
const diagramVisible = ref(false)
const diagramId = useId()
watch(() => props.rawCode, () => { diagramVisible.value = false }, { flush: 'sync' })
const state = ref<'idle' | 'copied' | 'failed'>('idle')
let resetTimer: ReturnType<typeof setTimeout> | undefined
let disposed = false

const label = computed(() => props.language || 'text')
const buttonLabel = computed(() => {
  if (state.value === 'copied') return '已复制'
  if (state.value === 'failed') return '复制失败'
  return '复制'
})
const statusText = computed(() => {
  if (state.value === 'copied') return '代码已复制到剪贴板'
  if (state.value === 'failed') return '复制失败，请手动选择代码'
  return ''
})

const announce = (next: 'copied' | 'failed'): void => {
  if (disposed) return
  state.value = next
  if (resetTimer) clearTimeout(resetTimer)
  resetTimer = setTimeout(() => { state.value = 'idle' }, 2_000)
}

/**
 * Selection-based copy. The reader's own selection is saved and restored, and
 * the command's return value is the result - nothing else is treated as
 * success.
 */
const copySelection = (): boolean => {
  const node = pre.value
  if (!node) return false
  const selection = window.getSelection()
  if (!selection) return false
  const saved = Array.from({ length: selection.rangeCount }, (_value, index) => selection.getRangeAt(index).cloneRange())
  const range = document.createRange()
  range.selectNodeContents(node)
  selection.removeAllRanges()
  selection.addRange(range)
  let copied = false
  try {
    copied = document.execCommand('copy')
  }
  catch {
    copied = false
  }
  selection.removeAllRanges()
  for (const restored of saved) selection.addRange(restored)
  return copied
}

const adapter = (): ClipboardAdapter => ({
  write: typeof navigator !== 'undefined' && navigator.clipboard?.writeText
    ? text => navigator.clipboard.writeText(text)
    : undefined,
  copySelection,
})

const copy = async (): Promise<void> => {
  const text = pre.value?.textContent ?? ''
  const outcome = await copyText(text, adapter())
  if (disposed) return
  announce(outcome)
}

onBeforeUnmount(() => {
  disposed = true
  if (resetTimer) clearTimeout(resetTimer)
})
</script>

<template>
  <div v-if="language === 'mermaid'" class="md-mermaid-wrapper">
    <details :open="!diagramVisible" class="md-diagram-source">
      <summary>Mermaid 图表源码</summary>
      <div class="md-code">
        <div class="md-code-head">
          <span class="md-code-lang">mermaid</span>
          <button
            type="button"
            class="md-code-copy"
            aria-label="复制 mermaid 代码"
            @click="copy"
          >
            {{ buttonLabel }}
          </button>
        </div>
        <pre ref="pre"><slot /></pre>
        <span class="md-code-status" role="status" aria-live="polite">{{ statusText }}</span>
      </div>
    </details>
    <button
      type="button"
      class="md-diagram-toggle"
      :aria-expanded="diagramVisible"
      :aria-controls="diagramId"
      @click="diagramVisible = !diagramVisible"
    >{{ diagramVisible ? '隐藏图表' : '显示图表' }}</button>
    <p class="md-diagram-help">图表源码可直接阅读与复制；启用 JavaScript 后可显示图表。</p>
    <div :id="diagramId" :hidden="!diagramVisible">
      <ClientOnly v-if="diagramVisible">
        <SafeMarkdownMermaid :code="rawCode" />
      </ClientOnly>
    </div>
  </div>
  <div v-else class="md-code">
    <div class="md-code-head">
      <span class="md-code-lang">{{ label }}</span>
      <button
        type="button"
        class="md-code-copy"
        :aria-label="`复制 ${label} 代码`"
        @click="copy"
      >
        {{ buttonLabel }}
      </button>
    </div>
    <pre ref="pre"><slot /></pre>
    <span class="md-code-status" role="status" aria-live="polite">{{ statusText }}</span>
  </div>
</template>

<style scoped>
.md-diagram-source summary {
  cursor: pointer;
  min-height: 44px;
  padding: 0.5rem 0;
}
.md-diagram-source .md-code-head { height: 44px; }
.md-diagram-source .md-code-copy { min-height: 44px; }
.md-diagram-help { font-size: 0.875em; }
.md-diagram-toggle {
  min-height: 44px;
  padding: 0.5rem 0.875rem;
  margin-bottom: 0.5rem;
  border: 1px solid currentColor;
  border-radius: 0.25rem;
  color: #0369a1;
  cursor: pointer;
}
.md-diagram-toggle:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
.dark .md-diagram-toggle { color: #7dd3fc; }
.md-code {
  position: relative;
  margin-bottom: 1.2em;
  border-radius: 0.5rem;
  overflow: hidden;
  background-color: #f3f4f6;
}

.dark .md-code {
  background-color: #111827;
}

.md-code-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  padding: 0 12px;
  font-size: 12px;
  line-height: 1;
  /* Archived md-editor-v3 head bar colour for the default theme. */
  background-color: #282c34;
  color: #a9b7c6;
}

.dark .md-code-head {
  background-color: #1a1a1a;
}

.md-code-lang {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-transform: lowercase;
}

.md-code-copy {
  min-height: 24px;
  padding: 0 8px;
  border-radius: 4px;
  font-size: 12px;
  color: inherit;
  cursor: pointer;
  transition: color 0.15s, background-color 0.15s;
}

.md-code-copy:hover {
  color: #fff;
  background-color: rgb(255 255 255 / 0.12);
}

.md-code-status {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.md-code :deep(pre) {
  margin: 0;
  padding: 0.75rem 1rem;
  overflow-x: auto;
  background: transparent;
}
</style>
