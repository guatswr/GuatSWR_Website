import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'
import { chromium } from '@playwright/test'
import { launch } from 'chrome-launcher'
import lighthouse from 'lighthouse'

const url = 'http://127.0.0.1:3100'
const paths = process.argv.slice(2)
if (!paths.length) paths.push('/')
for (const origin of [url, 'http://127.0.0.1:3181']) {
  let occupied = false
  try { await fetch(origin, { signal: AbortSignal.timeout(500) }); occupied = true }
  catch { /* The test processes must own both ports. */ }
  if (occupied) throw new Error(`${origin} is already in use; stop that preview before performance tests`)
}

const upstream = spawn(process.execPath, ['tests/fixtures/upstream.mjs'], { stdio: 'inherit' })
const server = spawn(process.execPath, ['.output/server/index.mjs'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: '3100',
    HOST: '127.0.0.1',
    NUXT_SESSION_PASSWORD: randomBytes(48).toString('hex'),
    NUXT_API_BASE: 'http://127.0.0.1:3181',
  },
})
let chrome
try {
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Preview exited with ${server.exitCode}`)
    if (upstream.exitCode !== null) throw new Error(`Fixture API exited with ${upstream.exitCode}`)
    try {
      ready = (await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(500) })).ok
        && (await fetch('http://127.0.0.1:3181/health', { signal: AbortSignal.timeout(500) })).ok
    }
    catch { /* Wait for the concrete HTTP readiness condition. */ }
    if (ready) break
    await setTimeout(100)
  }
  if (!ready) throw new Error('Production preview did not become ready')
  // Warm the render path (route render, JIT, fixture upstream) before
  // measuring, so the three samples describe a serving process rather than
  // the Node process's first render of each route.
  for (const path of paths) {
    await fetch(`${url}${path}`).then((response) => response.arrayBuffer())
    await fetch(`${url}${path}`).then((response) => response.arrayBuffer())
  }
  chrome = await launch({
    chromePath: chromium.executablePath(),
    chromeFlags: ['--headless=new', '--no-sandbox'],
  })
  await mkdir('.lighthouseci', { recursive: true })
  const results = []
  for (const path of paths) {
    const summaries = []
    const name = path === '/' ? 'foundation' : path.replaceAll(/[^a-z0-9-]/g, '')
    for (let run = 1; run <= 3; run++) {
      const result = await lighthouse(`${url}${path}`, { port: chrome.port, output: 'json', onlyCategories: ['performance'] })
      if (!result || result.lhr.runtimeError) throw new Error(`Lighthouse failed: ${result?.lhr.runtimeError?.message}`)
      await writeFile(`.lighthouseci/${name}-${run}.json`, result.report)
      summaries.push({
        performance: result.lhr.categories.performance.score * 100,
        lcpMs: result.lhr.audits['largest-contentful-paint'].numericValue,
      })
    }
    const ordered = [...summaries].sort((a, b) => a.lcpMs - b.lcpMs)
    results.push({ url: `${url}${path}`, runs: summaries, median: ordered[1] })
  }
  const summary = { device: 'Lighthouse default mobile / simulated throttling', results }
  await writeFile('.lighthouseci/summary.json', JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary, null, 2))
  if (results.some(({ median }) => median.performance < 95 || median.lcpMs > 1800)) throw new Error('Mobile performance budget exceeded')
}
finally {
  if (chrome) await chrome.kill()
  server.kill()
  upstream.kill()
}
