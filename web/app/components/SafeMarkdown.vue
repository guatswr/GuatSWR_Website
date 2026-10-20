<script setup lang="ts">
/**
 * Archived Markdown typography, without the editor runtime.
 *
 * Values are ported from the archived `ActivityDetail.vue` scoped overrides
 * and the base rules of the `md-editor-v3` preview theme that page used. No
 * editor/highlighter CSS or JavaScript is imported: the tree arrives already
 * parsed and allowlisted from `/api/content/activity/:id`.
 */
import type { SafeMarkdownNode } from '#shared/markdown'
import 'katex/dist/katex.min.css'

withDefaults(defineProps<{
  nodes: readonly SafeMarkdownNode[]
  /**
   * The archived history card injected the stored description straight into a
   * div that already carried the card's own `text-[15px] md:text-base` /
   * `leading-7 md:leading-8`; the prose wrapper must not impose its own
   * paragraph metrics there.
   */
  inheritTypography?: boolean
}>(), {
  inheritTypography: false,
})
</script>

<template>
  <div
    class="safe-markdown"
    :class="{ 'is-inherit-typography': inheritTypography }"
  >
    <SafeMarkdownNode
      v-for="(node, index) in nodes"
      :key="index"
      :node="node"
    />
  </div>
</template>

<style scoped>
/* Every rendered node comes from `SafeMarkdownNode`'s render function, i.e.
   from a *child* component, so scoped descendant selectors would never match
   them. `:deep()` is required for all nested prose elements - the wrapper class
   itself stays scoped. */
.safe-markdown {
  font-family: inherit;
  color: #374151;
  background: transparent;
  /* md-editor-v3 `.md-editor-preview { font-size:16px; word-break:break-all;
     overflow:hidden }`. The clipping matters: it is what keeps the first and
     last child's margins inside the measured preview box. */
  overflow: hidden;
  word-break: break-all;
}

.dark .safe-markdown {
  color: #e5e7eb;
}

.safe-markdown :deep(h1),
.safe-markdown :deep(h2),
.safe-markdown :deep(h3) {
  margin-top: 1.5em;
  margin-bottom: 0.8em;
  font-weight: 700;
  color: #1f2937;
  word-break: break-all;
  position: relative;
}

.safe-markdown :deep(h4),
.safe-markdown :deep(h5),
.safe-markdown :deep(h6) {
  margin: 1.4em 0 0.8em;
  font-weight: bold;
  word-break: break-all;
  position: relative;
}

.dark .safe-markdown :deep(h1),
.dark .safe-markdown :deep(h2),
.dark .safe-markdown :deep(h3) {
  color: #f3f4f6;
}

.safe-markdown :deep(h1) { font-size: 2em; }
.safe-markdown :deep(h2) { font-size: 1.5em; }
.safe-markdown :deep(h3) { font-size: 1.25em; }
.safe-markdown :deep(h4) { font-size: 1em; }
.safe-markdown :deep(h5) { font-size: 0.875em; }
.safe-markdown :deep(h6) { font-size: 0.85em; }

.safe-markdown :deep(p) {
  /* md-editor-v3 `div.default-theme p`. Inside the archived preview this rule
     has the same specificity as the page's own `[data-v] p` rule and comes
     later in the cascade, so it - not the page's 1.2em - is what the browser
     actually applied to a paragraph. */
  margin: 0.5rem 0;
  line-height: 1.6;
}

.safe-markdown :deep(ul),
.safe-markdown :deep(ol) {
  margin-bottom: 1.2em;
  padding-left: 1.5em;
}

.safe-markdown :deep(ul) { list-style: disc; }
.safe-markdown :deep(ol) { list-style: decimal; }

.safe-markdown :deep(blockquote) {
  margin-bottom: 1.2em;
  border-left: 4px solid #ef4444;
  background-color: #f9fafb;
  padding: 0.5em 1em;
  color: #6b7280;
}

.dark .safe-markdown :deep(blockquote) {
  background-color: #0f172a;
  color: #cbd5f5;
}

.safe-markdown :deep(a) {
  color: #2d8cf0;
  text-decoration: none;
  transition: color 0.3s;
}

.dark .safe-markdown :deep(a) {
  color: #93c5fd;
}

.safe-markdown :deep(img) {
  max-width: 100%;
}

/* md-editor-v3 renders an image that is alone in its paragraph as
   `figure > img` and gives that figure and image their own chrome
   (`.md-editor-preview figure` + `div.default-theme img`). The tree here keeps
   the paragraph, so the identical box is produced from `p:has(> img:only-child)`. */
.safe-markdown :deep(p:has(> img:only-child)) {
  display: inline-flex;
  flex-direction: column;
  margin: 0 0 1em;
  text-align: center;
}

.safe-markdown :deep(p:has(> img:only-child) > img) {
  box-sizing: border-box;
  margin: 0 auto;
  padding: 5px;
  border: 1px solid #e6e6e6;
  border-radius: 3px;
}

.safe-markdown :deep(hr) {
  height: 1px;
  margin: 10px 0;
  border: none;
  border-top: 1px solid #e6e6e6;
}

.dark .safe-markdown :deep(hr) {
  border-top-color: #334155;
}

.safe-markdown :deep(code) {
  color: #3594f7;
  background-color: rgba(59, 170, 250, 0.1);
  border-radius: 2px;
  padding: 0 4px;
  line-height: 22px;
}

.dark .safe-markdown :deep(code) {
  color: #e2e8f0;
  background-color: #0b1220;
}

/* Block-level code styling lives in `SafeMarkdownPre.vue`, which owns the
   language bar, the copy control and the archived grey block background. */

/* GFM task lists: the checkbox is inert and the marker is removed (archived). */
.safe-markdown :deep(li.task-list-item) {
  list-style-type: none;
}

.safe-markdown :deep(li.task-list-item input[type='checkbox']) {
  margin-left: -1.5em;
  margin-right: 0.1em;
}

/* Code-fence text is text: reset the inline-code treatment inside a fence. */
.safe-markdown :deep(pre code) {
  color: inherit;
  background: none;
  padding: 0;
  border-radius: 0;
  font-size: 0.875em;
  line-height: 1.75;
}

.safe-markdown :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1.2em;
}

.safe-markdown :deep(th),
.safe-markdown :deep(td) {
  border: 1px solid #e6e6e6;
  padding: 0.35em 0.6em;
}

.dark .safe-markdown :deep(th),
.dark .safe-markdown :deep(td) {
  border-color: #2d2d2d;
}

.safe-markdown :deep(tbody tr:nth-child(2n)) {
  background-color: #fafafa;
}

.dark .safe-markdown :deep(tbody tr:nth-child(2n)) {
  background-color: #111827;
}

.safe-markdown :deep(.katex-display) {
  margin: 1em 0;
  /* Scroll clipping must retain the last raster row of tall delimiters.
     Trade one pixel of bottom margin for padding, preserving prose geometry. */
  margin-bottom: calc(1em - 1px);
  padding-bottom: 1px;
  overflow-x: auto;
  overflow-y: hidden;
}

.safe-markdown :deep(.katex) {
  /* Archived KaTeX stylesheet's 1.21em ratio; retain its glyph geometry. */
  font-size: 1.21em;
  text-rendering: auto;
}

/* The archived history card injected the sanitized description into a div that
   already carried the card's own typography, so the wrapper adds no metrics of
   its own there. */
.safe-markdown.is-inherit-typography {
  word-break: normal;
  overflow: visible;
}

.safe-markdown.is-inherit-typography :deep(p) {
  margin: 0;
  line-height: inherit;
}
</style>
