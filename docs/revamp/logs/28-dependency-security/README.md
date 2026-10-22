# Dependency security backports

Date: 2026-10-22 (Asia/Shanghai). Branch: `revamp/nuxt-foundation`.
The user requested remediation of the two dependency findings from log 27.
The existing frontend cleanup changes are preserved. No backend/API, approved
visuals, deployment, domain or traffic settings are changed.

## Findings and fixes

The fresh full-workspace audit and npm registry checks still report
`node-forge@1.4.0` and `braces@3.0.3` as the latest published versions, with
two high-severity advisories and no published patched versions. Local pnpm
patches address the vulnerable behaviour without renaming packages or claiming
an unpublished version:

| Advisory | Installed-source remediation |
| --- | --- |
| [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | Match the nested DigestAlgorithm element count to the captured OID/optional NULL, and reject a non-empty NULL. This rejects both extra third elements and unexpected second elements. Canonical SHA-256 signatures, including omitted optional NULL, still verify. |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | Bound brace/parenthesis nesting to 128 and guard compile/expand/stringify recursion, including direct AST inputs. Excess depth produces a controlled `SyntaxError` with `ERR_BRACES_MAX_DEPTH`; ordinary ranges, patterns, quoted/escaped braces and the supported depth boundary retain their behaviour. |

The forge issue and proposed upstream approach are documented in
[forge #1149](https://github.com/digitalbazaar/forge/issues/1149) and
[PR #1152](https://github.com/digitalbazaar/forge/pull/1152). That PR remains
unmerged; this is a local backport, not an official release. The stricter
captured-element/null checks also cover cases beyond the three-element PoC.
The braces depth guard follows the recommendation in
[braces #70](https://github.com/micromatch/braces/issues/70).

`patchedDependencies` registers the patches in `pnpm-workspace.yaml`, and the
lockfile records their content hashes. `.gitattributes` keeps patch files LF
on Windows and Linux. Docker copies the patches before frozen installation.

## Verification and audit semantics

`pnpm check:security` first discovers installed copies in hoisted/nested layouts
and reachable pnpm landing directories. For every supported copy it verifies:

1. Exact reviewed package version and patch registration.
2. Patch-file SHA-256 and installed patched-source SHA-256.
3. Real RSA verification and brace-parser/walker regression probes.
4. An online, full-workspace pnpm audit, including development dependencies.

Only the exact GHSA, package, installed version and affected range can be marked
`mitigated`, after those checks pass. New advisories at any severity, mismatched
versions/ranges, missing/tampered patches, failed probes, network errors and
inconsistent audit metadata fail the gate. There is no global CVE ignore list.
The policy and fingerprints are in
[`security-patches.json`](../../../../scripts/revamp/security-patches.json).

**The original pnpm audit still exits 1 with two version-based high findings.**
The new gate preserves those original findings and counts, labels both as
verified local mitigations, and reports **0 unresolved findings**. It does not
rewrite the audit response into a zero-vulnerability report. Version-only
scanners may continue flagging the unchanged upstream package versions.

The current production image cannot resolve either dependency and lists neither
in its server dependency manifest. Their reachable workspace dependency paths
are through Nitro development/build tooling (`listhen` and `globby`); the patches
protect those installed tools too. This inventory is not a claim that every
other aspect of the application has passed a complete security audit.

## Results

| Check | Result |
| --- | --- |
| Unpatched behavioural reproduction | 20 probes: 8 controls pass, 12 security assertions fail; no public/private keys are persisted |
| Patched behaviour | All 20 probes pass |
| Security tests | 35/35, including source/patch tampering, missing registration, unknown versions/advisories, malformed audit results and both installation layouts |
| All tooling | 100/100 (65 existing + 35 security) |
| Windows workspace | Typecheck and lint pass; 798 units (73 shared + 725 web); one existing reviewed v-html lint warning |
| Linux frozen container build | Patch hashes/probes, live audit gate, typecheck, lint, the same 798 units and production build pass |
| Linux production artifacts | 0 sourcemaps |
| Linux runtime smoke | Health, five SSR routes, fresh matching CSP nonces, JSON-LD, RSS, preview sitemap policy, source-map 404 and actual WebP upload proxy pass |
| Dependency gate | 2 verified installed copies, 20 behavioural probes, 2 raw high findings, 2 verified mitigations, 0 unresolved |

The gates are wired into Windows/Linux CI, with the raw/verified report uploaded
for seven days, and into the Docker build. Remote CI was not run or pushed in
this task. The local Linux container build and runtime were actually executed.

## Reproduce

Use the repository's Node 24.16.0 and pnpm 11.25.0. On this Windows host, set
PATH to `.tools/node-24.16.0`, TEMP/TMP to `.tools/tmp`, and invoke the pinned
Corepack pnpm entry directly to avoid the host's Node 22 shim in nested scripts.

```text
pnpm install --frozen-lockfile
pnpm check:security
pnpm test:tooling
pnpm -r run typecheck
pnpm -r run lint
pnpm -r run test
docker build --file web/Dockerfile --tag guatswr-security:local .
node scripts/revamp/container-smoke.mjs --image guatswr-security:local
```

Raw local logs live in `.tools/security-audit/`. The gate always writes
`.tools/dependency-security.json`. Compact results, patch/source hashes and
image identity are recorded in [evidence.json](evidence.json); small raw gate
logs are retained alongside this report. This work closes the two dependency
findings from log 27; checklist #84's broader release security acceptance stays
open, as do the unrelated accessibility/performance/deployment items.

## Failed attempts retained

- The first new probe file had an extra closing parenthesis; it was corrected
  before recording the genuine unpatched 8-pass/12-fail result. The syntax-error
  attempt remains separate.
- The first gate launch preceded creation of the fingerprint policy and failed
  closed on the missing file. The Node process was denied creation of that source
  JSON; copying the generated policy with PowerShell succeeded. No hash check
  or filesystem policy was bypassed by changing application code.
- A focused test rerun without the documented workspace TEMP setting failed six
  filesystem-fixture tests on this host. The complete 100-test rerun with the
  workspace TEMP passes, with each tamper test requiring its specific error.
- The existing Node-driven Docker launcher could not access Docker Desktop's
  Windows named pipe. PowerShell started an owned loopback-only container, then
  the unchanged smoke script ran via its supported `--origin` option. It passed
  all checks; PowerShell stopped that exact container afterwards. The initial
  launcher failure and successful runtime report are both retained.

When an official fixed release becomes available, replace the local patches
through a reviewed dependency update, remove the corresponding policy entries,
then rerun the behavioural probes and live audit gate.
