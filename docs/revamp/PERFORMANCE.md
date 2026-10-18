# Performance accounting

This document defines how the public-route performance budgets are measured. It is
implementation documentation for the tooling, not an acceptance record; acceptance
evidence lives in [STATUS.md](STATUS.md) and [`evidence/`](evidence/).

## Budgets

| Budget | Value | Where enforced |
| --- | --- | --- |
| Initial public-route JavaScript, gzip | **exactly 150 × 1024 B (153,600 B)** | `scripts/revamp/check-route-budget.mjs` |
| Mobile Lighthouse performance | ≥ 95, median of three valid samples | `web/scripts/performance.mjs` |
| Mobile LCP, median of three valid samples | ≤ 1,800 ms | `web/scripts/performance.mjs` |
| Source maps in production output | 0, anywhere | `scripts/revamp/check-artifacts.mjs` and the route budget |
| All public JavaScript, informational | reported, not gated by the route checker | `check-artifacts.mjs` (still gates 150 KiB over *all* JS until the route budget is wired into CI and passes there) |

The 150 KiB route budget is a transfer budget in **gzip** bytes. It is not a
timing budget and it is not a raw-byte budget. The value is unchanged by this
tooling: `153,600` B, compared with `<=` (exactly at budget passes).

## What counts as initial-route JavaScript

For one declared route, in a cold browser context with no interaction, the
accounted set is the **union** of three things:

1. the scripts the server-rendered head declares: classic `<script src>` (no
   `type`, or a JavaScript type), `<script type="module" src>`,
   `<link rel="modulepreload">`, and `<link rel="preload" as="script">` (or a
   preload of a `.js` href with no `as`). Scripts with a data/template type
   (`application/json`, `application/ld+json`, `importmap`,
   `speculationrules`, `text/template`, `text/html`) are not JavaScript and are
   not seeded;
2. every JavaScript request the browser actually made during the measurement
   window, including chunks pulled by the app's automatic prefetch;
3. every module reachable from (1) and (2) through **static** `import`/`export
   … from` statements, resolved transitively.

The report keeps both halves visible: `staticGraphPaths` (the eager graph from
the SSR seeds) and `observedRequestPaths` (what the browser really requested),
next to the union actually budgeted. A non-empty graph is mandatory — an empty
script graph fails instead of passing with a 0-byte total.

Rules that keep the number honest:

- Each own asset path is counted once. Query-string variants of the same path
  (`/_nuxt/x.js?v=1`, `/_nuxt/x.js?v=2`) are one asset.
- Dynamic `import()` is **not** traversed. A lazy chunk counts only when the
  browser really requested it (an automatic prefetch is a real request, so a
  prefetched admin chunk is counted, never hidden).
- A failed, aborted, stalled or non-2xx/3xx script request fails the
  accounting. It is never treated as zero bytes.
- A request the browser made but the production output does not contain fails
  the accounting; so does an external-origin script (including a classic
  external script with no `type`, and an external `src` in the SSR head), a
  non-`/_nuxt/` script, a percent-encoded path, a backslash path or a `..`
  segment.
- A relative `../` static import that stays inside `/_nuxt/` (for example
  `/_nuxt/chunks/a.js` importing `../shared.js`) is counted normally; only a
  specifier that resolves outside the prefix fails.
- The Nuxt `__NUXT_DATA__` payload is JSON, not JavaScript. Its byte size is
  reported separately as `payloadBytes` and is never added to the JS total.
- CSS, images, fonts and the favicon are not part of this budget.

### Why a module lexer and not a regular expression

Static import discovery uses [`es-module-lexer`](https://github.com/guybedford/es-module-lexer)
(pinned `2.3.2`). A regex over `import(` would confuse dynamic imports with
static ones — over-counting lazy admin chunks, or (worse) missing static
imports. The lexer distinguishes `ImportType.Static`/`StaticSourcePhase`/
`StaticDeferPhase` from `Dynamic*` and `ImportMeta`, so the eager graph and the
lazy graph cannot be conflated.

## Gzip policy

The budget measures what the server would send:

- if Nitro emitted a precompressed `<asset>.js.gz`, its exact on-disk size is
  used (`gzipSource: "precompressed"`);
- otherwise the file is gzipped at `Z_BEST_COMPRESSION` (level 9), the level
  `nitropack`'s `compressPublicAssets()` uses (`gzipSource: "gzip-level-9-fallback"`).

Nitro skips precompression for assets below 1024 bytes, so those small files use
the level-9 fallback. For tiny files gzip can be slightly larger than the raw
bytes; the fallback therefore errs on the conservative side.

Every `.map`, `.map.gz` and `.map.br` anywhere in the output still fails the
accounting, and `allJavaScriptGzipBytes` (all public JS, including lazy chunks)
is still reported next to the route total. `check-artifacts.mjs` deliberately
keeps its original Node-default-level recomputation over all public JS so the
recorded foundation numbers remain comparable. That gate is a superset and is
stricter than the route budget; it stays in place until the route budget runs
green in CI.

## Measurement setup

`scripts/revamp/check-route-budget.mjs`:

- navigates the origin given by `--base` (default `http://127.0.0.1:3300`) and,
  unless `--no-serve` is given, starts **exactly** the build named by `--output`
  — `<output>/server/index.mjs` — on that origin's port and hostname. A missing
  server entry fails immediately, so the checker can never validate one artifact
  while running another. Serving requires plain HTTP on the loopback interface
  (`127.0.0.1`, `localhost` or `::1`); a `--base` with a path, credentials or a
  fragment, or an `https:`/remote host in serve mode, is rejected. In serve mode
  it also starts the fixture API (`web/tests/fixtures/upstream.mjs`, port
  **3381**).
  Those ports are reserved for this check (E2E uses 3100/3181, Lighthouse
  3200/3281, HTTP smoke tests 3311/3312);
- launches one Chromium instance and a **fresh context per route**, so every
  route starts with an empty HTTP cache and no stored state;
- pins the device profile: desktop `1280 × 720`, `deviceScaleFactor: 1`, light
  colour scheme, no touch. The viewport is pinned because viewport-triggered
  Nuxt prefetch would otherwise vary the counted set;
- performs a single navigation (`waitUntil: 'load'`), no clicks, no scrolling,
  then waits the **settle window** (default **2000 ms**, `--settle-ms`, max
  30 s). The window covers the app's own `load`-deferred `rel="prefetch"`
  injection and any automatic prefetch that follows it. When the window closes
  the observed request set is **frozen**: no request started later is adopted;
- then awaits the **bounded completion window** (default **5000 ms**,
  `--complete-ms`, max 30 s) for those already-started scripts to finish
  loading their bodies. A script that is still open at the deadline is recorded
  as `stalled` and fails the accounting, as does one that failed or aborted
  after the window: transfer that would have happened is never dropped. Every
  observed request keeps its response status and headers for that proof;
- asserts, separately from the budget, that the response is HTTP 200, is
  `noindex` (staging identity), and rendered real page content: a non-empty
  `<title>`, a bounded `#__nuxt` root, and the fixture's `mainContent` text
  present **inside `#__nuxt` and outside any script/style/template**. An empty
  `#__nuxt`, a navbar-only 200 error page, a marker that only appears in a
  script, or a marker outside the app root all fail;
- records the raw evidence in the JSON report per route: `status`, `robotsTag`,
  `title`, `mainContentExpected`, `mainContentFound`, `mainContentTextLength`,
  `mainContentExcerpt`, plus the asset list with sizes and sources.

Timeouts are bounded (`goto` 20 s, readiness polling 15 s, child shutdown 5 s)
and browser/child processes are always cleaned up in `finally`.

Bytes, not timings: the checker never starts a server warm-up or measures
network speed, so its numbers are independent of localhost latency.

## Route coverage and fixture contract

The checker requires an explicit route fixture file (`--routes <file>`) and
refuses to run with an empty list. There is no built-in default: an undeclared
route cannot be reported as passing, and an unmigrated route that 404s fails the
identity checks instead of producing a "budget pass".

Each fixture route declares:

- `path`: a canonical same-origin path beginning with `/`. Protocol-relative
  (`//host`), backslash, fragment, control/whitespace characters, percent
  encoding, `.`/`..`/empty segments, a trailing `/` and any query string in the
  path are rejected; the path must survive `new URL` unchanged;
- `query` (optional): a plain object of scalar values, serialized
  deterministically; two routes with the same canonical path+query are
  rejected as duplicates;
- `mainContent`: required non-empty plain-text marker of the page body (the
  heading or a distinctive phrase, never markup). It is what makes a
  navbar-only 200 page fail.

```json
{
  "routes": [
    { "name": "home", "path": "/", "mainContent": "Welcome" },
    { "name": "activities page 2", "path": "/activities", "query": { "page": 2 }, "mainContent": "Activities" },
    { "name": "activity detail", "path": "/activity/1", "mainContent": "例会记录" }
  ]
}
```

Planned coverage for the real integration (to be declared centrally): every
published page category (`/`, `/activities`, `/activity/<id>`, `/events` and
each event category, `/members`, `/history`, `/social`, `/join`, `/logs`), plus
one published activity detail and the list's page-2 / filter states.

**Fixture dependency:** the shared public-data fixture currently exposes three
public activities, so a meaningful "page 2" of `/activities` (and filter states
that change the counted chunk set) needs the fixture expanded first. That is a
data-fixture change owned by the data worker; this tooling does not touch it.

## Tests

`scripts/revamp/route-budget.test.mjs` is the pure suite (no browser, no build):
transitive/cyclic/shared static graph, dynamic import excluded until requested,
automatic prefetch and duplicate query variants counted once, empty-graph
refusal, external/missing/`../`-escape assets, stalled/incomplete/failed
requests, the bounded completion window, exact budget edge, documented level-9
fallback, source-map refusal, the `#__nuxt` main-content contract, route-fixture
path/query/marker validation, serve-target validation and the module lexer.

Verified on Node `v24.15.0` against the installed `es-module-lexer@2.3.2`:

```
node --test scripts/revamp/route-budget.test.mjs
# tests 27, pass 27, fail 0
```

## Wiring (proposed, not applied in the tooling batch)

Root `package.json`:

```json
"check:routes": "node scripts/revamp/check-route-budget.mjs --routes scripts/revamp/route-fixtures.json",
"test:tooling": "node --test scripts/revamp/route-budget.test.mjs"
```

CI (after `pnpm -r build`, before or after E2E — never concurrently with
Lighthouse), Linux job only, with the browser already installed by the E2E step:

```yaml
- run: pnpm test:tooling
- run: pnpm check:routes
```

The declared route fixture file is owned by the integration commit, not by this
tooling. `check:artifacts` stays in the pipeline unchanged until the route
budget has run green at least once in CI; only then may the all-JS gate be
revisited.

## Known limits

- The checker does not simulate network conditions. It reports transfer bytes;
  Lighthouse covers timing.
- Automatic prefetch is observed, not predicted. A browser that decides not to
  prefetch a chunk is not charged for it — which matches the user-facing rule
  but means the number can move with unrelated viewport/prefetch changes.
- The observation window is finite by design. A script **started** after the
  settle window closes is not adopted (and so not counted), even though a
  completion window then applies to everything started before it.
- The Windows/Linux runs of the same build can differ in request ordering, not
  in the counted asset set; the accounting is order-independent.
- The route fixture list is only as complete as the pages that exist, and it is
  declared centrally; this tooling validates it but does not own it.

## Central integration checkpoint (2026-10-19)

The root package now declares `es-module-lexer@2.3.2` and `@playwright/test@1.64.1` directly.
Codex independently ran the actual tooling suite: 27/27 passed, no skipped or pending cases.
CI now runs the tooling suite on Windows and Ubuntu and the browser route check sequentially on Ubuntu,
with a downloadable JSON report. Its initial declared scope is the accepted scaffold `/` and shared
`/__revamp/layout` checkpoint only; no unmigrated public route is implied to have passed. Expand the
fixture list to every migrated public page, details, page 2 and filters as those pages enter acceptance.
The conservative all-JS gate remains unchanged while this first CI route-check proof is pending.
Current uncommitted homepage output totals 158,151 B gzip, which fails that conservative gate; this is
not yet evidence about the real initial-route total and is not an accepted homepage performance result.
The accounting covers external script assets; inline script and serialized HTML/payload transfer costs
remain separate from this asset metric and are also exercised by Lighthouse timing.
