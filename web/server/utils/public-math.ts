import { randomBytes } from 'node:crypto'
import katex from 'katex'
import { parseMarkdown } from '@nuxtjs/mdc/runtime'
import type { RawMarkdownNode } from '#shared/markdown'

const MAX_FORMULAS = 32
const MAX_FORMULA_LENGTH = 10_000
const MAX_TOTAL_FORMULA_LENGTH = 20_000
const MAX_GENERATED_LENGTH = 200_000
type Replacement = (formula: string, display: boolean) => string
const renderFormula: Replacement = (formula, displayMode) => katex.renderToString(formula, {
  displayMode, output: 'htmlAndMathml', throwOnError: false, trust: false, maxSize: 20, maxExpand: 1000,
})

/** Protected regions are consumed before dollars; rejected currency does not
 * consume the opening delimiter of a subsequent real formula. */
export function preprocessMath(source: string, replace: Replacement = renderFormula): string {
  const tokens = /^(?<prefix>(?: {0,3}>[ \t]?)* {0,3})(?<fence>`{3,}|~{3,})(?<language>[^\r\n]*)\r?\n(?<body>[\s\S]*?)(?:^(?: {0,3}>[ \t]?)* {0,3}\k<fence>[`~]*[ \t]*\r?$|$(?![\s\S]))|(?<!`)(?<ticks>`+)(?!`)[\s\S]*?(?<!`)\k<ticks>(?!`)|<!--[\s\S]*?(?:-->|$(?![\s\S]))|<(?<rawTag>pre|code|script|style|textarea)\b[^>]*>[\s\S]*?(?:<\/\k<rawTag>\s*>|$(?![\s\S]))|<\/?[a-z][a-z0-9:-]*(?:[^>"']|"[^"]*"|'[^']*')*>|\\+\$|\$\$(?<display>(?:\\[\s\S]|[^\\])+?)\$\$|\$(?<inline>(?:\\[^\r\n]|[^$\\\r\n])+?)\$/gim
  let result = '', previous = 0, count = 0, total = 0
  const render = (formula: string, display: boolean) => {
    count++; total += formula.length
    if (count > MAX_FORMULAS || formula.length > MAX_FORMULA_LENGTH || total > MAX_TOTAL_FORMULA_LENGTH)
      throw new Error('public_math_budget')
    return replace(formula, display)
  }
  for (let match = tokens.exec(source); match; match = tokens.exec(source)) {
    result += source.slice(previous, match.index)
    previous = match.index + match[0].length
    const groups = match.groups ?? {}
    if (groups.fence !== undefined) {
      // Quoted fences remain code; never strip their block container prefixes.
      result += /^(math|katex)\s*$/i.test(groups.language ?? '') && !groups.prefix?.includes('>')
        ? `\n\n${render((groups.body ?? '').trim(), true)}\n\n` : match[0]
    } else if (groups.display !== undefined) {
      result += `\n\n${render(groups.display.trim(), true)}\n\n`
    } else if (groups.inline !== undefined) {
      const value = groups.inline
      const currency = /^\d+(?:[.,]\d+)?$/.test(value)
        || (/^\d+(?:[.,]\d+)?(?:[，。,:;!?：；、\s]|$)/.test(value) && !/[\\=+*/^_{}<>-]/.test(value))
      if (/^\s|\s$/.test(value) || currency || /^\d/.test(source[previous] ?? '')) {
        result += '$'; previous = match.index + 1; tokens.lastIndex = previous
      } else result += render(value, false)
    } else if (match[0].startsWith('\\') && match[0].endsWith('$') && (match[0].length - 1) % 2 === 0) {
      result += match[0].slice(0, -1); previous--; tokens.lastIndex = previous
    } else result += match[0]
  }
  return result + source.slice(previous)
}

/** Random slots carry generated nodes across Markdown parsing without granting
 * privileges to author-supplied class names, HTML attributes or SVG. */
export function prepareMath(source: string) {
  const prefix = randomBytes(16).toString('hex')
  const formulas = new Map<string, { formula: string, display: boolean }>()
  const markdown = preprocessMath(source, (formula, display) => {
    const id = `${prefix}-${formulas.size}`
    formulas.set(id, { formula, display })
    return `<span data-guatswr-math="${id}"></span>`
  })
  return { markdown, formulas }
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

export async function attachGeneratedMath(root: unknown, formulas: ReturnType<typeof prepareMath>['formulas']) {
  const generated = new WeakSet<object>()
  let length = 0
  const mark = (node: unknown, depth = 0) => {
    if (!record(node)) return
    if (depth > 48) throw new Error('public_math_depth')
    generated.add(node)
    if (Array.isArray(node.children)) for (const child of node.children) mark(child, depth + 1)
  }
  const visit = async (node: unknown, depth = 0): Promise<void> => {
    if (!record(node) || !Array.isArray(node.children)) return
    if (depth > 48) throw new Error('public_math_depth')
    for (const child of node.children) {
      if (!record(child)) continue
      const props = record(child.props) ? child.props : {}
      const key = props['data-guatswr-math'] ?? props.dataGuatswrMath
      const formula = child.tag === 'span' && typeof key === 'string' ? formulas.get(key) : undefined
      if (formula) {
        const html = renderFormula(formula.formula, formula.display)
        length += html.length
        if (length > MAX_GENERATED_LENGTH) throw new Error('public_math_output_budget')
        const parsed = await parseMarkdown(html, { highlight: false })
        const body = parsed.body as RawMarkdownNode
        let children = Array.isArray(body.children) ? body.children : []
        if (children.length === 1 && record(children[0]) && children[0].tag === 'p')
          children = Array.isArray(children[0].children) ? children[0].children : []
        for (const item of children) mark(item)
        child.children = children
        child.props = {}
      } else await visit(child, depth + 1)
    }
  }
  await visit(root)
  return generated
}
