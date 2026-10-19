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
