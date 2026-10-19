/**
 * Server-only code highlighting.
 *
 * The archived preview highlighted fenced code in the browser with
 * `md-editor-v3`. Here the highlighting happens once per request on the
 * server, through the explicitly declared `shiki` dependency:
 *
 * - one highlighter instance, created lazily and reused,
 * - an explicit theme and language list (no dynamic loading, no anonymous
 *   highlight endpoint, no WASM asset shipped to the browser),
 * - a bounded input; unknown languages and failures keep the plain code text,
 * - the highlighted tree is converted back to the same native-node shape as
 *   the rest of the document, so the shared sanitizer still validates every
 *   colour token before anything reaches the DOM.
 */
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import githubLight from 'shiki/themes/github-light.mjs'
import bash from 'shiki/langs/bash.mjs'
import c from 'shiki/langs/c.mjs'
import cpp from 'shiki/langs/cpp.mjs'
import css from 'shiki/langs/css.mjs'
import diff from 'shiki/langs/diff.mjs'
import html from 'shiki/langs/html.mjs'
import ini from 'shiki/langs/ini.mjs'
import java from 'shiki/langs/java.mjs'
import javascript from 'shiki/langs/javascript.mjs'
import json from 'shiki/langs/json.mjs'
import lua from 'shiki/langs/lua.mjs'
import markdown from 'shiki/langs/markdown.mjs'
import python from 'shiki/langs/python.mjs'
import sql from 'shiki/langs/sql.mjs'
import typescript from 'shiki/langs/typescript.mjs'
import vue from 'shiki/langs/vue.mjs'
import yaml from 'shiki/langs/yaml.mjs'
import type { RawMarkdownNode } from '#shared/markdown'

/** Highlighting is CPU-bound: one oversized fence degrades to plain text. */
const MAX_CODE_LENGTH = 20_000
const THEME = 'github-light'

/**
 * Archived fences label their language; anything else stays unhighlighted.
 *
 * A `Map` (not an object) so inherited keys such as `constructor`, `toString`
 * or `__proto__` can never resolve to an alias.
 */
const ALIASES: ReadonlyMap<string, string> = new Map([
  ['bash', 'bash'], ['sh', 'bash'], ['shell', 'bash'], ['zsh', 'bash'],
  ['c', 'c'], ['h', 'c'],
  ['cpp', 'cpp'], ['c++', 'cpp'], ['cc', 'cpp'], ['hpp', 'cpp'],
  ['css', 'css'],
  ['diff', 'diff'], ['patch', 'diff'],
  ['html', 'html'], ['htm', 'html'], ['xml', 'html'], ['vue', 'vue'],
  ['ini', 'ini'], ['conf', 'ini'], ['toml', 'ini'],
  ['java', 'java'],
  ['javascript', 'javascript'], ['js', 'javascript'], ['jsx', 'javascript'],
  ['mjs', 'javascript'], ['cjs', 'javascript'],
  ['json', 'json'], ['jsonc', 'json'],
  ['lua', 'lua'],
  ['markdown', 'markdown'], ['md', 'markdown'], ['mdc', 'markdown'],
  ['python', 'python'], ['py', 'python'],
  ['sql', 'sql'],
  ['typescript', 'typescript'], ['ts', 'typescript'], ['tsx', 'typescript'],
  ['yaml', 'yaml'], ['yml', 'yaml'],
])

type Highlighter = Awaited<ReturnType<typeof createHighlighterCore>>

let highlighterPromise: Promise<Highlighter> | null = null
let highlighterFailed = false

const getHighlighter = async (): Promise<Highlighter | null> => {
  if (highlighterFailed) return null
  highlighterPromise ??= createHighlighterCore({
    themes: [githubLight],
    langs: [
      bash, c, cpp, css, diff, html, ini, java, javascript, json, lua,
      markdown, python, sql, typescript, vue, yaml,
    ],
    engine: createJavaScriptRegexEngine(),
  })
  try {
    return await highlighterPromise
  }
  catch {
    // A missing/damaged highlighter must never break an article render.
    highlighterFailed = true
    highlighterPromise = null
    return null
  }
}

const hastChildren = (value: unknown): unknown[] => {
  if (typeof value !== 'object' || value === null) return []
  const children = (value as { children?: unknown }).children
  return Array.isArray(children) ? children : []
}

/** hast -> the parser's native-node shape, keeping only text and elements. */
const fromHast = (node: unknown): RawMarkdownNode | null => {
  if (typeof node !== 'object' || node === null) return null
  const record = node as { type?: unknown, tagName?: unknown, properties?: unknown, value?: unknown }
  if (record.type === 'text') {
    return typeof record.value === 'string' && record.value ? { type: 'text', value: record.value } : null
  }
  if (record.type !== 'element' || typeof record.tagName !== 'string') return null
  const children = hastChildren(node)
    .map(fromHast)
    .filter((child): child is RawMarkdownNode => child !== null)
  const properties = typeof record.properties === 'object' && record.properties !== null
    ? record.properties as Record<string, unknown>
    : {}
  const props: Record<string, unknown> = {}
  for (const key of ['className', 'class', 'style', 'title'] as const) {
    if (properties[key] !== undefined) props[key] = properties[key]
  }
  // `tabindex` on shiki's `pre` is dropped: the block is not interactive.
  return { type: 'element', tag: record.tagName, props, children }
}

/** Highlighted `pre` node, or `null` when the language is unsupported. */
export async function highlightCode(code: string, language: string): Promise<RawMarkdownNode | null> {
  const normalized = ALIASES.get(language.trim().toLowerCase())
  if (!normalized) return null
  if (code.length > MAX_CODE_LENGTH) return null
  const highlighter = await getHighlighter()
  if (!highlighter) return null
  if (!highlighter.getLoadedLanguages().includes(normalized)) return null
  try {
    const hast = highlighter.codeToHast(code, { lang: normalized, theme: THEME })
    const pre = hastChildren(hast).map(fromHast).find(node => node?.tag === 'pre')
    if (!pre) return null
    // Keep the language class used by the archived typography; the theme's own
    // background/style is dropped by the sanitizer.
    const props: Record<string, unknown> = { ...(pre.props ?? {}), className: [`language-${normalized}`] }
    return { ...pre, props }
  }
  catch {
    return null
  }
}

/** Languages this server can colour, for documentation and tests. */
export const HIGHLIGHT_LANGUAGES: readonly string[] = Object.freeze(
  [...new Set(ALIASES.values())].sort(),
)
