/**
 * Sanitized-node renderer, extracted from `SafeMarkdownNode.vue` so it can be
 * rendered to real markup in tests without a Single-File-Component pipeline.
 * It lives under `utils/` (not `components/`) so the component auto-import
 * scanner never sees a module without a default export.
 *
 * `h(tag, props, children)` is used with a *string* tag rather than
 * `<component :is>`: Vue resolves registered components only through the
 * template compiler, so a plain string can only ever create a native element -
 * a sanitizer bug cannot turn article content into an app or admin component.
 * The tag allowlist and the checkbox shape are both re-checked here, so this
 * renderer is safe even if it is handed a tree that did not come from the
 * server sanitizer.
 */
import { h } from 'vue'
import type { VNode, VNodeChild } from 'vue'
// Nuxt's `#shared` alias (not a relative path): `web/shared` sits outside the
// Vite app root, so a relative import of it is emitted into the Nitro chunk as
// an unresolvable path. Vitest aliases `#shared` too, so the focused
// `vue/server-renderer` tests still load this module.
import { isSafeMarkdownTag, safeTaskCheckboxProps, textContent } from '#shared/markdown'
import type { SafeMarkdownNode } from '#shared/markdown'

/** Renders a fenced block's chrome; injected so this module stays SFC-free. */
export type PreRenderer = (language: string | null, children: VNodeChild[], rawCode?: string) => VNode

const languageOf = (node: SafeMarkdownNode): string | null => {
  if (node.type !== 'element') return null
  const className = node.props.class
  return typeof className === 'string' && className.startsWith('language-')
    ? className.slice('language-'.length) || null
    : null
}

export function renderSafeNode(node: SafeMarkdownNode, renderPre: PreRenderer): VNode | string | null {
  if (node.type === 'text') return node.value
  // Closed checkbox branch, checked before the generic tag allowlist.
  if (node.tag === 'input') {
    const props = safeTaskCheckboxProps(node.props)
    if (!props || node.children.length > 0) return null
    return h('input', { ...props })
  }
  if (!isSafeMarkdownTag(node.tag)) return null
  const children: VNodeChild[] = node.children.map(child => renderSafeNode(child, renderPre))
  if (node.tag === 'pre') {
    const language = languageOf(node)
    const rawCode = language === 'mermaid' ? textContent(node.children) : undefined
    return renderPre(language, children, rawCode)
  }
  return h(node.tag, { ...node.props }, children)
}
