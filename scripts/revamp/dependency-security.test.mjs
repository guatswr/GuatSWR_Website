import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { discoverInstalledPackages, evaluateAudit, verifyPatchState } from './check-dependency-security.mjs'
import { bracesProbes, forgeProbes } from './security-patch-probes.mjs'

const require = createRequire(import.meta.url)
for (const [label, probe] of forgeProbes(require('node-forge'))) test(`node-forge: ${label}`, probe)
for (const [label, probe] of bracesProbes(require('braces'))) test(`braces: ${label}`, probe)

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const policy = JSON.parse(await readFile(join(repository, 'scripts/revamp/security-patches.json'), 'utf8'))
const verified = policy.map(item => ({ package: item.package, version: item.version, advisory: item.advisory }))
const advisory = (item, changes = {}) => ({ github_advisory_id: item.advisory, module_name: item.package,
  vulnerable_versions: item.range, severity: 'high', findings: [{ version: item.version }], ...changes })
function report(records = []) {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 }
  records.forEach(item => counts[item.severity]++)
  return { advisories: Object.fromEntries(records.map((item, index) => [index, item])), metadata: { vulnerabilities: counts } }
}

test('audit accepts only the two exact verified backports while retaining raw counts', () => {
  const result = evaluateAudit(report(policy.map(item => advisory(item))), policy, verified)
  assert.equal(result.ok, true)
  assert.equal(result.rawCounts.high, 2)
  assert.equal(result.mitigated.length, 2)
  assert.deepEqual(result.unresolved, [])
})
test('a clean upstream audit is also accepted', () => assert.equal(evaluateAudit(report(), policy, verified).ok, true))
test('an unverified patch cannot waive an advisory', () => assert.equal(evaluateAudit(report([advisory(policy[0])]), policy, []).ok, false))
test('new advisories fail even at low severity', () => assert.equal(evaluateAudit(report([advisory(policy[0], { github_advisory_id: 'GHSA-new', severity: 'low' })]), policy, verified).ok, false))
test('a changed affected range requires renewed review', () => assert.equal(evaluateAudit(report([advisory(policy[0], { vulnerable_versions: '<=9.0.0' })]), policy, verified).ok, false))
test('mixed installed versions cannot be waived', () => assert.equal(evaluateAudit(report([advisory(policy[0], { findings: [{ version: '1.4.0' }, { version: '1.3.0' }] })]), policy, verified).ok, false))
test('an advisory cannot be waived under another package name', () => assert.equal(evaluateAudit(report([advisory(policy[0], { module_name: 'another-library' })]), policy, verified).ok, false))
test('network, incomplete and inconsistent audit reports fail closed', () => {
  for (const invalid of [null, {}, { error: 'network unavailable' }, { ...report(), advisories: [] },
    { ...report(), metadata: { vulnerabilities: { high: 2 } } }, report([advisory(policy[0], { findings: [] })])]) {
    assert.throws(() => evaluateAudit(invalid, policy, verified))
  }
})

async function fixture(run) {
  const base = resolve(tmpdir())
  const root = await mkdtemp(join(base, 'guatswr-security-'))
  assert.ok(root.startsWith(base + sep))
  try { return await run(root) } finally { await rm(root, { recursive: true, force: true }) }
}
async function put(root, path, content) {
  const target = join(root, path)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, typeof content === 'string' ? content : JSON.stringify(content))
}
test('discovery finds hoisted and nested copies, including a different version', () => fixture(async root => {
  await put(root, 'node_modules/node-forge/package.json', { name: 'node-forge', version: '1.4.0' })
  await put(root, 'node_modules/vendor/package.json', { name: 'vendor', version: '1.0.0' })
  await put(root, 'node_modules/vendor/node_modules/node-forge/package.json', { name: 'node-forge', version: '1.3.0' })
  const copies = await discoverInstalledPackages(root, new Set(['node-forge']))
  assert.deepEqual(copies.map(item => item.version).sort(), ['1.3.0', '1.4.0'])
}))
test('discovery follows pnpm landing links without treating unused cache copies as installed', () => fixture(async root => {
  const store = 'node_modules/.pnpm/vendor@1/node_modules'
  await put(root, `${store}/vendor/package.json`, { name: 'vendor', version: '1.0.0' })
  await put(root, `${store}/node-forge/package.json`, { name: 'node-forge', version: '1.4.0' })
  await put(root, 'node_modules/.pnpm/unused/node_modules/node-forge/package.json', { name: 'node-forge', version: '1.3.0' })
  await symlink(join(root, store, 'vendor'), join(root, 'node_modules/vendor'), process.platform === 'win32' ? 'junction' : 'dir')
  const copies = await discoverInstalledPackages(root, new Set(['node-forge']))
  assert.equal(copies.length, 1)
  assert.equal(copies[0].path, await realpath(join(root, store, 'node-forge')))
}))
test('every actual installed copy passes patch hashes and exploit probes', async () => {
  const copies = await verifyPatchState(repository, policy)
  assert.ok(copies.some(item => item.package === 'node-forge'))
  assert.ok(copies.some(item => item.package === 'braces'))
  assert.ok(copies.every(item => item.probes > 0))
})
for (const failure of ['registration', 'patch checksum', 'installed source', 'unreviewed version']) {
  test(`missing/tampered ${failure} rejects mitigation`, () => fixture(async root => {
    const item = policy[0]
    await put(root, 'pnpm-workspace.yaml', failure === 'registration' ? '' : `patchedDependencies:\n  ${item.package}@${item.version}: ${item.patch}\n`)
    await put(root, item.patch, failure === 'patch checksum' ? 'tampered' : await readFile(join(repository, item.patch), 'utf8'))
    await put(root, `node_modules/${item.package}/package.json`, { name: item.package, version: failure === 'unreviewed version' ? '0.0.0' : item.version })
    await put(root, `node_modules/${item.package}/lib/rsa.js`, 'unpatched')
    const expected = { registration: /Patch registration missing/, 'patch checksum': /checksum mismatch/,
      'installed source': /Installed patch mismatch/, 'unreviewed version': /Unreviewed/ }
    await assert.rejects(verifyPatchState(root, [item]), expected[failure])
  }))
}
