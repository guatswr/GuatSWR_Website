# Runtime hardening and request-start experiment

2026-10-20, Codex alone, base `f8a4dbe`. Local testing only.

The `aeb945b` utility optimization evicts the first Map entry instead of the
window closest to expiry. Renewing an existing key leaves insertion order
unchanged. A deterministic 2-key/100ms test reproduces a fresh quota being
forgotten under capacity pressure: **1 fails / 37 pass** before the fix,
**38/38 pass** after it. Expired cleanup and nearest-deadline selection now
share one bounded sweep. Max keys, request limits, window duration and retry
semantics are unchanged. Raw `.tools/codex-rate-eviction-{red,green}.log`.

Performance aggregation also paired the score of the LCP-median run with LCP,
rather than independently taking both medians. The incoming CI counterexample
has scores 91/91/97, whose median is 91, while its LCP-median run scored 97.
A pure helper and three regression tests now enforce independent medians and
exactly three valid samples. Original samples/invalid-attempt retention and
fixed 95/1800ms thresholds remain. Tooling **59/59**.

Inspection confirms public link prefetch was already disabled. The current
Lighthouse network tree instead starts entry dependencies after the entry has
arrived. Experiment: retain module preload hints immediately **after** the
import map, ahead of inline CSS, on public routes too; omit them when no map
exists. Broad SSR prefetch hints remain removed. No visual/content change is
intended. This experiment is not accepted before actual performance, budget,
warm-cache reload and behavior regression results.

The preload experiment **fails**: 15/15 JS graphs still pass, but new independent
medians are home **2173.2 ms / 96**, layout **2109.0 ms / 96**, versus the
1811.9/1809.7ms baseline. It is withdrawn from application source. Every valid
sample remains in `.tools/lighthouse-preload-20261020/`; no unchanged rerun is
used to seek a better score. Final builds must use the restored head plugin.

Final typecheck/lint/test/build gates pass **784 units** (73 + 711), lint 0
errors / 34 warnings, with the original head plugin restored. Actual login,
guest and warm-entry regression passes **32/32**, 16 fresh batches, no
retry/flaky/skip. All **15** initial JS graphs pass; output contains **0 maps**.
This server-only fix does not establish a new public performance result.
The
initial tooling invocation forgot local TEMP/TMP and failed with mkdtemp EPERM;
the corrected pinned-environment run passes all 59. Failed logs are retained.

## Reproduction and evidence

Pinned Node 24.16.0 / pnpm 11.25.0; prepend `.tools/node/bin` to PATH, set
TEMP/TMP to the absolute `.tools/tmp`, PLAYWRIGHT_BROWSERS_PATH to the absolute
`.tools/browsers`, and E2E_PORT_BASE=4100. Commands from repository root:

```powershell
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm -r build
npm run test:tooling
node web/scripts/e2e-isolated.mjs login.spec.ts guest-integration.spec.ts entry-loading.spec.ts --work-dir .e2e-isolated/codex-runtime-hardening
# Separate terminal: PORT=3381, node web/tests/fixtures/budget-upstream.mjs
# Collector terminal: NUXT_API_BASE=http://127.0.0.1:3381
node scripts/revamp/check-route-budget.mjs --routes scripts/revamp/route-fixtures.json > .tools/codex-runtime-route-budget.json
npm run check:artifacts
```

Actual selected identities, rather than shorthand selector names, are retained
in `evidence/e2e-summary.json`. Raw commands/results:
`.tools/codex-runtime-final-{typecheck,lint,test,build}.log`,
`.tools/codex-hardening-tooling-local-temp.log`,
`.tools/codex-runtime-hardening-e2e.log`,
`.tools/codex-runtime-route-budget.json`, `.tools/codex-runtime-artifacts.log`.
See committed evidence for the exact source fingerprints and route results.

## Scope and remaining work

Changed source: root package.json, web/scripts/performance.mjs,
web/scripts/performance-metrics{,.test}.mjs, web/server/utils/bff-write.ts,
web/tests/auth-write.test.ts. No app UI, Nuxt configuration, head plugin,
backend or frozen frontend source changes. Full-site a11y/security/performance
and final CI remain open. A fresh 60-state public accessibility scan is recorded
locally at `.tools/public-a11y-1792485910079/`; findings are not accepted as fixed.

Fresh f8a4dbe CI is red on both hosts; Linux container succeeds. Ubuntu passes
261/262 cases, failing mobile light math/prose geometry. Batch 112 runs advanced
Markdown then math against mutable article 1, with the first article still
cached. The failure snapshot contains the advanced heading and three Mermaid
sources; expected math-only height 231.219px versus actual 1175.875px. Individual
formula regions are all zero-difference. This is fixture/cache isolation, not
permission to relax visual geometry or pixels. Correction is the next workstream.
Artifact 12250769181 SHA256:
`806338685af49747b6aefe82636844e711b44555dd333d1f44364061a5dda597`.
