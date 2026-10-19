// Initial public-route JavaScript accounting.
//
// The user-facing rule is 150 KiB *gzip* of JavaScript needed to render one
// public route, excluding chunks that are only fetched after interaction. This
// module is deliberately browser-free: the collector in check-route-budget.mjs
// supplies what a cold, non-interacting browser actually requested, the SSR
// HTML supplies the script seeds, and everything here can be unit tested.
//
// The graph comes from es-module-lexer, not a regular expression over
// `import(`: dynamic imports are only counted when the browser really asked for
// them, and static imports are always counted even if the request observation
// raced a paint. Nuxt 4's SSR importmap (`#entry` and friends) is resolved for
// the narrow subset of exact own-URL bindings; see parseImportMap().
import { readFile, stat } from 'node:fs/promises'
import { join, posix, sep } from 'node:path'
import { init, parse, ImportType } from 'es-module-lexer'
import {
  NITRO_GZIP_LEVEL,
  findSourceMaps,
  gzipSize,
  toUrlPath,
  walkFiles,
} from './artifacts.mjs'

/** The product budget: initial public-route JavaScript, gzip bytes. */
export const INITIAL_ROUTE_JS_BUDGET_BYTES = 150 * 1024

/** Own build assets live here; anything else requested as JS is unexpected. */
export const OWN_ASSET_PREFIX = '/_nuxt/'

/** The finite, interaction-free window used to observe automatic prefetch. */
export const DEFAULT_SETTLE_WINDOW_MS = 2000

/** Bounded wait, after the settle window, for scripts that already started. */
export const DEFAULT_COMPLETION_WINDOW_MS = 5000

/** Hard ceilings keep a mistyped flag from making the observation unbounded. */
export const MAX_SETTLE_WINDOW_MS = 30000
export const MAX_COMPLETION_WINDOW_MS = 30000

// Sentinel origin used only to prove a declared route path is same-origin.
export const ROUTE_SENTINEL_ORIGIN = 'http://route.invalid'

export class RouteBudgetError extends Error {
  constructor(message) {
    super(message)
    this.name = 'RouteBudgetError'
  }
}

const STATIC_IMPORT_TYPES = new Set([
  ImportType.Static,
  ImportType.StaticSourcePhase,
  ImportType.StaticDeferPhase,
])

// Script types that are data or templates. They may carry a `src`, but the
// browser never executes them as JavaScript, so they are not part of the
// initial-route budget.
const NON_JS_SCRIPT_TYPES = new Set([
  'application/json',
  'application/ld+json',
  'importmap',
  'speculationrules',
  'text/html',
  'text/template',
  'text/x-template',
])

const JS_SCRIPT_TYPES = new Set([
  '',
  'module',
  'text/javascript',
  'application/javascript',
  'text/ecmascript',
  'application/ecmascript',
])

// Asset paths are allow-listed rather than decoded: a percent-encoded segment
// could otherwise smuggle `..` or a separator past a naive containment check.
const ASSET_SEGMENT = /^[A-Za-z0-9._~-]+$/

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

function attribute(tag, name) {
  return tag.match(new RegExp(String.raw`\b${name}\s*=\s*["']([^"']*)["']`, 'i'))?.[1]
}

function isJavaScriptPath(href) {
  try {
    return new URL(href, 'http://seed.invalid').pathname.endsWith('.js')
  } catch {
    return false
  }
}

/**
 * Validate and return an own asset URL path.
 * Rejects external paths, traversal, backslashes and percent-encoding.
 */
export function normalizeAssetPath(pathname, { assetPrefix = OWN_ASSET_PREFIX } = {}) {
  if (typeof pathname !== 'string' || pathname.length === 0) {
    throw new RouteBudgetError('Empty asset path')
  }
  if (pathname.includes(String.fromCharCode(92))) {
    throw new RouteBudgetError(`Backslash in asset path: ${pathname}`)
  }
  if (pathname.includes('%')) {
    throw new RouteBudgetError(`Percent-encoded asset path is not allowed: ${pathname}`)
  }
  if (!pathname.startsWith(assetPrefix)) {
    throw new RouteBudgetError(`Asset outside ${assetPrefix}: ${pathname}`)
  }
  for (const segment of pathname.slice(1).split('/')) {
    if (segment === '' || segment === '.' || segment === '..') {
      throw new RouteBudgetError(`Unsafe asset path segment in: ${pathname}`)
    }
    if (!ASSET_SEGMENT.test(segment)) {
      throw new RouteBudgetError(`Unexpected characters in asset path: ${pathname}`)
    }
  }
  if (!pathname.endsWith('.js')) {
    throw new RouteBudgetError(`Not a JavaScript asset: ${pathname}`)
  }
  return pathname
}

/** Map a browser request URL to an own asset path, rejecting foreign origins. */
export function assetPathFromUrl(rawUrl, { origin, assetPrefix = OWN_ASSET_PREFIX } = {}) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) {
    throw new RouteBudgetError('Request without a URL')
  }
  let url
  try {
    url = new URL(rawUrl, origin)
  } catch {
    throw new RouteBudgetError(`Unparseable request URL: ${rawUrl}`)
  }
  if (!origin) {
    throw new RouteBudgetError('An app origin is required to classify asset requests')
  }
  if (url.origin !== new URL(origin).origin) {
    throw new RouteBudgetError(`External asset request is not allowed: ${rawUrl}`)
  }
  return normalizeAssetPath(url.pathname, { assetPrefix })
}

/** JavaScript-looking responses: declared scripts, or a `.js` path. */
export function isJavaScriptRequest(request) {
  if (request?.resourceType === 'script') return true
  if (typeof request?.url !== 'string') return false
  try {
    return new URL(request.url).pathname.endsWith('.js')
  } catch {
    return false
  }
}

/**
 * A failed, aborted, stalled or non-2xx/3xx script request fails the accounting
 * instead of quietly contributing zero bytes.
 */
export function assertRequestSucceeded(request) {
  if (request?.failure) {
    throw new RouteBudgetError(`Script request failed (${request.failure}): ${request.url}`)
  }
  if (request?.stalled) {
    throw new RouteBudgetError(`Script request stalled without completing: ${request.url}`)
  }
  if (typeof request?.status !== 'number') {
    throw new RouteBudgetError(`No response observed for script: ${request.url}`)
  }
  if (request.status < 200 || request.status >= 400) {
    throw new RouteBudgetError(`Script request returned HTTP ${request.status}: ${request.url}`)
  }
  if (request.finished === false) {
    throw new RouteBudgetError(`Script request did not complete: ${request.url}`)
  }
}

/** A request is terminal once it finished or failed; anything else is pending. */
export function isTerminalRequest(request) {
  return request?.failure !== undefined || request?.finished === true
}

/**
 * Bound the completion of scripts that were already initiated when the settle
 * window closed. No new request is adopted here: the set is frozen by the
 * caller. Requests still open at the deadline are marked `stalled`, which the
 * accounting treats as a failure.
 */
export async function settleScriptRequests(candidates, {
  timeoutMs = DEFAULT_COMPLETION_WINDOW_MS,
  pollMs = 25,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  now = () => Date.now(),
} = {}) {
  if (!Array.isArray(candidates)) {
    throw new RouteBudgetError('Script completion requires the observed request list')
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new RouteBudgetError('Script completion timeout must be a non-negative number')
  }
  const deadline = now() + timeoutMs
  for (;;) {
    const pending = candidates.filter(candidate => !isTerminalRequest(candidate))
    if (pending.length === 0) return candidates
    if (now() >= deadline) {
      for (const candidate of pending) candidate.stalled = true
      return candidates
    }
    await sleep(Math.max(1, Math.min(pollMs, deadline - now())))
  }
}

/**
 * Classic and module scripts, plus script preloads, declared by the
 * server-rendered head. Data/template script types are not JavaScript.
 */
export function initialAssetSeeds(html) {
  const seeds = new Set()
  for (const match of String(html).matchAll(/<script\b[^>]*>/gi)) {
    const tag = match[0]
    const src = attribute(tag, 'src')
    if (!src) continue
    const type = (attribute(tag, 'type') ?? '').split(';')[0].trim().toLowerCase()
    if (NON_JS_SCRIPT_TYPES.has(type)) continue
    if (!JS_SCRIPT_TYPES.has(type)) continue
    seeds.add(src)
  }
  for (const match of String(html).matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0]
    const rel = (attribute(tag, 'rel') ?? '').toLowerCase().split(/\s+/)
    const as = (attribute(tag, 'as') ?? '').toLowerCase()
    const href = attribute(tag, 'href')
    if (!href) continue
    const isModulePreload = rel.includes('modulepreload')
    const isScriptPreload = rel.includes('preload') && (as === 'script' || (!as && isJavaScriptPath(href)))
    if (!isModulePreload && !isScriptPreload) continue
    seeds.add(href)
  }
  return [...seeds]
}

/** Nuxt's serialized payload is JSON, not JavaScript; report it separately. */
export function nuxtPayloadBytes(html) {
  const match = String(html).match(/<script[^>]*\bid=["']__NUXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)
  return match ? Buffer.byteLength(match[1], 'utf8') : 0
}

/** Static module specifiers only; dynamic and import.meta entries are skipped. */
export async function staticImportSpecifiers(source, name = 'asset') {
  await init
  let imports
  try {
    [imports] = parse(source, name)
  } catch (error) {
    throw new RouteBudgetError(`Unable to parse ${name}: ${error.message}`)
  }
  return imports
    .filter(entry => STATIC_IMPORT_TYPES.has(entry.t))
    .map(entry => entry.n)
    .filter(specifier => typeof specifier === 'string' && specifier.length > 0)
}

/** Resolve an own relative specifier against the importing asset path. */
export function resolveRelativeSpecifier(fromPath, specifier) {
  const target = String(specifier).split('#')[0].split('?')[0]
  if (!target.startsWith('./') && !target.startsWith('../')) return null
  return posix.normalize(posix.join(posix.dirname(fromPath), target))
}

/** Measure one asset: served `.gz` bytes when Nitro produced them, else level 9. */
async function measureAsset(asset) {
  if (asset.gzipFile) {
    const [raw, compressed] = await Promise.all([stat(asset.file), stat(asset.gzipFile)])
    return { rawBytes: raw.size, gzipBytes: compressed.size, gzipSource: 'precompressed' }
  }
  const raw = await readFile(asset.file)
  return {
    rawBytes: raw.length,
    gzipBytes: gzipSize(raw, NITRO_GZIP_LEVEL),
    gzipSource: `gzip-level-${NITRO_GZIP_LEVEL}-fallback`,
  }
}

/**
 * Inspect a production output directory.
 * `assets` are own public `/_nuxt/*.js` files, keyed by URL path.
 */
export async function inspectOutput(outputDir) {
  const publicDir = join(outputDir, 'public')
  const files = await walkFiles(outputDir)
  const sourceMaps = findSourceMaps(files)
  const fileSet = new Set(files)
  const assets = new Map()
  let allJavaScriptGzipBytes = 0

  for (const file of files) {
    if (!file.startsWith(publicDir + sep) || !file.endsWith('.js')) continue
    const path = toUrlPath(publicDir, file)
    if (!path.startsWith(OWN_ASSET_PREFIX)) continue
    const asset = {
      path,
      file,
      gzipFile: fileSet.has(`${file}.gz`) ? `${file}.gz` : null,
    }
    assets.set(path, asset)
    allJavaScriptGzipBytes += (await measureAsset(asset)).gzipBytes
  }

  return { outputDir, publicDir, files, sourceMaps, assets, allJavaScriptGzipBytes }
}

/** The Nitro server entry for the exact `--output` tree being validated. */
export function serverEntryFor(outputDir) {
  if (typeof outputDir !== 'string' || outputDir.length === 0) {
    throw new RouteBudgetError('An output directory is required to locate the server entry')
  }
  return join(outputDir, 'server', 'index.mjs')
}

/**
 * Union of SSR seeds, observed browser requests and the transitively reachable
 * static import graph. Returns the sorted asset paths and how each was found.
 *
 * `staticGraphPaths` is the eager graph (SSR seeds plus static imports), while
 * `observedRequestPaths` is what the browser really requested. The accounted
 * set is their union; neither half is allowed to replace the other.
 */
export async function collectInitialRouteAssets({
  html,
  requests = [],
  output,
  origin,
  assetPrefix = OWN_ASSET_PREFIX,
}) {
  const importMap = parseImportMap(html)
  const nodes = new Map()
  const requested = new Set()
  const work = []
  const traversed = new Map()

  const add = (path, source, staticReachable) => {
    let node = nodes.get(path)
    if (!node) {
      node = { path, sources: new Set(), staticReachable: false }
      nodes.set(path, node)
    }
    node.sources.add(source)
    if (staticReachable) node.staticReachable = true

    const seen = traversed.get(path) ?? { static: false, observed: false }
    const key = staticReachable ? 'static' : 'observed'
    if (seen[key]) return
    seen[key] = true
    traversed.set(path, seen)
    work.push({ path, staticReachable })
  }

  for (const raw of initialAssetSeeds(html)) {
    let url
    try {
      url = new URL(raw, origin)
    } catch {
      throw new RouteBudgetError(`Unparseable asset reference in SSR HTML: ${raw}`)
    }
    if (url.origin !== new URL(origin).origin) {
      throw new RouteBudgetError(`External asset reference in SSR HTML: ${raw}`)
    }
    add(normalizeAssetPath(url.pathname, { assetPrefix }), 'ssr', true)
  }

  for (const request of requests) {
    if (!isJavaScriptRequest(request)) continue
    assertRequestSucceeded(request)
    const path = assetPathFromUrl(request.url, { origin, assetPrefix })
    requested.add(path)
    add(path, 'request', false)
  }

  // Breadth-first so shared and cyclic static imports terminate and count once.
  // A node first observed through a dynamic request is re-traversed if it is
  // also reachable statically, so the static graph cannot be under-reported.
  for (let index = 0; index < work.length; index++) {
    const { path, staticReachable } = work[index]
    const asset = output.assets.get(path)
    if (!asset) throw new RouteBudgetError(`Missing production asset: ${path}`)
    const source = await readFile(asset.file, 'utf8')
    for (const specifier of await staticImportSpecifiers(source, path)) {
      const resolved = resolveRelativeSpecifier(path, specifier)
      if (resolved === null) {
        // Nuxt's entry shim imports a bare specifier that the SSR importmap
        // binds to an own chunk. Unmapped bare specifiers still fail closed.
        const mapped = resolveImportMapSpecifier(importMap, specifier, { origin, assetPrefix })
        if (mapped === null) {
          throw new RouteBudgetError(`Non-relative static import "${specifier}" in ${path}`)
        }
        add(mapped, 'importmap', staticReachable)
        continue
      }
      add(normalizeAssetPath(resolved, { assetPrefix }), 'static-import', staticReachable)
    }
  }

  const paths = [...nodes.keys()].sort()
  return {
    paths,
    sources: new Map(paths.map(path => [path, [...nodes.get(path).sources][0]])),
    staticGraphPaths: paths.filter(path => nodes.get(path).staticReachable),
    observedRequestPaths: [...requested].sort(),
  }
}

/**
 * Account the initial JavaScript for one route.
 * Throws on structural problems (empty graph, external, missing, failed,
 * stalled, source maps) so the result can never silently under-count.
 */
export async function accountInitialRoute({
  html,
  requests = [],
  output,
  origin,
  budgetBytes = INITIAL_ROUTE_JS_BUDGET_BYTES,
  assetPrefix = OWN_ASSET_PREFIX,
}) {
  if (output.sourceMaps.length) {
    throw new RouteBudgetError(`Production contains ${output.sourceMaps.length} source maps`)
  }
  const { paths, sources, staticGraphPaths, observedRequestPaths } = await collectInitialRouteAssets({
    html, requests, output, origin, assetPrefix,
  })
  if (paths.length === 0) {
    throw new RouteBudgetError(
      'No initial JavaScript assets were found; an empty script graph cannot pass the budget',
    )
  }

  const assets = []
  let rawBytes = 0
  let gzipBytes = 0
  for (const path of paths) {
    const asset = output.assets.get(path)
    const measured = await measureAsset(asset)
    rawBytes += measured.rawBytes
    gzipBytes += measured.gzipBytes
    assets.push({ path, source: sources.get(path), ...measured })
  }

  return {
    assets,
    assetCount: assets.length,
    staticGraphPaths,
    observedRequestPaths,
    staticGraphCount: staticGraphPaths.length,
    observedRequestCount: observedRequestPaths.length,
    rawBytes,
    initialRouteJsGzipBytes: gzipBytes,
    budgetBytes,
    withinBudget: gzipBytes <= budgetBytes,
    allJavaScriptGzipBytes: output.allJavaScriptGzipBytes,
    sourceMaps: output.sourceMaps.length,
    payloadBytes: nuxtPayloadBytes(html),
  }
}

export function assertWithinBudget(result) {
  if (!result.withinBudget) {
    throw new RouteBudgetError(
      `Initial route JavaScript budget exceeded: ${result.initialRouteJsGzipBytes} > ${result.budgetBytes} gzip bytes`,
    )
  }
  return result
}

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])
const RAW_TEXT_TAGS = new Set(['script', 'style', 'template'])
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decodeEntities(text) {
  return String(text).replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, name) => {
    if (name.startsWith('#')) {
      const code = name[1]?.toLowerCase() === 'x'
        ? Number.parseInt(name.slice(2), 16)
        : Number.parseInt(name.slice(1), 10)
      if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff) return whole
      try {
        return String.fromCodePoint(code)
      } catch {
        return whole
      }
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? whole
  })
}

function collapseWhitespace(text) {
  return String(text).replace(/\s+/g, ' ').trim()
}

function textFromHtml(html) {
  return String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
}

function findElementEnd(html, startIndex, tagName) {
  const tagPattern = /<(\/?)([a-zA-Z][\w:-]*)\b[^>]*?(\/?)>/g
  tagPattern.lastIndex = startIndex
  let depth = 1
  const lower = html.toLowerCase()
  let match
  while ((match = tagPattern.exec(html))) {
    const closing = match[1] === '/'
    const name = match[2].toLowerCase()
    const selfClosing = match[3] === '/'
    if (RAW_TEXT_TAGS.has(name) && !closing) {
      const closeAt = lower.indexOf(`</${name}`, tagPattern.lastIndex)
      if (closeAt === -1) return -1
      tagPattern.lastIndex = closeAt
      continue
    }
    if (name !== tagName) continue
    if (closing) {
      depth -= 1
      if (depth === 0) return match.index
    } else if (!selfClosing && !VOID_TAGS.has(name)) {
      depth += 1
    }
  }
  return -1
}

/**
 * Text actually rendered inside `#__nuxt`, excluding scripts, styles and
 * templates. `closed: false` means the element exists but cannot be bounded;
 * that is not acceptable proof for a route content check.
 */
export function extractNuxtMainText(html) {
  const source = String(html)
  const open = source.match(
    /<([a-zA-Z][\w:-]*)\b[^>]*\bid\s*=\s*(?:"__nuxt"|'__nuxt'|__nuxt\b)[^>]*>/i,
  )
  if (!open) return { found: false, closed: false, text: '' }
  const tagName = open[1].toLowerCase()
  if (VOID_TAGS.has(tagName) || /\/\s*>$/.test(open[0])) {
    return { found: true, closed: false, text: '' }
  }
  const start = open.index + open[0].length
  const end = findElementEnd(source, start, tagName)
  if (end === -1) return { found: true, closed: false, text: '' }
  const text = collapseWhitespace(decodeEntities(textFromHtml(source.slice(start, end))))
  return { found: true, closed: true, text }
}

/**
 * Route identity and main-content proof, kept separate from the budget so a
 * non-JS failure is never reported as a performance result.
 *
 * `expectedContent` comes from the declared fixture. It must appear as rendered
 * text inside `#__nuxt` (never inside a script), so a 200 navbar-only error
 * page and an empty `#__nuxt` cannot pass.
 */
export function evaluateRouteResponse({
  name = 'route',
  path = '/',
  status,
  headers = {},
  body = '',
  expectedContent,
  requireNoIndex = true,
}) {
  const header = (key) => {
    const entry = Object.entries(headers).find(([headerName]) => headerName.toLowerCase() === key)
    return entry ? String(entry[1]) : ''
  }
  const source = String(body)
  const robotsTag = header('x-robots-tag')
  const hasNoIndex = /noindex/i.test(robotsTag)
  const titleMatch = source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch
    ? collapseWhitespace(decodeEntities(textFromHtml(titleMatch[1])))
    : ''
  const nuxt = extractNuxtMainText(source)
  const expected = typeof expectedContent === 'string'
    ? collapseWhitespace(decodeEntities(expectedContent))
    : ''
  const visibleText = collapseWhitespace(decodeEntities(textFromHtml(source)))
  const mainContentFound = expected.length > 0 && nuxt.text.includes(expected)

  const checks = {
    httpStatus: status === 200,
    noindex: requireNoIndex ? hasNoIndex : true,
    contentReady: title.length > 0
      && nuxt.found
      && nuxt.closed
      && nuxt.text.length > 0
      && mainContentFound,
  }

  return {
    name,
    path,
    ok: Object.values(checks).every(Boolean),
    checks,
    evidence: {
      status: typeof status === 'number' ? status : null,
      robotsTag,
      noindex: hasNoIndex,
      title,
      nuxtRootFound: nuxt.found,
      nuxtRootClosed: nuxt.closed,
      mainContentExpected: expected,
      mainContentFound,
      mainContentTextLength: nuxt.text.length,
      mainContentExcerpt: nuxt.text.slice(0, 160),
      visibleTextLength: visibleText.length,
    },
  }
}

export function assertRouteResponse(options) {
  const result = evaluateRouteResponse(options)
  if (!result.ok) {
    const failed = Object.entries(result.checks)
      .filter(([, ok]) => !ok)
      .map(([key]) => key)
      .join(', ')
    throw new RouteBudgetError(`Route ${result.name} (${result.path}) failed: ${failed}`)
  }
  return result
}

function normalizeRoutePath(path, index) {
  if (typeof path !== 'string' || !path.startsWith('/')) {
    throw new RouteBudgetError(`Route fixture ${index} needs a path starting with "/"`)
  }
  if (path.startsWith('//')) {
    throw new RouteBudgetError(`Route fixture ${index} path must not be protocol-relative: ${path}`)
  }
  if (path.includes(String.fromCharCode(92))) {
    throw new RouteBudgetError(`Route fixture ${index} path must not contain a backslash: ${path}`)
  }
  if (path.includes('#')) {
    throw new RouteBudgetError(`Route fixture ${index} path must not contain a fragment: ${path}`)
  }
  if (path.includes('?')) {
    throw new RouteBudgetError(`Route fixture ${index} must declare query parameters in "query": ${path}`)
  }
  if (CONTROL_CHARS.test(path) || /\s/.test(path)) {
    throw new RouteBudgetError(`Route fixture ${index} path contains control or whitespace characters`)
  }
  if (path.includes('%')) {
    throw new RouteBudgetError(`Route fixture ${index} path must be declared unencoded: ${path}`)
  }
  if (path.length > 1 && path.endsWith('/')) {
    throw new RouteBudgetError(`Route fixture ${index} path must not end with "/": ${path}`)
  }
  if (path !== '/') {
    for (const segment of path.slice(1).split('/')) {
      if (segment === '' || segment === '.' || segment === '..') {
        throw new RouteBudgetError(`Route fixture ${index} path has an empty or dot segment: ${path}`)
      }
    }
  }
  let url
  try {
    url = new URL(path, ROUTE_SENTINEL_ORIGIN)
  } catch {
    throw new RouteBudgetError(`Route fixture ${index} path is not a valid URL path: ${path}`)
  }
  if (url.origin !== ROUTE_SENTINEL_ORIGIN || url.pathname !== encodeURI(path)) {
    throw new RouteBudgetError(`Route fixture ${index} path is not a normalized same-origin path: ${path}`)
  }
  return path
}

function normalizeRouteQuery(query, index) {
  if (query === undefined) return null
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    throw new RouteBudgetError(`Route fixture ${index} "query" must be a plain object`)
  }
  const entries = []
  for (const [key, value] of Object.entries(query)) {
    if (key.length === 0 || CONTROL_CHARS.test(key) || /[&#]/.test(key)) {
      throw new RouteBudgetError(`Route fixture ${index} has an invalid query name: ${key}`)
    }
    if (!['string', 'number', 'boolean'].includes(typeof value)) {
      throw new RouteBudgetError(`Route fixture ${index} query "${key}" needs a scalar value`)
    }
    if (typeof value === 'string' && (CONTROL_CHARS.test(value) || value.includes('#'))) {
      throw new RouteBudgetError(`Route fixture ${index} query "${key}" has an invalid value`)
    }
    entries.push([key, String(value)])
  }
  entries.sort(([left], [right]) => left.localeCompare(right))
  const params = new URLSearchParams()
  for (const [key, value] of entries) params.append(key, value)
  return params.toString()
}

function normalizeContentMarker(marker, index, path) {
  if (typeof marker !== 'string' || marker.trim().length === 0) {
    throw new RouteBudgetError(
      `Route fixture ${index} (${path}) needs a non-empty "mainContent" text marker`,
    )
  }
  const normalized = marker.trim()
  if (CONTROL_CHARS.test(normalized) || normalized.includes('<') || normalized.includes('>')) {
    throw new RouteBudgetError(
      `Route fixture ${index} (${path}) "mainContent" must be plain rendered text, not markup`,
    )
  }
  return normalized
}

/**
 * A route list is mandatory. There is no default set: unmigrated routes must
 * never be reported as passing by omission.
 *
 * Each route declares a canonical same-origin `path`, optional scalar `query`,
 * and a `mainContent` text marker that proves the real page body rendered.
 */
export function validateRouteFixtures(input) {
  if (!input || !Array.isArray(input.routes) || input.routes.length === 0) {
    throw new RouteBudgetError(
      'A declared route fixture list is required; unmigrated routes cannot be assumed to pass',
    )
  }
  const seen = new Set()
  return input.routes.map((route, index) => {
    if (!route || typeof route !== 'object' || Array.isArray(route)) {
      throw new RouteBudgetError(`Route fixture ${index} must be an object`)
    }
    const path = normalizeRoutePath(route.path, index)
    const query = normalizeRouteQuery(route.query, index)
    const mainContent = normalizeContentMarker(route.mainContent, index, path)
    const canonical = query ? `${path}?${query}` : path
    if (seen.has(canonical)) {
      throw new RouteBudgetError(`Duplicate route fixture path: ${canonical}`)
    }
    seen.add(canonical)
    return {
      name: typeof route.name === 'string' && route.name.length > 0 ? route.name : path,
      path,
      query,
      mainContent,
    }
  })
}

/**
 * The `--base` used to navigate and (for `--serve`) to run the checked build.
 * It must be an origin: no path, credentials, query or fragment. Serving needs
 * plain HTTP on the loopback interface and uses that exact port.
 */
export function parseServeTarget(base, { serve = true } = {}) {
  let url
  try {
    url = new URL(base)
  } catch {
    throw new RouteBudgetError(`Invalid --base URL: ${base}`)
  }
  const allowedProtocols = serve ? ['http:'] : ['http:', 'https:']
  if (!allowedProtocols.includes(url.protocol)) {
    const names = allowedProtocols.map(protocol => protocol.replace(':', '')).join(' or ')
    throw new RouteBudgetError(`--base must use ${names}: ${base}`)
  }
  if (url.username || url.password) {
    throw new RouteBudgetError('--base must not contain credentials')
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new RouteBudgetError('--base must be an origin without a path, query or fragment')
  }
  const hostname = url.hostname.startsWith('[') && url.hostname.endsWith(']')
    ? url.hostname.slice(1, -1)
    : url.hostname
  if (serve && !['127.0.0.1', 'localhost', '::1'].includes(hostname)) {
    throw new RouteBudgetError('--serve requires --base on the loopback interface')
  }
  return {
    origin: url.origin,
    hostname,
    port: url.port || (url.protocol === 'http:' ? '80' : '443'),
  }
}

/**
 * Nuxt's SSR importmap: an inline `<script type="importmap">` JSON document
 * that maps bare specifiers (for example `#entry`) to own build chunks. Only a
 * narrow, documented subset is supported: a single map with exact-string
 * `imports` bindings. Scopes, prefix mappings and multiple maps are rejected
 * rather than approximated.
 */
export function parseImportMap(html) {
  const bodies = []
  for (const match of String(html).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const type = (attribute(match[0], 'type') ?? '').split(';')[0].trim().toLowerCase()
    if (type === 'importmap') bodies.push(match[1])
  }
  if (bodies.length === 0) return { present: false, imports: new Map() }
  if (bodies.length > 1) {
    throw new RouteBudgetError(
      'Multiple SSR importmap scripts are not supported; refusing to guess browser merge semantics',
    )
  }
  let document
  try {
    document = JSON.parse(bodies[0])
  } catch (error) {
    throw new RouteBudgetError(`SSR importmap is not valid JSON: ${error.message}`)
  }
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new RouteBudgetError('SSR importmap must be a JSON object')
  }
  const imports = new Map()
  if (document.imports !== undefined) {
    const bindings = document.imports
    if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings)) {
      throw new RouteBudgetError('SSR importmap "imports" must be an object of string bindings')
    }
    for (const key of Object.keys(bindings)) {
      if (key.length === 0) throw new RouteBudgetError('SSR importmap has an empty binding key')
      if (key.endsWith('/')) {
        throw new RouteBudgetError(`Importmap prefix mapping "${key}" is not supported; refusing to approximate it`)
      }
      const target = bindings[key]
      if (typeof target !== 'string' || target.length === 0) {
        throw new RouteBudgetError(`Importmap binding "${key}" needs a non-empty URL string`)
      }
      imports.set(key, target)
    }
  }
  if (document.scopes !== undefined) {
    const scopes = document.scopes
    const keys = scopes && typeof scopes === 'object' && !Array.isArray(scopes) ? Object.keys(scopes) : null
    if (keys === null || keys.length > 0) {
      throw new RouteBudgetError('SSR importmap "scopes" are not supported; refusing to approximate them')
    }
  }
  return { present: true, imports }
}

/**
 * Resolve one bare static specifier through exact importmap bindings. Returns
 * null when no binding exists (the caller keeps failing closed), and throws
 * when a binding exists but is unsafe or is not an own JavaScript asset.
 * Lookups use a Map, so inherited object keys can never act as bindings.
 */
export function resolveImportMapSpecifier(importMap, specifier, { origin, assetPrefix = OWN_ASSET_PREFIX } = {}) {
  if (!importMap || !importMap.imports || !importMap.imports.has(specifier)) return null
  const target = importMap.imports.get(specifier)
  // Check the raw target before URL parsing: for special schemes the URL
  // parser silently turns a backslash into a path separator, which would let a
  // dangerous mapping masquerade as a different, harmless path.
  if (target.includes(String.fromCharCode(92))) {
    throw new RouteBudgetError(`Importmap binding "${specifier}" must not contain a backslash: ${target}`)
  }
  if (target.includes('%')) {
    throw new RouteBudgetError(`Importmap binding "${specifier}" must not be percent-encoded: ${target}`)
  }
  if (CONTROL_CHARS.test(target) || target.trim().length !== target.length) {
    throw new RouteBudgetError(
      `Importmap binding "${specifier}" must not contain control or whitespace characters: ${target}`,
    )
  }
  let url
  try {
    url = new URL(target, origin)
  } catch {
    throw new RouteBudgetError(`Importmap binding "${specifier}" is not a valid URL: ${target}`)
  }
  if (url.origin !== new URL(origin).origin) {
    throw new RouteBudgetError(`Importmap binding "${specifier}" points outside the app origin: ${target}`)
  }
  if (url.search || url.hash) {
    throw new RouteBudgetError(`Importmap binding "${specifier}" must not carry a query or fragment: ${target}`)
  }
  // Only absolute own-origin paths are supported. A relative target would be
  // resolved by the browser against the page URL, which this accounting does
  // not model, so it is rejected instead of being guessed from the origin.
  if (!target.startsWith('/') || target.startsWith('//')) {
    throw new RouteBudgetError(
      `Importmap binding "${specifier}" must be an absolute own-origin path, not a relative target: ${target}`,
    )
  }
  return normalizeAssetPath(url.pathname, { assetPrefix })
}
