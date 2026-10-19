#!/usr/bin/env node
// Isolated production E2E runner.
//
// The 60-case public suite exceeds the production security rate limit when it
// runs in one process (one Nuxt server serves every test), so later tests see
// 429s and empty DOMs. This runner keeps the production rate policy untouched
// and instead gives every batch its own fresh fixture/Nuxt process:
//
//   1. inventory the declared suite with `playwright test --list --reporter=json`
//      (no browser, no server);
//   2. shard it with the official `--shard X/Y` CLI so each invocation runs at
//      most MAX_TESTS_PER_BATCH tests, and verify the shard lists with
//      `--list --shard` before anything executes;
//   3. run the shards sequentially, each with its own `--output` directory,
//      JSON report and blob report, keeping the CI retry policy from the config;
//   4. fail closed on any inventory/plan/coverage/reporter problem, any skipped
//      test that is not in the declared policy, and any failing batch;
//   5. merge the per-batch blob reports into one HTML report and write a
//      machine summary with every test identity.
//
// It never rebuilds, never changes expectations, masks, snapshots, timeouts,
// workers-per-test semantics or the production rate limiter, and never sets a
// forged forwarding header.
//
// Usage (from the repository root):
//   node web/scripts/e2e-isolated.mjs [playwright selectors/options] [runner options]
//
// Runner options (everything else is forwarded verbatim to Playwright):
//   --max-per-batch <1|2>   tests per fresh server (default 2, hard ceiling 2)
//   --work-dir <dir>        artifact root, relative to web/ (default .e2e-isolated/<stamp>)
//   --dry-run               inventory + shard plan only, execute nothing
//   --help                  this text
//
// Unit tests (pure, no browser): node --test web/scripts/e2e-isolated.test.mjs
import { spawn } from 'node:child_process'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Hard ceiling from the isolation design: at most two tests per fresh server. */
export const MAX_TESTS_PER_BATCH = 2

/**
 * Tests allowed to end as `skipped`. Empty on purpose: a skip that is not
 * declared here fails the run, so an unconfigured feature/flag cannot be
 * reported as a completed migration. Each entry is
 * `{ identity, reason }` with a non-empty reason.
 */
export const DECLARED_SKIP_POLICY = []

export class E2EIsolationError extends Error {
  constructor(message, details) {
    super(message)
    this.name = 'E2EIsolationError'
    if (details !== undefined) this.details = details
  }
}

const CONFLICTING_OPTIONS = new Map([
  ['--shard', 'the runner derives and verifies the shard plan itself'],
  ['--list', 'the runner inventories the suite before executing anything'],
  ['--reporter', 'the runner owns the reporters that produce machine results'],
  ['--add-reporter', 'the runner owns the reporters that produce machine results'],
  ['--output', 'every batch gets its own artifact directory'],
  ['--workers', 'each batch runs with a single worker'],
  ['-j', 'each batch runs with a single worker'],
  ['--repeat-each', 'each declared test must run exactly once per attempt'],
  ['--retries', 'the retry policy from playwright.config.ts is retained'],
  ['--update-snapshots', 'this runner never updates snapshots'],
  ['--max-failures', 'every declared test must run even after a failure'],
  ['--pass-with-no-tests', 'an empty inventory must fail'],
  ['--last-failed', 'the whole declared scope must execute'],
  ['--only-changed', 'the whole declared scope must execute'],
  ['--debug', 'debug mode rewrites workers, timeout and max-failures'],
  ['--config', 'the runner pins the checked playwright.config.ts'],
  ['-c', 'the runner pins the checked playwright.config.ts'],
])

// Conflicting options that consume a separate value argument; the value is
// consumed with the flag so it cannot leak into Playwright as a test filter.
const CONFLICTING_WITH_VALUE = new Set([
  '--shard', '--reporter', '--add-reporter', '--output', '--workers', '-j',
  '--repeat-each', '--retries', '--max-failures', '--config', '-c',
])

const KNOWN_TEST_STATUSES = new Set(['expected', 'unexpected', 'flaky', 'skipped'])
const PLAYWRIGHT_REPORTER_ENV_KEYS = [
  'PLAYWRIGHT_JSON_OUTPUT_FILE',
  'PLAYWRIGHT_JSON_OUTPUT_NAME',
  'PLAYWRIGHT_JSON_OUTPUT_DIR',
  'PLAYWRIGHT_BLOB_OUTPUT_FILE',
  'PLAYWRIGHT_BLOB_OUTPUT_NAME',
  'PLAYWRIGHT_BLOB_OUTPUT_DIR',
  'PLAYWRIGHT_HTML_OUTPUT_DIR',
  'PLAYWRIGHT_HTML_REPORT',
  'PLAYWRIGHT_LAST_RUN_OUTPUT_FILE',
  'PLAYWRIGHT_JUNIT_OUTPUT_FILE',
]

/**
 * Split argv into runner options and Playwright arguments. Unknown flags are
 * forwarded (never silently swallowed), while flags that would break exact
 * coverage or artifact preservation are rejected with the reason.
 */
export function parseRunnerArgs(argv) {
  const runner = { maxPerBatch: MAX_TESTS_PER_BATCH, workDir: null, dryRun: false, help: false }
  const forwarded = []
  const errors = []
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    const separator = arg.startsWith('--') ? arg.indexOf('=') : -1
    const name = separator === -1 ? arg : arg.slice(0, separator)
    const inlineValue = separator === -1 ? null : arg.slice(separator + 1)
    if (name === '--help' || name === '-h') {
      runner.help = true
      continue
    }
    if (name === '--dry-run') {
      runner.dryRun = true
      continue
    }
    if (name === '--max-per-batch') {
      const raw = inlineValue ?? argv[++index]
      const value = Number(raw)
      if (!Number.isInteger(value) || value < 1) {
        errors.push(`--max-per-batch needs a positive integer, got ${raw}`)
        continue
      }
      if (value > MAX_TESTS_PER_BATCH) {
        errors.push(`--max-per-batch ${value} exceeds the ${MAX_TESTS_PER_BATCH}-tests-per-fresh-server limit`)
        continue
      }
      runner.maxPerBatch = value
      continue
    }
    if (name === '--work-dir') {
      const value = inlineValue ?? argv[++index]
      if (!value) {
        errors.push('--work-dir needs a directory')
        continue
      }
      runner.workDir = value
      continue
    }
    if (CONFLICTING_OPTIONS.has(name)) {
      errors.push(`${name} is not allowed: ${CONFLICTING_OPTIONS.get(name)}`)
      if (separator === -1 && CONFLICTING_WITH_VALUE.has(name)) index += 1
      continue
    }
    forwarded.push(arg)
  }
  return { runner, forwarded, errors }
}

/** Stable identity for one test case in one project. */
export function identityOf({ project, file, line, column, fullTitle }) {
  return [project, file, `${line}:${column ?? 1}`, fullTitle].join('::')
}

function walkSuites(report, visit) {
  if (!report || typeof report !== 'object' || !Array.isArray(report.suites)) {
    throw new E2EIsolationError('Playwright report is missing a suites array')
  }
  const walk = (suite, titles) => {
    const chain = suite.title ? [...titles, suite.title] : titles
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        visit({ spec, test, fullTitle: [...chain, spec.title].join(' > ') })
      }
    }
    for (const child of suite.suites ?? []) walk(child, chain)
  }
  for (const suite of report.suites) walk(suite, [])
}

function locationOf(spec, test) {
  const project = test.projectName ?? test.projectId ?? 'unknown-project'
  return {
    project,
    file: spec.file,
    line: spec.line,
    column: spec.column,
    fullTitle: null,
    identity: null,
  }
}

/**
 * Flatten a `--list` report into the declared scope, rejecting load errors,
 * empty inventories, missing locations and duplicate identities.
 */
export function flattenInventory(report) {
  if (Array.isArray(report?.errors) && report.errors.length > 0) {
    throw new E2EIsolationError(`Playwright inventory reported ${report.errors.length} load error(s)`)
  }
  const tests = []
  walkSuites(report, ({ spec, test, fullTitle }) => {
    const entry = {
      ...locationOf(spec, test),
      fullTitle,
      expectedStatus: test.expectedStatus ?? 'passed',
      tags: spec.tags ?? [],
    }
    entry.identity = identityOf(entry)
    if (!entry.file || !Number.isInteger(entry.line)) {
      throw new E2EIsolationError(`Inventory entry without a file/line location: ${fullTitle}`)
    }
    tests.push(entry)
  })
  if (tests.length === 0) {
    throw new E2EIsolationError('Playwright inventory is empty; refusing to report a passing run')
  }
  const seen = new Set()
  for (const test of tests) {
    if (seen.has(test.identity)) {
      throw new E2EIsolationError(`Duplicate inventory identity: ${test.identity}`)
    }
    seen.add(test.identity)
  }
  return tests
}

/** Shard numbers for an inventory of `count` tests, `maxPerBatch` at a time. */
export function planBatches(count, maxPerBatch = MAX_TESTS_PER_BATCH) {
  if (!Number.isInteger(count) || count < 1) {
    throw new E2EIsolationError('Cannot plan batches for an empty inventory')
  }
  if (!Number.isInteger(maxPerBatch) || maxPerBatch < 1 || maxPerBatch > MAX_TESTS_PER_BATCH) {
    throw new E2EIsolationError(`maxPerBatch must be between 1 and ${MAX_TESTS_PER_BATCH}`)
  }
  const totalShards = Math.ceil(count / maxPerBatch)
  return {
    totalShards,
    batches: Array.from({ length: totalShards }, (_, index) => ({
      index: index + 1,
      shard: index + 1,
      totalShards,
    })),
  }
}

/**
 * Prove the shard plan covers the declared suite exactly once and that no
 * shard exceeds the fresh-server limit, before any browser starts.
 */
export function verifyShardCoverage({ inventory, shards, maxPerBatch = MAX_TESTS_PER_BATCH }) {
  const declared = new Set(inventory.map(test => test.identity))
  const firstShardFor = new Map()
  const problems = []
  const plan = []
  for (const shard of shards) {
    const identities = shard.tests.map(test => test.identity)
    if (identities.length === 0) {
      problems.push(`shard ${shard.index}/${shard.totalShards} selects no tests`)
    }
    if (identities.length > maxPerBatch) {
      problems.push(
        `shard ${shard.index}/${shard.totalShards} selects ${identities.length} tests, over the ${maxPerBatch}-tests-per-fresh-server limit`,
      )
    }
    for (const identity of identities) {
      if (!declared.has(identity)) {
        problems.push(`shard ${shard.index}/${shard.totalShards} selects an undeclared test: ${identity}`)
      }
      if (firstShardFor.has(identity)) {
        problems.push(`test selected by shards ${firstShardFor.get(identity)} and ${shard.index}: ${identity}`)
      } else {
        firstShardFor.set(identity, shard.index)
      }
    }
    plan.push({ index: shard.index, totalShards: shard.totalShards, identities })
  }
  for (const identity of declared) {
    if (!firstShardFor.has(identity)) problems.push(`no shard selects ${identity}`)
  }
  if (problems.length > 0) {
    throw new E2EIsolationError(
      `Shard plan does not cover the declared suite exactly once:\n${problems.join(String.fromCharCode(10))}`,
      { problems, plan },
    )
  }
  return plan
}

export function buildInventoryArgs(forwarded) {
  return ['test', '--list', '--reporter=json', ...forwarded]
}

export function buildShardListArgs({ shard, totalShards, forwarded }) {
  return ['test', '--list', '--reporter=json', `--shard=${shard}/${totalShards}`, ...forwarded]
}

export function buildRunArgs({ shard, totalShards, outputDir, forwarded }) {
  return [
    'test',
    `--shard=${shard}/${totalShards}`,
    '--workers=1',
    '--reporter=list,json,blob',
    `--output=${outputDir}`,
    ...forwarded,
  ]
}

/** Per-batch environment: unique machine results, unique blob, no inherited reporter state. */
export function batchEnv({ baseEnv = process.env, batchDir }) {
  const env = { ...baseEnv }
  for (const key of PLAYWRIGHT_REPORTER_ENV_KEYS) delete env[key]
  env.PLAYWRIGHT_JSON_OUTPUT_FILE = join(batchDir, 'report.json')
  env.PLAYWRIGHT_BLOB_OUTPUT_FILE = join(batchDir, 'blob', 'report.zip')
  return env
}

/** Environment for the final merge, which must not inherit a batch's outputs. */
export function mergeEnv({ baseEnv = process.env, workDir }) {
  const env = { ...baseEnv }
  for (const key of PLAYWRIGHT_REPORTER_ENV_KEYS) delete env[key]
  env.PLAYWRIGHT_HTML_OUTPUT_DIR = join(workDir, 'html')
  env.PLAYWRIGHT_JSON_OUTPUT_FILE = join(workDir, 'merged.json')
  return env
}

/**
 * Parse one batch's machine report. Any test outside the shard plan, a test
 * with no result, an interrupted test or a missing planned test is an
 * infrastructure failure, not a silent gap.
 */
export function parseRunReport(report, { expected, batch = 'batch' }) {
  if (Array.isArray(report?.errors) && report.errors.length > 0) {
    throw new E2EIsolationError(`Batch ${batch} report contains ${report.errors.length} run error(s)`)
  }
  const expectedSet = new Set(expected)
  const tests = []
  walkSuites(report, ({ spec, test, fullTitle }) => {
    const identity = identityOf({ ...locationOf(spec, test), fullTitle })
    if (!expectedSet.has(identity)) {
      throw new E2EIsolationError(`Batch ${batch} ran a test outside its shard plan: ${identity}`)
    }
    if (!KNOWN_TEST_STATUSES.has(test.status)) {
      throw new E2EIsolationError(`Batch ${batch} reported an unknown status "${test.status}" for ${identity}`)
    }
    const results = Array.isArray(test.results) ? test.results : []
    if (results.length === 0) {
      throw new E2EIsolationError(`Batch ${batch} produced no result for ${identity}`)
    }
    if (results.some(result => result.status === 'interrupted')) {
      throw new E2EIsolationError(`Batch ${batch} interrupted ${identity}`)
    }
    tests.push({
      identity,
      status: test.status,
      expectedStatus: test.expectedStatus,
      attempts: results.length,
      retries: results.filter(result => (result.retry ?? 0) > 0).length,
      finalStatus: results[results.length - 1].status,
      attachments: results
        .flatMap(result => result.attachments ?? [])
        .map(attachment => attachment.path)
        .filter(Boolean),
      errors: results
        .flatMap(result => result.errors ?? [])
        .map(error => error.message ?? String(error)),
    })
  })
  const seen = new Set(tests.map(test => test.identity))
  const missing = expected.filter(identity => !seen.has(identity))
  if (missing.length > 0) {
    throw new E2EIsolationError(
      `Batch ${batch} did not execute ${missing.length} planned test(s):\n${missing.join(String.fromCharCode(10))}`,
    )
  }
  return { tests, stats: report.stats ?? null }
}

/** A declared policy entry must have a reason and must match a declared test. */
export function assertPolicyMatchesInventory(policy, inventory) {
  const declared = new Set(inventory.map(test => test.identity))
  const problems = []
  for (const entry of policy) {
    if (!entry || typeof entry.identity !== 'string' || entry.identity.length === 0) {
      problems.push('a declared skip policy entry has no identity')
      continue
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length === 0) {
      problems.push(`declared skip policy entry has no reason: ${entry.identity}`)
    }
    if (!declared.has(entry.identity)) {
      problems.push(`declared skip policy entry matches no declared test: ${entry.identity}`)
    }
  }
  if (problems.length > 0) {
    throw new E2EIsolationError(
      `Declared skip policy is invalid:\n${problems.join(String.fromCharCode(10))}`,
      { problems },
    )
  }
  return policy
}

/**
 * Any skip that is not declared in the policy fails the run, so a feature or
 * flag that was never configured cannot be reported as a completed migration.
 */
export function assertNoUndeclaredSkips(tests, policy = DECLARED_SKIP_POLICY) {
  const allowed = new Map(policy.map(entry => [entry.identity, entry.reason]))
  const problems = []
  const declaredSkips = []
  for (const test of tests) {
    const skipped = test.status === 'skipped'
      || test.expectedStatus === 'skipped'
      || test.finalStatus === 'skipped'
    if (!skipped) continue
    if (!allowed.has(test.identity)) {
      problems.push(`skipped without a declared policy reason: ${test.identity}`)
    } else {
      declaredSkips.push({ identity: test.identity, reason: allowed.get(test.identity) })
    }
  }
  if (problems.length > 0) {
    throw new E2EIsolationError(
      `Undeclared skip(s) in the run:\n${problems.join(String.fromCharCode(10))}`,
      { problems },
    )
  }
  return declaredSkips
}

/**
 * Aggregate per-batch results: every declared test exactly once, no unknown
 * status, no failure hidden by other passing batches.
 */
export function summarizeRun({ inventory, batchResults, policy = DECLARED_SKIP_POLICY }) {
  const declared = inventory.map(test => test.identity)
  const byIdentity = new Map()
  for (const batch of batchResults) {
    for (const test of batch.tests) {
      if (byIdentity.has(test.identity)) {
        throw new E2EIsolationError(`Test executed more than once across batches: ${test.identity}`)
      }
      byIdentity.set(test.identity, { ...test, batch: batch.index, exitCode: batch.exitCode })
    }
  }
  const missing = declared.filter(identity => !byIdentity.has(identity))
  if (missing.length > 0) {
    throw new E2EIsolationError(
      `Run did not execute ${missing.length} declared test(s):\n${missing.join(String.fromCharCode(10))}`,
    )
  }
  const counts = { passed: 0, flaky: 0, failed: 0, skipped: 0 }
  for (const test of byIdentity.values()) {
    if (test.status === 'expected') counts.passed += 1
    else if (test.status === 'flaky') counts.flaky += 1
    else if (test.status === 'unexpected') counts.failed += 1
    else if (test.status === 'skipped') counts.skipped += 1
    else throw new E2EIsolationError(`Unknown test status "${test.status}" for ${test.identity}`)
  }
  const declaredSkips = assertNoUndeclaredSkips([...byIdentity.values()], policy)
  const failedBatches = batchResults
    .filter(batch => batch.exitCode !== 0)
    .map(batch => ({ index: batch.index, exitCode: batch.exitCode }))
  const tests = [...byIdentity.values()].sort((left, right) => left.identity.localeCompare(right.identity))
  const ok = counts.failed === 0
    && counts.skipped === 0
    && failedBatches.length === 0
    && missing.length === 0
    && tests.length === declared.length
  return {
    ok,
    declared: declared.length,
    counts: {
      passed: counts.passed,
      expected: counts.passed,
      flaky: counts.flaky,
      failed: counts.failed,
      skipped: counts.skipped,
      allDeclared: declared.length,
    },
    failedBatches,
    declaredSkips,
    tests,
  }
}

/** Environment for read-only list/inventory invocations. */
export function listEnv({ baseEnv = process.env } = {}) {
  const env = { ...baseEnv }
  for (const key of PLAYWRIGHT_REPORTER_ENV_KEYS) delete env[key]
  return env
}

/** Real child-process executor; the runner itself only depends on this shape. */
export function createSpawnExec({ playwrightCli, nodePath = process.execPath }) {
  if (!existsSync(playwrightCli)) {
    throw new E2EIsolationError(`Playwright CLI not found: ${playwrightCli}`)
  }
  return function spawnExec({ args, cwd, env }) {
    return new Promise((resolvePromise, rejectPromise) => {
      const child = spawn(nodePath, [playwrightCli, ...args], {
        cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', chunk => { stdout += chunk })
      child.stderr.on('data', chunk => { stderr += chunk })
      child.on('error', error => {
        rejectPromise(new E2EIsolationError(`Failed to start Playwright: ${error.message}`))
      })
      child.on('close', code => {
        resolvePromise({ code: code ?? 1, stdout, stderr })
      })
    })
  }
}

async function readJson(file, label) {
  let raw
  try {
    raw = await readFile(file, 'utf8')
  } catch (error) {
    throw new E2EIsolationError(`${label} did not write ${file}: ${error.message}`)
  }
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new E2EIsolationError(`${label} wrote invalid JSON to ${file}: ${error.message}`)
  }
}

/** Copy every batch blob into one directory for `merge-reports`. */
export async function collectBlobReports({ workDir, batchResults }) {
  const blobDir = join(workDir, 'blob')
  await mkdir(blobDir, { recursive: true })
  const files = []
  const missing = []
  for (const batch of batchResults) {
    const source = join(batch.dir, 'blob', 'report.zip')
    if (!existsSync(source)) {
      missing.push(batch.index)
      continue
    }
    const target = join(blobDir, `batch-${String(batch.index).padStart(2, '0')}.zip`)
    await copyFile(source, target)
    files.push(target)
  }
  return { blobDir, files, missing }
}

/** Merge the blob reports into one HTML report plus one merged JSON report. */
export async function mergeReports({ exec, webRoot, workDir, blobs }) {
  if (blobs.files.length === 0) {
    return { ok: false, exitCode: null, error: 'no blob reports were produced', blobCount: 0 }
  }
  const result = await exec({
    args: ['merge-reports', '--reporter=html,json', blobs.blobDir],
    cwd: webRoot,
    env: mergeEnv({ workDir }),
  })
  return {
    ok: result.code === 0,
    exitCode: result.code,
    error: result.code === 0 ? null : (result.stderr.trim() || `merge-reports exited ${result.code}`),
    blobCount: blobs.files.length,
    missingBlobs: blobs.missing,
  }
}

/**
 * Inventory, verify the shard plan, then execute every declared test exactly
 * once across sequential fresh-server batches. Throws E2EIsolationError for
 * infrastructure problems (inventory, plan, reporter, missing results); test
 * failures are reported in the returned summary instead of stopping the run.
 */
export async function runIsolated({
  webRoot,
  forwarded = [],
  maxPerBatch = MAX_TESTS_PER_BATCH,
  workDir,
  dryRun = false,
  exec,
  policy = DECLARED_SKIP_POLICY,
  log = () => {},
}) {
  if (typeof exec !== 'function') throw new E2EIsolationError('runIsolated needs an exec function')
  if (!workDir) throw new E2EIsolationError('runIsolated needs a work directory')

  log('inventory: playwright test --list --reporter=json')
  const inventoryResult = await exec({ args: buildInventoryArgs(forwarded), cwd: webRoot, env: listEnv() })
  if (inventoryResult.code !== 0) {
    throw new E2EIsolationError(`Inventory failed with exit code ${inventoryResult.code}`, {
      stderr: inventoryResult.stderr,
    })
  }
  let inventoryReport
  try {
    inventoryReport = JSON.parse(inventoryResult.stdout)
  } catch (error) {
    throw new E2EIsolationError(`Inventory stdout is not valid JSON: ${error.message}`)
  }
  const inventory = flattenInventory(inventoryReport)
  assertPolicyMatchesInventory(policy, inventory)
  log(`inventory: ${inventory.length} declared test(s) in ${new Set(inventory.map(t => t.project)).size} project(s)`)

  const { totalShards, batches } = planBatches(inventory.length, maxPerBatch)
  const shards = []
  for (const batch of batches) {
    const result = await exec({
      args: buildShardListArgs({ ...batch, forwarded }),
      cwd: webRoot,
      env: listEnv(),
    })
    if (result.code !== 0) {
      throw new E2EIsolationError(`Shard ${batch.index}/${totalShards} listing failed with exit code ${result.code}`, {
        stderr: result.stderr,
      })
    }
    let report
    try {
      report = JSON.parse(result.stdout)
    } catch (error) {
      throw new E2EIsolationError(`Shard ${batch.index}/${totalShards} list is not valid JSON: ${error.message}`)
    }
    shards.push({ ...batch, tests: flattenInventory(report) })
  }
  const plan = verifyShardCoverage({ inventory, shards, maxPerBatch })
  log(`plan: ${plan.length} shard(s), max ${Math.max(...plan.map(shard => shard.identities.length))} test(s) per batch`)

  if (dryRun) {
    return { dryRun: true, inventory, plan, totalShards, workDir, maxPerBatch }
  }

  const batchResults = []
  for (const planned of plan) {
    const dir = join(workDir, `batch-${String(planned.index).padStart(2, '0')}`)
    await mkdir(join(dir, 'blob'), { recursive: true })
    log(`batch ${planned.index}/${totalShards}: ${planned.identities.length} test(s)`)
    const result = await exec({
      args: buildRunArgs({
        shard: planned.index,
        totalShards,
        outputDir: join(dir, 'test-results'),
        forwarded,
      }),
      cwd: webRoot,
      env: batchEnv({ batchDir: dir }),
    })
    await writeFile(join(dir, 'playwright.log'), `${result.stdout}${result.stderr}`).catch(() => {})
    const report = await readJson(join(dir, 'report.json'), `Batch ${planned.index}`)
    const parsed = parseRunReport(report, { expected: planned.identities, batch: planned.index })
    batchResults.push({
      index: planned.index,
      exitCode: result.code,
      dir,
      tests: parsed.tests,
      stats: parsed.stats,
    })
  }

  const summary = summarizeRun({ inventory, batchResults, policy })
  const blobs = await collectBlobReports({ workDir, batchResults })
  const merge = await mergeReports({ exec, webRoot, workDir, blobs })
  return { dryRun: false, inventory, plan, totalShards, batchResults, summary, blobs, merge, workDir, maxPerBatch }
}

export function usage() {
  return [
    'Usage: node web/scripts/e2e-isolated.mjs [playwright selectors/options] [runner options]',
    '',
    'Runs the declared Playwright suite in sequential fresh-server batches of at',
    'most two tests, preserving every machine result, failure log, trace and blob.',
    '',
    'Runner options:',
    '  --max-per-batch <1|2>  tests per fresh server (default 2, hard ceiling 2)',
    '  --work-dir <dir>       artifact root, relative to web/',
    '  --dry-run              inventory and verify the shard plan only',
    '  --help                 show this text',
    '',
    'Every other option is forwarded to `playwright test` (for example --project,',
    '--grep, a spec file or file:line). Options that would break exact coverage or',
    'artifact preservation (--shard, --list, --reporter, --output, --workers,',
    '--retries, --repeat-each, --update-snapshots, --max-failures, --last-failed,',
    '--only-changed, --pass-with-no-tests, --debug, --config) are rejected.',
  ].join(String.fromCharCode(10))
}

export async function main(argv, { log = console.log, error = console.error } = {}) {
  const { runner, forwarded, errors } = parseRunnerArgs(argv)
  if (runner.help) {
    log(usage())
    return 0
  }
  if (errors.length > 0) {
    for (const message of errors) error(`e2e-isolated: ${message}`)
    return 1
  }

  const scriptDir = dirname(fileURLToPath(import.meta.url))
  const webRoot = dirname(scriptDir)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const workDir = resolve(webRoot, runner.workDir ?? join('.e2e-isolated', stamp))
  const playwrightCli = join(dirname(webRoot), 'node_modules', 'playwright', 'cli.js')

  try {
    const exec = createSpawnExec({ playwrightCli })
    const result = await runIsolated({
      webRoot,
      forwarded,
      maxPerBatch: runner.maxPerBatch,
      workDir,
      dryRun: runner.dryRun,
      exec,
      log,
    })
    if (result.dryRun) {
      log(`dry run: ${result.inventory.length} declared test(s), ${result.plan.length} shard(s) verified`)
      for (const shard of result.plan) {
        log(`  shard ${shard.index}/${shard.totalShards}: ${shard.identities.join(', ')}`)
      }
      return 0
    }
    const summary = {
      generatedAt: new Date().toISOString(),
      workDir: result.workDir,
      totalShards: result.totalShards,
      maxPerBatch: result.maxPerBatch,
      batches: result.batchResults.map(batch => ({ index: batch.index, exitCode: batch.exitCode })),
      merge: result.merge,
      ok: result.summary.ok && result.merge.ok,
      ...result.summary,
    }
    await writeFile(join(workDir, 'summary.json'), JSON.stringify(summary, null, 2))
    log(`passed ${summary.counts.passed}/${summary.counts.allDeclared}, flaky ${summary.counts.flaky}, failed ${summary.counts.failed}, skipped ${summary.counts.skipped}`)
    for (const batch of summary.batches) log(`  batch ${batch.index}: exit ${batch.exitCode}`)
    log(`merge: ${result.merge.ok ? 'ok' : `failed (${result.merge.error})`}`)
    for (const test of summary.tests) log(`  ${test.status} ${test.identity}`)
    return summary.ok ? 0 : 1
  } catch (error_) {
    error(`e2e-isolated: ${error_.message}`)
    const failure = {
      generatedAt: new Date().toISOString(),
      workDir,
      ok: false,
      error: error_.message,
      details: error_.details ?? null,
    }
    await mkdir(workDir, { recursive: true }).catch(() => {})
    await writeFile(join(workDir, 'summary.json'), JSON.stringify(failure, null, 2)).catch(() => {})
    return 1
  }
}

const invokedPath = process.argv[1]
const isDirectInvocation = Boolean(invokedPath)
  && fileURLToPath(import.meta.url).toLowerCase() === resolve(invokedPath).toLowerCase()
if (isDirectInvocation) {
  process.exitCode = await main(process.argv.slice(2))
}
