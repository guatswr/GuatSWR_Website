import { execFile } from 'node:child_process'
import { promisify, parseArgs } from 'node:util'
import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const exec = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const { values } = parseArgs({ options: { image: { type: 'string', default: 'guatswr-revamp:ci' }, origin: { type: 'string' } } })
const image = values.image
let origin = values.origin
if (origin) {
  const url = new URL(origin)
  assert.ok(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
  assert.ok(!url.username && !url.password && url.pathname === '/' && !url.search && !url.hash)
  origin = url.origin
}
const name = `guatswr-revamp-smoke-${randomBytes(5).toString('hex')}`
const report = { image, generatedAt: new Date().toISOString(), cases: [], passed: false }
let container
try {
  if (!origin) {
    const result = await exec('docker', [
    'run', '--detach', '--rm', '--name', name,
    '--publish', '127.0.0.1::3100',
    '--mount', `type=bind,source=${resolve(root, 'web/tests/fixtures')},target=/fixtures,readonly`,
    '--mount', `type=bind,source=${resolve(root, 'web/public')},target=/public,readonly`,
    '--env', 'NUXT_SESSION_PASSWORD', '--env', 'NUXT_API_BASE=http://127.0.0.1:3181',
    '--entrypoint', 'node', image, '/fixtures/container-entry.mjs',
  ], { env: { ...process.env, NUXT_SESSION_PASSWORD: randomBytes(48).toString('hex') } })
  container = result.stdout.trim()
  assert.match(container, /^[a-f0-9]{64}$/)
  const bound = await exec('docker', ['port', container, '3100/tcp'])
  const port = bound.stdout.match(/127\.0\.0\.1:(\d+)/)?.[1]
  assert.ok(port)
    origin = `http://127.0.0.1:${port}`
  }
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    try { ready = (await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(500) })).ok } catch { /* bounded readiness */ }
    if (ready) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(ready, 'container did not become ready')
  const nonces = new Set()
  for (const [path, content] of [['/', '桂航绯想天'], ['/members', '绯想天住民名录'], ['/activity/1', '秋季例会'], ['/activity/3', 'answer'], ['/events/stg', '秋季 STG 大会']]) {
    const response = await fetch(`${origin}${path}`)
    assert.equal(response.status, 200)
    const html = await response.text()
    assert.ok(html.includes(content))
    assert.match(response.headers.get('x-robots-tag') || '', /noindex/)
    const nonce = response.headers.get('content-security-policy')?.match(/'nonce-([^']+)'/)?.[1]
    assert.ok(nonce)
    assert.ok(html.includes(`nonce="${nonce}"`))
    assert.ok(html.includes('application/ld+json'))
    assert.ok(!nonces.has(nonce))
    nonces.add(nonce)
    report.cases.push({ path, status: response.status, ssrContent: true, nonceMatches: true })
  }
  const rss = await fetch(`${origin}/rss.xml`)
  assert.equal(rss.status, 200)
  assert.match(await rss.text(), /最近活动记录/)
  assert.equal((await fetch(`${origin}/sitemap.xml`)).status, 404)
  const urls = await (await fetch(`${origin}/api/__sitemap__/urls`)).json()
  assert.equal(urls.length, 15)
  assert.equal((await fetch(`${origin}/_nuxt/missing.js.map`)).status, 404)
  const imageResponse = await fetch(`${origin}/uploads/fixture.webp`)
  assert.equal(imageResponse.status, 200)
  assert.match(imageResponse.headers.get('content-type') || '', /image\/webp/)
  assert.equal(Buffer.from(await imageResponse.arrayBuffer()).subarray(0, 4).toString(), 'RIFF')
  report.feed = true
  report.previewSitemapDisabled = true
  report.publicIndexEntries = urls.length
  report.sourceMap404 = true
  report.uploadImageProxy = true
  report.passed = true
} catch (error) {
  report.error = error.message
  throw error
} finally {
  // Stop only the exact container id this invocation successfully created.
  if (container && /^[a-f0-9]{64}$/.test(container)) await exec('docker', ['stop', container]).catch(() => {})
  await mkdir(resolve(root, '.tools'), { recursive: true })
  await writeFile(resolve(root, '.tools/container-runtime-validation.json'), JSON.stringify(report, null, 2))
}
console.log(JSON.stringify(report, null, 2))
