# Independent review of public Markdown — correction checkpoint

2026-10-20, Codex alone. Reviewed `11e9bcc` and its preceding utility changes.
The log 18 report is an implementation handoff, not complete independent
acceptance. No deployment or real backend writes.

## Reproduced and corrected math defects

Nine independent regressions fail against the handed-off math implementation:
HTML attributes containing dollars are rewritten, multi-backtick code spans,
longer fences and unclosed tilde fences are not preserved, currency can consume
a later formula delimiter, HTML-only output hides the formula from assistive
technology, raw-SVG dropping also loses the generated radical, forged author
KaTeX classes acquire positioning styles, and aggregate formula work is unbounded.
Raw `.tools/codex-public-math-review-red.log`.

Corrections preserve author SVG rejection and the existing renderer rejection
test. A random per-parse slot separates authored Markdown from generated math.
Only generated object identities enter a closed KaTeX/MathML/SVG projection;
author classes and attributes cannot opt into it. Generated nodes carry a
separate server-owned marker, and the client independently rechecks native tags
and properties. No SVG href, event, script, foreignObject or stylesheet is
enabled. The whole-document fallback remains readable and reports incomplete.

KaTeX uses `htmlAndMathml`, trust false, maxExpand 1000 and maxSize 20.
Bounds: 32 formulas, 10000 characters per formula, 20000 aggregate formula
characters and 200000 generated HTML characters, plus existing AST budgets.
All input formula bounds are checked before production rendering starts.
Quoted math fences remain literal code; full quoted-math rendering is not
claimed. Ordinary quoted fences are protected from dollar rewriting.

Focused original + independent tests: **16/16**. Four recursive gates pass
**783 units** (73 shared + 710 web), lint 0 errors / 34 warnings, production
build success. Raw `.tools/codex-public-markdown-review-final-*.log`.
Those checks precede the final typography/interaction fixes. Final source
passes the same four recursive gates: **783 units**, lint **0 errors / 34
warnings**. Raw `.tools/codex-markdown-gutter-{typecheck,lint,test,build}.log`.

## Final correction evidence

| Check | Actual result |
| --- | --- |
| Advanced production browser | **4/4** desktop/mobile with/without JS: source and MathML in SSR, no engine on load/focus, keyboard activation, strict directive override rejection, flow/sequence, theme, hide, syntax failure and client navigation cleanup |
| Math/prose against archive | **4/4**, 16 regions; three formulas and complete prose body in desktop/mobile light/dark, **zero differing pixels** |
| Public/nonce/warm-reload regression | **64/64**, 34 more zero-difference regions |
| Total final E2E | **72/72**, 36 fresh batches, no retry/flaky/skip |
| Cold initial JS graphs | **15/15**, **122334–137112 B gzip**; advanced article **130206 B**; unchanged ceiling **153600 B** |
| Tooling / whole production output | **56/56**, **0 source maps**, including compressed maps |
| Current local Lighthouse | **Fails**: home **1811.9 ms / 99**, layout **1809.7 ms / 98** |

[Machine evidence and source fingerprints](evidence.json), [complete route
graphs](route-budget.json), [Lighthouse samples](lighthouse-summary.json).
Browser summaries: [advanced](advanced-e2e-summary.json),
[math](math-e2e-summary.json), [regression](regression-e2e-summary.json).
Engine network proof: [desktop](advanced-desktop-network.json),
[mobile](advanced-mobile-network.json).

The approved button has `aria-expanded`, `aria-controls`, keyboard activation
and a stable controlled region. SSR source is initially open and copyable;
hiding unmounts the renderer and reopens source. A plain-text JS hint survives
SSR (the initial noscript version did not). New controls have 44px targets.
Owned measurement containers are removed even on failures/superseded renders;
irrelevant HTML-class mutations no longer rerender diagrams.

Restore archived 1.21em math: the handoff's 1.1em override made desktop formulas
18.48px versus 20.328px, mobile 17.6px versus 19.36px. A scroll frame clipped
4 light / 5 dark mobile matrix pixels; trading 1px of bottom margin for padding
preserves ink and total geometry. Compiled `:global(.dark)` selectors also
became bare root `.dark` rules; fix their scope and assert actual colours.
No threshold, mask or raster-exception changes.

Production keeps KaTeX 0.18.2. The unmodified archived MdPreview gets its own
KaTeX 0.16.11 and highlight.js CDN assets 11.10.0 from SHA-512-pinned npm
tarballs, through test-only `web/scripts/archive-math-reference.mjs`. The
archived math-ready watcher needs the highlighter even in math-only prose.
The helper downloads on cold cache, verifies every preparation, and reads
exact tar entries without installing old dependencies or changing frozen
sources. Unused archived Mermaid/icon/statistics requests are blocked/recorded.
No reference dependency reaches the production output.

Raw interaction captures: [light](advanced-light-activated.png),
[dark](advanced-dark-activated.png). Native fixed navigation remains at the
current viewport position in those full-page captures. Math parity uses the
existing aligned whole-device-pixel protocol. All raw PNGs remain in the E2E
directories; a committed mobile example retains [archive raw](math-mobile-light-archive-raw.png),
[new raw](math-mobile-light-nuxt-raw.png) and [diff](math-mobile-light-diff.png).

Failed runs remain: original nine regressions;
`.e2e-isolated/codex-markdown-click` (SSR hint), `codex-markdown-theme-red`
(actual colours), `codex-markdown-final-math` (4/5 clipped pixels). Diagnostic
candidate CSS probes are not acceptance evidence; final production E2E uses
no candidate CSS injection.

## Real advanced-content browser evidence

An isolated in-memory canonical v1 article is served through the actual BFF;
there is no browser API interception or real backend write. Pinned Pixel 7
Chromium, fresh context, production output after the math corrections:
[complete probe](advanced-probe.json), [light](advanced-light.png),
[dark](advanced-dark.png). The page contains three MathML formulas, a visible
radical path, a matrix and two rendered Mermaid diagrams. Currency is preserved,
no foreignObject is present, and real theme-button activation changes diagram
fills. Page errors and error-console output are empty. This is a diagnostic,
not old/new advanced-content pixel acceptance.

Automatic mounting downloads **360073 B gzip of observed scripts** within the
unchanged two-second interaction-free window. This is already above **153600 B**,
before adding other inline/payload graph accounting. Dynamic import does not
make an automatically mounted diagram free on first load. The plain article
fixture used by log 18's 14-route check cannot verify this content class.

## Mermaid decision — approved by the user

On 2026-10-20 the user selected: **推荐：点击“显示图表”后再加载，SSR 保留可读源码，维持首载预算**.
This explicitly authorizes the first option's interaction difference only.
The implementation must still pass actual browser and complete route-budget
verification; approval itself is not test evidence.

| Option | Behavior | Consequence |
| --- | --- | --- |
| Recommended: explicit “显示图表” activation | SSR keeps readable diagram source; engine downloads only after the reader activates it; rendered view and dark-mode support remain | Changes the old automatic-render interaction; requires the user's approval under the public 1:1 rule. Must verify no engine request before activation and budget the full cold route. |
| Preserve automatic display with server rendering | Design and validate a bounded server renderer/pre-render path, keeping the engine off the browser | Requires additional local resource, concurrency, timeout/cache and deployment planning; no server resource or latency claim has been measured yet. |
| Keep current automatic client load | Current diagram behavior | Requires an explicit content-specific JS-budget exception; not recommended and not covered by the one-pixel approval. |

The scoped activation/common-formula correction is verified. Checklist 24
stays open for broader Markdown coverage: the existing prose fixture excludes
coloured code fences, whose Shiki palette differs from the archive, and extra
generated-math style coverage still needs review. No full migration success,
palette exception or JS-budget exception is claimed.

## Follow-up scope

Incoming [CI run 39382869333](https://github.com/guatswr/GuatSWR_Website/actions/runs/39382869333)
at `11e9bcc`: Windows succeeds, Ubuntu E2E is **254/254** with zero flaky/
failed/skipped, Linux container succeeds. Ubuntu performance fails: home runs
**2756.5 / 2038.8 / 2486.9 ms**, the harness's LCP-median sample **2486.9 ms /
97**; layout LCP-median sample **1066.8 ms / 99**. These are incoming CI results,
not results for our uncommitted corrections. [Fetched job evidence](incoming-ci.json).
The harness currently pairs the score with the LCP-median run, rather than
independently taking the score median; final performance review must make that
aggregation explicit and must not discard valid slow samples.

Current home Lighthouse samples: **3406.2 / 1808.1 / 1811.9 ms**; layout:
**2564.2 / 1658.8 / 1809.7 ms**. All valid slow samples stay in
`.tools/lighthouse-public-markdown-20261020/`; do not rerun unchanged source to
fish for a pass. Fix performance before final acceptance. Review earlier
`aeb945b` rate-limiter eviction semantics in security work. The earlier 56-state
axe baseline belongs to `767157e`, not this output. Full accessibility,
security, monitoring, fair performance comparison and final CI remain open.
No deployment or QQ success notification.

## Reproduction and exact inventory

Node 24.16.0 / pnpm 11.25.0; TEMP/TMP and browser cache under `.tools/`;
`E2E_PORT_BASE=4100`. Run recursive gates serially, followed by:

```text
node scripts/revamp/check-route-budget.mjs --routes scripts/revamp/route-fixtures.json
node web/scripts/e2e-isolated.mjs public-markdown-advanced.spec.ts --work-dir .e2e-isolated/recheck-advanced
node web/scripts/e2e-isolated.mjs public-math-visual.spec.ts --work-dir .e2e-isolated/recheck-math
node web/scripts/e2e-isolated.mjs public-pages.spec.ts cache-nonces.spec.ts entry-loading.spec.ts --work-dir .e2e-isolated/recheck-regression
node --run test:tooling
node scripts/revamp/check-artifacts.mjs
```

Keep mutable advanced fixtures separate from default-data batches. From `web/`,
performance is `node scripts/performance.mjs / /__revamp/layout`, preserving
previous reports first. [Exact changed-file inventory](files.json); source
SHA-256 fingerprints in `evidence.json`. Frozen `frontend/`, `backend/`, API
contract and dependency lockfile are unchanged.
