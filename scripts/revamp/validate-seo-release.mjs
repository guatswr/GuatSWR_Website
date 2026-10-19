// Local-only release-index rehearsal. It never changes the default preview
// configuration, installs dependencies, deploys or accesses the real backend.
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, writeFile, unlink, rmdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { loadNuxt, build } from 'nuxt'
import { useNuxt } from '@nuxt/kit'
import { chromium } from '@playwright/test'
import { walkFiles, findSourceMaps } from './artifacts.mjs'
import { handlePublicFixture } from '../../web/tests/fixtures/public-data.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const web = resolve(root, 'web')
const output = resolve(root, '.tools/seo-release-output')
const lock = resolve(root, '.tools/build.lock')
const reportPath = resolve(root, '.tools/seo-release-validation.json')
const site = 'https://guatswr.top'
const port = 3400
const base = `http://127.0.0.1:${port}`
const report = { generatedAt: new Date().toISOString(), localOnly: true, output, cases: [], passed: false }
let nuxt, server, browser, page, fixture, mode = 'normal'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function stopServer() {
  if (!server || server.exitCode !== null) return
  const child = server
  const done = new Promise(resolve => child.once('exit', resolve))
  child.kill()
  await Promise.race([done, delay(5000).then(() => { throw new Error('Rehearsal server did not stop') })])
  server = undefined
}
async function startServer(apiBase) {
  server = spawn(process.execPath, [resolve(output, 'server/index.mjs')], {
    cwd: web, stdio: ['ignore', 'ignore', 'pipe'],
    env: {
      ...process.env, PORT: String(port), HOST: '127.0.0.1',
      NUXT_API_BASE: apiBase, NUXT_SITE_URL: site, NUXT_SITE_INDEXABLE: 'true',
      NUXT_SESSION_PASSWORD: randomBytes(48).toString('hex'),
    },
  })
  // Keep failure diagnostics, without dumping private runtime configuration.
  let stderr = ''
  server.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000) })
  for (let i = 0; i < 150; i++) {
    if (server.exitCode !== null) throw new Error(`Rehearsal server exited: ${stderr}`)
    try { if ((await fetch(`${base}/api/health`)).ok) return } catch { /* bounded startup polling */ }
    await delay(100)
  }
  throw new Error('Rehearsal server startup timed out')
}
async function parseXml(xml) {
  return page.evaluate(text => {
    const doc = new DOMParser().parseFromString(text, 'application/xml')
    return {
      errors: doc.querySelectorAll('parsererror').length,
      urls: [...doc.querySelectorAll('url > loc')].map(node => node.textContent),
      items: doc.querySelectorAll('item').length,
    }
  }, xml)
}

// This directory is a fixed child of the repository, never caller-controlled.
assert.equal(dirname(lock), resolve(root, '.tools'))
await mkdir(lock)
await writeFile(resolve(lock, 'owner.txt'), `SEO release rehearsal pid=${process.pid}\n`)
try {
  nuxt = await loadNuxt({ cwd: web, dev: false, overrides: {
    buildDir: resolve(root, '.tools/seo-release-build'),
    nitro: { output: { dir: output } },
    site: { url: site, indexable: true },
    sitemap: { enabled: true, excludeAppSources: true, cacheMaxAgeSeconds: 0 },
    routeRules: {
      '/**': { headers: { 'X-Robots-Tag': 'index, follow' } },
      '/sitemap.xml': { headers: { 'Cache-Control': 'no-store' } },
      '/login': { headers: { 'X-Robots-Tag': 'noindex, nofollow' } },
      '/admin': { headers: { 'X-Robots-Tag': 'noindex, nofollow' } },
      '/admin/**': { headers: { 'X-Robots-Tag': 'noindex, nofollow' } },
      '/api/**': { headers: { 'X-Robots-Tag': 'noindex, nofollow' } },
    },
    hooks: {
      // Nuxt's config merge concatenates arrays. Replace the preview's root
      // disallow only in this isolated test build, before modules consume it.
      'modules:before': () => {
        const options = useNuxt().options
        options.robots = { ...options.robots, disallow: [], allow: ['/'] }
      },
    },
  } })
  await build(nuxt)
  await nuxt.close()
  nuxt = undefined
  assert.equal(findSourceMaps(await walkFiles(output)).length, 0)
  report.sourceMaps = 0

  fixture = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1')
    if (url.pathname === '/api/activities' && mode !== 'normal') {
      response.setHeader('Content-Type', 'application/json')
      if (mode === 'failure') { response.writeHead(502); response.end('{"message":"fixture unavailable"}'); return }
      response.end(JSON.stringify({ total: mode === 'oversize' ? 5001 : 0, page: 1, limit: Number(url.searchParams.get('limit') || 20), items: [] }))
      return
    }
    if (!handlePublicFixture(request, response)) { response.writeHead(404); response.end() }
  })
  await new Promise((resolve, reject) => { fixture.once('error', reject); fixture.listen(0, '127.0.0.1', resolve) })
  const apiBase = `http://127.0.0.1:${fixture.address().port}`
  browser = await chromium.launch()
  page = await browser.newPage()
  for (const scenario of ['normal', 'empty', 'failure', 'oversize']) {
    mode = scenario
    await startServer(apiBase)
    const response = await fetch(`${base}/sitemap.xml`, { headers: { 'x-forwarded-host': 'evil.test' } })
    const text = await response.text()
    const entry = { scenario, sitemapStatus: response.status }
    if (scenario === 'failure' || scenario === 'oversize') {
      assert.equal(response.status, 503, `${scenario}: must not publish a successful empty sitemap`)
    } else {
      assert.equal(response.status, 200)
      assert.match(response.headers.get('cache-control') || '', /no-store/)
      const xml = await parseXml(text)
      assert.equal(xml.errors, 0)
      assert.equal(xml.urls.length, scenario === 'empty' ? 12 : 15)
      assert.ok(xml.urls.every(url => new URL(url).origin === site))
      assert.ok(!xml.urls.some(url => /admin|login|__revamp|evil\.test/.test(url)))
      assert.ok(!xml.urls.includes(`${site}/activity/4`))
      assert.ok(!xml.urls.includes(`${site}/activity/5`))
      if (scenario === 'normal') assert.ok(xml.urls.includes(`${site}/activity/1`))
      entry.urls = xml.urls
      const rss = await fetch(`${base}/rss.xml`)
      assert.equal(rss.status, 200)
      const parsed = await parseXml(await rss.text())
      assert.equal(parsed.errors, 0)
      assert.equal(parsed.items, scenario === 'empty' ? 0 : 3)
      entry.rssItems = parsed.items
    }
    report.cases.push(entry)
    await stopServer()
  }
  report.passed = true
} catch (error) {
  report.error = error.message
  throw error
} finally {
  await stopServer().catch(() => {})
  await browser?.close()
  if (fixture) await new Promise(resolve => fixture.close(resolve))
  await nuxt?.close()
  await writeFile(reportPath, JSON.stringify(report, null, 2))
  await unlink(resolve(lock, 'owner.txt'))
  await rmdir(lock)
}
console.log(JSON.stringify(report, null, 2))
