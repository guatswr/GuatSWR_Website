# Independent acceptance — 2026-10-19

Base: `bf18a36`, primary checkout, `revamp/nuxt-foundation`. Codex performs
this work directly; no Claude or other subagents. Node 24.15.0, pnpm 11.25.0,
workspace-local TEMP and Playwright browser cache, serialized build/E2E lock.
No deployment or real backend writes. `frontend/` and `backend/` remain frozen.

## Warm-cache entry failure — fixed and independently reproduced

The checkout already contained an uncommitted `head-hints.ts` ordering fix.
It was preserved, reviewed and completed (the no-import-map fallback now inserts
after the closing title, rather than inside it). Import maps now precede all
hoisted modulepreloads. CSP nonces, HTTP caching and ordinary hydration remain.

Before rebuilding, the existing production artifact reproduced the reported
500 on warm-cache reload of `/`, `/members`, `/login` in headless Chromium,
and `/login` in full Chromium. Disabling HTTP caching masked all three failures.
After rebuilding, the same independent probe passed in both browser engines.
The raw probe outputs are `entry-before.log` and `entry-after.log` here.

New committed regression: `web/tests/e2e/entry-loading.spec.ts`. Each route is
loaded and reloaded twice without request interception or cache overrides.
Every response asserts import-map ordering and CSP nonce agreement; each load
must support the actual theme-toggle client interaction. The existing login
session redirect regression is also included.

Commands actually executed in the pinned runtime:

```
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm -r build
node --test web/scripts/e2e-isolated.test.mjs
E2E_PORT_BASE=4100 node web/scripts/e2e-isolated.mjs tests/e2e/entry-loading.spec.ts tests/e2e/login.spec.ts --grep 'warm-cache|redirects a reloaded' --work-dir .e2e-isolated/codex-entry --max-per-batch 2
node .tools/tmp/login-repro/entry-probe.mjs
```

Four recursive gates exit 0, 604 unit tests (68 shared + 536 web), lint 33
warnings / 0 errors. Runner unit tests 22/22. Entry/session subset **8/8**,
0 flaky, 0 skipped, 4 fresh-server batches; merged report succeeded.
Ignored raw gate logs: `.tools/codex-acceptance-{typecheck,lint,test,build}.log`.
These numbers describe the entry-fix artifact, before subsequent performance
work; they are not whole-migration acceptance.

## Still open at this checkpoint

- Cold-browser home route JS independently confirmed **177,477 > 153,600 B**.
  Its SSR graph is 129,505 B and automatic requests add 47,972 B. The collector
  now retains a failed route's actual chunk inventory for diagnosis.
- The old `check-artifacts.mjs` incorrectly applied the foundation's all-chunk
  budget to the expanded app. Its failure is recorded, not a passed gate.
  Source-map inspection reports 0; the actual route budget remains failing.
- Public visual comparisons, privacy-specific log expectations, full E2E,
  administration, SEO and final hardening remain under active verification.
- The previously approved readable dark signup dialog remains an explicit
  deviation. Public logs will keep their privacy projection; raw IPs and
  private config keys will not be restored to satisfy screenshots.

Further acceptance evidence will be added after those checks execute.

## Public visual protocol and route JavaScript correction

The first independently rerun 20-case prose visual selection, after waiting for
real progressive-image states and completed progress indicators and aligning
region captures above unrelated fixed navigation, passed 14/20. All member
images and charts matched exactly without changing `ProgressiveImage`.
Remaining failures were four raw-versus-redacted log comparisons and two real
mobile article heading mismatches (36 px line height instead of 37.5 px).
The heading now explicitly preserves 1.25 line height on mobile and 1 on desktop.

The log deviation is intentional: public IPs, credentials and private config
keys stay removed. Each log comparison retains the unsafe raw archive PNG,
asserts the exact privacy difference and then compares the archived renderer
using independently specified safe public strings. It does **not** claim that
the unsafe raw archive and safe new page have identical pixels. The subsequent
8-case residual selection passed 8/8, 0 flaky/skipped. No masks, antialias
settings, pixel thresholds or whole-device-pixel crop rules were relaxed.

Public JS changes:

- Default route prefetch now requires pointer/focus intent.
- Event display labels have a schema-free shared subpath, keeping validators
  behind the forms that consume them.
- The old head hook's unconditional `load`-event prefetch downloaded private
  middleware, auth/Zod and error chunks on anonymous pages. Those speculative
  hints are removed; actual dynamic imports and intent prefetch still work.
- Artifact scanning enforces zero maps and reports all-chunk inventory. The
  unchanged 153,600 B initial-route budget is enforced separately using the
  actual SSR dependency graph and observed cold-browser requests, now covering
  all 14 public routes including the `/events` redirect.

`node scripts/revamp/check-route-budget.mjs --routes scripts/revamp/route-fixtures.json`
passed on the rebuilt artifact: home **129,542 B** (previously 177,477 B);
all public routes **116,609–129,542 B** gzip; 0 source maps. Full graphs are
in `route-budget.json`. Total lazy/private/public chunk inventory is not the
initial-route measurement. One earlier collector process exited with Windows
native status -1073740791 without producing measurements; it is an invalid
attempt, not a pass. The next valid run still failed at 171,085 B; only after
the unconditional private prefetch was removed did the 14-route run pass.

Commands and raw ignored evidence:

```
pnpm -r typecheck/lint/test/build  # four separate sequential commands
node scripts/revamp/check-artifacts.mjs
node --test scripts/revamp/route-budget.test.mjs
node --test web/scripts/e2e-isolated.test.mjs
E2E_PORT_BASE=4100 node web/scripts/e2e-isolated.mjs tests/e2e/public-pages.spec.ts --grep '/logs matches|/activity/1 matches' --work-dir .e2e-isolated/codex-public-residual --max-per-batch 2
```

Recursive gates: exit 0, still 604 units and 33 lint warnings / 0 errors.
The subsequent head-prefetch change was rebuilt separately (exit 0).
Tooling tests 34/34; isolation tests 22/22. Changed E2E files also passed
direct ESLint after removing login's artificial cross-project duplicate skips.
The default E2E script now uses the isolated runner; CI's functional-job timeout
allows the full fresh-server suite without changing production rate limits.

Full **170-case** isolated production E2E is in progress. This is 166 old
declarations minus two never-executed cross-project login variants plus six
new warm-reload cases. Both actual desktop/mobile login comparisons remain.
No skip policy exceptions remain. Full report and Lighthouse acceptance are
still outstanding; no whole-site or migration-success claim is made.

## Full-suite result and previously missed layout fixture ports

The complete 170-case run finished: **166 passed / 4 failed / 0 flaky /
0 skipped**, 85 fresh-server batches, merged report succeeded. All four failures
were the archived light/dark navbar/footer comparisons on desktop/mobile:
`layout.spec.ts` still used hardcoded legacy `5174` and upstream `3181`, while
the run correctly owned base `4100` (legacy `6174`, upstream `4181`). This was a
test wiring defect, not a page comparison pass. Both origins now use the same
derived constants as the other specs.

Against the **same immutable production artifact**, the exact repair selection
passed **4/4**, no retry or skip:

```
E2E_PORT_BASE=4100 node web/scripts/e2e-isolated.mjs tests/e2e/layout.spec.ts --grep 'navigation and footer match archived' --work-dir .e2e-isolated/codex-layout-port --max-per-batch 2
```

Thus all 170 unique cases were exercised successfully across the full run and
the repair selection; this is **not** a claim that one complete 170-case run
was green. A final complete run after SEO/guest/admin integration is still owed.
The existing guest UI specs intercept the BFF: genuine browser → built Nuxt BFF
→ frozen-contract upstream guest flows still need coverage. Auth landing on the
not-yet-migrated admin route is also not accepted as a complete admin workflow.

Raw ignored reports: `web/.e2e-isolated/codex-full-public/` and
`web/.e2e-isolated/codex-layout-port/`. Gate summaries are preserved below as
`full-suite-summary.json` and `layout-repair-summary.json`.
