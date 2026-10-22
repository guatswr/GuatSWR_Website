# Frontend migration closeout

Date: 2026-10-22 (Asia/Shanghai). Base: `1deb3b9`, branch
`revamp/nuxt-foundation`. The user confirmed the visuals of all migrated pages
and requested frontend closeout. No agent was delegated.

## Changes

- Treat the approved redesigns as the current visual reference. Preserve the
  historical comparisons and keep release acceptance separate from visual approval.
- Remove `/__revamp/layout`, its unused `UiDialog` and `dialog-reka` adapter,
  the direct `reka-ui` dependency and its Nitro inline exception. Update the
  lockfile without upgrading the remaining dependencies.
- Exercise navigation on `/activities`; assert that the retired demo returns
  HTTP 404. Existing real event-modal tests still check keyboard activation,
  focus trapping, Escape and focus return.
- Target `/`, `/activities` and `/events/stg` in the performance command. Update
  the event route-budget markers to actual approved content; retain the existing
  153600-byte initial-JS gate.
- Fix the unused fixture `bio` destructuring variable while retaining the public
  member projection. Apply the existing Vue self-closing rules (23 formatting
  warnings); retain the explicit DOMPurify boundary in admin history.
- Remove three inert `@reference` directives from admin.css. It has no `@apply`
  rules; main.css already supplies the tokens. The admin bundle must not import
  Tailwind again, which would reintroduce global utility overrides.
- Use one NuxtPage instance, with the existing public wrapper in the default
  layout. The public DOM structure is retained; admin transitions remain disabled.
  Pass Vue Query's AbortSignal into backup/settings and ban-list commands so
  observer disposal cancels the cached query, rather than persisting the aborted
  component's error on remount. Session-loss cancellation remains in place.

Backend sources, API contracts, server/DNS/Cloudflare settings and traffic were
not changed. The 3100 development listener is retained. Tests bind independent
loopback ports and use the in-memory upstream fixtures.

## Runtime and commands

Use Node **24.16.0** from `.tools/node-24.16.0/node.exe` and pnpm **11.25.0**.
The host shell's default Node is 22.23.2. The first launch attempts were rejected
by the engine gate (and one attempted local pnpm path did not exist); no source
or test assertion was changed to bypass those checks. Set PATH to the pinned
Node before invoking Corepack's pnpm entry, and use `-r run` directly to avoid
the host pnpm shim in nested root scripts.

Raw local evidence is under `.tools/frontend-closeout/`; bulky browser traces
remain under `web/.e2e-isolated/`. These directories are gitignored. Committed
`evidence.json` records the compact results and source identity.

```text
pnpm -r run typecheck
pnpm -r run lint
pnpm -r run test
node --test scripts/revamp/boundaries.test.mjs scripts/revamp/route-budget.test.mjs web/scripts/e2e-isolated.test.mjs web/scripts/performance-metrics.test.mjs
node scripts/revamp/check-boundaries.mjs
pnpm -r run build
node scripts/revamp/check-artifacts.mjs
node scripts/revamp/check-route-budget.mjs --routes scripts/revamp/route-fixtures.json
node web/scripts/e2e-isolated.mjs --work-dir .e2e-isolated/frontend-closeout
```

For browser runs set `PLAYWRIGHT_BROWSERS_PATH=.tools/browsers` (absolute),
TEMP/TMP to `.tools/tmp`, and `E2E_PORT_BASE=4500`. The final isolated build uses
Nuxt's `loadNuxt`/`buildNuxt` API with the actual `web/nuxt.config.ts`, explicit
root/src/server directories and an output/build directory below this workstream's
`.tools/` folder. Existing build outputs are not replaced during a browser run.

## Failures retained and acceptance limits

- The first lint run found the unused `_bio` variable and 24 warnings. The fixture
  error and 23 formatting warnings were fixed; the one remaining no-v-html
  warning is the existing `safeDescription()` DOMPurify call, covered by the real
  history XSS workflow. No lint rule was disabled.
- The first route-budget run stopped at the stale STG intro marker. The route's
  initial JS was within budget; update only the content marker, then rerun all
  15 routes. Keep `routes.json` and `routes-final.json` separately.
- The broad first E2E run exposed cancelled initial backup reads; the large
  download and normal backup workflow timed out on their unavailable controls.
  Their traces and error contexts are retained. No timeout or retry policy is
  relaxed, and no automatic retry is introduced for private writes.
- An independent two-test desktop/mobile run reproduced the large-download
  failure. An intermediate single-NuxtPage candidate still failed the desktop
  backup cases; that four-case attempt was stopped before finishing its mobile
  cases once the missing query-signal ownership was identified. Keep these
  failed candidate artifacts separate from the corrected build.
- The concurrent final unit attempt hit the unchanged 5s non-finite-limit stress
  test deadline at 5148ms while a build and browser suites were running. The
  initial 798-unit run passed, and a later full workspace run passed 798/798
  again without changing the test, implementation or deadline.
- Strict axe runs now identify contrast issues in the approved redesign, beyond
  the old empty-board/dark-log diagnostics. `accessibility-findings.json` retains
  the measured nodes, ratios and incomplete-rule lists. Approved colours are
  preserved; #80 remains open. A green visual confirmation is not a WCAG pass.
- Update selectors for intentional overlapping page transitions and the current
  history year rail; preserve the navigation/scroll assertions. The dark log
  hover assertion now uses its actual approved indigo colour.
- The initial ordinary build retained a Windows Nitro `entities` EEXIST link
  warning. A clean isolated build removed that warning. The dead CSS references
  were also removed. Remaining upstream warnings include nuxt-security's
  esbuild/oxc logger-removal mismatch, large lazy editor/diagram chunks, Rollup
  annotations and export-map deprecations. This report does not claim all of #86.
- Windows/local JS accounting is not Linux Lighthouse acceptance. The matched
  old/new performance baseline, complete a11y/security acceptance, observability,
  final remote CI and deployment/rollback checks remain separate release work.
- `pnpm audit --prod --json` reports high-severity `node-forge` and `braces`
  advisories, both without a patched version in the returned audit data. Their
  dependency paths enter through Nitro's listhen/globby tooling; neither is in
  the generated server package manifest. This is a dependency-tree finding,
  not proof that either vulnerable API is remotely reachable in the output.
  Keep #84 open rather than suppressing advisories or introducing an unverified
  override.

## Results

| Gate | Final local result |
| --- | --- |
| Workspace typecheck | Pass |
| Workspace lint | 0 errors / 1 reviewed DOMPurify/v-html warning; focused final-selector lint also passes |
| Workspace units | 798/798 (73 shared + 725 web); earlier unchanged stress timeout retained |
| Tooling / import boundaries | 65/65 tooling; 126 source files, 0 import violations |
| Frozen lockfile | Lockfile-only frozen validation passes; no install into a running server |
| Shared build + final isolated Nuxt build | Pass; `.tools/frontend-closeout/verified/.output` |
| Backup, settings and IPv6 bans | 6/6 desktop/mobile; actual 100 MiB downloads complete in both projects |
| Navigation/admin/homepage regression | Initial 69/70; one mobile-menu locator failed because its name changes on open; explicit corrected desktop/mobile layout run 2/2 |
| Public content / SEO | 42/42 desktop/mobile |
| Unique final scoped cases accepted | 118, after the explicit layout correction; 0 automatic retries/flaky/skips in these runs |
| Initial JS / maps | 15/15 routes, 124066–137559 B gzip (limit 153600 B); 0 maps |
| Backend/API source changes | 0 files |

The broad initial run declared 346 cases. It was stopped after 90 completed
batches / 180 cases (148 passed, 32 failed) once approved-palette accessibility
failures were established, with a remaining in-progress batch interrupted.
This incomplete run is neither a full pass nor a complete failure inventory.
Failures include the backup cancellation bug, stale selectors/typography/count
and event-title assertions, and strict accessibility checks. The functional
repairs are exercised by the 118 final scoped cases; the initial failed results
are kept rather than overwritten. The independent failing download run and
the unsuccessful intermediate layout-only candidate are also retained.

`accessibility-findings.json` contains 37 captured states, 25 with violations,
plus incomplete-rule lists. It is a partial desktop-oriented diagnostic
inventory, not a full WCAG audit. Colours, contrast thresholds and target-size
rules were not weakened. Full #80, Linux Lighthouse/matched performance,
dependency/security acceptance, observability, remaining warnings, final remote
CI and deployment remain open. No release or deployment was performed.

Final browser commands (absolute pinned browser/output/TEMP paths as above):

```text
E2E_PORT_BASE=4700 E2E_NUXT_OUTPUT=<repo>/.tools/frontend-closeout/verified/.output
node web/scripts/e2e-isolated.mjs admin-secondary.spec.ts admin-workflows.spec.ts --grep "large backup|backups preserve|account and IPv6" --max-per-batch 1 --work-dir .e2e-isolated/frontend-closeout-download-verified
node web/scripts/e2e-isolated.mjs public-pages.spec.ts seo.spec.ts --work-dir .e2e-isolated/frontend-closeout-public-verified

E2E_PORT_BASE=4900 E2E_NUXT_OUTPUT=<repo>/.tools/frontend-closeout/verified/.output
node web/scripts/e2e-isolated.mjs admin-interface.spec.ts page-transitions.spec.ts route-progress.spec.ts layout.spec.ts homepage.spec.ts entry-loading.spec.ts --work-dir .e2e-isolated/frontend-closeout-final-regression

E2E_PORT_BASE=5100 E2E_NUXT_OUTPUT=<repo>/.tools/frontend-closeout/verified/.output
node web/scripts/e2e-isolated.mjs layout.spec.ts --work-dir .e2e-isolated/frontend-closeout-layout-verified

node scripts/revamp/check-route-budget.mjs --output .tools/frontend-closeout/verified/.output --routes scripts/revamp/route-fixtures.json
```

Environment assignments above describe values, not PowerShell syntax. The
groups own independent ports, with at most two tests per fresh server; no
new agent or shared test server is introduced. Final source SHA-256 values,
individual accepted identities, earlier failures, attempt counts and the
artifact entry hash are recorded in [evidence.json](evidence.json). Runtime
gates are also retained in the small committed logs beside this report.
