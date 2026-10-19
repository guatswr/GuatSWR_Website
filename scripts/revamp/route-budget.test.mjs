// Pure tests for the initial-route JavaScript accounting.
// Run with: node --test scripts/revamp/route-budget.test.mjs
// No browser, no build output: every asset tree below is a temporary fixture.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import {
  RouteBudgetError,
  accountInitialRoute,
  assertRequestSucceeded,
  assertRouteResponse,
  assertWithinBudget,
  evaluateRouteResponse,
  extractNuxtMainText,
  initialAssetSeeds,
  inspectOutput,
  isTerminalRequest,
  normalizeAssetPath,
  nuxtPayloadBytes,
  parseImportMap,
  parseServeTarget,
  serverEntryFor,
  settleScriptRequests,
  staticImportSpecifiers,
  validateRouteFixtures,
} from './route-budget.mjs'

const ORIGIN = 'http://127.0.0.1:3300'
const BACKSLASH = String.fromCharCode(92)

async function withOutput(t, files) {
  const root = await mkdtemp(join(tmpdir(), 'route-budget-'))
  for (const [name, contents] of Object.entries(files)) {
    const file = join(root, 'public', '_nuxt', name)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, contents)
  }
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

const htmlWithSeeds = (...seeds) => `<!doctype html><html><head>${seeds
  .map(seed => `<link rel="modulepreload" href="${seed}">`)
  .join('')}</head><body><div id="__nuxt"><h1>Hi</h1></div></body></html>`

const pageHtml = (marker, { title = 'Page', extra = '' } = {}) => [
  '<!doctype html><html><head><title>', title, '</title></head><body>',
  '<div id="__nuxt"><main><h1>', marker, '</h1></main></div>', extra, '</body></html>',
].join('')

const request = (path, status = 200, extra = {}) => ({
  url: `${ORIGIN}${path}`,
  resourceType: 'script',
  status,
  finished: true,
  ...extra,
})

test('seeds classic and module scripts and script preloads, not data scripts', () => {
  const html = [
    '<script src="/_nuxt/classic.js"></script>',
    '<script type="module" src="/_nuxt/entry.js"></script>',
    '<script type="text/javascript; charset=utf-8" src="/_nuxt/typed.js"></script>',
    '<script type="application/json" src="/_nuxt/data.js"></script>',
    '<script type="importmap" src="/_nuxt/map.js"></script>',
    '<script type="text/x-template" src="/_nuxt/tpl.js"></script>',
    '<script>window.inline = 1</script>',
    '<link rel="modulepreload" href="/_nuxt/pre.js">',
    '<link rel="preload" as="script" href="/_nuxt/preload.js">',
    '<link rel="preload" href="/_nuxt/guessed.js">',
    '<link rel="prefetch" href="/_nuxt/deferred.js">',
    '<link rel="stylesheet" href="/_nuxt/site.css">',
  ].join('')
  assert.deepEqual(initialAssetSeeds(html).sort(), [
    '/_nuxt/classic.js',
    '/_nuxt/entry.js',
    '/_nuxt/guessed.js',
    '/_nuxt/pre.js',
    '/_nuxt/preload.js',
    '/_nuxt/typed.js',
  ])
})

test('follows static imports transitively and counts shared or cyclic modules once', async (t) => {
  const root = await withOutput(t, {
    'entry.js': "import './a.js'\nimport './b.js'\n",
    'a.js': "import './shared.js'\nexport const a = 1\n",
    'b.js': "import './shared.js'\nimport './c.js'\nexport const b = 1\n",
    'c.js': "import './a.js'\nexport const c = 1\n",
    'shared.js': 'export const shared = 1\n',
  })
  const output = await inspectOutput(root)
  const result = await accountInitialRoute({ html: htmlWithSeeds('/_nuxt/entry.js'), output, origin: ORIGIN })

  assert.deepEqual(result.assets.map(asset => asset.path), [
    '/_nuxt/a.js', '/_nuxt/b.js', '/_nuxt/c.js', '/_nuxt/entry.js', '/_nuxt/shared.js',
  ])
  assert.equal(result.assetCount, 5)
  assert.equal(result.assets.find(asset => asset.path === '/_nuxt/shared.js').source, 'static-import')
})

test('excludes a dynamic import until the browser requests it', async (t) => {
  const root = await withOutput(t, {
    'entry.js': "export const load = () => import('./lazy.js')\n",
    'lazy.js': 'export const lazy = 1\n',
  })
  const output = await inspectOutput(root)

  const cold = await accountInitialRoute({ html: htmlWithSeeds('/_nuxt/entry.js'), output, origin: ORIGIN })
  assert.deepEqual(cold.assets.map(asset => asset.path), ['/_nuxt/entry.js'])
  assert.deepEqual(cold.staticGraphPaths, ['/_nuxt/entry.js'])
  assert.deepEqual(cold.observedRequestPaths, [])

  const afterRequest = await accountInitialRoute({
    html: htmlWithSeeds('/_nuxt/entry.js'),
    output,
    origin: ORIGIN,
    requests: [request('/_nuxt/lazy.js')],
  })
  assert.deepEqual(afterRequest.assets.map(asset => asset.path), ['/_nuxt/entry.js', '/_nuxt/lazy.js'])
  assert.deepEqual(afterRequest.staticGraphPaths, ['/_nuxt/entry.js'])
  assert.deepEqual(afterRequest.observedRequestPaths, ['/_nuxt/lazy.js'])
  assert.equal(afterRequest.staticGraphCount, 1)
  assert.equal(afterRequest.observedRequestCount, 1)
})

test('counts a chunk the browser prefetched automatically', async (t) => {
  const root = await withOutput(t, {
    'entry.js': 'export const entry = 1\n',
    'prefetched.js': 'export const prefetched = 1\n',
  })
  const output = await inspectOutput(root)
  const result = await accountInitialRoute({
    html: htmlWithSeeds('/_nuxt/entry.js'),
    output,
    origin: ORIGIN,
    requests: [request('/_nuxt/prefetched.js')],
  })

  assert.deepEqual(result.assets.map(asset => asset.path), ['/_nuxt/entry.js', '/_nuxt/prefetched.js'])
  assert.equal(result.assets.find(asset => asset.path === '/_nuxt/prefetched.js').source, 'request')
})

test('counts duplicate query variants of one asset once', async (t) => {
  const root = await withOutput(t, { 'entry.js': 'export const entry = 1\n' })
  const output = await inspectOutput(root)
  const result = await accountInitialRoute({
    html: htmlWithSeeds('/_nuxt/entry.js'),
    output,
    origin: ORIGIN,
    requests: [request('/_nuxt/entry.js?v=1'), request('/_nuxt/entry.js?v=2')],
  })

  assert.equal(result.assetCount, 1)
  assert.equal(result.assets[0].source, 'ssr')
  assert.deepEqual(result.observedRequestPaths, ['/_nuxt/entry.js'])
})

test('refuses to pass a route with an empty script graph', async (t) => {
  const root = await withOutput(t, { 'entry.js': 'export const entry = 1\n' })
  const output = await inspectOutput(root)

  await assert.rejects(
    accountInitialRoute({
      html: '<!doctype html><html><body><div id="__nuxt"><h1>No scripts</h1></div></body></html>',
      output,
      origin: ORIGIN,
    }),
    { name: 'RouteBudgetError', message: /empty script graph/ },
  )
})

test('rejects external JavaScript and missing production assets', async (t) => {
  const root = await withOutput(t, { 'entry.js': 'export const entry = 1\n' })
  const output = await inspectOutput(root)

  await assert.rejects(
    accountInitialRoute({
      html: htmlWithSeeds('/_nuxt/entry.js'),
      output,
      origin: ORIGIN,
      requests: [{ url: 'https://cdn.example.com/vendor.js', resourceType: 'script', status: 200 }],
    }),
    { name: 'RouteBudgetError', message: /External asset request/ },
  )

  await assert.rejects(
    accountInitialRoute({
      html: '<html><body><div id="__nuxt"></div><script src="https://cdn.example.com/vendor.js"></script></body></html>',
      output,
      origin: ORIGIN,
    }),
    { name: 'RouteBudgetError', message: /External asset reference/ },
  )

  await assert.rejects(
    accountInitialRoute({
      html: htmlWithSeeds('/_nuxt/entry.js'),
      output,
      origin: ORIGIN,
      requests: [request('/_nuxt/missing.js')],
    }),
    { name: 'RouteBudgetError', message: /Missing production asset/ },
  )
})

test('rejects traversal, encoded separators and backslash asset paths', () => {
  const rejected = [
    '/_nuxt/../secret.js',
    '/_nuxt/%2e%2e/secret.js',
    '/_nuxt/..%5csecret.js',
    `/_nuxt/sub${BACKSLASH}secret.js`,
    '/_nuxt//double.js',
    '/elsewhere/asset.js',
    '/_nuxt/asset.css',
  ]
  for (const path of rejected) {
    assert.throws(() => normalizeAssetPath(path), RouteBudgetError, path)
  }
  assert.equal(normalizeAssetPath('/_nuxt/D9UJMR5y.js'), '/_nuxt/D9UJMR5y.js')
})

test('rejects non-relative static imports instead of counting them as zero', async (t) => {
  const root = await withOutput(t, { 'entry.js': "import 'vue'\n" })
  const output = await inspectOutput(root)

  await assert.rejects(
    accountInitialRoute({ html: htmlWithSeeds('/_nuxt/entry.js'), output, origin: ORIGIN }),
    { name: 'RouteBudgetError', message: /Non-relative static import/ },
  )
})

test('resolves ../ chunks inside the own prefix but fails ones that leave it', async (t) => {
  const inside = await withOutput(t, {
    'entry.js': "import './chunks/a.js'\n",
    'chunks/a.js': "import '../shared.js'\nexport const a = 1\n",
    'shared.js': 'export const shared = 1\n',
  })
  const insideOutput = await inspectOutput(inside)
  const result = await accountInitialRoute({
    html: htmlWithSeeds('/_nuxt/entry.js'), output: insideOutput, origin: ORIGIN,
  })
  assert.deepEqual(result.assets.map(asset => asset.path), [
    '/_nuxt/chunks/a.js', '/_nuxt/entry.js', '/_nuxt/shared.js',
  ])

  const outside = await withOutput(t, {
    'entry.js': "import '../secret.js'\n",
  })
  const outsideOutput = await inspectOutput(outside)
  await assert.rejects(
    accountInitialRoute({ html: htmlWithSeeds('/_nuxt/entry.js'), output: outsideOutput, origin: ORIGIN }),
    { name: 'RouteBudgetError', message: /Asset outside/ },
  )
})

test('fails the accounting on failed, stalled or incomplete script requests', async (t) => {
  const root = await withOutput(t, { 'entry.js': 'export const entry = 1\n' })
  const output = await inspectOutput(root)
  const base = { html: htmlWithSeeds('/_nuxt/entry.js'), output, origin: ORIGIN }

  await assert.rejects(
    accountInitialRoute({ ...base, requests: [request('/_nuxt/entry.js', 200, { failure: 'net::ERR_FAILED' })] }),
    { name: 'RouteBudgetError', message: /Script request failed/ },
  )
  await assert.rejects(
    accountInitialRoute({ ...base, requests: [request('/_nuxt/entry.js', 200, { stalled: true })] }),
    { name: 'RouteBudgetError', message: /stalled/ },
  )
  await assert.rejects(
    accountInitialRoute({ ...base, requests: [request('/_nuxt/entry.js', 200, { finished: false })] }),
    { name: 'RouteBudgetError', message: /did not complete/ },
  )
  await assert.rejects(
    accountInitialRoute({ ...base, requests: [request('/_nuxt/entry.js', 404)] }),
    { name: 'RouteBudgetError', message: /HTTP 404/ },
  )
  await assert.rejects(
    accountInitialRoute({ ...base, requests: [{ url: `${ORIGIN}/_nuxt/entry.js`, resourceType: 'script' }] }),
    { name: 'RouteBudgetError', message: /No response observed/ },
  )
})

test('bounds script completion and marks requests still open at the deadline', async () => {
  assert.equal(isTerminalRequest({ finished: true }), true)
  assert.equal(isTerminalRequest({ failure: 'net::ERR_ABORTED' }), true)
  assert.equal(isTerminalRequest({ status: 200, finished: false }), false)
  assert.throws(
    () => assertRequestSucceeded({ url: `${ORIGIN}/x.js`, status: 200, finished: false }),
    /did not complete/,
  )

  let clock = 0
  const stalled = { url: `${ORIGIN}/_nuxt/slow.js`, resourceType: 'script', status: 200, finished: false }
  await settleScriptRequests([stalled], {
    timeoutMs: 50,
    pollMs: 10,
    now: () => clock,
    sleep: async (ms) => { clock += ms },
  })
  assert.equal(stalled.stalled, true)

  const completing = { url: `${ORIGIN}/_nuxt/late.js`, resourceType: 'script', status: 200, finished: false }
  let sleeps = 0
  await settleScriptRequests([completing], {
    timeoutMs: 100,
    pollMs: 10,
    now: () => clock,
    sleep: async (ms) => { sleeps += 1; clock += ms; completing.finished = true },
  })
  assert.equal(completing.finished, true)
  assert.equal(completing.stalled, undefined)
  assert.equal(sleeps, 1)

  await settleScriptRequests([{ url: `${ORIGIN}/_nuxt/done.js`, status: 200, finished: true }], {
    timeoutMs: 0,
    now: () => clock,
    sleep: async () => { throw new Error('already terminal requests must not be polled') },
  })
})

test('prefers the precompressed .gz size and enforces the budget edge exactly', async (t) => {
  const root = await withOutput(t, { 'entry.js': 'export const entry = 1\n' })
  await writeFile(join(root, 'public', '_nuxt', 'entry.js.gz'), Buffer.alloc(100, 7))
  const output = await inspectOutput(root)

  const atBudget = await accountInitialRoute({
    html: htmlWithSeeds('/_nuxt/entry.js'), output, origin: ORIGIN, budgetBytes: 100,
  })
  assert.equal(atBudget.assets[0].gzipSource, 'precompressed')
  assert.equal(atBudget.assets[0].gzipBytes, 100)
  assert.equal(atBudget.withinBudget, true)
  assert.doesNotThrow(() => assertWithinBudget(atBudget))

  const overBudget = await accountInitialRoute({
    html: htmlWithSeeds('/_nuxt/entry.js'), output, origin: ORIGIN, budgetBytes: 99,
  })
  assert.equal(overBudget.withinBudget, false)
  assert.throws(() => assertWithinBudget(overBudget), { name: 'RouteBudgetError', message: /budget exceeded/ })
})

test('falls back to a documented level-9 gzip size when no .gz exists', async (t) => {
  const source = 'export const entry = 1\n'
  const root = await withOutput(t, { 'entry.js': source })
  const output = await inspectOutput(root)

  const result = await accountInitialRoute({ html: htmlWithSeeds('/_nuxt/entry.js'), output, origin: ORIGIN })
  assert.equal(result.assets[0].gzipSource, 'gzip-level-9-fallback')
  assert.equal(result.assets[0].gzipBytes, gzipSync(Buffer.from(source), { level: 9 }).byteLength)
})

test('detects source maps anywhere and refuses to account', async (t) => {
  const root = await withOutput(t, { 'entry.js': 'export const entry = 1\n', 'entry.js.map': '{}' })
  const output = await inspectOutput(root)

  assert.equal(output.sourceMaps.length, 1)
  await assert.rejects(
    accountInitialRoute({ html: htmlWithSeeds('/_nuxt/entry.js'), output, origin: ORIGIN }),
    { name: 'RouteBudgetError', message: /source maps/ },
  )
})

test('records raw status, robots header and main-content proof for a real page', () => {
  const ready = evaluateRouteResponse({
    name: 'home',
    path: '/',
    status: 200,
    headers: { 'X-Robots-Tag': 'noindex, nofollow' },
    body: [
      '<!doctype html><html><head><title>Club &amp; Home</title></head><body>',
      '<div id="__nuxt"><div><h1>Welcome home</h1></div></div>',
      '<footer>Contact us</footer></body></html>',
    ].join(''),
    expectedContent: 'Welcome home',
  })
  assert.equal(ready.ok, true)
  assert.deepEqual(ready.checks, { httpStatus: true, noindex: true, contentReady: true })
  assert.equal(ready.evidence.status, 200)
  assert.equal(ready.evidence.robotsTag, 'noindex, nofollow')
  assert.equal(ready.evidence.noindex, true)
  assert.equal(ready.evidence.title, 'Club & Home')
  assert.equal(ready.evidence.mainContentFound, true)
  assert.equal(ready.evidence.mainContentTextLength, 'Welcome home'.length)
  assert.equal(ready.evidence.mainContentExcerpt, 'Welcome home')
  assert.equal(ready.evidence.nuxtRootFound, true)
  assert.equal(ready.evidence.nuxtRootClosed, true)
})

test('rejects an empty #__nuxt even when a title and script text are present', () => {
  const empty = evaluateRouteResponse({
    status: 200,
    headers: { 'X-Robots-Tag': 'noindex' },
    body: '<title>x</title><div id="__nuxt"></div><script>window.payload = 1</script>',
    expectedContent: 'x',
  })
  assert.equal(empty.checks.contentReady, false)
  assert.equal(empty.evidence.title, 'x')
  assert.equal(empty.evidence.mainContentTextLength, 0)

  const scriptOnly = evaluateRouteResponse({
    status: 200,
    headers: { 'X-Robots-Tag': 'noindex' },
    body: '<title>Page</title><div id="__nuxt"><script>const heading = "Secret heading"</script></div>',
    expectedContent: 'Secret heading',
  })
  assert.equal(scriptOnly.checks.contentReady, false)
  assert.equal(scriptOnly.evidence.mainContentFound, false)
})

test('rejects navbar-only 200 pages, markers outside #__nuxt and unbounded roots', () => {
  const errorPage = evaluateRouteResponse({
    status: 200,
    headers: { 'X-Robots-Tag': 'noindex' },
    body: [
      '<title>Page</title><div id="__nuxt">',
      '<nav><a href="/">Home</a><a href="/join">Join</a></nav>',
      '<main><h1>Not Found</h1></main></div>',
    ].join(''),
    expectedContent: 'Welcome home',
  })
  assert.equal(errorPage.checks.contentReady, false)

  const footerMarker = evaluateRouteResponse({
    status: 200,
    headers: { 'X-Robots-Tag': 'noindex' },
    body: '<title>Page</title><div id="__nuxt"><p>Body</p></div><footer>Welcome home</footer>',
    expectedContent: 'Welcome home',
  })
  assert.equal(footerMarker.checks.contentReady, false)

  const unclosed = evaluateRouteResponse({
    status: 200,
    headers: { 'X-Robots-Tag': 'noindex' },
    body: '<title>Page</title><div id="__nuxt"><p>Welcome home</p>',
    expectedContent: 'Welcome home',
  })
  assert.equal(unclosed.checks.contentReady, false)
  assert.equal(unclosed.evidence.nuxtRootClosed, false)
})

test('keeps identity checks separate and fails a 404 or missing noindex', () => {
  const missing = evaluateRouteResponse({ name: 'gone', path: '/gone', status: 404, headers: {}, body: '' })
  assert.deepEqual(missing.checks, { httpStatus: false, noindex: false, contentReady: false })
  assert.throws(
    () => assertRouteResponse({ name: 'gone', path: '/gone', status: 404 }),
    { message: /httpStatus/ },
  )

  const indexable = evaluateRouteResponse({
    status: 200,
    headers: {},
    body: pageHtml('Welcome home'),
    expectedContent: 'Welcome home',
  })
  assert.equal(indexable.checks.noindex, false)
  assert.equal(indexable.ok, false)

  const allowed = evaluateRouteResponse({
    status: 200,
    headers: {},
    body: pageHtml('Welcome home'),
    expectedContent: 'Welcome home',
    requireNoIndex: false,
  })
  assert.equal(allowed.ok, true)
})

test('reports the Nuxt payload separately from JavaScript bytes', async (t) => {
  const root = await withOutput(t, { 'entry.js': 'export const entry = 1\n' })
  const output = await inspectOutput(root)
  const html = `${htmlWithSeeds('/_nuxt/entry.js')}<script type="application/json" id="__NUXT_DATA__">[1,2,3]</script>`

  assert.equal(nuxtPayloadBytes(html), 7)
  const result = await accountInitialRoute({ html, output, origin: ORIGIN })
  assert.equal(result.payloadBytes, 7)
  assert.equal(result.initialRouteJsGzipBytes, result.assets[0].gzipBytes)
  assert.equal(result.assets.reduce((sum, asset) => sum + asset.rawBytes, 0), result.rawBytes)
})

test('validates declared public route fixtures', () => {
  assert.throws(
    () => validateRouteFixtures(undefined),
    { name: 'RouteBudgetError', message: /declared route fixture list/ },
  )
  assert.throws(
    () => validateRouteFixtures({ routes: [] }),
    { name: 'RouteBudgetError', message: /declared route fixture list/ },
  )
  assert.deepEqual(validateRouteFixtures({
    routes: [
      { path: '/', mainContent: 'Welcome home' },
      { name: 'list', path: '/activities', query: { page: 2, sort: 'new' }, mainContent: 'Activities' },
      { name: 'detail', path: '/activity/1', mainContent: '例会记录' },
    ],
  }), [
    { name: '/', path: '/', query: null, mainContent: 'Welcome home' },
    { name: 'list', path: '/activities', query: 'page=2&sort=new', mainContent: 'Activities' },
    { name: 'detail', path: '/activity/1', query: null, mainContent: '例会记录' },
  ])
})

test('rejects route fixture paths that are not bounded same-origin paths', () => {
  const fixture = (path, extra = {}) => ({ routes: [{ path, mainContent: 'Body text', ...extra }] })
  const rejected = [
    ['//cdn.example.com/page', /protocol-relative/],
    [`/${BACKSLASH}authority`, /backslash/],
    ['/a#fragment', /fragment/],
    ['/a?page=2', /query/],
    [`/a${String.fromCharCode(0)}b`, /control or whitespace/],
    ['/a b', /control or whitespace/],
    ['/caf%c3%a9', /unencoded/],
    ['/a/../b', /dot segment/],
    ['/a/./b', /dot segment/],
    ['/a//b', /dot segment/],
    ['/activities/', /must not end with/],
    ['activities', /path starting with/],
  ]
  for (const [path, message] of rejected) {
    assert.throws(() => validateRouteFixtures(fixture(path)), { name: 'RouteBudgetError', message }, path)
  }
  assert.throws(
    () => validateRouteFixtures(fixture('/a', { query: { page: [2] } })),
    { message: /scalar value/ },
  )
  assert.throws(
    () => validateRouteFixtures(fixture('/a', { query: 'page=2' })),
    { message: /plain object/ },
  )
})

test('requires a real main-content marker and unique canonical routes', () => {
  const route = (extra) => ({ routes: [{ path: '/a', ...extra }] })
  for (const mainContent of [undefined, '', '   ', '<h1>Hi</h1>']) {
    assert.throws(
      () => validateRouteFixtures(route({ mainContent })),
      { name: 'RouteBudgetError', message: /mainContent/ },
      String(mainContent),
    )
  }
  assert.throws(
    () => validateRouteFixtures({ routes: [{ path: '/a', mainContent: 'A' }, { path: '/a', mainContent: 'B' }] }),
    { message: /Duplicate route fixture path/ },
  )
  assert.throws(
    () => validateRouteFixtures({
      routes: [
        { path: '/a', query: { page: 2 }, mainContent: 'A' },
        { path: '/a', query: { page: 2 }, mainContent: 'B' },
      ],
    }),
    { message: /Duplicate route fixture path/ },
  )
  assert.equal(
    validateRouteFixtures(route({ query: { b: 'x', a: 1 }, mainContent: 'A' }))[0].query,
    'a=1&b=x',
  )
})

test('extracts main text from nested markup without reading scripts', () => {
  const nested = extractNuxtMainText(
    '<div id="__nuxt"><div><h1>Real</h1><script>const x = "</div>"</script></div></div><footer>Nav</footer>',
  )
  assert.deepEqual(nested, { found: true, closed: true, text: 'Real' })
  assert.equal(extractNuxtMainText('<div class="x">no root</div>').found, false)
})

test('normalizes the serve target and rejects unsupported bases', () => {
  assert.deepEqual(parseServeTarget('http://127.0.0.1:3300'), {
    origin: 'http://127.0.0.1:3300',
    hostname: '127.0.0.1',
    port: '3300',
  })
  assert.equal(parseServeTarget('http://localhost:8080').hostname, 'localhost')
  assert.equal(parseServeTarget('http://[::1]:3300').hostname, '::1')
  assert.equal(parseServeTarget('http://127.0.0.1').port, '80')

  assert.throws(() => parseServeTarget('https://127.0.0.1:3300'), { message: /must use http:/ })
  assert.throws(() => parseServeTarget('http://10.0.0.5:3300'), { message: /loopback/ })
  assert.throws(() => parseServeTarget('http://127.0.0.1:3300/base'), { message: /without a path/ })
  assert.throws(() => parseServeTarget('http://user:pass@127.0.0.1:3300'), { message: /credentials/ })
  assert.throws(() => parseServeTarget('not a url'), { message: /Invalid --base/ })
  assert.equal(parseServeTarget('https://preview.example.com', { serve: false }).origin, 'https://preview.example.com')
})

test('locates the server entry for the exact output tree', () => {
  assert.equal(serverEntryFor('web/.output'), join('web/.output', 'server', 'index.mjs'))
  assert.throws(() => serverEntryFor(''), { name: 'RouteBudgetError', message: /output directory/ })
})

test('static specifier extraction ignores dynamic and import.meta entries', async () => {
  const specifiers = await staticImportSpecifiers(
    "import './a.js'; export { x } from '../b.js'; const lazy = () => import('./lazy.js'); import.meta.url",
  )
  assert.deepEqual(specifiers, ['./a.js', '../b.js'])
})

const importMapHtml = imports => `<script type="importmap">${JSON.stringify({ imports })}</script>`

test('resolves a Nuxt SSR importmap alias and its transitive static imports once', async (t) => {
  const root = await withOutput(t, {
    'shim.js': "import '#entry'\nexport const shim = 1\n",
    'entry.js': "import './shared.js'\nexport const entry = 1\n",
    'shared.js': 'export const shared = 1\n',
  })
  const output = await inspectOutput(root)
  const html = `${htmlWithSeeds('/_nuxt/shim.js')}${importMapHtml({ '#entry': '/_nuxt/entry.js' })}`
  const result = await accountInitialRoute({ html, output, origin: ORIGIN })

  assert.deepEqual(result.assets.map(asset => asset.path), [
    '/_nuxt/entry.js', '/_nuxt/shared.js', '/_nuxt/shim.js',
  ])
  assert.equal(result.assetCount, 3)
  assert.equal(result.assets.find(asset => asset.path === '/_nuxt/entry.js').source, 'importmap')
  assert.equal(result.assets.find(asset => asset.path === '/_nuxt/shared.js').source, 'static-import')
  assert.deepEqual(result.staticGraphPaths, ['/_nuxt/entry.js', '/_nuxt/shared.js', '/_nuxt/shim.js'])
  assert.deepEqual(result.observedRequestPaths, [])
})

test('counts a mapped chunk once when the browser also requested it', async (t) => {
  const root = await withOutput(t, {
    'shim.js': "import '#entry'\nexport const shim = 1\n",
    'entry.js': "import './shared.js'\nexport const entry = 1\n",
    'shared.js': 'export const shared = 1\n',
  })
  const output = await inspectOutput(root)
  const html = `${htmlWithSeeds('/_nuxt/shim.js')}${importMapHtml({ '#entry': '/_nuxt/entry.js' })}`
  const result = await accountInitialRoute({
    html,
    output,
    origin: ORIGIN,
    requests: [request('/_nuxt/entry.js'), request('/_nuxt/entry.js?v=1')],
  })

  assert.equal(result.assetCount, 3)
  assert.deepEqual(result.assets.map(asset => asset.path), [
    '/_nuxt/entry.js', '/_nuxt/shared.js', '/_nuxt/shim.js',
  ])
  assert.deepEqual(result.observedRequestPaths, ['/_nuxt/entry.js'])
  assert.deepEqual(result.staticGraphPaths, ['/_nuxt/entry.js', '/_nuxt/shared.js', '/_nuxt/shim.js'])
})

test('rejects relative importmap targets and non-exact bindings', async (t) => {
  const root = await withOutput(t, {
    'shim.js': "import '#entry'\nexport const shim = 1\n",
    'entry.js': 'export const entry = 1\n',
  })
  const output = await inspectOutput(root)

  // Nuxt emits an absolute /_nuxt/<hash>.js target with this app config; a
  // relative target would depend on the page URL and is refused.
  await assert.rejects(
    accountInitialRoute({
      html: `${htmlWithSeeds('/_nuxt/shim.js')}${importMapHtml({ '#entry': './_nuxt/entry.js' })}`,
      output,
      origin: ORIGIN,
    }),
    { message: /absolute own-origin path/ },
  )

  await assert.rejects(
    accountInitialRoute({
      html: `${htmlWithSeeds('/_nuxt/shim.js')}${importMapHtml({ '#ent': '/_nuxt/entry.js' })}`,
      output,
      origin: ORIGIN,
    }),
    { name: 'RouteBudgetError', message: /Non-relative static import "#entry"/ },
  )
})

test('rejects unsafe, external, missing or non-JavaScript importmap targets', async (t) => {
  const root = await withOutput(t, {
    'shim.js': "import '#entry'\nexport const shim = 1\n",
    'entry.js': 'export const entry = 1\n',
    'style.css': 'body { color: red }\n',
  })
  const output = await inspectOutput(root)
  const account = target => accountInitialRoute({
    html: `${htmlWithSeeds('/_nuxt/shim.js')}${importMapHtml({ '#entry': target })}`,
    output,
    origin: ORIGIN,
  })

  await assert.rejects(account('https://cdn.example.com/entry.js'), { message: /outside the app origin/ })
  await assert.rejects(account('//cdn.example.com/entry.js'), { message: /outside the app origin/ })
  // URL normalization collapses `..` before the prefix check, so the target
  // fails as an outside-prefix asset rather than as a dot segment.
  await assert.rejects(account('/_nuxt/../secret.js'), { message: /Asset outside/ })
  await assert.rejects(account(`/_nuxt/sub${BACKSLASH}entry.js`), { message: /must not contain a backslash/ })
  await assert.rejects(account('/_nuxt/%2e%2e/entry.js'), { message: /must not be percent-encoded/ })
  await assert.rejects(account('/elsewhere/entry.js'), { message: /Asset outside/ })
  await assert.rejects(account('/_nuxt/style.css'), { message: /Not a JavaScript asset/ })
  await assert.rejects(account('/_nuxt/entry.js?x=1'), { message: /must not carry a query or fragment/ })
  await assert.rejects(account('/_nuxt/entry.js#top'), { message: /must not carry a query or fragment/ })
  await assert.rejects(account('/_nuxt/missing.js'), { message: /Missing production asset/ })
})

test('still rejects bare specifiers with no binding and ignores inherited keys', async (t) => {
  const root = await withOutput(t, {
    'shim.js': "import 'vue'\nexport const shim = 1\n",
    'entry.js': 'export const entry = 1\n',
  })
  const output = await inspectOutput(root)

  await assert.rejects(
    accountInitialRoute({
      html: `${htmlWithSeeds('/_nuxt/shim.js')}${importMapHtml({ '#entry': '/_nuxt/entry.js' })}`,
      output,
      origin: ORIGIN,
    }),
    { message: /Non-relative static import "vue"/ },
  )

  const prototypeMap = '<script type="importmap">{"imports":{"__proto__":"/_nuxt/entry.js"}}</script>'
  const prototypeShim = await withOutput(t, { 'shim.js': "import 'constructor'\n" })
  const prototypeOutput = await inspectOutput(prototypeShim)
  await assert.rejects(
    accountInitialRoute({
      html: `${htmlWithSeeds('/_nuxt/shim.js')}${prototypeMap}`,
      output: prototypeOutput,
      origin: ORIGIN,
    }),
    { message: /Non-relative static import "constructor"/ },
  )

  const parsed = parseImportMap(prototypeMap)
  assert.equal(parsed.present, true)
  assert.equal(parsed.imports.has('constructor'), false)
  assert.equal(parsed.imports.has('toString'), false)
  assert.equal(parsed.imports.get('__proto__'), '/_nuxt/entry.js')
})

test('fails closed on malformed, scoped, prefixed or repeated importmaps', () => {
  const parse = body => parseImportMap(`<script type="importmap">${body}</script>`)
  assert.throws(() => parse('{ not json'), { name: 'RouteBudgetError', message: /not valid JSON/ })
  assert.throws(() => parse('[1,2]'), { message: /must be a JSON object/ })
  assert.throws(() => parse('{"imports":[]}'), { message: /"imports" must be an object/ })
  assert.throws(() => parse('{"imports":{"#entry":42}}'), { message: /needs a non-empty URL string/ })
  assert.throws(() => parse('{"imports":{"":"/_nuxt/entry.js"}}'), { message: /empty binding key/ })
  assert.throws(() => parse('{"imports":{"#/":"/_nuxt/"}}'), { message: /prefix mapping/ })
  assert.throws(() => parse('{"imports":{},"scopes":{"/app/":{"#entry":"/_nuxt/entry.js"}}}'), { message: /"scopes" are not supported/ })
  assert.throws(
    () => parseImportMap(`${importMapHtml({ '#entry': '/_nuxt/entry.js' })}${importMapHtml({ '#entry': '/_nuxt/entry.js' })}`),
    { message: /Multiple SSR importmap scripts/ },
  )
  assert.deepEqual(parse('{"imports":{},"scopes":{}}').imports.size, 0)
  assert.equal(parse('{"imports":{}}').present, true)
  assert.equal(parseImportMap('<div>no map</div>').present, false)
})

test('never counts the importmap JSON as JavaScript or as the Nuxt payload', async (t) => {
  const root = await withOutput(t, { 'entry.js': 'export const entry = 1\n' })
  const output = await inspectOutput(root)
  const html = `${htmlWithSeeds('/_nuxt/entry.js')}${importMapHtml({ '#entry': '/_nuxt/entry.js' })}`

  assert.deepEqual(initialAssetSeeds(html), ['/_nuxt/entry.js'])
  assert.equal(nuxtPayloadBytes(html), 0)
  const result = await accountInitialRoute({ html, output, origin: ORIGIN })
  assert.equal(result.payloadBytes, 0)
  assert.equal(result.assetCount, 1)
})
