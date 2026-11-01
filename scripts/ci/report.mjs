import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const integer = value => Number.isSafeInteger(value) && value >= 0
const metric = (name, value, target, ok = true) => ({ name, value, target, ok })
const requireValue = (condition, message) => { if (!condition) throw new Error(message) }

export function vitestMetrics(report, platform = process.platform) {
  requireValue(integer(report.numTotalTests) && report.numTotalTests > 0 && Array.isArray(report.testResults), 'Missing/empty Vitest test results')
  const cases = report.testResults.flatMap(suite => (suite.assertionResults ?? []).map(test => ({ ...test, file: suite.name?.replaceAll('\\', '/') })))
  requireValue(cases.length === report.numTotalTests, 'Vitest test inventory does not match the summary')
  const passed = cases.filter(test => test.status === 'passed').length
  const failed = cases.filter(test => test.status === 'failed').length
  // This single POSIX process-group assertion cannot run on Windows. It must
  // still execute on Linux; no blanket skip-count allowance is used.
  const excluded = cases.filter(test => platform === 'win32' && test.status === 'skipped'
    && test.file?.endsWith('/backend/tests/integration/backup-scheduler.test.mjs')
    && test.fullName === 'timeout kills POSIX descendants in the detached backup process group').length
  requireValue(excluded <= 1, 'Duplicate platform exclusion')
  const skipped = cases.length - passed - failed - excluded
  return [
    metric('Tests passed', `${passed}/${cases.length - excluded}`, '100% of applicable tests', report.success === true && passed === cases.length - excluded && report.numFailedTestSuites === 0),
    metric('Platform-excluded tests', excluded, 'only the POSIX process-group test on Windows'),
    metric('Tests skipped/todo/unknown', skipped, '0', skipped === 0),
    metric('Tests failed', failed, '0', failed === 0),
  ]
}

export function e2eMetrics(report) {
  const counts = report.counts
  requireValue(counts && ['passed', 'failed', 'flaky', 'skipped', 'allDeclared'].every(key => integer(counts[key])) && counts.allDeclared > 0, 'Missing/empty E2E inventory')
  const executed = counts.passed + counts.failed + counts.flaky + counts.skipped
  requireValue(Array.isArray(report.tests) && report.tests.length === counts.allDeclared && executed === counts.allDeclared, 'E2E inventory was not executed exactly once')
  return [
    metric('E2E passed on first attempt', `${counts.passed}/${counts.allDeclared}`, '100%', report.ok === true && report.merge?.ok === true && counts.passed === counts.allDeclared),
    metric('E2E flaky (passed after retry)', counts.flaky, '0', counts.flaky === 0),
    metric('E2E skipped', counts.skipped, '0', counts.skipped === 0),
    metric('E2E failed', counts.failed, '0', counts.failed === 0),
  ]
}

export function routeMetrics(report) {
  requireValue(report.budgetBytes === 150 * 1024 && Array.isArray(report.routes) && report.routes.length > 0, 'Missing route budget results or changed product budget')
  return [metric('Cold-route JS budget', `${report.routes.length} routes`, 'each ≤150 KiB gzip', report.passed === true),
    metric('Production sourcemaps', report.output?.sourceMaps, '0', report.output?.sourceMaps === 0),
    ...report.routes.map(route => {
      const bytes = route.initialRouteJsGzipBytes
      requireValue(Number.isFinite(bytes) && bytes > 0, 'Missing route gzip bytes')
      return metric(`Initial JS ${route.path ?? route.name}`, `${(bytes / 1024).toFixed(1)} KiB`, '≤150 KiB gzip', bytes <= report.budgetBytes)
    })]
}

export function performanceMetrics(report) {
  requireValue(report.complete === true && Array.isArray(report.results) && report.results.length === 3, 'Performance collection incomplete; require /, /activities and /events/stg')
  requireValue(new Set(report.results.map(result => new URL(result.url).pathname)).size === 3 && ['/', '/activities', '/events/stg'].every(path => report.results.some(result => new URL(result.url).pathname === path)), 'Unexpected performance route inventory')
  return report.results.flatMap(result => {
    requireValue(result.runs?.length === 3 && result.runs.every(run => Number.isFinite(run.lcpMs) && run.lcpMs > 0 && Number.isFinite(run.performance)), 'Require three valid Lighthouse samples per route')
    // Recompute medians from raw measurements rather than trusting a summary.
    const lcp = result.runs.map(run => run.lcpMs).sort((a, b) => a - b)[1]
    const score = result.runs.map(run => run.performance).sort((a, b) => a - b)[1]
    const path = new URL(result.url).pathname
    return [metric(`Mobile LCP ${path}`, `${lcp.toFixed(0)} ms`, 'median of 3 ≤1800 ms', lcp <= 1800), metric(`Lighthouse ${path}`, score, 'median of 3 ≥95', score >= 95)]
  })
}

export function securityMetrics(report) {
  requireValue(Array.isArray(report.unresolved) && Array.isArray(report.mitigated) && Array.isArray(report.verified), 'Audit failed before producing a complete security report')
  return [metric('Audit evaluation', report.ok === true ? 'complete' : (report.error ?? 'failed'), 'complete with no unresolved advisories', report.ok === true), ...['critical', 'high', 'moderate', 'low', 'info'].map(severity => {
    const count = report.unresolved.filter(item => item.severity === severity).length
    return metric(`Unresolved ${severity} advisories`, count, '0 (all severities retained)', count === 0)
  }), metric('Verified local mitigations', report.mitigated.length, 'exact advisory + source hashes + exploit probes', report.verified.length >= report.mitigated.length)]
}

export function resultMetrics(needs) {
  const flags = needs.scope?.outputs
  requireValue(needs.scope?.result === 'success' && flags, 'Scope selection did not complete')
  const jobs = ['quality', 'backend', 'web', 'real-bff', 'container', 'web-container', 'audit']
  requireValue(jobs.every(key => needs[key]?.result), 'An expected CI job is missing from the aggregate')
  return jobs.map(key => {
    const job = needs[key]
    const flag = key === 'real-bff' ? 'integration' : key === 'web-container' ? 'web_container' : key
    requireValue(['true', 'false'].includes(flags[flag]), `Missing scope output for ${key}`)
    const expected = flags[flag] === 'true'
    return metric(key, job.result, expected ? 'success' : 'skipped', job.result === (expected ? 'success' : 'skipped'))
  })
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const [mode, ...files] = argv
  const rows = [], errors = [], advisories = []
  const parsers = { vitest: vitestMetrics, e2e: e2eMetrics, routes: routeMetrics, performance: performanceMetrics, security: securityMetrics }
  if (mode === 'result') {
    try { rows.push(...resultMetrics(JSON.parse(env.NEEDS_JSON))) } catch (error) { errors.push(error.message) }
  } else {
    requireValue(parsers[mode] && files.length > 0, 'Usage: report.mjs <vitest|e2e|routes|performance|security> <json...>, or result with NEEDS_JSON')
    for (const file of files) {
      try {
        const source = JSON.parse(readFileSync(file, 'utf8'))
        rows.push(...parsers[mode](source).map(row => ({ ...row, source: file })))
        if (mode === 'security') advisories.push(...source.unresolved)
      }
      catch (error) { errors.push(`${file}: ${error.message}`) }
    }
  }
  const report = { revision: env.GITHUB_SHA ?? null, mode, ok: errors.length === 0 && rows.length > 0 && rows.every(row => row.ok), metrics: rows, errors }
  mkdirSync('.tools/ci', { recursive: true })
  writeFileSync(`.tools/ci/${mode}.metrics.json`, JSON.stringify(report, null, 2) + '\n')
  const safe = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ')
  const detail = advisories.length ? `\n| Severity | Package | Advisory | Finding |\n| --- | --- | --- | --- |\n${advisories.map(item => `| ${safe(item.severity)} | ${safe(item.package)} | ${safe(item.advisory)} | ${safe(item.title)} |`).join('\n')}\n` : ''
  const markdown = `## ${mode} metrics\n\n| Metric | Measured | Target | Result | Report |\n| --- | --- | --- | --- | --- |\n${rows.map(row => `| ${safe(row.name)} | ${safe(row.value)} | ${safe(row.target)} | ${row.ok ? 'PASS' : 'FAIL'} | ${safe(row.source ?? mode)} |`).join('\n')}\n${errors.map(error => `\n- Report error: ${safe(error)}`).join('')}\n${detail}`
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, markdown)
  console.log(markdown)
  if (!report.ok) process.exitCode = 1
  return report
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main()
