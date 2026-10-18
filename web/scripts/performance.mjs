import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'
import { chromium } from '@playwright/test'
import { launch } from 'chrome-launcher'
import lighthouse from 'lighthouse'

// Dedicated ports: the E2E web servers own 3100/3181, and on Windows CI a
// leftover E2E preview could still hold those ports when this script starts.
const url = 'http://127.0.0.1:3200'
const upstreamUrl = 'http://127.0.0.1:3281'
const paths = process.argv.slice(2)
if (!paths.length) paths.push('/')
for (const origin of [url, upstreamUrl]) {
  let occupied = false
  try { await fetch(origin, { signal: AbortSignal.timeout(500) }); occupied = true }
  catch { /* The test processes must own both ports. */ }
  if (occupied) throw new Error(`${origin} is already in use; stop that preview before performance tests`)
}

const upstream = spawn(process.execPath, ['tests/fixtures/upstream.mjs'], {
  stdio: 'inherit',
  env: { ...process.env, PORT: '3281' },
})
const server = spawn(process.execPath, ['.output/server/index.mjs'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: '3200',
    HOST: '127.0.0.1',
    NUXT_SESSION_PASSWORD: randomBytes(48).toString('hex'),
    NUXT_API_BASE: upstreamUrl,
  },
})
let chrome
const summary = {
  device: 'Lighthouse default mobile / simulated throttling',
  serverState: 'Prewarmed by two HTTP document requests per route; Lighthouse resets browser storage/cache',
  warmup: [], invalidAttempts: [], results: [], complete: false,
}

async function launchBrowser() {
  return launch({ chromePath: chromium.executablePath(), chromeFlags: ['--headless=new', '--no-sandbox'] })
}

// A sample only counts when both budgeted values are real numbers. A missing
// or non-finite audit value is an instrumentation failure, never a pass.
function measuredMetrics(result) {
  const score = result.lhr.categories.performance?.score
  const lcpMs = result.lhr.audits['largest-contentful-paint']?.numericValue
  if (!Number.isFinite(score) || !Number.isFinite(lcpMs) || lcpMs <= 0) return null
  return { performance: score * 100, lcpMs }
}

async function collect(target, name, run) {
  // Retry only a missing navigation trace, never a valid slow measurement.
  // Lighthouse tracks this instrumentation failure upstream (issue #15382).
  for (let attempt = 1; attempt <= 2; attempt++) {
    let result
    let failure
    let metrics
    try {
      result = await lighthouse(target, { port: chrome.port, output: 'json', onlyCategories: ['performance'] })
      if (!result) throw new Error('Lighthouse returned no report')
      if (result.lhr.runtimeError) failure = result.lhr.runtimeError
      else {
        metrics = measuredMetrics(result)
        if (!metrics) failure = { code: 'INVALID_METRICS', message: 'Lighthouse reported no finite performance score and positive LCP' }
      }
    }
    catch (error) { failure = { code: error.code, message: error.message } }
    if (!failure) {
      await writeFile(`.lighthouseci/${name}-${run}.json`, result.report)
      return metrics
    }
    const diagnostic = { url: target, run, attempt, ...failure }
    summary.invalidAttempts.push(diagnostic)
    await writeFile(`.lighthouseci/${name}-${run}-invalid-${attempt}.json`, result?.report ?? JSON.stringify(diagnostic, null, 2))
    if (failure.code !== 'NO_NAVSTART' || attempt === 2) throw new Error(`Lighthouse collection failed: ${failure.code ?? ''} ${failure.message}`)
    console.warn(`Missing navigation trace for ${target}; retaining diagnostic and retrying once with a fresh browser`)
    await chrome.kill()
    chrome = await launchBrowser()
  }
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  const stopped = once(child, 'exit')
  child.kill()
  await Promise.race([stopped, setTimeout(5000, undefined, { ref: false })])
}

try {
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Preview exited with ${server.exitCode}`)
    if (upstream.exitCode !== null) throw new Error(`Fixture API exited with ${upstream.exitCode}`)
    try {
      ready = (await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(500) })).ok
        && (await fetch(`${upstreamUrl}/health`, { signal: AbortSignal.timeout(500) })).ok
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
    const durations = []
    for (let request = 0; request < 2; request++) {
      const start = performance.now()
      const response = await fetch(`${url}${path}`, { signal: AbortSignal.timeout(15000) })
      if (!response.ok) throw new Error(`Warm-up ${path} returned HTTP ${response.status}`)
      await response.arrayBuffer()
      durations.push(performance.now() - start)
    }
    summary.warmup.push({ path, firstDocumentRequestMs: durations[0], secondDocumentRequestMs: durations[1] })
  }
  chrome = await launchBrowser()
  await mkdir('.lighthouseci', { recursive: true })
  for (const path of paths) {
    const summaries = []
    const name = path === '/' ? 'foundation' : path.replaceAll(/[^a-z0-9-]/g, '')
    for (let run = 1; run <= 3; run++) {
      summaries.push(await collect(`${url}${path}`, name, run))
    }
    const ordered = [...summaries].sort((a, b) => a.lcpMs - b.lcpMs)
    summary.results.push({ url: `${url}${path}`, runs: summaries, median: ordered[1] })
  }
  summary.complete = true
  console.log(JSON.stringify(summary, null, 2))
  if (summary.results.some(({ median }) => median.performance < 95 || median.lcpMs > 1800)) {
    const detail = summary.results.map(({ url, median }) => `${new URL(url).pathname} median ${median.lcpMs.toFixed(1)} ms, score ${median.performance}`).join(' | ')
    throw new Error(`Mobile performance budget exceeded — ${detail}`)
  }
}
catch (error) { summary.failure = error.message; throw error }
finally {
  try {
    await mkdir('.lighthouseci', { recursive: true })
    await writeFile('.lighthouseci/summary.json', JSON.stringify(summary, null, 2))
  }
  finally {
    await Promise.allSettled([chrome?.kill(), stopChild(server), stopChild(upstream)])
  }
}
