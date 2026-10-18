import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'
import { chromium } from '@playwright/test'
import { launch } from 'chrome-launcher'
import lighthouse from 'lighthouse'

const url = 'http://127.0.0.1:3100'
try {
  await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(500) })
  throw new Error('Port 3100 is already in use; stop the local preview before performance tests')
}
catch (error) {
  if (error.message.includes('already in use')) throw error
}

const server = spawn(process.execPath, ['.output/server/index.mjs'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: '3100',
    HOST: '127.0.0.1',
    NUXT_SESSION_PASSWORD: randomBytes(48).toString('hex'),
  },
})
let chrome
try {
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Preview exited with ${server.exitCode}`)
    try {
      ready = (await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(500) })).ok
    }
    catch { /* Wait for the concrete HTTP readiness condition. */ }
    if (ready) break
    await setTimeout(100)
  }
  if (!ready) throw new Error('Production preview did not become ready')
  chrome = await launch({
    chromePath: chromium.executablePath(),
    chromeFlags: ['--headless=new', '--no-sandbox'],
  })
  await mkdir('.lighthouseci', { recursive: true })
  const summaries = []
  for (let run = 1; run <= 3; run++) {
    const result = await lighthouse(url, { port: chrome.port, output: 'json', onlyCategories: ['performance'] })
    if (!result || result.lhr.runtimeError) throw new Error(`Lighthouse failed: ${result?.lhr.runtimeError?.message}`)
    await writeFile(`.lighthouseci/foundation-${run}.json`, result.report)
    summaries.push({
      performance: result.lhr.categories.performance.score * 100,
      lcpMs: result.lhr.audits['largest-contentful-paint'].numericValue,
    })
  }
  const ordered = [...summaries].sort((a, b) => a.lcpMs - b.lcpMs)
  const median = ordered[1]
  const summary = { url, device: 'Lighthouse default mobile / simulated throttling', runs: summaries, median }
  await writeFile('.lighthouseci/summary.json', JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary, null, 2))
  if (median.performance < 95 || median.lcpMs > 1800) throw new Error('Mobile performance budget exceeded')
}
finally {
  if (chrome) await chrome.kill()
  server.kill()
}
