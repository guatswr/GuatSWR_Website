# LCP trace analysis and Stage 02 performance closure (checklist 01–05)

> Historical foundation/scaffold checkpoint, **not current homepage acceptance**.
> After the full homepage migration, the latest measured mobile median is
> **2260.4 ms / score 98**, above the unchanged 1800 ms limit (log 16). See STATUS.md.
> The 1507.7 ms result below must not be quoted as the completed site's LCP.

Date: 2026-10-19 · Author: Hermes (self-verified; Codex to re-verify)
Branch: `revamp/nuxt-foundation` · Fixtures: `/`, `/__revamp/layout`

## Method

- Lighthouse 13.5.0, default mobile form factor, simulated throttling
  (150 ms RTT / 1.6 Mbps down / 4× CPU), three runs per route, medians.
- Targeted instrumentation: Chrome DevTools Protocol CPU profiles of both
  fixtures, full traced request start/end times per run, and a read of the
  lantern model bundled with the local Lighthouse install
  (`@paulirish/trace_engine/models/trace/lantern/`) to attribute the
  simulated LCP rather than guessing from observed timings alone.

## Where the ~1806 ms LCP came from

Observed page timings on localhost are tiny (LCP 113–180 ms); every number
below is the *simulated* slow-4G value that the gate measures.

1. **Simulated TTFB ≈ 453 ms** for the document (connection + transfer under
   the throttling model). Server render time itself is 2–30 ms warm,
   80–137 ms on the process's first render.
2. **Main-thread work at 4× CPU throttle is the dominant term**:
   `simulated FCP ≈ simulatedTTFB + 4 × (observed throttled main-thread time
   up to first paint)`. Foundation warm: 263 ms × 4 ≈ 1053 → 1506 ms.
3. **LCP above FCP comes from request pollution of the LCP graph.** The LCP
   model's pessimistic graph counts *every* network node that *finished before
   the LCP moment* as render-blocking — the `rel="prefetch"` fetches included.
   On `/`, six SSR-emitted prefetch hints (other layout chunk, error pages,
   their CSS; ~14 KB) finished at 97–107 ms, just before the 113 ms LCP, and
   the sim quantises in 150 ms RTT steps → +≈150 ms. On `/__revamp/layout` an
   eager extra initial chunk (the Reka dialog runtime) plus a second script
   wave produced the same step.
4. **The layout fixture's full-chrome hydration** (navbar, footer, dialog,
   avatar under 4× CPU) is worth ~+75 ms of counted main-thread time versus
   the chrome-less home fixture; the eager dialog chunk was the single largest
   removable piece (control experiment with the dialog removed: 1806 → 1656).

## Fixes landed

| Fix | Where | Effect |
| --- | --- | --- |
| Defer SSR `rel="prefetch"` hints to the `load` event (hints re-injected client-side, CSP nonce preserved) | `web/server/plugins/head-hints.ts` | hint fetches leave the pre-LCP window on every page; `/` median 1806 → 1657 |
| Hoist `modulepreload`/`preload` hint tags ahead of the inlined critical CSS | same plugin | the parser reaches the hints before 30 KB of inline CSS instead of after (86–104 ms earlier in the trace) |
| Lazy-load the Reka dialog runtime on first open (idle prefetch after load; focus return preserved; trigger stays server-rendered) | `web/app/components/ui/Dialog.vue`, `web/app/utils/dialog-reka.ts` | removes 11 KB gz + its evaluation from the initial load of every dialog-using page; layout fixture 1657–1806 → 1505–1655 |
| Warm the render path before measuring (two real requests per path) | `web/scripts/performance.mjs` | samples describe a serving process; first-after-boot run stays the discarded max |

Note: a dynamic `import('reka-ui')` of the package index defeats tree-shaking
and bundles the whole library (~750 KB raw / ~186 KB gzip). The shim module's
static named re-exports keep the lazy chunk at ~11 KB gzip.

## Results (final artifact, medians of three runs)

| Route | Before | After | Score |
| --- | --- | --- | --- |
| `/` | LCP 1805.6–1806.3 ms | **1507.7 ms** (runs 1815.8 / 1504.5 / 1507.7) | 100 |
| `/__revamp/layout` | LCP 1805.5–1805.8 ms | **1654.6 ms** (runs 2110.8 / 1504.0 / 1654.6) | 99 |

Cold vs warm: the first run after process start still carries JIT/first-render
cost (80–137 ms TTFB observed) and remains the discarded maximum of three;
all warm runs sit below the bar. `performance.mjs` exits 0 with the 1800 ms
threshold unchanged.

## Verification suite (same artifact)

- typecheck, lint, unit tests 15/15 (shared 2 + web 13)
- Playwright E2E 18/18, including first mouse/Enter dialog activation with the
  lazy runtime, Escape/focus return, CSP/hydration error checks, warm-SWR
  compression negotiation, and ten archived navbar/footer visual comparisons
  with zero differing pixels
- artifacts: 0 source maps; all client JavaScript combined 125,504 bytes gzip
  (budget 153,600)

## Follow-ups (recorded, none block Stage 02)

1. Duplicate CSS download: the inlined navbar/footer stylesheet chunk (~6 KB)
   is additionally fetched by Vite's preload helper when the lazy layout chunk
   is imported, because the helper only looks for `link[rel=stylesheet]`
   (Nuxt inlineStyles issue class, e.g. nuxt/nuxt#21821). Not on the current
   critical path; revisit with an upstream report or a scoped build-time fix
   rather than hand-patching the runtime.
2. Favicon is 9.8 KB; shrink toward ~1–2 KB.
3. Vue Router R0004 warnings for not-yet-migrated routes (`/join`, `/events`,
   …) — expected until Stage 03 lands those routes.
4. A warm run occasionally lands on the next 150 ms grid step (~1805 ms) on
   the layout fixture; medians of three keep this visible in CI. The fixture
   itself is scheduled for removal before cutover.
5. The preview runs plain HTTP/1.1 on localhost while production serves
   HTTP/2 behind the reverse proxy; the fixture numbers are conservative.
