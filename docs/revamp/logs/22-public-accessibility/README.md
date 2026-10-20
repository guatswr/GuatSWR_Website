# Public accessibility: semantic corrections and bounded visual proposal

2026-10-20, Codex alone, base `c3d00cc`. Local only. No backend or frozen
frontend source writes. Checklist #80 remains open.

Follow-up: the user approved the bounded visual proposal on 2026-10-20.
Implementation and further findings are recorded in [log 23](../23-approved-accessibility/README.md).
The measurements below preserve this log's earlier, pre-approval checkpoint.

## Corrections that preserve normal appearance

- Navbar wordmark accessible name now contains both visible Chinese/English
  labels; interest cards use their complete native visible text as the name.
- Member, history and event card headings follow the page h1 at level h2,
  preserving their explicit existing visual classes.
- Event avatar images repeated beside a person's name get empty decorative alt.
- Code scroll blocks and the log table enter the native Tab sequence, have
  descriptive names and visible inset focus outlines, and accept arrow scrolling.
  Code blocks are named groups; the single log table is a named region.

The first implementation used repeated named regions for code. A full 60-state
scan detected **4 landmark-unique violations** on the advanced article. These
are corrected with groups; the failed intermediate scan remains locally at
`.tools/public-a11y-1792499402743/`. The initial 4/4 keyboard selection is not the
final group verification. No threshold or axe rule was suppressed.

## Actual baseline / remaining visual decision

The initial scan `.tools/public-a11y-1792485910079/` covers **15 public scenarios
× light/dark × Desktop Chrome/Pixel 7 = 60 states**, with axe-core 4.14.0 from
the pinned Lighthouse dependency. Findings: contrast 60 states/268 nodes,
accessible-name mismatch 60/76, scroll focus 4/4, heading order 28/28, target size
2/4 and missing alt 16/24. These are state/node records, not unique components.

Final group-source scan `.tools/public-a11y-1792499773660/` completes all **60**
states without page errors. Only the existing **color-contrast (60/268)** and
**target-size (2/4)** findings remain. No name, heading, image-alt, scroll-focus
or duplicate-landmark violations are left in this declared closed-state scan.
This does not establish complete WCAG conformance: gradient/image backgrounds
have incomplete checks, and expanded states/manual assistive technology/touch
and reduced-motion review remain required.

[The concrete visual proposal](VISUAL-PROPOSAL.md) retains original and injected
candidate full-page PNGs, exact per-node proposed changes, and before/after axe
findings. These are review artifacts, **not application styles or accepted
visual baselines**. The user's public 1:1 boundary requires a scoped decision;
the earlier log-border pixel and diagram activation approvals do not cover it.
Current production text colours and month-link geometry remain unchanged.

## Verification and reproduction

Pinned Node 24.16.0 / pnpm 11.25.0, same PATH/TEMP/TMP/browser settings as log 20;
E2E_PORT_BASE=4100. From repository root:

```powershell
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm -r build
# Restore the exact diagnostic source from this log to its original location:
Copy-Item docs/revamp/logs/22-public-accessibility/audit-source.mjs.txt .tools/audit-public-accessibility.mjs
node .tools/audit-public-accessibility.mjs
node web/scripts/e2e-isolated.mjs public-accessibility.spec.ts public-pages.spec.ts homepage-visual.spec.ts events-visual.spec.ts events.spec.ts public-markdown-advanced.spec.ts public-math-visual.spec.ts --work-dir .e2e-isolated/codex-a11y-regression
```

All four final group-source recursive gates pass **785 units** (73 shared + 712
web), lint **0 errors / 34 warnings**, production build success. Raw
`.tools/codex-a11y-group-{typecheck,lint,test,build}.log`. Final broad E2E passes
**112/112**, 56 fresh batches, zero retry/flaky/skip. All **88** actual archived
comparison regions have zero differing pixels on Windows. Four native keyboard
focus PNGs are retained and inspected. The screenshot-only test attachments were
added after the recursive gates and are exercised in this final browser run.
All **15** initial route graphs pass **122319–137070 B gzip** against the same
153600 B limit; whole output contains **0 maps**; tooling **59/59**. See
[machine evidence](evidence.json) and [retained evidence](evidence/).

Route-budget reproduction is simply the following; the collector starts and
owns both services itself. Starting a second fixture manually caused the first
local invocation to fail on /activities, retained at
`.tools/codex-a11y-route-budget-duplicate-fixture.json`. The extra process was
removed and the stock collector passes without any application change. Log 20's
incorrect extra-fixture reproduction comment is corrected in this workstream.

```powershell
node scripts/revamp/check-route-budget.mjs --routes scripts/revamp/route-fixtures.json
node scripts/revamp/check-artifacts.mjs
npm run test:tooling
```

Raw `.tools/codex-a11y-{route-budget.json,artifacts.log,tooling.log,regression.log}`.
These selections do not establish complete accessibility or fresh full CI.

The audit script is diagnostic, requires the exact lockfile/runtime already
installed, and does not add a production dependency. Each scenario/theme gets
a fresh app/fixture pair; it never disables production rate limits or intercepts
browser requests. No browser service beyond loopback is used.

## Source inventory / limits

web/app/components/SafeMarkdownPre.vue,
web/app/components/SiteNavbar.vue,
web/app/components/events/EventCard.vue,
web/app/components/home/HomeInterests.vue,
web/app/pages/history.vue, web/app/pages/logs.vue, web/app/pages/members.vue,
web/tests/e2e/events.spec.ts, web/tests/e2e/public-accessibility.spec.ts.

Public LCP, old/new real-page baselines, expanded Markdown coverage, complete
security/monitoring and new full-host CI remain open. No deployment or migration
success/QQ notification.

Additional read-only review preserves two follow-ups. The real KaTeX 0.18.2
output loses named colours/background/borders through the current projection
(`\color{red}`, `\colorbox`, `\boxed`); see `.tools/katex-style-projection.json`
and `.tools/probe-katex-style-projection.mjs`. No wider macro support is claimed.

`pnpm audit --prod --json` still reports two high build-chain advisories:
[node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv) and
[braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), both currently listing
no patched version (verified 2026-10-20). The output inventory finds **209**
package manifests, no matching package/dependency names or bundle markers,
and three internal symlinks with no external targets. Raw
`.tools/codex-runtime-production-audit.json` and
`.tools/runtime-dependency-inventory{.mjs,.json}`. This supports a build-chain
classification; it is not a claim of a complete runtime security audit.
