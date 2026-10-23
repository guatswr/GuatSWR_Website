import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { bracesProbes, forgeProbes } from './security-patch-probes.mjs'

const execute = promisify(execFile)
const sha256 = data => createHash('sha256').update(data).digest('hex')
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const probeFactories = { 'node-forge': forgeProbes, braces: bracesProbes }

// Follow installed package links, nested node_modules and pnpm's reachable
// sibling dependency directories. Unreferenced store/cache entries are not code
// that Node can resolve from this workspace and are deliberately not included.
export async function discoverInstalledPackages(root, names) {
  const visitedModules = new Set(), visitedPackages = new Set(), found = []
  async function visitPackage(path) {
    let actual, manifest
    try {
      actual = await realpath(path)
      if (visitedPackages.has(actual)) return
      visitedPackages.add(actual)
      manifest = JSON.parse(await readFile(join(actual, 'package.json'), 'utf8'))
    } catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return; throw error }
    if (names.has(manifest.name)) found.push({ name: manifest.name, version: manifest.version, path: actual })
    await visitModules(join(actual, 'node_modules'))
    if (basename(dirname(actual)) === 'node_modules') await visitModules(dirname(actual))
  }
  async function visitModules(path) {
    let actual, entries
    try {
      actual = await realpath(path)
      if (visitedModules.has(actual)) return
      visitedModules.add(actual)
      entries = await readdir(actual, { withFileTypes: true })
    } catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return; throw error }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || (!entry.isDirectory() && !entry.isSymbolicLink())) continue
      const path = join(actual, entry.name)
      if (entry.name.startsWith('@')) {
        for (const scoped of await readdir(path)) await visitPackage(join(path, scoped))
      } else await visitPackage(path)
    }
  }
  await visitModules(join(root, 'node_modules'))
  await visitModules(join(root, 'web/node_modules'))
  await visitModules(join(root, 'backend/node_modules'))
  let workspaces = []
  try { workspaces = await readdir(join(root, 'packages')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  for (const name of workspaces) await visitModules(join(root, 'packages', name, 'node_modules'))
  return found.sort((a, b) => a.path.localeCompare(b.path))
}

function localPath(root, path) {
  const target = resolve(root, path)
  const child = relative(root, target)
  if (isAbsolute(path) || child.startsWith('..') || isAbsolute(child)) throw new Error(`Invalid policy path: ${path}`)
  return target
}

export async function verifyPatchState(root, policy) {
  const installed = await discoverInstalledPackages(root, new Set(policy.map(item => item.package)))
  const settings = await readFile(join(root, 'pnpm-workspace.yaml'), 'utf8')
  const verified = []
  for (const item of policy) {
    if (!probeFactories[item.package]) throw new Error(`No regression probes for ${item.package}`)
    if (!settings.includes(`${item.package}@${item.version}: ${item.patch}`)) throw new Error(`Patch registration missing for ${item.package}`)
    const patch = await readFile(localPath(root, item.patch))
    if (sha256(patch) !== item.patchSha256) throw new Error(`Patch checksum mismatch: ${item.patch}`)
    const copies = installed.filter(copy => copy.name === item.package)
    if (!copies.length) throw new Error(`No installed copy found for ${item.package}`)
    for (const copy of copies) {
      if (copy.version !== item.version) throw new Error(`Unreviewed ${copy.name} version: ${copy.version}`)
      for (const [file, hash] of Object.entries(item.files)) {
        if (sha256(await readFile(localPath(copy.path, file))) !== hash) throw new Error(`Installed patch mismatch: ${copy.path}/${file}`)
      }
      const require = createRequire(join(copy.path, 'package.json'))
      const probes = probeFactories[item.package](require(copy.path))
      for (const [name, probe] of probes) {
        try { probe() } catch (error) { throw new Error(`${copy.name}: ${name}: ${error.message}`, { cause: error }) }
      }
      verified.push({ package: copy.name, version: copy.version, path: copy.path, probes: probes.length, advisory: item.advisory })
    }
  }
  return verified
}

// No blanket ignoreCves: only the exact advisory, range and installed version
// can be accepted, and only after source hashes AND exploit probes have passed.
export function evaluateAudit(audit, policy, verified) {
  if (!audit || audit.error || !audit.advisories || Array.isArray(audit.advisories) || !audit.metadata?.vulnerabilities) throw new Error('Invalid or incomplete audit report')
  const accepted = [], unresolved = [], counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 }
  for (const advisory of Object.values(audit.advisories)) {
    if (!Object.hasOwn(counts, advisory.severity) || !Array.isArray(advisory.findings) || !advisory.findings.length) throw new Error('Invalid advisory record')
    counts[advisory.severity]++
    const item = policy.find(item => item.advisory === advisory.github_advisory_id && item.package === advisory.module_name && item.range === advisory.vulnerable_versions)
    const patched = item && advisory.findings.every(finding => finding.version === item.version)
      && verified.some(copy => copy.package === item.package && copy.version === item.version && copy.advisory === item.advisory)
    const finding = { advisory: advisory.github_advisory_id, package: advisory.module_name, severity: advisory.severity, title: advisory.title }
    if (patched) accepted.push({ ...finding, mitigation: 'verified local patch; upstream version remains flagged' })
    else unresolved.push(finding)
  }
  for (const severity of Object.keys(counts)) {
    if (audit.metadata.vulnerabilities[severity] !== counts[severity]) throw new Error('Audit summary does not match advisory records')
  }
  return { ok: unresolved.length === 0, rawCounts: counts, mitigated: accepted, unresolved }
}

async function fetchAudit() {
  const entry = process.env.npm_execpath
  if (!entry) throw new Error('Run this gate using pnpm check:security so the pinned package manager is used')
  const javascript = /\.(?:c?js|mjs)$/i.test(entry)
  if (!javascript && !/^pnpm(?:\.exe)?$/i.test(basename(entry))) throw new Error('Unsupported package-manager entry point')
  let stdout, code = 0
  try {
    ({ stdout } = await execute(javascript ? process.execPath : entry, [...(javascript ? [entry] : []), 'audit', '--json'], {
      cwd: repository, timeout: 120_000, maxBuffer: 10 * 1024 * 1024,
    }))
  } catch (error) {
    if (error.code !== 1 || !error.stdout) throw error
    stdout = error.stdout; code = 1
  }
  const report = JSON.parse(stdout)
  if (code && !Object.keys(report.advisories ?? {}).length) throw new Error('Audit failed without usable findings')
  return report
}

async function main() {
  const report = { generatedAt: new Date().toISOString(), ok: false }
  try {
    const policy = JSON.parse(await readFile(join(repository, 'scripts/revamp/security-patches.json'), 'utf8'))
    report.verified = await verifyPatchState(repository, policy)
    report.rawAudit = await fetchAudit()
    Object.assign(report, evaluateAudit(report.rawAudit, policy, report.verified))
    if (!report.ok) throw new Error(`${report.unresolved.length} unresolved dependency advisories`)
    console.log(JSON.stringify({ ok: true, verifiedCopies: report.verified.length, regressionProbes: report.verified.reduce((sum, item) => sum + item.probes, 0), rawCounts: report.rawCounts, mitigated: report.mitigated, unresolved: report.unresolved }, null, 2))
  } catch (error) {
    report.ok = false; report.error = error.message
    console.error(`dependency-security: ${error.message}`)
    process.exitCode = 1
  } finally {
    const output = join(repository, '.tools/dependency-security.json')
    await mkdir(dirname(output), { recursive: true })
    await writeFile(output, JSON.stringify(report, null, 2) + '\n')
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
