<script setup lang="ts">
/**
 * Lazy, client-only Mermaid diagram renderer for public Markdown.
 *
 * `mermaid` is only imported dynamically when a document actually contains a
 * fenced `mermaid` code block. Initial cold route loads of `/activity/:id` for
 * articles without diagrams pay 0 bytes of client JavaScript.
 *
 * Strict mode, no HTML labels, unadopted stylesheet parsing and DOMPurify
 * sanitization mirror the admin editor runtime (`admin-editor-runtime.ts`).
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  code: string
}>()

const renderedSvg = ref('')
const renderError = ref<string | null>(null)
const loading = ref(true)
const showSource = ref(false)

const diagramPresentation = new Set([
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray',
  'stroke-linecap', 'stroke-linejoin', 'opacity', 'color', 'font-family', 'font-size', 'font-weight', 'font-style',
  'text-anchor', 'text-align', 'dominant-baseline', 'alignment-baseline', 'background-color', 'line-height',
])

let observer: MutationObserver | null = null
let currentRenderToken = 0

const renderDiagram = async (): Promise<void> => {
  const token = ++currentRenderToken
  loading.value = true
  renderError.value = null

  const trimmed = props.code.trim()
  if (!trimmed) {
    loading.value = false
    renderedSvg.value = ''
    return
  }

  try {
    const [mermaidModule, domPurifyModule] = await Promise.all([
      import('mermaid'),
      import('dompurify'),
    ])
    const mermaid = mermaidModule.default
    const DOMPurify = domPurifyModule.default

    if (token !== currentRenderToken) return

    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      maxTextSize: 50_000,
      maxEdges: 500,
      theme: isDark ? 'dark' : 'default',
      secure: [
        'securityLevel', 'startOnLoad', 'maxTextSize', 'maxEdges',
        'htmlLabels', 'flowchart', 'themeCSS', 'fontFamily', 'altFontFamily', 'themeVariables',
      ],
    })

    const id = `mermaid-public-${Math.random().toString(36).slice(2, 9)}`
    const { svg: rawSvg } = await mermaid.render(id, trimmed)

    if (token !== currentRenderToken) return

    const template = document.createElement('template')
    template.innerHTML = DOMPurify.sanitize(rawSvg, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ['foreignObject'],
    })

    const root = template.content.querySelector('svg')
    if (root) {
      for (const style of root.querySelectorAll('style')) {
        const sheet = new CSSStyleSheet()
        sheet.replaceSync(style.textContent ?? '')
        for (const rule of sheet.cssRules) {
          if (!(rule instanceof CSSStyleRule)) continue
          let targets: Element[]
          try {
            targets = [...(root.matches(rule.selectorText) ? [root] : []), ...root.querySelectorAll(rule.selectorText)]
          }
          catch {
            continue
          }
          for (const property of rule.style) {
            const value = rule.style.getPropertyValue(property)
            if (!diagramPresentation.has(property) || /url\s*\(|expression\s*\(|@|\\/i.test(value)) continue
            for (const target of targets) {
              if (target instanceof SVGElement) {
                target.style.setProperty(property, value, rule.style.getPropertyPriority(property))
              }
            }
          }
        }
        style.remove()
      }

      renderedSvg.value = DOMPurify.sanitize(root.outerHTML, {
        USE_PROFILES: { svg: true, svgFilters: true },
        FORBID_TAGS: ['style', 'foreignObject'],
      })
    }
    else {
      renderedSvg.value = ''
    }
  }
  catch (error) {
    if (token !== currentRenderToken) return
    renderError.value = error instanceof Error ? error.message : '图表渲染失败'
  }
  finally {
    if (token === currentRenderToken) {
      loading.value = false
    }
  }
}

onMounted(() => {
  renderDiagram()
  if (typeof document !== 'undefined') {
    observer = new MutationObserver(() => {
      renderDiagram()
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
  }
})

onBeforeUnmount(() => {
  currentRenderToken += 1
  if (observer) {
    observer.disconnect()
    observer = null
  }
})

watch(() => props.code, () => {
  nextTick(renderDiagram)
})
</script>

<template>
  <div class="safe-mermaid my-6">
    <!-- eslint-disable vue/no-v-html -->
    <div
      v-if="renderedSvg"
      class="mermaid-container flex justify-center overflow-x-auto p-4 rounded-lg bg-gray-50/50 dark:bg-slate-800/40 border border-gray-100 dark:border-slate-800"
      v-html="renderedSvg"
    />
    <!-- eslint-enable vue/no-v-html -->
    <div
      v-else-if="renderError"
      class="mermaid-error p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-sm"
    >
      <div class="flex items-center justify-between mb-2">
        <span class="font-medium">流程图渲染错误</span>
        <button
          type="button"
          class="text-xs px-2 py-1 rounded bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-800/50 transition"
          @click="showSource = !showSource"
        >
          {{ showSource ? '隐藏源码' : '查看源码' }}
        </button>
      </div>
      <p class="text-xs font-mono opacity-80 mb-2">{{ renderError }}</p>
      <pre
        v-if="showSource"
        class="font-mono text-xs bg-black/5 dark:bg-black/30 p-2 rounded overflow-x-auto mt-2 text-gray-800 dark:text-gray-200"
      >{{ code }}</pre>
    </div>
    <div
      v-else-if="loading"
      class="mermaid-loading py-8 text-center text-gray-400 dark:text-gray-500 text-xs font-mono"
    >
      加载图表中...
    </div>
  </div>
</template>

<style scoped>
.safe-mermaid :deep(svg) {
  max-width: 100%;
  height: auto;
}
</style>
