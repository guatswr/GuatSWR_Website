# GuatSWR frontend revamp status

Updated: 2026-10-22 (Asia/Shanghai). Branch: `revamp/nuxt-foundation`.

## Current checkpoint

The two high-severity dependency findings from log 27 are locally remediated
with locked pnpm patches for `node-forge@1.4.0` and `braces@3.0.3`. The new
`pnpm check:security` gate verifies patch/source hashes and 20 behavioural
probes before accepting those exact advisories. Raw pnpm audit still reports
two version-based findings; the verified result is **2 mitigated / 0 unresolved**.
Windows checks pass with **798 units and 100 tooling tests**. A fresh Linux
container installation, the same 798 units, production build and runtime smoke
also pass, with **0 sourcemaps**. The gate is wired into CI and Docker;
remote CI was not triggered. See [log 28](logs/28-dependency-security/README.md).

The user has visually approved every migrated page. The approved redesigns are
now the visual reference; historical old-site pixel comparisons remain evidence
of earlier checkpoints, rather than a requirement to undo those redesigns.

This frontend cleanup is implemented. The internal `/__revamp/layout`
page, its dedicated dialog component, adapter and unused Reka dependency have
been removed. Navigation tests use `/activities`; Lighthouse targets the real
homepage, article list and STG page. Route-budget content markers now match the
approved event pages. Formatting warnings and an unused fixture variable are
fixed; backend sources and the frozen API contract are unchanged.

Initial backup/settings and ban-list reads now use Vue Query's cancellation
signal, preventing an aborted first mount from leaving a cached error. The real
desktop/mobile 100 MiB downloads and backup/ban workflows pass **6/6**.

Final local gates pass **798 units**, typecheck, lint (**0 errors / 1 reviewed
warning**), **65 tooling tests** at that checkpoint, **126 import-boundary
scans**, frozen-lockfile validation and the shared/isolated Nuxt production
builds. **118 unique scoped
E2E cases** pass across the final build's groups: 6 backup/ban, 70 navigation/admin
and 42 public/SEO cases. The 70-case group initially had one mobile-menu locator
failure; the explicit two-case layout correction passes, with the failure kept.
All **15** route graphs pass at **124066–137559 B gzip**, with **0 maps**.

The broad initial browser run was stopped after **180/346 cases** (148 pass,
32 fail) when strict accessibility findings required palette decisions. Its
functional defects/stale assertions were addressed in the final scoped groups;
the original failed results remain. **37** captured accessibility states include
**25** with violations. The approved colours are preserved. This is a completed
cleanup checkpoint, not whole-site release acceptance.

The current closeout results, failed attempts and exact commands are recorded
in [log 27](logs/27-frontend-closeout/README.md). Validation from prior checkpoints
must not be presented as validation of this version.

## Remaining acceptance

[CHECKLIST.md](CHECKLIST.md) remains the detailed acceptance ledger. Visual
approval does not close the following independent release requirements:

- **#11–14:** finish the component/form semantic acceptance ledger against actual
  controls; the project need not introduce wrappers without a reuse case.
- **#80 Accessibility:** strict automatic findings, incomplete checks and manual
  keyboard/touch/motion acceptance must be assessed on the approved redesigns.
- **#81–82 Performance:** matched old/new cold/warm baseline and real-page
  Lighthouse/LCP remain independent of the passing initial-JS budget.
- **#83–84 Resilience/security:** the two dependency findings are mitigated and
  continuously checked; broader security acceptance and production configuration
  remain open. The current global `security.rateLimiter: false` is not approved
  by this cleanup.
- **#85–87:** production observability, remaining upstream build warnings and
  final remote Windows/Linux/container CI remain open. The Linux container and
  Windows checks above are local evidence.
- **#89–100 Deployment/cutover:** release version, environment configuration,
  backup/rollback and deployment verification remain separate. The estimated
  launch date is 2026-11-11; no deployment or traffic change has been performed.

The existing local development server at **http://127.0.0.1:3100** is preserved.
Test servers use isolated loopback ports and in-memory data. The final validation
build is isolated under `.tools/frontend-closeout/verified/`.

## Navigation and evidence

- [Dependency security remediation](logs/28-dependency-security/README.md)
- [Closeout report](logs/27-frontend-closeout/README.md)
- [Architecture and ownership](../ARCHITECTURE.md)
- [Script and backup entry points](../../scripts/README.md)
- [Workstream evidence index](logs/README.md)
- [Previous structure checkpoint](logs/26-structure-improvements/README.md)
- [Full pre-maintenance history](STATUS-HISTORY-2026-10-21.md)

Update this file with the current conclusion and open work. Historical commands,
measurements, failures and limitations belong in the workstream reports.
