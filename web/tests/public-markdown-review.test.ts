import { describe, expect, it } from 'vitest'
import { renderSafeMarkdown } from '../server/utils/markdown'
import { preprocessMath } from '../server/utils/public-math'
import type { SafeMarkdownNode } from '../shared/markdown'
const elements = (nodes: readonly SafeMarkdownNode[]): Extract<SafeMarkdownNode, { type: 'element' }>[] => nodes.flatMap(n => n.type === 'element' ? [n, ...elements(n.children)] : [])
const text = (nodes: readonly SafeMarkdownNode[]): string => nodes.map(n => n.type === 'text' ? n.value : text(n.children)).join('')

describe('independent public math acceptance', () => {
  it.each([
    '<a href="/cost/$x$" title="$price$">cost</a>',
    '``code `$x$` remains code``',
    '````text\n```js\n$x$\n```\n````',
    '~~~text\n$x$\n',
  ])('does not rewrite protected Markdown or HTML: %s', source => {
    expect(preprocessMath(source)).toBe(source)
  })
  it('keeps currency beside a real inline formula', async () => {
    const source = '价格$5，公式$x+1$，结束。'
    const result = await renderSafeMarkdown(source)
    expect(result.complete).toBe(true)
    expect(text(result.nodes)).toContain('价格$5，公式')
    expect(text(result.nodes)).toContain('结束。')
    expect(elements(result.nodes).some(n => n.props.class === 'katex')).toBe(true)
  })
  it('keeps a formula accessible through real MathML and its TeX annotation', async () => {
    const result = await renderSafeMarkdown('$x+1$')
    expect(elements(result.nodes).some(n => n.tag === 'math')).toBe(true)
    expect(elements(result.nodes).some(n => n.tag === 'annotation' && text(n.children) === 'x+1')).toBe(true)
  })
  it('does not lose the generated radical while still dropping authored SVG', async () => {
    const result = await renderSafeMarkdown('$\\sqrt{x}$\n\n<svg><path d="M0 0" /></svg>')
    const paths = elements(result.nodes).filter(n => n.tag === 'path')
    expect(paths.length).toBeGreaterThan(0)
    expect(paths.every(n => typeof n.props.d === 'string' && n.props.d.length > 10)).toBe(true)
    expect(paths.some(n => n.props.d === 'M0 0')).toBe(false)
  })
  it('does not grant positioning to forged author KaTeX classes', async () => {
    const result = await renderSafeMarkdown('<span class="katex" style="position:absolute;top:-1000px;height:9999px">forged</span>')
    expect(text(result.nodes)).toContain('forged')
    expect(elements(result.nodes).some(n => typeof n.props.style === 'string' && /position|top|height/.test(n.props.style))).toBe(false)
  })
  it('bounds aggregate formula work and preserves the whole over-budget article', async () => {
    const source = Array.from({ length: 200 }, () => '$x$').join(' ')
    const result = await renderSafeMarkdown(source)
    expect(result.complete).toBe(false)
    expect(text(result.nodes)).toBe(source)
  })
})
