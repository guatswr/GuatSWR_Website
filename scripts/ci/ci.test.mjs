import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { classifyChanges } from './changes.mjs'
import { e2eMetrics, performanceMetrics, resultMetrics, routeMetrics, securityMetrics, vitestMetrics } from './report.mjs'

const passes = rows => rows.every(row => row.ok)
test('main CI keeps only core gates and a stable required result', async () => {
  const require=createRequire(new URL('../../backend/package.json',import.meta.url)),{load}=require('js-yaml')
  const workflow=load(await readFile(new URL('../../.github/workflows/backend.yml',import.meta.url),'utf8'))
  assert.equal(workflow.name,'CI')
  assert.ok(workflow.on.push.branches.includes('main')&&workflow.on.pull_request.branches.includes('main'))
  assert.ok(Object.hasOwn(workflow.on,'merge_group'))
  assert.equal(workflow.on.schedule,undefined)
  assert.equal(workflow.on.push.paths,undefined)
  assert.deepEqual(Object.keys(workflow.jobs).sort(),['scope','quality','postgres','web','audit','result'].sort())
  assert.equal(workflow.jobs.result.if,'${{ always() }}')
  assert.deepEqual(workflow.jobs.result.needs,['scope','quality','postgres','web','audit'])
  for(const name of ['postgres','web'])assert.deepEqual(workflow.jobs[name].needs,['scope','quality'])
  const commands=Object.values(workflow.jobs).flatMap(job=>(job.steps||[]).map(step=>step.run||'')).join('\n')
  assert.doesNotMatch(commands,/docker build|playwright install|test:e2e|test:performance|check-route-budget/)
  assert.match(commands,/--suite core/);assert.match(commands,/--suite release/);assert.match(commands,/--suite bff/)
  assert.equal((commands.match(/--filter @guatswr\/web build/g)||[]).length,1)
  assert.equal(workflow.jobs.audit.uses,'./.github/workflows/dependency-security.yml')
})
test('expensive browser, image and Windows checks are manual, while security scans remain scheduled',async()=>{
  const require=createRequire(new URL('../../backend/package.json',import.meta.url)),{load}=require('js-yaml')
  const extended=load(await readFile(new URL('../../.github/workflows/extended-ci.yml',import.meta.url),'utf8'))
  assert.deepEqual(Object.keys(extended.on),['workflow_dispatch'])
  const commands=Object.values(extended.jobs).flatMap(job=>(job.steps||[]).map(step=>step.run||'')).join('\n')
  assert.match(commands,/test:e2e/);assert.match(commands,/test:performance/);assert.match(commands,/--suite packaged/)
  const security=load(await readFile(new URL('../../.github/workflows/dependency-security.yml',import.meta.url),'utf8'))
  assert.ok(Object.hasOwn(security.on,'workflow_call')&&security.on.schedule.length>0)
})
test('documentation skips core work while unknown source paths retain every core gate',()=>{
  assert.equal(Object.values(classifyChanges(['README.md','docs/releases/v2.0.0.md'])).some(Boolean),false)
  for(const files of [['scripts/ci/report.mjs'],['docs/backend-modernization/evidence/baseline.json'],['new-runtime-config']]){
    const scope=classifyChanges(files);assert.ok(scope.quality&&scope.postgres&&scope.web);assert.equal(scope.audit,false)
  }
  assert.ok(Object.values(classifyChanges([],true)).every(Boolean))
})
test('scope selects PostgreSQL for backend/BFF changes and audit only for dependency changes',()=>{
  const css=classifyChanges(['web/app/assets/css/main.css'])
  assert.ok(css.quality&&css.web);assert.equal(css.postgres||css.audit,false)
  assert.ok(classifyChanges(['web/server/api/config.get.ts']).postgres)
  for(const file of ['backend/src/app.js','packages/shared/src/index.ts']){
    const scope=classifyChanges([file]);assert.ok(scope.quality&&scope.postgres&&scope.web);assert.equal(scope.audit,false)
  }
  for(const file of ['pnpm-lock.yaml','.npmrc','web/package.json','patches/example.patch'])assert.ok(classifyChanges([file]).audit)
})

const unit = statuses => ({ success: !statuses.includes('failed'), numTotalTests: statuses.length, numFailedTestSuites: 0, testResults: [{ name: '/repo/tests/unit.test.ts', assertionResults: statuses.map((status, i) => ({ status, fullName: `test ${i}` })) }] })
test('unit gates reject empty, partial, failed and silently skipped inventories', () => {
  assert.ok(passes(vitestMetrics(unit(['passed', 'passed']))))
  for (const status of ['failed', 'pending', 'todo', 'unknown']) assert.equal(passes(vitestMetrics(unit(['passed', status]))), false)
  assert.throws(() => vitestMetrics(unit([])), /empty/)
  assert.throws(() => vitestMetrics({ ...unit(['passed']), numTotalTests: 2 }), /inventory/)
})
test('only the declared POSIX process-group case is excluded on Windows', () => {
  const report = unit(['passed', 'skipped'])
  report.testResults[0].name = 'D:\\repo\\backend\\tests\\integration\\backup-scheduler.test.mjs'
  report.testResults[0].assertionResults[1].fullName = 'timeout kills POSIX descendants in the detached backup process group'
  assert.ok(passes(vitestMetrics(report, 'win32')))
  assert.equal(passes(vitestMetrics(report, 'linux')), false)
  report.testResults[0].assertionResults[1].fullName = 'another skipped test'
  assert.equal(passes(vitestMetrics(report, 'win32')), false)
})
test('a passed retry remains a flaky failure and incomplete E2E reports cannot pass', () => {
  const e2e = { ok: true, merge: { ok: true }, counts: { passed: 2, failed: 0, flaky: 0, skipped: 0, allDeclared: 2 }, tests: [{}, {}] }
  assert.ok(passes(e2eMetrics(e2e)))
  e2e.counts.passed--; e2e.counts.flaky++
  assert.equal(passes(e2eMetrics(e2e)), false)
  assert.throws(() => e2eMetrics({ ...e2e, tests: [{}] }), /exactly once/)
  assert.equal(passes(e2eMetrics({ ...e2e, merge: { ok: false } })), false)
})
test('route size is gzip on cold navigation; sourcemaps and missing measurements fail', () => {
  const report = { passed: true, budgetBytes: 153600, output: { sourceMaps: 0 }, routes: [{ path: '/', initialRouteJsGzipBytes: 153600 }] }
  assert.ok(passes(routeMetrics(report)))
  assert.equal(passes(routeMetrics({ ...report, output: { sourceMaps: 1 } })), false)
  assert.equal(passes(routeMetrics({ ...report, routes: [{ path: '/', initialRouteJsGzipBytes: 153601 }] })), false)
  assert.throws(() => routeMetrics({ ...report, routes: [{}] }), /gzip/)
})
test('performance gates recompute medians and reject incomplete route/sample inventories', () => {
  const report = { complete: true, results: ['/', '/activities', '/events/stg'].map(path => ({ url: `http://localhost${path}`, runs: [{ lcpMs: 1000, performance: 99 }, { lcpMs: 1800, performance: 95 }, { lcpMs: 3000, performance: 50 }] })) }
  assert.ok(passes(performanceMetrics(report)))
  report.results[0].runs[1].lcpMs = 1801
  assert.equal(passes(performanceMetrics(report)), false)
  assert.throws(() => performanceMetrics({ ...report, results: report.results.slice(1) }), /incomplete/)
  report.results[0].runs.pop()
  assert.throws(() => performanceMetrics(report), /three valid/)
})
test('audit errors and new advisories stay red even when other checks can run', () => {
  const report = { ok: true, unresolved: [], mitigated: [{}], verified: [{}] }
  assert.ok(passes(securityMetrics(report)))
  assert.equal(passes(securityMetrics({ ...report, ok: false, unresolved: [{ severity: 'low' }] })), false)
  assert.equal(passes(securityMetrics({ ...report, ok: false, error: 'network failure' })), false)
  assert.throws(() => securityMetrics({ ok: false }), /complete security report/)
})
test('the final required check rejects missing, failed, cancelled or unexpectedly skipped jobs', () => {
  const flags = classifyChanges(['web/app/pages/index.vue'])
  const needs = { scope: { result: 'success', outputs: Object.fromEntries(Object.entries(flags).map(([key, value]) => [key, String(value)])) } }
  for (const [job, flag] of Object.entries({quality:'quality',postgres:'postgres',web:'web',audit:'audit'})) needs[job] = { result: flags[flag] ? 'success' : 'skipped' }
  assert.ok(passes(resultMetrics(needs)))
  const pgRequired={...needs,scope:{...needs.scope,outputs:{...needs.scope.outputs,postgres:'true'}}}
  assert.equal(passes(resultMetrics(pgRequired)),false)
  assert.ok(passes(resultMetrics({...pgRequired,postgres:{result:'success'}})))
  for (const result of ['skipped', 'cancelled', 'failure']) assert.equal(passes(resultMetrics({ ...needs, web: { result } })), false)
  assert.throws(() => resultMetrics({ ...needs, audit: undefined }), /missing/)
  assert.throws(() => resultMetrics({ ...needs, scope: { result: 'failure' } }), /Scope/)
})
test('missing report CLI exits nonzero and preserves a machine-readable diagnostic', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'guatswr-ci-report-'))
  assert.equal(dirname(dir), tmpdir())
  try {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./report.mjs', import.meta.url)), 'vitest', 'missing.json'], { cwd: dir, encoding: 'utf8' })
    assert.equal(result.status, 1)
    const report = JSON.parse(await readFile(join(dir, '.tools/ci/vitest.metrics.json'), 'utf8'))
    assert.equal(report.ok, false)
    assert.match(report.errors[0], /missing.json/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('scope CLI compares the push base and writes usable GitHub outputs; an unavailable base selects all checks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'guatswr-ci-scope-'))
  assert.equal(dirname(dir), tmpdir())
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  try {
    git('init', '--quiet')
    await writeFile(join(dir, 'README.md'), 'fixture')
    git('add', '--', 'README.md')
    git('-c', 'user.name=CI fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'base')
    const base = git('rev-parse', 'HEAD')
    await mkdir(join(dir, 'web/app'), { recursive: true })
    await writeFile(join(dir, 'web/app/page.vue'), '<template>fixture</template>')
    git('add', '--', 'web/app/page.vue')
    git('-c', 'user.name=CI fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'page')
    const eventFile = join(dir, '.git/event.json'), output = join(dir, '.git/outputs')
    await writeFile(eventFile, JSON.stringify({ before: base }))
    const run = () => spawnSync(process.execPath, [fileURLToPath(new URL('./changes.mjs', import.meta.url))], { cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: eventFile, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: join(dir, '.git/summary') } })
    assert.equal(run().status, 0)
    const scope = JSON.parse(await readFile(join(dir, '.tools/ci/scope.json'), 'utf8'))
    assert.deepEqual(scope.files, ['web/app/page.vue'])
    assert.equal(scope.scope.web, true)
    assert.equal(scope.scope.audit, false)
    assert.match(await readFile(output, 'utf8'), /web=true\n/)
    await writeFile(eventFile, JSON.stringify({ before: 'f'.repeat(40) }))
    assert.equal(run().status, 0)
    const fallback = JSON.parse(await readFile(join(dir, '.tools/ci/scope.json'), 'utf8'))
    assert.equal(fallback.full, true)
    assert.ok(Object.values(fallback.scope).every(Boolean))
  } finally { await rm(dir, { recursive: true, force: true }) }
})
