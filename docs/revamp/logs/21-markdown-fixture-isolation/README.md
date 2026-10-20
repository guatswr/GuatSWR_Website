# Markdown cache isolation and natural-context visual capture

2026-10-20, Codex alone; base `ed05908`, following public correction `f8a4dbe`.
Local testing only. No production app, cache policy, API contract, backend or
archived frontend source change in this workstream.

## Confirmed CI failure

Run 39393421776 fails the same mobile light math test on both Windows and
Ubuntu: **261/262 passed, zero flaky**, Linux container succeeds. Ubuntu batch
112 pairs advanced Markdown then math; both mutate article 1 through an admin
fixture toggle. The real BFF correctly keeps the already-read article in cache.
The math failure snapshot therefore contains the advanced heading and three
diagram sources: expected height 231.219px, actual 1175.875px. Individual formula
regions match; this is not a new pixel exception. Artifact 12250769181, ZIP
SHA256 `806338685af49747b6aefe82636844e711b44555dd333d1f44364061a5dda597`.

Use immutable, detail-only fixture IDs **991 advanced / 992 math** instead.
Auth-browser and budget fixtures share the same handler. Ordinary article 1,
public lists and the opt-in admin dataset stay independent; the Markdown admin
mutation switch is removed. One real loopback unit regression verifies those
boundaries and the unknown-ID 404. Every math E2E explicitly warms advanced
article 991 first and verifies ordinary article 1 afterwards through actual
production BFF reads, so future shard order cannot silently remove this check.

## A second problem in the visual protocol

The first mixed local run reads the correct source but mobile formula 0 fails
206 pixels: the fixed navigation is in the screenshot. Moving transparent prose
to viewport origin can also yield an incidental zero-difference image containing
navigation/cover content. Raising main alone passes 4/4 but **does not remove
the unrelated backdrop**, so that experiment is not visual acceptance.

Math now stays in its **natural article context**. Both pages settle native
images/fonts/progress, centre the region by scrolling, and assert it fits below
the 64px navbar and inside the viewport. A centre hit test rejects covering
layers. No inline style, content, palette, mask or threshold is changed.

Natural locator screenshots round fractional CSS bounds outward. Therefore the
accepted capture is the complete viewport PNG at physical origin (0,0), cropped
at **ceil(left/top × DPR) through floor(right/bottom × DPR)**. Each excluded
edge is strictly less than one physical pixel; old/new dimensions must match.
All original viewport PNGs, precise rectangles/origins/edges, crops and diff
PNGs are retained. This replaces the earlier math visual evidence; existing
non-math fixed captures and the single approved dark-log pixel guard are intact.
The intermediate natural-locator attempt also passes but is superseded by the
more exact viewport crop. It is not a separate acceptance result.

## Verification

Pinned Node 24.16.0, pnpm 11.25.0; PATH/TEMP/TMP/browser variables as in log 20,
E2E_PORT_BASE=4100. Exact commands from repository root:

```powershell
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm -r build
node web/scripts/e2e-isolated.mjs public-markdown-advanced.spec.ts public-math-visual.spec.ts --work-dir .e2e-isolated/codex-markdown-viewport-final
node web/scripts/e2e-isolated.mjs public-markdown-advanced.spec.ts public-math-visual.spec.ts --grep 'diagram engines|formulas and prose.*light' --work-dir .e2e-isolated/codex-markdown-mixed-final
```

Actual viewport acceptance: **8/8**, four fresh batches, no retry/flaky/skip;
all **16** common-formula/whole-prose regions have zero differing pixels on
Windows, with raw screenshots inspected for actual visible formula content.
Final explicit cross-spec mixed run also passes **4/4**, two fresh batches,
zero retry/flaky/skip and eight zero-difference regions. These four are repeated
identities within the eight-case scope: **12 executions, eight unique cases**.
Four recursive gates pass **785 units** (73 shared + 712 web), lint **0 errors /
34 warnings**, production build success; whole output has **0 maps**. The last
helper cleanup avoids assigning a readonly TypeScript field; mixed verification
uses that final source. No green full CI is inferred from these selections.

Raw retained logs: `.tools/codex-markdown-{mixed,mixed-layer,natural,isolation-final,viewport-final,mixed-final}.log`,
`.tools/codex-isolation-{typecheck,lint,test,build}.log`, and matching
`web/.e2e-isolated/` directories. Failed and superseded attempts remain intact.

## Exact source scope / limitations

web/tests/e2e/public-markdown-advanced.spec.ts,
web/tests/e2e/public-math-visual.spec.ts,
web/tests/e2e/support/public-pages.ts,
web/tests/fixtures/auth-upstream.mjs,
web/tests/fixtures/budget-upstream.mjs,
web/tests/fixtures/public-markdown-advanced.mjs,
web/tests/fixtures/markdown-details.mjs,
web/tests/markdown-fixture-isolation.test.ts.

The three common formulas do not establish complete KaTeX macro/style support.
Code-fence palette, current public LCP, full accessibility/security/monitoring
and fresh full-host CI are still open. No deployment or QQ success notification.
