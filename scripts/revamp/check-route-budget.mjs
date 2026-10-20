#!/usr/bin/env node
// Cold-browser collector for the initial-route JavaScript budget.
//
//   node scripts/revamp/check-route-budget.mjs --routes scripts/revamp/route-fixtures.json
//
// The route list is mandatory: there is no default set, because a route that is
// not declared (an unmigrated page, a 404) must never be reported as passing.
// Each fixture also declares the `mainContent` text its real page body renders,
// so a 200 navbar-only error page cannot pass the identity check.
//
// `--serve` starts exactly the build named by `--output` (its
// `server/index.mjs`) on the port in `--base`; validating one artifact while
// running another is not possible.
//
// Ports are dedicated to this check: the E2E suite owns 3100/3181, Lighthouse
// 3200/3281 and the HTTP smoke tests 3311/3312.
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'
import {
  DEFAULT_COMPLETION_WINDOW_MS,
  DEFAULT_SETTLE_WINDOW_MS,
  INITIAL_ROUTE_JS_BUDGET_BYTES,
  MAX_COMPLETION_WINDOW_MS,
  MAX_SETTLE_WINDOW_MS,
  accountInitialRoute,
  assertRouteResponse,
  assertWithinBudget,
  inspectOutput,
  isJavaScriptRequest,
  parseServeTarget,
  serverEntryFor,
  settleScriptRequests,
  validateRouteFixtures,
} from './route-budget.mjs'

const FIXTURE_PORT = 3381
const UPSTREAM_SCRIPT = 'web/tests/fixtures/budget-upstream.mjs'

function fail(message) {
  console.error(`route-budget: ${message}`)
  process.exitCode = 1
}

function windowOption(raw, { flag, max }) {
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${flag} must be a non-negative number`)
  }
  if (value > max) throw new Error(`${flag} must not exceed ${max} ms`)
  return value
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(), 5000)
    child.once('exit', () => { clearTimeout(timer); resolve() })
    child.kill()
  })
}

async function waitForHttp(url, { timeoutMs = 15000, child } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(`${url}: child process exited with code ${child.exitCode}`)
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) })
      if (response.ok) return
    } catch {
      // Keep polling until the bounded deadline.
    }
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${url}`)
}

/**
 * Track every JavaScript request the page makes. The set is frozen when the
 * settle window closes; completion of those already-started scripts is then
 * awaited (bounded) so a request that would finish or abort after the window is
 * still accounted for, never silently dropped.
 */
function registerRequestTracking(page) {
  const tracked = []
  const byRequest = new Map()
  let frozen = false
  page.on('request', (request) => {
    if (frozen) return
    const candidate = {
      url: request.url(),
      resourceType: request.resourceType(),
      status: undefined,
      failure: undefined,
      headers: undefined,
      finished: false,
    }
    if (!isJavaScriptRequest(candidate)) return
    byRequest.set(request, candidate)
    tracked.push(candidate)
  })
  page.on('response', (response) => {
    const candidate = byRequest.get(response.request())
    if (!candidate) return
    candidate.status = response.status()
    candidate.headers = response.headers()
  })
  page.on('requestfinished', (request) => {
    const candidate = byRequest.get(request)
    if (candidate) candidate.finished = true
  })
  page.on('requestfailed', (request) => {
    const candidate = byRequest.get(request)
    if (candidate) candidate.failure = request.failure()?.errorText ?? 'request failed'
  })
  return {
    freeze() {
      frozen = true
      return tracked.slice()
    },
    all() {
      return tracked.slice()
    },
  }
}

function routeUrl(route, origin) {
  const path = route.query ? `${route.path}?${route.query}` : route.path
  const url = new URL(path, origin)
  if (url.origin !== origin) {
    throw new Error(`Route ${route.name} escapes the checked origin: ${path}`)
  }
  return url.href
}

async function main() {
  const { values } = parseArgs({
    options: {
      routes: { type: 'string' },
      output: { type: 'string', default: 'web/.output' },
      base: { type: 'string', default: 'http://127.0.0.1:3300' },
      'settle-ms': { type: 'string', default: String(DEFAULT_SETTLE_WINDOW_MS) },
      'complete-ms': { type: 'string', default: String(DEFAULT_COMPLETION_WINDOW_MS) },
      serve: { type: 'boolean', default: true },
      'no-serve': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  })

  if (values.help || !values.routes) {
    console.error([
      'Usage: node scripts/revamp/check-route-budget.mjs --routes <route-fixtures.json>',
      '  [--output web/.output] [--base http://127.0.0.1:3300]',
      '  [--settle-ms 2000] [--complete-ms 5000] [--no-serve]',
    ].join(String.fromCharCode(10)))
    process.exitCode = values.help ? 0 : 1
    return
  }

  const report = {
    generatedAt: new Date().toISOString(),
    budgetBytes: INITIAL_ROUTE_JS_BUDGET_BYTES,
    routes: [],
    passed: false,
  }

  let upstream
  let server
  let browser

  try {
    const serve = values.serve && !values['no-serve']
    const settleWindowMs = windowOption(values['settle-ms'], {
      flag: '--settle-ms',
      max: MAX_SETTLE_WINDOW_MS,
    })
    const completionWindowMs = windowOption(values['complete-ms'], {
      flag: '--complete-ms',
      max: MAX_COMPLETION_WINDOW_MS,
    })
    const routes = validateRouteFixtures(JSON.parse(await readFile(values.routes, 'utf8')))
    const target = parseServeTarget(values.base, { serve })
    const origin = target.origin
    const output = await inspectOutput(values.output)

    report.origin = origin
    report.serve = serve
    report.settleWindowMs = settleWindowMs
    report.completionWindowMs = completionWindowMs
    report.output = {
      dir: values.output,
      allJavaScriptGzipBytes: output.allJavaScriptGzipBytes,
      sourceMaps: output.sourceMaps.length,
    }

    if (serve) {
      const serverEntry = serverEntryFor(values.output)
      const entryStat = await stat(serverEntry).catch(() => null)
      if (!entryStat?.isFile()) {
        throw new Error(`--serve needs ${serverEntry}; build the tree named by --output first`)
      }
      upstream = spawn(process.execPath, [UPSTREAM_SCRIPT], {
        stdio: 'ignore',
        env: { ...process.env, PORT: String(FIXTURE_PORT) },
      })
      server = spawn(process.execPath, [serverEntry], {
        stdio: 'ignore',
        env: {
          ...process.env,
          PORT: target.port,
          HOST: target.hostname,
          NUXT_API_BASE: `http://127.0.0.1:${FIXTURE_PORT}`,
          // Ephemeral, in-memory only; never printed.
          NUXT_SESSION_PASSWORD: randomBytes(48).toString('hex'),
        },
      })
      // Child output is discarded so stdout stays a single JSON document.
      await Promise.all([
        waitForHttp(`${origin}/api/health`, { child: server }),
        waitForHttp(`http://127.0.0.1:${FIXTURE_PORT}/health`, { child: upstream }),
      ])
    }

    browser = await chromium.launch()

    for (const route of routes) {
      // Fixed device profile so viewport-triggered prefetch cannot drift with
      // Playwright's defaults: desktop 1280x720, DPR 1, light scheme, no touch.
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
        colorScheme: 'light',
        hasTouch: false,
      })
      try {
        const page = await context.newPage()
        const observed = registerRequestTracking(page)
        const response = await page.goto(routeUrl(route, origin), {
          timeout: 20000,
          waitUntil: 'load',
        })
        if (!response) throw new Error(`No navigation response for ${route.path}`)

        // Fixed, interaction-free window: lets the load-deferred prefetch hints
        // and any automatic Nuxt prefetch land before the request set freezes.
        await page.waitForTimeout(settleWindowMs)
        const requests = observed.freeze()
        await settleScriptRequests(requests, { timeoutMs: completionWindowMs })

        const body = await response.text()
        const identity = assertRouteResponse({
          name: route.name,
          path: route.path,
          status: response.status(),
          headers: response.headers(),
          body,
          expectedContent: route.mainContent,
        })
        const budget = await accountInitialRoute({
          html: body,
          requests,
          output,
          origin,
        })
        report.routes.push({
          name: route.name,
          path: route.path,
          query: route.query,
          mainContent: route.mainContent,
          ...identity,
          ...budget,
        })
        // Keep the measured graph even when the budget fails: reviewers need
        // the actual chunk inventory to diagnose a failure, not just its sum.
        assertWithinBudget(budget)
      } finally {
        await context.close()
      }
    }

    report.passed = true
  } catch (error) {
    report.error = error?.message ?? String(error)
    fail(report.error)
  } finally {
    if (browser) await browser.close().catch(() => {})
    await Promise.allSettled([stopChild(server), stopChild(upstream)])
  }

  console.log(JSON.stringify(report, null, 2))
  if (!report.passed) process.exitCode = 1
}

await main()
