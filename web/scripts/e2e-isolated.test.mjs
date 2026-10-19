// Pure tests for the isolated E2E runner. No browser, no Playwright process:
// every Playwright invocation is a fake child-process executor.
//
// Run with: node --test web/scripts/e2e-isolated.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  DECLARED_SKIP_POLICY,
  MAX_TESTS_PER_BATCH,
  assertNoUndeclaredSkips,
  assertPolicyMatchesInventory,
  batchEnv,
  buildInventoryArgs,
  buildRunArgs,
  buildShardListArgs,
  collectBlobReports,
  flattenInventory,
  identityOf,
  main,
  mergeEnv,
  mergeReports,
  parseRunnerArgs,
  parseRunReport,
  planBatches,
  runIsolated,
  summarizeRun,
  usage,
  verifyShardCoverage,
} from './e2e-isolated.mjs'

const passedResult = (retry = 0) => ({
  status: 'passed', retry, attachments: [], errors: [], stdout: [], stderr: [],
})

function specOf({
  file = 'a.spec.ts',
  title,
  line,
  column = 1,
  project = 'desktop',
  expectedStatus = 'passed',
  status = 'skipped',
  results = [],
}) {
  return {
    title, file, line, column, tags: [], ok: true, id: `${file}:${line}:${project}`,
    tests: [{ projectName: project, projectId: project, expectedStatus, status, results }],
  }
}

function groupByFile(specs) {
  const byFile = new Map()
  for (const spec of specs) {
    if (!byFile.has(spec.file)) byFile.set(spec.file, [])
    byFile.get(spec.file).push(spec)
  }
  return [...byFile].map(([file, fileSpecs]) => ({ title: file, specs: fileSpecs, suites: [] }))
}

function listReport(specs, { errors = [] } = {}) {
  return { config: {}, errors, stats: { total: specs.length }, suites: groupByFile(specs) }
}

const inventorySpecs = [
  specOf({ title: 'alpha', line: 3 }),
  specOf({ title: 'beta', line: 10 }),
  specOf({ title: 'gamma', line: 20, project: 'mobile' }),
  specOf({ title: 'delta', line: 30, project: 'mobile' }),
]

async function withTempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'e2e-isolated-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return dir
}

/**
 * Fake Playwright executor: answers list/shard-list from canned reports, writes
 * a batch report + blob for run invocations, and records every call.
 */
function fakeExec({ inventory, shards, runs, runExit = () => 0, mergeCode = 0 }) {
  const calls = []
  const exec = async ({ args, cwd, env }) => {
    calls.push({ args, cwd, env })
    if (args[0] === 'merge-reports') {
      return { code: mergeCode, stdout: '', stderr: mergeCode === 0 ? '' : 'merge failed' }
    }
    if (args.includes('--list')) {
      const shardArg = args.find(arg => arg.startsWith('--shard='))
      if (!shardArg) return { code: 0, stdout: JSON.stringify(inventory), stderr: '' }
      const current = Number(shardArg.slice('--shard='.length).split('/')[0])
      return { code: 0, stdout: JSON.stringify(shards[current - 1]), stderr: '' }
    }
    const shard = Number(args.find(arg => arg.startsWith('--shard=')).slice('--shard='.length).split('/')[0])
    const batchDir = dirname(args.find(arg => arg.startsWith('--output=')).slice('--output='.length))
    await mkdir(join(batchDir, 'blob'), { recursive: true })
    await writeFile(join(batchDir, 'report.json'), JSON.stringify(runs[shard - 1]))
    await writeFile(join(batchDir, 'blob', 'report.zip'), 'blob')
    return { code: runExit(shard), stdout: `list output ${shard}`, stderr: '' }
  }
  return { exec, calls }
}

test('parses runner options and forwards everything else verbatim', () => {
  const parsed = parseRunnerArgs(['--project', 'desktop', 'homepage.spec.ts:16', '--grep', 'hero'])
  assert.deepEqual(parsed.errors, [])
  assert.deepEqual(parsed.forwarded, ['--project', 'desktop', 'homepage.spec.ts:16', '--grep', 'hero'])
  assert.equal(parsed.runner.maxPerBatch, MAX_TESTS_PER_BATCH)
  assert.equal(parsed.runner.dryRun, false)
  assert.equal(parsed.runner.help, false)

  assert.equal(parseRunnerArgs(['--max-per-batch', '1']).runner.maxPerBatch, 1)
  assert.equal(parseRunnerArgs(['--max-per-batch=1']).runner.maxPerBatch, 1)
  assert.equal(parseRunnerArgs(['--dry-run']).runner.dryRun, true)
  assert.equal(parseRunnerArgs(['--work-dir', 'out']).runner.workDir, 'out')
  assert.equal(parseRunnerArgs(['--help']).runner.help, true)
  assert.equal(parseRunnerArgs(['-h']).runner.help, true)
})

test('rejects max-per-batch values above the fresh-server ceiling', () => {
  for (const raw of ['0', '-1', '3', 'two', '']) {
    const parsed = parseRunnerArgs(['--max-per-batch', raw])
    assert.equal(parsed.errors.length, 1, raw)
    assert.match(parsed.errors[0], /max-per-batch/)
  }
  assert.deepEqual(parseRunnerArgs(['--max-per-batch', '2']).errors, [])
})

test('rejects options that would break exact coverage or artifacts', () => {
  const cases = [
    ['--shard', '1/2'],
    ['--shard=1/2'],
    ['--list'],
    ['--reporter', 'json'],
    ['--reporter=list'],
    ['--add-reporter', 'html'],
    ['--output', 'out'],
    ['--workers', '4'],
    ['-j', '4'],
    ['--repeat-each', '2'],
    ['--retries', '3'],
    ['--update-snapshots'],
    ['--max-failures', '1'],
    ['--pass-with-no-tests'],
    ['--last-failed'],
    ['--only-changed'],
    ['--debug'],
    ['--config', 'other.config.ts'],
    ['-c', 'other.config.ts'],
  ]
  for (const argv of cases) {
    const parsed = parseRunnerArgs(argv)
    assert.equal(parsed.errors.length, 1, argv.join(' '))
    assert.equal(parsed.forwarded.length, 0, argv.join(' '))
    assert.match(parsed.errors[0], /not allowed/)
  }
  assert.deepEqual(parseRunnerArgs(['--headed', '--timeout', '5000']).forwarded, ['--headed', '--timeout', '5000'])
})

test('builds the inventory, shard-list and run command lines', () => {
  assert.deepEqual(buildInventoryArgs(['--project', 'mobile']), [
    'test', '--list', '--reporter=json', '--project', 'mobile',
  ])
  assert.deepEqual(buildShardListArgs({ shard: 2, totalShards: 5, forwarded: [] }), [
    'test', '--list', '--reporter=json', '--shard=2/5',
  ])
  assert.deepEqual(buildRunArgs({ shard: 3, totalShards: 5, outputDir: join('work', 'batch-03', 'test-results'), forwarded: ['--grep', 'hero'] }), [
    'test', '--shard=3/5', '--workers=1', '--reporter=list,json,blob',
    `--output=${join('work', 'batch-03', 'test-results')}`, '--grep', 'hero',
  ])
})

test('scopes reporter output to one batch and strips inherited reporter env', () => {
  const batchDir = join('work', 'batch-01')
  const env = batchEnv({
    baseEnv: { PATH: 'x', PLAYWRIGHT_JSON_OUTPUT_FILE: 'stale.json', PLAYWRIGHT_BLOB_OUTPUT_DIR: 'stale-blob' },
    batchDir,
  })
  assert.equal(env.PATH, 'x')
  assert.equal(env.PLAYWRIGHT_JSON_OUTPUT_FILE, join(batchDir, 'report.json'))
  assert.equal(env.PLAYWRIGHT_BLOB_OUTPUT_FILE, join(batchDir, 'blob', 'report.zip'))
  assert.equal(env.PLAYWRIGHT_BLOB_OUTPUT_DIR, undefined)

  const merged = mergeEnv({ baseEnv: { PLAYWRIGHT_HTML_REPORT: 'stale' }, workDir: 'work' })
  assert.equal(merged.PLAYWRIGHT_HTML_OUTPUT_DIR, join('work', 'html'))
  assert.equal(merged.PLAYWRIGHT_JSON_OUTPUT_FILE, join('work', 'merged.json'))
  assert.equal(merged.PLAYWRIGHT_HTML_REPORT, undefined)
})

test('flattens the inventory with project, location and full title identity', () => {
  const report = {
    config: {},
    errors: [],
    suites: [{
      title: 'homepage.spec.ts',
      specs: [specOf({ file: 'homepage.spec.ts', title: 'is readable', line: 16, column: 3 })],
      suites: [{
        title: 'homepage',
        specs: [specOf({ file: 'homepage.spec.ts', title: 'freezes on clicks', line: 228, column: 3, project: 'mobile' })],
        suites: [],
      }],
    }],
  }
  const tests = flattenInventory(report)
  assert.equal(tests.length, 2)
  assert.equal(tests[0].fullTitle, 'homepage.spec.ts > is readable')
  assert.equal(tests[0].identity, 'desktop::homepage.spec.ts::16:3::homepage.spec.ts > is readable')
  assert.equal(tests[1].identity, 'mobile::homepage.spec.ts::228:3::homepage.spec.ts > homepage > freezes on clicks')
  assert.equal(tests[0].expectedStatus, 'passed')
})

test('rejects unusable inventories instead of reporting an empty pass', () => {
  assert.throws(() => flattenInventory({}), { name: 'E2EIsolationError', message: /suites array/ })
  assert.throws(() => flattenInventory(listReport([])), { message: /inventory is empty/ })
  assert.throws(() => flattenInventory(listReport([specOf({ title: 'a', line: 1 })], { errors: [{ message: 'load' }] })), { message: /load error/ })
  assert.throws(() => flattenInventory(listReport([specOf({ title: 'a', line: 1 }), specOf({ title: 'a', line: 1 })])), { message: /Duplicate inventory identity/ })
  assert.throws(() => flattenInventory(listReport([specOf({ title: 'a', line: undefined })])), { message: /file\/line location/ })
})

test('plans one shard per batch of at most two tests', () => {
  assert.deepEqual(planBatches(70).totalShards, 35)
  assert.equal(planBatches(70).batches[0].shard, 1)
  assert.equal(planBatches(61).totalShards, 31)
  assert.equal(planBatches(5, 1).totalShards, 5)
  assert.throws(() => planBatches(0), { message: /empty inventory/ })
  assert.throws(() => planBatches(4, 3), { message: /between 1 and 2/ })
  assert.throws(() => planBatches(4, 0), { message: /between 1 and 2/ })
})

const shard = (index, totalShards, identities) => ({
  index,
  totalShards,
  tests: identities.map(identity => ({ identity })),
})

test('verifies the shard plan covers the declared suite exactly once', () => {
  const inventory = flattenInventory(listReport(inventorySpecs))
  const identities = inventory.map(test => test.identity)
  const plan = verifyShardCoverage({
    inventory,
    shards: [shard(1, 2, identities.slice(0, 2)), shard(2, 2, identities.slice(2))],
  })
  assert.equal(plan.length, 2)
  assert.deepEqual(plan[0].identities, identities.slice(0, 2))
})

test('fails the shard plan on oversize, duplicate, missing or undeclared tests', () => {
  const inventory = flattenInventory(listReport(inventorySpecs))
  const identities = inventory.map(test => test.identity)
  assert.throws(
    () => verifyShardCoverage({ inventory, shards: [shard(1, 1, identities)] }),
    { message: /over the 2-tests-per-fresh-server limit/ },
  )
  assert.throws(
    () => verifyShardCoverage({
      inventory,
      shards: [shard(1, 2, [identities[0], identities[1]]), shard(2, 2, [identities[1], identities[2]])],
    }),
    { message: /selected by shards/ },
  )
  assert.throws(
    () => verifyShardCoverage({
      inventory,
      shards: [shard(1, 2, identities.slice(0, 2)), shard(2, 2, identities.slice(2, 3))],
    }),
    { message: /no shard selects/ },
  )
  assert.throws(
    () => verifyShardCoverage({
      inventory,
      shards: [shard(1, 2, identities.slice(0, 2)), shard(2, 2, [identities[2], 'desktop::ghost.spec.ts::1:1::ghost'])],
    }),
    { message: /undeclared test/ },
  )
  assert.throws(
    () => verifyShardCoverage({ inventory, shards: [shard(1, 2, []), shard(2, 2, identities.slice(0, 2)), shard(3, 3, identities.slice(2))] }),
    { message: /selects no tests/ },
  )
})

const runSpec = ({ title, line, project = 'desktop', status = 'expected', expectedStatus = 'passed', results }) => {
  const spec = specOf({ title, line, project, status, expectedStatus })
  spec.tests[0].results = results ?? [passedResult()]
  return spec
}

test('parses a batch report with retries, attachments and failure messages', () => {
  const report = {
    config: {},
    errors: [],
    stats: { total: 2, expected: 1, unexpected: 1, flaky: 0, skipped: 0, ok: false },
    suites: groupByFile([
      runSpec({ title: 'alpha', line: 3 }),
        runSpec({
          title: 'beta',
          line: 10,
          status: 'unexpected',
          results: [
            { status: 'failed', retry: 0, attachments: [{ name: 'trace', path: 'batch-01/test-results/beta/trace.zip' }], errors: [{ message: 'boom' }] },
            { status: 'failed', retry: 1, attachments: [], errors: [{ message: 'boom again' }] },
          ],
        }),
    ]),
  }
  const expected = [
    identityOf({ project: 'desktop', file: 'a.spec.ts', line: 3, column: 1, fullTitle: 'a.spec.ts > alpha' }),
    identityOf({ project: 'desktop', file: 'a.spec.ts', line: 10, column: 1, fullTitle: 'a.spec.ts > beta' }),
  ]
  const parsed = parseRunReport(report, { expected, batch: 1 })
  assert.equal(parsed.tests.length, 2)
  assert.equal(parsed.tests[0].status, 'expected')
  assert.equal(parsed.tests[1].attempts, 2)
  assert.equal(parsed.tests[1].retries, 1)
  assert.equal(parsed.tests[1].finalStatus, 'failed')
  assert.deepEqual(parsed.tests[1].attachments, ['batch-01/test-results/beta/trace.zip'])
  assert.deepEqual(parsed.tests[1].errors, ['boom', 'boom again'])
  assert.equal(parsed.stats.unexpected, 1)
})

test('fails a batch report that is incomplete or off plan', () => {
  const expected = [identityOf({ project: 'desktop', file: 'a.spec.ts', line: 3, column: 1, fullTitle: 'a.spec.ts > alpha' })]
  const suiteWith = specs => ({ config: {}, errors: [], suites: groupByFile(specs) })
  assert.throws(
    () => parseRunReport(suiteWith([runSpec({ title: 'other', line: 9 })]), { expected, batch: 1 }),
    { message: /outside its shard plan/ },
  )
  assert.throws(
    () => parseRunReport(suiteWith([runSpec({ title: 'alpha', line: 3, results: [] })]), { expected, batch: 1 }),
    { message: /no result/ },
  )
  assert.throws(
    () => parseRunReport(suiteWith([runSpec({ title: 'alpha', line: 3, results: [{ status: 'interrupted', retry: 0 }] })]), { expected, batch: 1 }),
    { message: /interrupted/ },
  )
  assert.throws(
    () => parseRunReport(suiteWith([runSpec({ title: 'alpha', line: 3, status: 'weird' })]), { expected, batch: 1 }),
    { message: /unknown status/ },
  )
  assert.throws(
    () => parseRunReport({ config: {}, errors: [{ message: 'worker crash' }], suites: [] }, { expected, batch: 1 }),
    { message: /run error/ },
  )
  assert.throws(
    () => parseRunReport(suiteWith([]), { expected, batch: 2 }),
    { message: /did not execute 1 planned test/ },
  )
})

test('allows skips only when the declared policy names the exact test', () => {
  const alpha = identityOf({ project: 'desktop', file: 'a.spec.ts', line: 3, column: 1, fullTitle: 'a.spec.ts > alpha' })
  const skipped = { identity: alpha, status: 'skipped', expectedStatus: 'passed', finalStatus: 'skipped' }
  assert.throws(() => assertNoUndeclaredSkips([skipped]), { message: /skipped without a declared policy reason/ })
  assert.throws(
    () => assertNoUndeclaredSkips([{ ...skipped, status: 'expected', finalStatus: 'skipped' }]),
    { message: /skipped without a declared policy reason/ },
  )
  const declared = assertNoUndeclaredSkips([skipped], [{ identity: alpha, reason: 'webkit-only case' }])
  assert.deepEqual(declared, [{ identity: alpha, reason: 'webkit-only case' }])
})

test('validates the declared skip policy against the inventory', () => {
  const inventory = flattenInventory(listReport(inventorySpecs))
  const alpha = inventory[0].identity
  assert.deepEqual(assertPolicyMatchesInventory([{ identity: alpha, reason: 'known' }], inventory).length, 1)
  assert.throws(() => assertPolicyMatchesInventory([{ identity: alpha }], inventory), { message: /no reason/ })
  assert.throws(() => assertPolicyMatchesInventory([{ reason: 'why' }], inventory), { message: /no identity/ })
  assert.throws(
    () => assertPolicyMatchesInventory([{ identity: 'desktop::ghost.spec.ts::1:1::ghost', reason: 'stale' }], inventory),
    { message: /matches no declared test/ },
  )
  assert.deepEqual(DECLARED_SKIP_POLICY, [])
})

test('summarizes counts and refuses to hide a failure behind passing batches', () => {
  const inventory = flattenInventory(listReport(inventorySpecs))
  const [alpha, beta, gamma, delta] = inventory.map(test => test.identity)
  const batchResults = [
    { index: 1, exitCode: 0, tests: [{ identity: alpha, status: 'expected' }, { identity: beta, status: 'flaky', retries: 1 }] },
    { index: 2, exitCode: 1, tests: [{ identity: gamma, status: 'unexpected' }, { identity: delta, status: 'expected' }] },
  ]
  const summary = summarizeRun({ inventory, batchResults })
  assert.equal(summary.ok, false)
  assert.deepEqual(summary.counts, {
    passed: 2, expected: 2, flaky: 1, failed: 1, skipped: 0, allDeclared: 4,
  })
  assert.deepEqual(summary.failedBatches, [{ index: 2, exitCode: 1 }])
  assert.equal(summary.tests.length, 4)

  assert.throws(
    () => summarizeRun({ inventory, batchResults: [batchResults[0], { ...batchResults[1], tests: [batchResults[1].tests[0]] }] }),
    { message: /did not execute 1 declared test/ },
  )
  assert.throws(
    () => summarizeRun({ inventory, batchResults: [batchResults[0], { ...batchResults[1], tests: [...batchResults[1].tests, { identity: alpha, status: 'expected' }] }] }),
    { message: /executed more than once/ },
  )
})

test('copies each batch blob and reports batches without one', async (t) => {
  const workDir = await withTempDir(t)
  const batchResults = [
    { index: 1, dir: join(workDir, 'batch-01') },
    { index: 2, dir: join(workDir, 'batch-02') },
  ]
  await mkdir(join(batchResults[0].dir, 'blob'), { recursive: true })
  await writeFile(join(batchResults[0].dir, 'blob', 'report.zip'), 'first')
  const blobs = await collectBlobReports({ workDir, batchResults })
  assert.deepEqual(blobs.missing, [2])
  assert.equal(blobs.files.length, 1)
  assert.equal(await readFile(blobs.files[0], 'utf8'), 'first')
})

test('merges blobs into one HTML and JSON report and fails closed', async () => {
  const calls = []
  const exec = async call => {
    calls.push(call)
    return { code: 0, stdout: '', stderr: '' }
  }
  const merged = await mergeReports({
    exec,
    webRoot: 'web',
    workDir: 'work',
    blobs: { blobDir: join('work', 'blob'), files: ['a.zip'], missing: [] },
  })
  assert.equal(merged.ok, true)
  assert.equal(merged.blobCount, 1)
  assert.deepEqual(calls[0].args, ['merge-reports', '--reporter=html,json', join('work', 'blob')])
  assert.equal(calls[0].env.PLAYWRIGHT_HTML_OUTPUT_DIR, join('work', 'html'))
  assert.equal(calls[0].env.PLAYWRIGHT_JSON_OUTPUT_FILE, join('work', 'merged.json'))

  const noBlobs = await mergeReports({ exec, webRoot: 'web', workDir: 'work', blobs: { blobDir: 'b', files: [], missing: [1] } })
  assert.equal(noBlobs.ok, false)
  assert.match(noBlobs.error, /no blob reports/)

  const failed = await mergeReports({
    exec: async () => ({ code: 2, stdout: '', stderr: 'merge exploded' }),
    webRoot: 'web',
    workDir: 'work',
    blobs: { blobDir: 'b', files: ['a.zip'], missing: [] },
  })
  assert.equal(failed.ok, false)
  assert.equal(failed.exitCode, 2)
  assert.match(failed.error, /merge exploded/)
})

const runReportFor = (specs, statuses = {}) => ({
  config: {},
  errors: [],
  stats: { total: specs.length },
  suites: groupByFile(specs.map((spec, index) => {
      const status = statuses[index] ?? 'expected'
      const result = status === 'skipped' ? { status: 'skipped', retry: 0 } : passedResult()
      return runSpec({ title: spec.title, line: spec.line, project: spec.tests[0].projectName, status, results: [result] })
  })),
})

test('runs every declared test exactly once across sequential fresh-server batches', async (t) => {
  const workDir = await withTempDir(t)
  const inventory = listReport(inventorySpecs)
  const shards = [
    listReport(inventorySpecs.slice(0, 2)),
    listReport(inventorySpecs.slice(2)),
  ]
  const runs = [runReportFor(inventorySpecs.slice(0, 2)), runReportFor(inventorySpecs.slice(2))]
  const { exec, calls } = fakeExec({ inventory, shards, runs })
  const logs = []
  const result = await runIsolated({
    webRoot: 'web',
    workDir,
    exec,
    log: message => logs.push(message),
  })

  assert.equal(result.dryRun, false)
  assert.equal(result.totalShards, 2)
  assert.equal(result.inventory.length, 4)
  assert.equal(result.summary.ok, true)
  assert.deepEqual(result.summary.counts, {
    passed: 4, expected: 4, flaky: 0, failed: 0, skipped: 0, allDeclared: 4,
  })
  assert.equal(result.merge.ok, true)
  assert.deepEqual(result.batchResults.map(batch => batch.exitCode), [0, 0])

  const runCalls = calls.filter(call => call.args[0] === 'test' && !call.args.includes('--list'))
  assert.equal(runCalls.length, 2)
  assert.deepEqual(runCalls.map(call => call.args[1]), ['--shard=1/2', '--shard=2/2'])
  for (const call of runCalls) {
    assert.equal(call.args.includes('--workers=1'), true)
    assert.equal(call.args.includes('--reporter=list,json,blob'), true)
    assert.equal(call.env.PLAYWRIGHT_JSON_OUTPUT_FILE.startsWith(workDir), true)
  }
  assert.equal(calls[calls.length - 1].args[0], 'merge-reports')
  assert.equal(await readFile(join(workDir, 'batch-01', 'playwright.log'), 'utf8'), 'list output 1')
  assert.equal(await readFile(join(workDir, 'blob', 'batch-02.zip'), 'utf8'), 'blob')
  assert.equal(logs.some(line => line.startsWith('inventory: 4 declared')), true)
})

test('keeps executing and reports a failing batch instead of hiding it', async (t) => {
  const workDir = await withTempDir(t)
  const shards = [listReport(inventorySpecs.slice(0, 2)), listReport(inventorySpecs.slice(2))]
  const runs = [
    runReportFor(inventorySpecs.slice(0, 2)),
    runReportFor(inventorySpecs.slice(2), { 0: 'unexpected' }),
  ]
  const { exec, calls } = fakeExec({ inventory: listReport(inventorySpecs), shards, runs, runExit: shard => (shard === 2 ? 1 : 0) })
  const result = await runIsolated({ webRoot: 'web', workDir, exec })

  assert.equal(result.summary.ok, false)
  assert.equal(result.summary.counts.failed, 1)
  assert.deepEqual(result.summary.failedBatches, [{ index: 2, exitCode: 1 }])
  assert.equal(result.summary.tests.length, 4)
  assert.equal(calls.filter(call => call.args[0] === 'test' && !call.args.includes('--list')).length, 2)
})

test('fails closed on undeclared skips and missing batch reports', async (t) => {
  const workDir = await withTempDir(t)
  const shards = [listReport(inventorySpecs.slice(0, 2)), listReport(inventorySpecs.slice(2))]
  const skippedRuns = [runReportFor(inventorySpecs.slice(0, 2), { 0: 'skipped' }), runReportFor(inventorySpecs.slice(2))]
  const skipped = fakeExec({ inventory: listReport(inventorySpecs), shards, runs: skippedRuns })
  await assert.rejects(
    runIsolated({ webRoot: 'web', workDir, exec: skipped.exec }),
    { message: /skipped without a declared policy reason/ },
  )

  const workDirTwo = await withTempDir(t)
  const broken = async ({ args }) => {
    if (args[0] === 'merge-reports') return { code: 0, stdout: '', stderr: '' }
    if (args.includes('--list')) {
      const shardArg = args.find(arg => arg.startsWith('--shard='))
      const index = shardArg ? Number(shardArg.slice('--shard='.length).split('/')[0]) : null
      return { code: 0, stdout: JSON.stringify(index === null ? listReport(inventorySpecs) : shards[index - 1]), stderr: '' }
    }
    return { code: 0, stdout: '', stderr: '' }
  }
  await assert.rejects(
    runIsolated({ webRoot: 'web', workDir: workDirTwo, exec: broken }),
    { message: /did not write/ },
  )
})

test('dry run verifies the plan without executing any test', async (t) => {
  const workDir = await withTempDir(t)
  const shards = [listReport(inventorySpecs.slice(0, 2)), listReport(inventorySpecs.slice(2))]
  const { exec, calls } = fakeExec({ inventory: listReport(inventorySpecs), shards, runs: [] })
  const result = await runIsolated({ webRoot: 'web', workDir, exec, dryRun: true })

  assert.equal(result.dryRun, true)
  assert.equal(result.plan.length, 2)
  assert.equal(result.inventory.length, 4)
  assert.equal(calls.every(call => call.args.includes('--list')), true)
})

test('main prints usage, rejects conflicting options and needs no browser', async () => {
  const lines = []
  const errors = []
  assert.equal(await main(['--help'], { log: line => lines.push(line), error: line => errors.push(line) }), 0)
  assert.equal(lines.join(String.fromCharCode(10)).includes('Usage:'), true)

  assert.equal(await main(['--shard', '1/2'], { log: () => {}, error: line => errors.push(line) }), 1)
  assert.equal(errors.some(line => line.includes('--shard is not allowed')), true)

  assert.equal(await main(['--max-per-batch', '5'], { log: () => {}, error: line => errors.push(line) }), 1)
  assert.equal(errors.some(line => line.includes('max-per-batch')), true)
  assert.equal(usage().includes('--dry-run'), true)
})
