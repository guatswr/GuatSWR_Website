# GitHub CI

`CI` (`.github/workflows/backend.yml`) validates PRs targeting `main`, pushes to
`main`, `codex/**` and `revamp/**`, merge queues, manual runs, and a weekly full
run (Monday 02:00 Asia/Shanghai). The filename remains stable for the release
workflow. The former `revamp.yml` is consolidated here.

Require **CI result** in branch protection. It runs even when earlier jobs fail,
and checks that every job selected by the change scope succeeded. An unexpected
skip, cancellation, missing scope or missing metric report fails validation.
Documentation-only changes still produce this check with explicit scope skips;
there are no workflow-level path filters that leave a required check pending.
Existing branch rules referring to the retired workflow must be updated in the
repository settings when this configuration is adopted.

## Change scope

| Change | Validation |
| --- | --- |
| `web/app/**`, frontend styles/assets/tests | Static checks, shared/web units, production build, all desktop/mobile Chromium E2E, route budgets, Lighthouse, packaged frontend runtime |
| `web/server/**`, `web/shared/**`, fixtures, Nuxt config | Frontend checks plus real PG state/recovery and BFF-to-backend integration |
| `backend/**` | Static checks, Windows/Linux backend units, Python historical-source tests, Linux Docker PostgreSQL business/contracts/lifecycle and cold recovery, real BFF, packaged recovery |
| Lockfile, shared packages, scripts, CI or unknown paths | Full validation; unknown files never silently bypass checks |
| Web/backend package manifests | Relevant checks plus online dependency audit |
| Only README, LICENSE or Markdown/images under `docs/**` | Scope report and final required result (JSON/config/test fixtures still run all checks) |
| Manual, weekly, new branch or unavailable diff base | Full validation |

Jobs run independently after scope selection. A dependency advisory cannot
prevent test/build jobs from collecting results. Heavy frontend browser checks
run once on Linux. Pure backend units retain Windows and Linux coverage; PG business, process and packaged recovery jobs run on Linux Docker. Each browser run still covers both desktop and phone projects.
Frontend unit tests use two workers in CI and Docker builds to fit hosted-runner
CPU budgets without starving security assertions under parallel compilation.

## Metrics and thresholds

Each measured job writes tables to the Actions summary and uploads raw reports
plus `.tools/ci/*.metrics.json` for 14 days. Reports record the checked revision.

| Metric | Required value | What it establishes |
| --- | --- | --- |
| Typecheck, lint, import boundaries | Successful commands | Type consistency, code rules and browser/server separation |
| Unit/integration/contract pass rate | 100% of applicable declared cases; nonempty reports | Existing behavior and API contracts still hold |
| Unreviewed skips/todos | 0 | Disabling tests cannot manufacture a pass |
| Platform exclusions | Only the POSIX descendant-process case on Windows | A reviewed OS limitation; the case must pass on Linux |
| Desktop/mobile E2E first-attempt pass rate | 100%; failures, flaky retries, skips all 0 | User flows are reproducible, not rescued by retries |
| Initial public-route JS | Each fixture route ≤150 KiB gzip | Cold-navigation download/parse cost, including automatically requested chunks |
| Production sourcemaps | 0, including compressed maps | Debug source is absent from shipped artifacts |
| Mobile LCP | Median of exactly 3 valid samples per route ≤1,800 ms | Lab rendering speed on `/`, `/activities`, `/events/stg` |
| Lighthouse performance | Independent median of the same 3 samples ≥95 | Existing mobile lab budget; missing/invalid samples fail |
| Packaged backend | Non-root PG application, native 32-table dump, empty-target restore, login/files and next-ID writes succeed | Recovery works from the actual clean production image |
| Packaged frontend | Nonce/SSR/public-content/image checks succeed | The frontend image preserves public delivery contracts |
| Local dependency patches | Registered hashes, installed source hashes and exploit probes pass | The pinned mitigation is really installed |
| Online dependency audit | 0 unresolved advisories at every severity | Dependency updates and releases do not accept unreviewed findings |

Test counts and total client bundle size remain inventories, not arbitrary
minimums. There is no invented code-coverage percentage. The LCP figures above
are controlled Lighthouse lab measurements, not real-user p75 Core Web Vitals;
production traffic telemetry would be needed for that metric.

## Security audit policy

`pnpm check:patches` is deterministic and runs in normal quality checks and the
frontend Docker build. It does not contact an advisory service or claim that
the dependency tree is free of vulnerabilities.

`Dependency security` runs daily at 10:00 Asia/Shanghai and on manual request.
CI also calls it for dependency/configuration changes and full runs. The caller's
**CI result** fails if this required audit fails. Ordinary source-only changes
get their quality results without rerunning the online audit. A daily finding
remains a visible failed security run with raw GHSA/package details; no severity
is hidden, no finding baseline is accepted, and no `continue-on-error` is used.

The v2 release workflow audits the exact tag again before publishing, so a green
source-only quality check cannot authorize a release with unresolved advisories.
Unresolved findings require dependency upgrades or reviewed mitigations;
the workflow itself never waives them. The current dependency remediation is
documented in [the November 2026 security notes](security/dependencies-2026-11.md).

## Reproduction

Use Node from `.node-version` and pnpm from `packageManager` in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm test:ci
pnpm test:database
pnpm test:release
pnpm test:postgres
pnpm check:patches
pnpm check:security
WEB_ENV_FILE=./web/.env.example BACKEND_ENV_FILE=./backend/.env.example docker compose config --no-env-resolution --quiet
```

The Compose check deliberately uses tracked example files. Production keeps its
required private `env_file` configuration; CI never needs production secrets.
Workflow actions are pinned to release commit SHAs and use Node 24 runtimes.

New metrics must have a user or operational consequence, a stated measurement
method, a threshold with a reason, and retained failure evidence. Change the
underlying budget and its report validation together; missing data is a failure.

The PostgreSQL harness owns its temporary Docker instance and per-case databases; it never accepts production endpoints. See [PostgreSQL testing](ops/POSTGRESQL-TESTING.md) for isolation, clean builds and the pinned-image packaged suite. Local validation does not mean the remote Actions run has executed.
