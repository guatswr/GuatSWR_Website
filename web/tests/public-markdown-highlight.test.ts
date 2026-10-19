/**
 * Server highlighting + sanitizer contract.
 *
 * Runs the real installed `shiki` highlighter (explicit theme/langs, JavaScript
 * engine) and then the shared sanitizer over its output, proving that coloured
 * tokens survive the allowlist while nothing else does. The browser never
 * receives the highlighter: only the reduced native tree leaves the server.
 *
 * Written but not run here (no `node_modules` in this worktree); `shiki` is
 * declared as a direct server dependency centrally before the suite runs.
 */
import { describe, expect, it } from 'vitest'
import { HIGHLIGHT_LANGUAGES, highlightCode } from '../server/utils/highlight'
import { sanitizeMarkdownAst } from '#shared/markdown'
import type { RawMarkdownNode, SafeMarkdownElement, SafeMarkdownNode } from '#shared/markdown'

const findElements = (nodes: readonly SafeMarkdownNode[], tag: string): SafeMarkdownElement[] =>
  nodes.flatMap(node => (node.type === 'text'
    ? []
    : [...(node.tag === tag ? [node] : []), ...findElements(node.children, tag)]))

const flattenText = (nodes: readonly SafeMarkdownNode[]): string => nodes
  .map(node => (node.type === 'text' ? node.value : flattenText(node.children)))
  .join('')

describe('server code highlighting', () => {
  it('colours a supported language and keeps only safe tokens', async () => {
    const highlighted = await highlightCode('const answer = 42 // comment\n', 'js')
    expect(highlighted).not.toBeNull()

    const result = sanitizeMarkdownAst([highlighted as RawMarkdownNode])
    const [pre] = findElements(result.nodes, 'pre')
    expect(pre?.props.class).toBe('language-javascript')

    const spans = findElements(result.nodes, 'span')
    const coloured = spans.filter(span => typeof span.props.style === 'string')
    expect(coloured.length).toBeGreaterThan(0)
    for (const span of coloured) {
      expect(span.props.style).toMatch(/^(?:color: #[0-9a-f]{3,8}|font-style: \w+|--shiki-[a-z-]+: #[0-9a-f]{3,8})$/)
    }

    // Shiki emits one span per token, so the source is asserted as flattened
    // text rather than as a substring of the serialized tree.
    expect(flattenText(result.nodes)).toContain('const answer = 42 // comment')
    const serialized = JSON.stringify(result.nodes)
    // Theme chrome must not survive: no background, no tabindex, no class.
    expect(serialized).not.toContain('background-color')
    expect(serialized).not.toContain('tabindex')
    expect(serialized).not.toContain('"class":"shiki')
  })

  it('falls back to readable plain text for unknown or oversized input', async () => {
    expect(await highlightCode('x = 1', 'not-a-language')).toBeNull()
    // Oversized fences keep their plain text instead of occupying the render path.
    expect(await highlightCode('a'.repeat(20_001), 'js')).toBeNull()
  })

  it('never resolves inherited object keys as a language', async () => {
    for (const hostile of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf', 'prototype']) {
      expect(await highlightCode('x = 1', hostile), hostile).toBeNull()
    }
  })

  it('loads only the declared languages', () => {
    expect(HIGHLIGHT_LANGUAGES).toContain('javascript')
    expect(HIGHLIGHT_LANGUAGES).toContain('typescript')
    expect(HIGHLIGHT_LANGUAGES).toContain('vue')
    expect(HIGHLIGHT_LANGUAGES).not.toContain('brainfuck')
  })
})
