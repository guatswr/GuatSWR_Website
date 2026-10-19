/**
 * Allowlisted Markdown rendering vocabulary, shared by the Nitro sanitizer and
 * the browser renderer.
 *
 * The archived `/activity/:id` page fed backend Markdown straight into
 * `md-editor-v3`'s preview component, which parsed and highlighted in the
 * browser and resolved component syntax. This module keeps the same readable
 * result without shipping a Markdown parser, a syntax highlighter or any
 * component resolution to the client:
 *
 * 1. Nitro parses the Markdown once per request (`server/utils/markdown.ts`).
 * 2. `sanitizeMarkdownAst` reduces the parser output to native prose tags with
 *    a fixed attribute allowlist - frontmatter, component mappings, `v-bind`
 *    style bindings, event handlers and unsafe URLs are dropped here.
 * 3. The browser renders that reduced tree with native elements only.
 *
 * The sanitizer never produces HTML text, so there is no `v-html` sink and no
 * blacklist to outsmart: an element that is not in `SAFE_TAGS` is either
 * dropped with its subtree (`DROPPED_TAGS`) or unwrapped to visible content.
 * When an internal budget is exhausted the result is reported as incomplete so
 * the caller can fall back to the *whole* article as escaped plain text
 * instead of silently dropping its tail.
 */

/** Structural parser output; mirrors the `@nuxtjs/mdc` minimark node shape. */
export interface RawMarkdownNode {
  readonly type?: unknown
  readonly tag?: unknown
  readonly props?: unknown
  readonly value?: unknown
  readonly children?: unknown
}

export type SafeMarkdownProps = Readonly<Record<string, string | number | boolean>>

export interface SafeMarkdownElement {
  readonly type: 'element'
  readonly tag: string
  readonly props: SafeMarkdownProps
  readonly children: readonly SafeMarkdownNode[]
}

export interface SafeMarkdownText {
  readonly type: 'text'
  readonly value: string
}

export type SafeMarkdownNode = SafeMarkdownElement | SafeMarkdownText

export interface MarkdownHeading {
  readonly id: string
  readonly text: string
  readonly depth: number
}

export interface SafeMarkdownResult {
  readonly nodes: readonly SafeMarkdownNode[]
  readonly headings: readonly MarkdownHeading[]
  /**
   * `false` when a sanitizer budget was hit. The tree is still safe, but it is
   * not the whole document, so callers must not present it as complete.
   */
  readonly complete: boolean
}

/** Native prose elements only. No custom component name can appear here. */
const SAFE_TAGS = new Set([
  'a', 'blockquote', 'br', 'caption', 'code', 'dd', 'del', 'dl', 'dt', 'em',
  'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'img',
  'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 's', 'span', 'strong', 'sub',
  'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
])

/**
 * Active-content and embedding tags. Their subtree is discarded instead of
 * unwrapped so that, for example, the payload of `<script>` never becomes
 * visible article text. `style` is listed because the installed highlighter
 * appends a theme stylesheet to the parsed tree.
 */
const DROPPED_TAGS = new Set([
  'applet', 'audio', 'base', 'body', 'button', 'canvas', 'embed', 'form',
  'frame', 'frameset', 'head', 'html', 'iframe', 'link', 'math',
  'meta', 'noembed', 'noframes', 'noscript', 'object', 'optgroup', 'option',
  'param', 'picture', 'portal', 'script', 'select', 'slot', 'source', 'style',
  'svg', 'template', 'textarea', 'title', 'track', 'video',
])

/** Headings get a deterministic, clobber-resistant id instead of the parser's. */
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

const LANGUAGE_CLASS = /^language-[a-z0-9+#._-]{1,24}$/

/** Shiki emits colour tokens; only these declaration/value pairs survive. */
const SAFE_STYLE_PROPERTY = /^(?:color|background-color|font-style|font-weight|text-decoration|opacity|--shiki-[a-z-]{1,32})$/
const SAFE_STYLE_VALUE = /^(?:#[0-9a-f]{3,8}|rgba?\([\d\s.,%]{3,40}\)|hsla?\([\d\s.,%]{3,40}\)|italic|oblique|bold|bolder|lighter|normal|underline|line-through|none|(?:0|1|0?\.\d+))$/
const SAFE_ALIGN = new Set(['left', 'center', 'right', 'justify'])

const MAX_DEPTH = 32
const MAX_NODES = 8_000
const MAX_IMAGE_DIMENSION = 4_096
const MAX_URL_LENGTH = 2_048
const MAX_ATTRIBUTE_TEXT = 256

/** Sentinel origin used to resolve relative paths without any real host. */
const RESOLUTION_ORIGIN = 'https://public-content.invalid'
/** Legacy upload paths: no traversal, no backslashes, no encoded separators. */
const UPLOAD_PATH = /^\/uploads\/[A-Za-z0-9][A-Za-z0-9._\-/]*$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasControlCharacter = (value: string): boolean => {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

/**
 * A URL that is safe to hand to the browser in *any* of its encoded forms.
 * Backslashes are rejected outright: browsers treat `/\evil.test` as an
 * authority, so a "local path" containing one is not local at all.
 */
const isSafeUrlText = (value: string): boolean =>
  value.length > 0
  && value.length <= MAX_URL_LENGTH
  && !value.includes('\\')
  && !hasControlCharacter(value)

/** Every decoding step must stay safe, up to three rounds of encoding. */
const decodeVariants = (value: string): string[] | null => {
  const variants = [value]
  let current = value
  for (let index = 0; index < 3; index += 1) {
    let next: string
    try {
      next = decodeURIComponent(current)
    }
    catch {
      return null
    }
    if (next === current) break
    variants.push(next)
    current = next
  }
  return variants
}

/** `.`/`..` path segments are rejected: the image proxy must never traverse. */
const hasDotSegment = (value: string): boolean => {
  const path = value.split(/[?#]/)[0] ?? ''
  return path.split('/').some(segment => segment === '.' || segment === '..')
}

const isSameOriginPath = (value: string): boolean => {
  try {
    const url = new URL(value, RESOLUTION_ORIGIN)
    return url.origin === RESOLUTION_ORIGIN && !url.username && !url.password
  }
  catch {
    return false
  }
}

const isHttpUrl = (value: string): boolean => {
  if (!/^https?:\/\//i.test(value)) return false
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && Boolean(url.hostname)
      && !url.username
      && !url.password
  }
  catch {
    return false
  }
}

/**
 * Absolute `http(s)` links, same-origin paths and in-page fragments are the
 * only link targets the archived site rendered. Anything else - including
 * encoded, whitespace, backslash and Unicode-control variants of
 * `javascript:` - is removed entirely. The returned string is the original
 * text, never a decoded form, so path/query semantics cannot drift.
 */
export function safeLinkHref(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const href = value.trim()
  if (!isSafeUrlText(href)) return null
  const variants = decodeVariants(href)
  if (!variants || variants.some(variant => !isSafeUrlText(variant))) return null
  for (const variant of variants) {
    if (variant.startsWith('#') && variant.length > 1) continue
    if (variant.startsWith('/')) {
      if (!isSameOriginPath(variant)) return null
      continue
    }
    if (!isHttpUrl(variant)) return null
  }
  return href
}

/**
 * Image sources the deployment can actually display.
 *
 * The public CSP is `img-src 'self' data:` and the lead's decision is a fixed
 * self origin for `/uploads` plus owned brand assets, so only same-origin
 * paths are returned. Legacy rows that stored an absolute backend upload URL
 * are normalized to the equivalent path; any other remote origin is dropped
 * rather than emitted as a request the browser would block.
 */
export function safeImageSrc(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const source = value.trim()
  if (!isSafeUrlText(source)) return null
  const variants = decodeVariants(source)
  if (!variants || variants.some(variant => !isSafeUrlText(variant))) return null
  if (source.startsWith('/')) {
    const local = variants.every(variant =>
      isSameOriginPath(variant) && !variant.startsWith('//') && !hasDotSegment(variant))
    return local ? source : null
  }
  if (!isHttpUrl(source)) return null
  try {
    const url = new URL(source)
    return UPLOAD_PATH.test(url.pathname) && !hasDotSegment(url.pathname) ? url.pathname : null
  }
  catch {
    return null
  }
}

const safeStyle = (value: unknown): string | null => {
  if (typeof value !== 'string' || value.length > 512) return null
  const declarations: string[] = []
  for (const part of value.split(';')) {
    const separator = part.indexOf(':')
    if (separator === -1) continue
    const property = part.slice(0, separator).trim().toLowerCase()
    const declarationValue = part.slice(separator + 1).trim().toLowerCase()
    if (!SAFE_STYLE_PROPERTY.test(property) || !SAFE_STYLE_VALUE.test(declarationValue)) continue
    declarations.push(`${property}: ${declarationValue}`)
  }
  return declarations.length > 0 ? declarations.join('; ') : null
}

const boundedInteger = (value: unknown, min: number, max: number): number | null => {
  const numeric = typeof value === 'string' ? Number(value) : value
  if (typeof numeric !== 'number' || !Number.isSafeInteger(numeric)) return null
  return numeric >= min && numeric <= max ? numeric : null
}

/** Archived `task-list-item` marker, kept so the list style can be reset. */
const hasTaskClass = (value: unknown): boolean => {
  const entries = Array.isArray(value) ? value : [value]
  return entries.some(entry => entry === 'task-list-item')
}

const languageClass = (value: unknown): string | null => {
  const candidate = Array.isArray(value)
    ? value.find((entry): entry is string => typeof entry === 'string' && LANGUAGE_CLASS.test(entry))
    : value
  return typeof candidate === 'string' && LANGUAGE_CLASS.test(candidate) ? candidate : null
}

/** C0 controls and DEL, tested by code point (see `public-query.ts`). */
const isControlCharacter = (codePoint: number): boolean => codePoint < 0x20 || codePoint === 0x7f

/** Only plain text reaches an `alt`/`title` attribute, never markup. */
const plainText = (value: unknown, limitText: number): string | null => {
  if (typeof value !== 'string') return null
  const collapsed = [...value]
    .map(character => (isControlCharacter(character.codePointAt(0) ?? 0) ? ' ' : character))
    .join('')
    .trim()
  return collapsed ? collapsed.slice(0, limitText) : null
}

const slugify = (text: string): string =>
  text.toLowerCase().replace(/[^\w㐀-鿿-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)

interface SanitizeContext {
  readonly usedIds: Set<string>
  readonly headings: MarkdownHeading[]
  /** In-article fragments that should resolve to a generated heading id. */
  readonly fragments: Map<string, string>
  nodes: number
  truncated: boolean
}

const sanitizeChildren = (
  value: unknown,
  context: SanitizeContext,
  inCode: boolean,
  depth: number,
): SafeMarkdownNode[] => {
  if (!Array.isArray(value)) return []
  if (depth > MAX_DEPTH) {
    context.truncated = true
    return []
  }
  const output: SafeMarkdownNode[] = []
  for (const child of value) {
    if (context.nodes >= MAX_NODES) {
      context.truncated = true
      return output
    }
    const node = sanitizeNode(child, context, inCode, depth + 1)
    if (node) output.push(node)
  }
  return output
}

const textNode = (value: unknown): SafeMarkdownText | null =>
  typeof value === 'string' && value ? { type: 'text', value } : null

const CHECKED_MARKERS = new Set(['true', 'checked', ''])

/**
 * A type alias, not an interface: an interface has no implicit index signature,
 * so it is not assignable to `SafeMarkdownProps`
 * (`Readonly<Record<string, string | number | boolean>>`), while an object type
 * alias is.
 */
export type SafeCheckboxProps = {
  readonly type: 'checkbox'
  readonly disabled: true
  readonly checked?: true
}

/**
 * The only `input` shape this application ever renders: an inert GFM checkbox.
 *
 * Exported so the browser renderer can re-validate independently of the
 * sanitizer (defence in depth). Anything that is not exactly a checkbox - a
 * text/submit/file control, an enabled control, an event handler or any other
 * attribute - is refused, and `disabled` is always forced.
 */
export function safeTaskCheckboxProps(value: unknown): SafeCheckboxProps | null {
  const source = isRecord(value) ? value : {}
  const type = typeof source.type === 'string' ? source.type.toLowerCase() : ''
  if (type !== 'checkbox') return null
  const raw = source.checked
  const checked = raw === true || (typeof raw === 'string' && CHECKED_MARKERS.has(raw.toLowerCase()))
  return checked ? { type: 'checkbox', disabled: true, checked: true } : { type: 'checkbox', disabled: true }
}

/** Inert `<input type="checkbox">` for a GFM task item, or `null`. */
const taskCheckbox = (node: RawMarkdownNode): SafeMarkdownElement | null => {
  const props = safeTaskCheckboxProps(node.props)
  return props ? { type: 'element', tag: 'input', props, children: [] } : null
}

const sanitizeNode = (
  value: unknown,
  context: SanitizeContext,
  inCode: boolean,
  depth: number,
): SafeMarkdownNode | null => {
  if (!isRecord(value)) return null
  const node: RawMarkdownNode = value
  if (node.type === 'text') return textNode(node.value)
  if (node.type !== 'element') return null
  const tag = typeof node.tag === 'string' ? node.tag.toLowerCase() : ''
  if (tag === 'input') {
    // Only the inert GFM checkbox survives; every other input is dropped.
    const checkbox = taskCheckbox(node)
    if (!checkbox) return null
    context.nodes += 1
    return checkbox
  }
  if (!tag || DROPPED_TAGS.has(tag)) return null
  context.nodes += 1
  if (!SAFE_TAGS.has(tag)) {
    // Unknown or custom tag: keep the readable content, drop the element and
    // every binding that came with it, so no registered component can render.
    const unwrapped = sanitizeChildren(node.children, context, inCode, depth)
    if (unwrapped.length === 0) return null
    return unwrapped.length === 1
      ? (unwrapped[0] ?? null)
      : { type: 'element', tag: 'span', props: {}, children: unwrapped }
  }
  const props = sanitizeProps(tag, node.props, inCode)
  // An `<img>` whose source the deployment cannot display has no content left
  // to show, so the element itself is dropped rather than emitted as an empty
  // image the browser would paint as a broken placeholder.
  if (tag === 'img' && props.src === undefined) return null
  const children = sanitizeChildren(node.children, context, inCode || tag === 'pre', depth)
  if (HEADING_TAGS.has(tag)) {
    const title = textContent(children).trim()
    const id = headingId(title, context.usedIds)
    registerFragments(context, node.props, title, id)
    context.headings.push({ id, text: title, depth: Number(tag.slice(1)) })
    return { type: 'element', tag, props: { ...props, id }, children }
  }
  return { type: 'element', tag, props, children }
}

/**
 * Remember every fragment a reader could plausibly have written for this
 * heading: the generated id, the author's text, the parser's own id and the
 * slug of each, so `[x](#标题一)` keeps working after ids are regenerated.
 */
const registerFragments = (context: SanitizeContext, props: unknown, title: string, id: string): void => {
  const aliases = new Set<string>([id])
  if (title) {
    aliases.add(title)
    const slug = slugify(title)
    if (slug) {
      aliases.add(slug)
      aliases.add(`md-${slug}`)
    }
  }
  const source = isRecord(props) ? props.id : undefined
  if (typeof source === 'string' && source.trim()) aliases.add(source.trim())
  for (const alias of aliases) {
    if (!context.fragments.has(alias)) context.fragments.set(alias, id)
  }
}

const textContent = (nodes: readonly SafeMarkdownNode[]): string => {
  let text = ''
  for (const node of nodes) {
    if (node.type === 'text') text += node.value
    else if (node.tag !== 'img') text += textContent(node.children)
  }
  return text
}

/**
 * Deterministic heading id, prefixed so a heading can never clobber a
 * `window`/`document` property the way `id="location"` would.
 */
const headingId = (text: string, used: Set<string>): string => {
  const base = `md-${slugify(text) || 'section'}`
  let candidate = base
  let suffix = 1
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`
    suffix += 1
  }
  used.add(candidate)
  return candidate
}

const sanitizeProps = (tag: string, value: unknown, inCode: boolean): SafeMarkdownProps => {
  const source = isRecord(value) ? value : {}
  const props: Record<string, string | number | boolean> = {}
  const className = languageClass(source.className ?? source.class)
  if (className) props.class = className
  else if (tag === 'li' && hasTaskClass(source.className ?? source.class)) props.class = 'task-list-item'
  switch (tag) {
    case 'input': {
      // Reached only through `taskCheckbox`, which already validated the type;
      // re-validating here keeps the invariant local to the attribute pass.
      return safeTaskCheckboxProps(source) ?? { type: 'checkbox', disabled: true }
    }
    case 'a': {
      const href = safeLinkHref(source.href)
      if (!href) return props
      props.href = href
      const title = plainText(source.title, MAX_ATTRIBUTE_TEXT)
      if (title) props.title = title
      if (isHttpUrl(href)) {
        props.target = '_blank'
        props.rel = 'noopener noreferrer nofollow'
      }
      return props
    }
    case 'img': {
      const src = safeImageSrc(source.src)
      if (!src) return {}
      props.src = src
      props.alt = plainText(source.alt, MAX_ATTRIBUTE_TEXT) ?? ''
      const title = plainText(source.title, MAX_ATTRIBUTE_TEXT)
      if (title) props.title = title
      const width = boundedInteger(source.width, 1, MAX_IMAGE_DIMENSION)
      const height = boundedInteger(source.height, 1, MAX_IMAGE_DIMENSION)
      if (width !== null) props.width = width
      if (height !== null) props.height = height
      props.loading = 'lazy'
      props.decoding = 'async'
      return props
    }
    case 'code':
    case 'span': {
      // `span` only exists to carry server-side highlighter colours.
      if (tag === 'span') {
        if (!inCode) return {}
        const style = safeStyle(source.style)
        return style ? { style } : {}
      }
      return props
    }
    case 'ol': {
      const start = boundedInteger(source.start, 1, 10_000)
      if (start !== null && start !== 1) props.start = start
      return props
    }
    case 'th':
    case 'td': {
      const colspan = boundedInteger(source.colspan, 1, 64)
      const rowspan = boundedInteger(source.rowspan, 1, 64)
      const align = typeof source.align === 'string' && SAFE_ALIGN.has(source.align) ? source.align : null
      if (colspan !== null && colspan !== 1) props.colspan = colspan
      if (rowspan !== null && rowspan !== 1) props.rowspan = rowspan
      if (align) props.align = align
      return props
    }
    default:
      return props
  }
}

/** Point in-article `#fragment` links at the regenerated heading ids. */
const rewriteFragments = (
  nodes: readonly SafeMarkdownNode[],
  fragments: ReadonlyMap<string, string>,
): SafeMarkdownNode[] => nodes.map((node) => {
  if (node.type === 'text') return node
  const children = node.children.length > 0 ? rewriteFragments(node.children, fragments) : node.children
  const href = node.tag === 'a' ? node.props.href : undefined
  if (typeof href !== 'string' || !href.startsWith('#')) {
    return children === node.children ? node : { ...node, children }
  }
  const raw = href.slice(1)
  if (!raw) return { ...node, children }
  let decoded: string
  try {
    decoded = decodeURIComponent(raw)
  }
  catch {
    decoded = raw
  }
  const target = fragments.get(raw)
    ?? fragments.get(decoded)
    ?? fragments.get(raw.toLowerCase())
    ?? fragments.get(decoded.toLowerCase())
  if (!target) return { ...node, children }
  return { ...node, props: { ...node.props, href: `#${target}` }, children }
})

/**
 * Reduce parser output to the allowlisted tree. `value` is the parser's
 * `body` node, its `children`, or a bare node list.
 */
export function sanitizeMarkdownAst(value: unknown): SafeMarkdownResult {
  const context: SanitizeContext = { usedIds: new Set(), headings: [], fragments: new Map(), nodes: 0, truncated: false }
  const children = isRecord(value) && Array.isArray(value.children)
    ? (value.children as unknown[])
    : (Array.isArray(value) ? (value as unknown[]) : [])
  const nodes = sanitizeChildren(children, context, false, 0)
  return {
    nodes: rewriteFragments(nodes, context.fragments),
    headings: context.headings,
    complete: !context.truncated,
  }
}

/** Frozen tag list, exported so the browser renderer asserts the same set. */
export const SAFE_MARKDOWN_TAGS: readonly string[] = Object.freeze([...SAFE_TAGS])

export const isSafeMarkdownTag = (tag: string): boolean => SAFE_TAGS.has(tag)

/** Single paragraph of escaped plain text, used for whole-article fallbacks. */
export function plainTextAst(value: string): SafeMarkdownNode[] {
  return value
    ? [{ type: 'element', tag: 'p', props: {}, children: [{ type: 'text', value }] }]
    : []
}
