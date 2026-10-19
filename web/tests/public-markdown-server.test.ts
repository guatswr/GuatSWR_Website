/**
 * End-to-end server Markdown pipeline: MDC parse -> server highlighting ->
 * shared sanitizer, including the budget fallbacks.
 *
 * These are the paths that decide what an article actually contains, so the
 * assertions are about content completeness (nothing silently dropped) and
 * about what may reach the DOM. Written but not run here; `@nuxtjs/mdc` and
 * `shiki` are declared dependencies of the server.
 */
import { describe, expect, it } from 'vitest'
import { astWithinBudget, renderSafeMarkdown } from '../server/utils/markdown'
import type { SafeMarkdownNode } from '../shared/markdown'

const flatten = (nodes: readonly SafeMarkdownNode[]): string => nodes
  .map(node => (node.type === 'text' ? node.value : flatten(node.children)))
  .join('')

const find = (nodes: readonly SafeMarkdownNode[], tag: string): SafeMarkdownNode[] =>
  nodes.flatMap(node => (node.type === 'text'
    ? []
    : [...(node.tag === tag ? [node] : []), ...find(node.children, tag)]))

describe('server markdown pipeline', () => {
  it('highlights a fenced block and sanitizes its colour tokens', async () => {
    const result = await renderSafeMarkdown('```js\nconst answer = 42 // comment\n```')
    expect(result.complete).toBe(true)
    const [pre] = find(result.nodes, 'pre')
    expect(pre?.props.class).toBe('language-javascript')
    const coloured = find(result.nodes, 'span').filter(node => typeof node.props.style === 'string')
    expect(coloured.length).toBeGreaterThan(0)
    for (const span of coloured) expect(span.props.style).toMatch(/^color: #[0-9a-f]{3,8}$/)
    const serialized = JSON.stringify(result.nodes)
    expect(serialized).not.toContain('background-color')
    expect(serialized).not.toContain('tabindex')
    expect(flatten(result.nodes)).toContain('const answer = 42 // comment')
  })

  it('keeps an unsupported language readable as plain text', async () => {
    const result = await renderSafeMarkdown('```brainfuck\n+++[>+<-]\n```')
    const [pre] = find(result.nodes, 'pre')
    expect(pre?.props.class).toBe('language-brainfuck')
    expect(find(result.nodes, 'span')).toEqual([])
    expect(flatten(result.nodes)).toContain('+++[>+<-]')
  })

  it('keeps malicious fence content as text, never as markup', async () => {
    const result = await renderSafeMarkdown('```html\n<script>alert(1)</script>\n```')
    expect(flatten(result.nodes)).toContain('<script>alert(1)</script>')
    for (const tag of ['script', 'iframe', 'svg', 'form', 'input']) {
      expect(find(result.nodes, tag), tag).toEqual([])
    }
  })

  it('renders raw HTML links and images through the allowlist', async () => {
    const result = await renderSafeMarkdown('[x](javascript:alert(1))\n\n<img src="https://cdn.example/a.png" onerror="steal()">')
    expect(find(result.nodes, 'a').every(node => node.props.href === undefined)).toBe(true)
    expect(find(result.nodes, 'img')).toEqual([])
    expect(JSON.stringify(result.nodes)).not.toContain('onerror')
  })

  it.each([
    '<img src="/uploads/fixture.png" onerror="steal()">',
    '<img src=x onerror="steal()">', '<br>', '<hr>',
    '<input type="checkbox" disabled>', '<input type="text">',
  ])('keeps authored text following a raw HTML void element: %s', async tag => {
    const result = await renderSafeMarkdown(`正文之前\n\n${tag}\n正文之后`)
    expect(result.complete).toBe(true)
    expect(flatten(result.nodes)).toContain('正文之前')
    expect(flatten(result.nodes)).toContain('正文之后')
    expect(JSON.stringify(result.nodes)).not.toContain('onerror')
    expect(find(result.nodes, 'input').every(node => node.props.disabled === true && node.props.type === 'checkbox')).toBe(true)
    expect(find(result.nodes, 'img').every(node => node.children.length === 0)).toBe(true)
  })

  it('falls back to the whole article when nesting exceeds the walk budget', async () => {
    const nested = `${'>'.repeat(80)} SENTINEL-DEEP`
    const result = await renderSafeMarkdown(nested)
    expect(result.complete).toBe(false)
    expect(flatten(result.nodes)).toContain('SENTINEL-DEEP')
    expect(find(result.nodes, 'blockquote')).toEqual([])
  })

  it('never truncates an oversized article', async () => {
    const body = `${'a'.repeat(200_001)}SENTINEL-TAIL`
    const result = await renderSafeMarkdown(body)
    expect(result.complete).toBe(false)
    const rendered = flatten(result.nodes)
    expect(rendered).toContain('SENTINEL-TAIL')
    expect(rendered).toHaveLength(body.length)
  })

  it('bounds the parsed tree iteratively, before any recursive walk', () => {
    const deep: { type: string, tag: string, props: object, children: unknown[] } = {
      type: 'element', tag: 'blockquote', props: {}, children: [],
    }
    let cursor = deep
    for (let index = 0; index < 60; index += 1) {
      const child = { type: 'element', tag: 'blockquote', props: {}, children: [] as unknown[] }
      cursor.children.push(child)
      cursor = child
    }
    expect(astWithinBudget(deep)).toBe(false)
    expect(astWithinBudget({ type: 'element', tag: 'p', props: {}, children: [{ type: 'text', value: 'x' }] })).toBe(true)
    expect(astWithinBudget(undefined)).toBe(true)
    expect(astWithinBudget({
      type: 'root',
      children: Array.from({ length: 40_001 }, () => ({ type: 'text', value: 'x' })),
    })).toBe(false)
  })
})
