/**
 * Server-only Markdown rendering.
 *
 * The installed `@nuxtjs/mdc` parser runs here, on the server, exactly once per
 * request. Its output is immediately reduced by the shared allowlist
 * (`#shared/markdown`), so the browser only ever receives native prose nodes:
 *
 * - no parser or highlighter code is shipped to public pages,
 * - frontmatter, MDC component syntax and `{...}` bindings never reach the DOM,
 * - the parser instance is created once per process and reused.
 *
 * Article text is never silently truncated. When a budget is exceeded - an
 * oversized body or a sanitizer node/depth limit - the whole article is
 * returned as escaped plain text instead, and `complete` reports that the rich
 * rendering did not cover the document.
 *
 * Code fences are highlighted on the server by `./highlight` (shiki, explicit
 * theme/languages, no browser parser and no anonymous highlight endpoint). The
 * colour tokens it emits are validated by the same narrow
 * `color`/`font-*`/`--shiki-*` allowlist as everything else, and unsupported
 * languages keep their plain text.
 */
import { parseMarkdown } from '@nuxtjs/mdc/runtime'
import { plainTextAst, sanitizeMarkdownAst } from '#shared/markdown'
import type { RawMarkdownNode, SafeMarkdownResult } from '#shared/markdown'
import { highlightCode } from './highlight'

/** Parse bound: protects the render path from one oversized record. */
const MAX_PARSE_LENGTH = 200_000
/** Bound on highlighting work per document (CPU, not correctness). */
const MAX_HIGHLIGHTED_BLOCKS = 24
/**
 * Bounds on the parsed tree *before* any highlighting or sanitizing walk, so a
 * pathologically nested document cannot exhaust the call stack. Exceeding
 * either budget falls back to the whole article as escaped plain text.
 */
const MAX_AST_DEPTH = 48
const MAX_AST_NODES = 40_000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * MDC 0.23.2's compiler drops every root text node, including genuine prose
 * following a raw HTML void tag. Wrap non-whitespace root text in a native
 * inline span after rehype-raw and before compilation. Keep it as text; never
 * reinterpret it as HTML/MDC. The usual sanitizer still checks the whole tree.
 */
function preserveRootProse() {
  return (tree: unknown) => {
    if (!isRecord(tree) || tree.type !== 'root' || !Array.isArray(tree.children)) return
    tree.children = tree.children.map(child => isRecord(child) && child.type === 'text'
      && typeof child.value === 'string' && child.value.trim()
      ? { type: 'element', tagName: 'span', properties: {}, children: [child] } : child)
  }
}

/**
 * Iterative (non-recursive) budget check: returns `false` as soon as the tree
 * is deeper or larger than the render path is willing to walk.
 */
export const astWithinBudget = (root: unknown): boolean => {
  const stack: { node: unknown, depth: number }[] = [{ node: root, depth: 0 }]
  let visited = 0
  while (stack.length > 0) {
    const entry = stack.pop()
    if (!entry) break
    const { node, depth } = entry
    visited += 1
    if (visited > MAX_AST_NODES || depth > MAX_AST_DEPTH) return false
    if (!isRecord(node)) continue
    const children = node.children
    if (!Array.isArray(children)) continue
    for (const child of children) stack.push({ node: child, depth: depth + 1 })
  }
  return true
}

const textOf = (node: RawMarkdownNode): string => {
  if (node.type === 'text') return typeof node.value === 'string' ? node.value : ''
  const children = Array.isArray(node.children) ? node.children as RawMarkdownNode[] : []
  return children.map(textOf).join('')
}

const languageOf = (node: RawMarkdownNode): string | null => {
  const props = isRecord(node.props) ? node.props : {}
  if (typeof props.language === 'string' && props.language) return props.language
  const className = props.className ?? props.class
  const first = Array.isArray(className) ? className[0] : className
  const matched = typeof first === 'string' ? /^language-([a-z0-9+#._-]+)$/i.exec(first) : null
  return matched?.[1] ?? null
}

/**
 * Replace each fenced block with its highlighted equivalent *before*
 * sanitizing, so the highlighter's output passes through exactly the same
 * allowlist as every other node.
 */
const highlightBlocks = async (node: unknown, budget: { blocks: number }): Promise<void> => {
  if (!isRecord(node)) return
  const children = node.children
  if (!Array.isArray(children)) return
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]
    if (!isRecord(child) || child.type !== 'element') continue
    const element = child as RawMarkdownNode
    if (typeof element.tag !== 'string') continue
    if (element.tag.toLowerCase() !== 'pre') {
      await highlightBlocks(element, budget)
      continue
    }
    if (budget.blocks >= MAX_HIGHLIGHTED_BLOCKS) continue
    const language = languageOf(element)
    if (!language) continue
    const props = isRecord(element.props) ? element.props : {}
    const code = typeof props.code === 'string' ? props.code : textOf(element)
    if (!code) continue
    budget.blocks += 1
    const highlighted = await highlightCode(code, language)
    if (highlighted) children[index] = highlighted
  }
}

const plainResult = (source: string): SafeMarkdownResult => ({
  nodes: plainTextAst(source),
  headings: [],
  complete: false,
})

export async function renderSafeMarkdown(markdown: string): Promise<SafeMarkdownResult> {
  const source = typeof markdown === 'string' ? markdown : ''
  if (!source.trim()) return { nodes: [], headings: [], complete: true }
  // Not truncated: the caller falls back to the whole text.
  if (source.length > MAX_PARSE_LENGTH) return plainResult(source)
  try {
    // MDC's own highlight plugin stays off (it is disabled in this project's
    // module defaults anyway); `./highlight` colours the fences explicitly.
    const parsed = await parseMarkdown(source, { highlight: false, configs: [{
      unified: { post: processor => processor.use(preserveRootProse) },
    }] })
    // `parsed.data` (frontmatter) is intentionally ignored: it is parser output
    // from user content, never render configuration.
    // Refuse to walk a pathological tree: the whole article is returned as
    // escaped plain text by the caller instead of being silently cut short.
    if (!astWithinBudget(parsed.body)) return plainResult(source)
    await highlightBlocks(parsed.body, { blocks: 0 })
    const result = sanitizeMarkdownAst(parsed.body)
    return result.complete ? result : plainResult(source)
  }
  catch {
    // A parser failure must still render readable text rather than a 502.
    return plainResult(source)
  }
}
