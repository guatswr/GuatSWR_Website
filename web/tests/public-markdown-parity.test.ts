/**
 * Public Markdown parity tests for formulas (KaTeX) and diagrams (Mermaid).
 *
 * Verifies that:
 * 1. KaTeX renders server-side into sanitized native AST nodes without leaking
 *    arbitrary styles, active tags or requiring client-side parser JS.
 * 2. Display math, inline math, and ```math/katex fenced blocks are correctly
 *    preprocessed and rendered.
 * 3. Ordinary currency ($5, $10.50), inline code (`$var`), code fences (```bash)
 *    and escaped dollars (\$) are never corrupted.
 * 4. Fenced ```mermaid blocks are preserved as language-mermaid with raw diagram
 *    code for client-side rendering (never sent to shiki).
 * 5. Formula errors degrade gracefully with error tokens, never throwing 500/502.
 */
import { describe, expect, it } from 'vitest'
import { preprocessMath, renderSafeMarkdown } from '../server/utils/markdown'
import type { SafeMarkdownNode } from '../shared/markdown'

const flatten = (nodes: readonly SafeMarkdownNode[]): string => nodes
  .map(node => (node.type === 'text' ? node.value : flatten(node.children)))
  .join('')

const find = (nodes: readonly SafeMarkdownNode[], tag: string): SafeMarkdownNode[] =>
  nodes.flatMap(node => (node.type === 'text'
    ? []
    : [...(node.tag === tag ? [node] : []), ...find(node.children, tag)]))

describe('public markdown formula (KaTeX) parity', () => {
  it('renders inline math $...$ into safe KaTeX spans', async () => {
    const result = await renderSafeMarkdown('质能方程 $E=mc^2$ 是著名的物理公式。')
    expect(result.complete).toBe(true)
    const spans = find(result.nodes, 'span')
    const katexSpans = spans.filter(s => typeof s.props.class === 'string' && s.props.class.includes('katex'))
    expect(katexSpans.length).toBeGreaterThan(0)
    expect(flatten(result.nodes)).toContain('E')
    expect(flatten(result.nodes)).toContain('m')
    expect(flatten(result.nodes)).toContain('c')
    expect(flatten(result.nodes)).toContain('2')
    // No script, svg, iframe or unsafe tags
    for (const tag of ['script', 'iframe', 'svg', 'form']) {
      expect(find(result.nodes, tag)).toEqual([])
    }
  })

  it('renders display math $$...$$ with katex-display wrapper', async () => {
    const result = await renderSafeMarkdown('求和公式：\n\n$$\n\\sum_{i=1}^n x_i\n$$\n\n结束。')
    expect(result.complete).toBe(true)
    const spans = find(result.nodes, 'span')
    const displaySpans = spans.filter(s => typeof s.props.class === 'string' && s.props.class.includes('katex-display'))
    expect(displaySpans.length).toBeGreaterThan(0)
    // Strut and sizing styles survive
    const styled = spans.filter(s => typeof s.props.style === 'string')
    expect(styled.length).toBeGreaterThan(0)
    for (const s of styled) {
      expect(typeof s.props.style).toBe('string')
      expect(s.props.style).not.toContain('url(')
      expect(s.props.style).not.toContain('javascript:')
    }
  })

  it('renders fenced ```math and ```katex code blocks', async () => {
    const result = await renderSafeMarkdown('```math\n\\int_0^1 x dx\n```\n\n```katex\n\\alpha + \\beta\n```')
    expect(result.complete).toBe(true)
    const spans = find(result.nodes, 'span')
    const displaySpans = spans.filter(s => typeof s.props.class === 'string' && s.props.class.includes('katex-display'))
    expect(displaySpans.length).toBe(2)
  })

  it('preserves currency ($5, $100.50), inline code ($var) and code blocks (echo $HOME)', async () => {
    const source = [
      '一件衣服 $50，另一件 $100.50。',
      '在终端运行 `$env:PATH = "..."` 设置环境变量。',
      '使用 \\$100 表示原义美元。',
      '```bash',
      'echo $USER',
      'echo $HOME',
      '```',
    ].join('\n\n')

    const preprocessed = preprocessMath(source)
    expect(preprocessed).toContain('$50')
    expect(preprocessed).toContain('$100.50')
    expect(preprocessed).toContain('`$env:PATH = "..."`')
    expect(preprocessed).toContain('\\$100')
    expect(preprocessed).toContain('echo $USER')

    const result = await renderSafeMarkdown(source)
    expect(result.complete).toBe(true)
    const text = flatten(result.nodes)
    expect(text).toContain('50')
    expect(text).toContain('100.50')
    expect(text).toContain('$env:PATH')
    expect(text).toContain('echo $USER')
  })

  it('handles formula syntax errors gracefully without throwing', async () => {
    const result = await renderSafeMarkdown('$\\invalidCommand{test}$')
    expect(result.complete).toBe(true)
    const spans = find(result.nodes, 'span')
    expect(spans.length).toBeGreaterThan(0)
    // Error token rendered safely in red
    const redSpans = spans.filter(s => typeof s.props.style === 'string' && s.props.style.includes('color: #cc0000'))
    expect(redSpans.length).toBeGreaterThan(0)
    expect(flatten(result.nodes)).toContain('\\invalidCommand')
    expect(flatten(result.nodes)).toContain('test')
  })

  it('preserves aria-hidden attributes on KaTeX markup', async () => {
    const result = await renderSafeMarkdown('$x + y = z$')
    const htmlSpans = find(result.nodes, 'span').filter(s => s.props['aria-hidden'] === 'true')
    expect(htmlSpans.length).toBeGreaterThan(0)
  })
})

describe('public markdown diagram (Mermaid) parity', () => {
  it('preserves fenced ```mermaid blocks without shiki tokenization', async () => {
    const diagram = '```mermaid\ngraph TD;\n  A-->B;\n  B-->C;\n```'
    const result = await renderSafeMarkdown(diagram)
    expect(result.complete).toBe(true)

    const [pre] = find(result.nodes, 'pre')
    expect(pre).toBeDefined()
    expect(pre?.props.class).toBe('language-mermaid')

    const [code] = find(result.nodes, 'code')
    expect(code).toBeDefined()
    const content = flatten(result.nodes)
    expect(content).toContain('graph TD;')
    expect(content).toContain('A-->B;')
    expect(content).toContain('B-->C;')

    // Mermaid code block is not coloured by shiki (no inner styled spans)
    const preSpans = find([pre], 'span').filter(s => typeof s.props.style === 'string')
    expect(preSpans).toEqual([])
  })
})
