import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { discoverInstalledPackages, evaluateAudit, fetchAudit, verifyPatchState } from './check-dependency-security.mjs'
import { bracesProbes, deepmergeProbes, forgeProbes, minimatchProbes } from './security-patch-probes.mjs'

const require = createRequire(import.meta.url)
for (const [label, probe] of forgeProbes(require('node-forge'))) test(`node-forge: ${label}`, probe)
for (const [label, probe] of bracesProbes(require('braces'))) test(`braces: ${label}`, probe)
for (const entry of ['deepmerge', 'deepmerge/dist/umd.js']) {
  for (const [label, probe] of deepmergeProbes(require(entry))) test(`${entry}: ${label}`, probe)
}
const legacyMinimatch = createRequire(require.resolve('eslint-plugin-import-x'))('minimatch')
for (const [label, probe] of minimatchProbes(legacyMinimatch)) test(`minimatch: ${label}`, probe)

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

test('audit accepts only the exact verified mitigations while retaining raw counts', () => {
  const result = evaluateAudit(report(policy.map(item => advisory(item))), policy, verified)
  assert.equal(result.ok, true)
  assert.equal(result.rawCounts.high, policy.length)
  assert.equal(result.mitigated.length, policy.length)
  assert.deepEqual(result.unresolved, [])
})
test('a clean upstream audit is also accepted', () => assert.equal(evaluateAudit(report(), policy, verified).ok, true))
test('an unverified patch cannot waive an advisory', () => assert.equal(evaluateAudit(report([advisory(policy[0])]), policy, []).ok, false))
test('new advisories fail even at low severity', () => assert.equal(evaluateAudit(report([advisory(policy[0], { github_advisory_id: 'GHSA-new', severity: 'low' })]), policy, verified).ok, false))
test('a changed affected range requires renewed review', () => assert.equal(evaluateAudit(report([advisory(policy[0], { vulnerable_versions: '<=9.0.0' })]), policy, verified).ok, false))
test('mixed installed versions cannot be waived', () => assert.equal(evaluateAudit(report([advisory(policy[0], { findings: [{ version: policy[0].version }, { version: '0.0.0' }] })]), policy, verified).ok, false))
test('an advisory cannot be waived under another package name', () => assert.equal(evaluateAudit(report([advisory(policy[0], { module_name: 'another-library' })]), policy, verified).ok, false))

test('a fixed upstream minimatch copy cannot waive an unpatched legacy copy', () => {
  const item = policy.find(entry => entry.package === 'minimatch')
  assert.equal(evaluateAudit(report([advisory(item)]), policy, [{ package: item.package, version: '11.0.3', advisory: item.advisory }]).ok, false)
})
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
test('discovery finds hoisted, nested and backend-local copies, including different versions', () => fixture(async root => {
  await put(root, 'node_modules/node-forge/package.json', { name: 'node-forge', version: '1.4.0' })
  await put(root, 'node_modules/vendor/package.json', { name: 'vendor', version: '1.0.0' })
  await put(root, 'node_modules/vendor/node_modules/node-forge/package.json', { name: 'node-forge', version: '1.3.0' })
  await put(root, 'backend/node_modules/node-forge/package.json', { name: 'node-forge', version: '1.2.0' })
  const copies = await discoverInstalledPackages(root, new Set(['node-forge']))
  assert.deepEqual(copies.map(item => item.version).sort(), ['1.2.0', '1.3.0', '1.4.0'])
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
  for (const item of policy) assert.ok(copies.some(copy => copy.package === item.package))
  assert.ok(copies.every(item => item.probes > 0))
})
test('policy cannot disable behavioral probes or exempt its own vulnerable version', async () => {
  await assert.rejects(verifyPatchState(repository, [{ ...policy[0], entrypoints: [] }]), /Invalid probe entrypoints/)
  await assert.rejects(verifyPatchState(repository, [{ ...policy[0], upstreamFixedVersions: [policy[0].version] }]), /Invalid fixed-version exemption/)
})
for (const failure of ['registration', 'patch checksum', 'installed source', 'unreviewed version']) {
  test(`missing/tampered ${failure} rejects mitigation`, () => fixture(async root => {
    const item = policy[0]
    await put(root, 'pnpm-workspace.yaml', failure === 'registration' ? '' : `patchedDependencies:\n  ${item.package}@${item.version}: ${item.patch}\n`)
    await put(root, item.patch, failure === 'patch checksum' ? 'tampered' : await readFile(join(repository, item.patch), 'utf8'))
    await put(root, `node_modules/${item.package}/package.json`, { name: item.package, version: failure === 'unreviewed version' ? '0.0.0' : item.version })
    for (const file of Object.keys(item.files)) await put(root, `node_modules/${item.package}/${file}`, 'unpatched')
    const expected = { registration: /Patch registration missing/, 'patch checksum': /checksum mismatch/,
      'installed source': /Installed patch mismatch/, 'unreviewed version': /Unreviewed/ }
    await assert.rejects(verifyPatchState(root, [item]), expected[failure])
  }))
}


test('audit uses the official security registry regardless of the installation mirror',async()=>{
 const clean=report(),entry=resolve('fixture-pnpm.cjs')
 const result=await fetchAudit({entry,wait:async()=>{},run:async(file,args,options)=>{
  assert.equal(file,process.execPath);assert.ok(args.includes('--registry=https://registry.npmjs.org/'));assert.ok(options.timeout<=45000)
  return {stdout:JSON.stringify(clean)}
 }})
 assert.deepEqual(result,clean)
})
test('audit retries a transport/server failure once but cannot report it as success',async()=>{
 let calls=0
 await assert.rejects(fetchAudit({entry:resolve('fixture-pnpm.cjs'),wait:async()=>{},run:async()=>{calls++;return {stdout:JSON.stringify({error:{code:'unavailable'}})}}}),/complete security report/)
 assert.equal(calls,2)
})
test('audit can recover after one invalid response',async()=>{
 let calls=0
 const clean=report()
 assert.deepEqual(await fetchAudit({entry:resolve('fixture-pnpm.cjs'),wait:async()=>{},run:async()=>({stdout:++calls===1?'temporary failure':JSON.stringify(clean)})}),clean)
 assert.equal(calls,2)
})
test('real vulnerability findings are returned immediately even when pnpm exits one',async()=>{
 let calls=0
 const findings=report([advisory(policy[0],{github_advisory_id:'GHSA-unreviewed'})])
 const result=await fetchAudit({entry:resolve('fixture-pnpm.cjs'),wait:async()=>{},run:async()=>{calls++;throw Object.assign(new Error('findings'),{code:1,stdout:JSON.stringify(findings)})}})
 assert.equal(calls,1);assert.equal(evaluateAudit(result,policy,verified).ok,false)
})

for(const nonzero of [false,true])test(`incomplete audit findings cannot produce a clean report (nonzero=${nonzero})`,async()=>{
 const incomplete=report()
 incomplete.metadata.vulnerabilities.high=1
 await assert.rejects(fetchAudit({entry:resolve('fixture-pnpm.cjs'),wait:async()=>{},run:async()=>{
  if(nonzero)throw Object.assign(new Error('missing findings'),{code:1,stdout:JSON.stringify(incomplete)})
  return {stdout:JSON.stringify(incomplete)}
 }}),/complete security report/)
})
