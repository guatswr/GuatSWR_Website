# Workstream 05 — public-pages E2E failures (visual parity, hydration, skips)

## 1. Scope

Make `web/tests/e2e/public-pages.spec.ts` pass without weakening anything, from
the state workstream 02 left it in (26 passed / 20 failed / 2 skipped).

| | |
| --- | --- |
| Primary checkout | `E:/Taropoi/workspace/GuatSWR_Website` |
| Branch / base revision | `revamp/nuxt-foundation` at `6be6e8e` |
| Runtime | `.tools/env.sh` — Node 24.15.0, pnpm 11.25.0 |
| E2E port base | `E2E_PORT_BASE=3600` |
| Brief | `.tools/brief-pages-e2e.md` |
| Previous report | `docs/revamp/logs/02-public-pages/README.md` |

**This checkout is shared.** While this workstream ran, other agents edited
`web/app/components/ProgressiveImage.vue`, `web/tests/e2e/support/public-parity.ts`,
`web/tests/e2e/homepage.spec.ts`, `web/tests/e2e/social-join.spec.ts`,
`web/scripts/e2e-isolated.mjs`, `web/nuxt.config.ts`, `web/server/utils/guest-drafts.ts`
and `packages/shared/src/index.ts`, and rebuilt `.output` at least twice
(10:03, and again during this workstream's baseline E2E run — which is why that
run is recorded as invalid, §4.2). Every build used for a measurement below was
taken under `.tools/build.lock`; the measured `.output` therefore also contains
whatever the homepage agent had in `ProgressiveImage.vue` at that moment.

## 2. Exact file inventory

### 2a. Changed (all modified, none new outside the log directory)

| Path | What changed |
| --- | --- |
| `web/app/components/SafeMarkdown.vue` | new `inheritTypography` prop; container gains `overflow:hidden` + `word-break:break-all`; `p` becomes `margin:.5rem 0; line-height:1.6`; standalone-image chrome; `font-size`/`line-height` and the `max-width:768px` step moved out to the page |
| `web/app/pages/activity/[id].vue` | page-wide archived `:deep()` rules (h1/h2/h3, p, ul/ol, blockquote + dark); `.markdown-body :deep(.safe-markdown)` typography + mobile step; `leading-tight` removed from the hero `h1`; `md:leading-6` added to the description block |
| `web/app/pages/history.vue` | `<SafeMarkdown … inherit-typography />`; the now-redundant last-child margin rule and the empty `<style scoped>` block removed |
| `web/app/components/ParliamentChart.vue` | `:global(.dark) .x` → `:global(.dark .x)` for `.total-number`, `.chart-title`, `.chart-subtitle` |
| `web/tests/e2e/public-pages.spec.ts` | `nested prose typography`: `paragraphMargin` expectation corrected and a `paragraphLineHeight` assertion added; `code block copy` retargeted from `/activity/1` to `/activity/3` and its self-skip replaced by a real assertion |
| `web/tests/fixtures/public-data.mjs` | activity 3's `content` gains a fenced `js` block |

### 2b. Created

| Path | Note |
| --- | --- |
| `docs/revamp/logs/05-public-pages-e2e/README.md` | this file |
| `docs/revamp/logs/05-public-pages-e2e/evidence.json` | machine-readable results |
| `docs/revamp/logs/05-public-pages-e2e/after-isolated.log` | raw console output of the isolated E2E run (committed runner, §4.4) |
| `docs/revamp/logs/05-public-pages-e2e/baseline-isolated.log` | raw console output of the baseline attempt that a concurrent rebuild invalidated (§4.2) |

Nothing else was touched. In particular `web/app/assets/css/**`,
`web/server/utils/public-read.ts`, `web/app/components/ProgressiveImage.vue`,
`web/nuxt.config.ts`, `web/scripts/e2e-isolated.mjs` and the homepage/event specs
were **not** edited (§6).

## 3. The property behind each fix

Every value below was read from the archived page's own computed styles
(`frontend/dist` served by `tests/fixtures/legacy.mjs`), not guessed.

### 3.1 `/activity/1` prose and article (4 tests: light/dark × desktop/mobile)

Measured before: archive `176.984px` vs new `123.906px` for `main .md-editor-preview`
vs `main .safe-markdown`; the article region was `1571.031` vs `1532.109`.

1. **`overflow` on the prose container.** The archived `.md-editor-preview` carries
   `overflow:hidden` (md-editor-v3 base rule), which makes it a block formatting
   context, so its first child's `margin-top` and its last child's `margin-bottom`
   stay *inside* the measured box. The migrated `.safe-markdown` had
   `overflow:visible`, so both margins escaped: `1571.031` vs `123.906` is exactly
   `37.8 (h2 margin-top) + 20.16 (p margin-bottom)` missing.
2. **`p` metrics.** The archived preview is governed by md-editor-v3's
   `div.default-theme p { line-height:1.6; margin:.5rem 0 }`. It and the page's own
   `[data-v-x] p { margin-bottom:1.2em }` have the same specificity, and the preview
   stylesheet comes later in the cascade, so the *rendered* values are
   `line-height:26.88px` and `margin:8px 0` - not `30.24px` / `0 0 20.16px`.
3. **Standalone-image chrome.** md-editor-v3 renders an image that is alone in a
   paragraph as `figure > img`, with `.md-editor-preview figure { margin:0 0 1em;
   display:inline-flex; flex-direction:column; text-align:center }` and
   `div.default-theme img { margin:0 auto; box-sizing:border-box; padding:5px;
   border:1px solid #e6e6e6; border-radius:3px }`. The fixture image is 8×8, so the
   archived page paints a 20×20 box (8 + 2×5 padding + 2×1 border) and the migrated
   page painted a bare 8×8 `<img>` inside a full-width paragraph. The same box is
   now produced from `p:has(> img:only-child)`.
4. **Page-wide scoped rules.** The archived `ActivityDetail.vue` wrote its overrides
   as bare `:deep(p)`, `:deep(h1)`, `:deep(ul)`, `:deep(blockquote)`; those compile
   to `[data-v-x] <tag>` and therefore applied to the **whole page**, not just the
   Markdown body. Missing them cost the publisher row `28.8px`
   (`1.2em` on two `<p>`) and the gallery heading `22px` (`margin-top:1.5em`,
   `margin-bottom:.8em` replacing `mb-6`).
5. **Hero `h1` line height.** The archived heading is
   `text-3xl md:text-5xl lg:text-6xl … leading-tight`. In Tailwind 3 the responsive
   `text-*` block is emitted after `leading-tight` and carries its own line length
   (`2.25rem` / `1` / `1`), so the rendered line boxes are 36px / 48px / 60px. In
   Tailwind 4 `leading-tight` sets `--tw-leading:1.25` and the `text-*` utilities read
   `line-height: var(--tw-leading, …)`, so `leading-tight` won at every breakpoint
   (37.5px / 60px / 75px). `leading-tight` is inert in the archive, so it was removed.
6. **Description block line height.** `leading-relaxed text-sm md:text-base`:
   archive `24px` (Tailwind 3 `md:text-base` line length), migrated `26px`
   (`leading-relaxed` = 1.625 through `--tw-leading`). Fixed with the matching
   variant line height `md:leading-6`, per the lead's Tailwind 3→4 note.

### 3.2 `/history` timeline (4 tests)

The archived card injected the stored HTML with `v-html` into a div already carrying
`text-[15px] md:text-base` and `leading-7 md:leading-8`, so the paragraph inherited
**16px / 32px** and kept Tailwind's preflight `margin:0`. The migrated page rendered
it through `.safe-markdown`, which imposed `1.05rem` / `1.8` (**16.8px / 30.24px**),
making each card `1.77px` short (archive `660`, new `658.234`). The renderer now
takes `inherit-typography`, which adds no metrics of its own.

### 3.3 `/members` chart in dark (2 tests)

`:global(.dark) .total-number` is not a form Vue's scoped-CSS transform handles
correctly here: the built `members.DPNgxHkZ.css` contained only a stray
`.dark{fill:#999}` and the `#fff` / `#ddd` rules were dropped entirely, so the chart
kept its light palette in dark mode (total-number `#111` instead of `#fff`,
title `#333` instead of `#ddd`, subtitle `#888` instead of `#999`). Rewritten to the
archived/repo form `:global(.dark .total-number)`.

## 4. Commands actually run

All commands from the primary checkout after `. .tools/env.sh`.

| # | Command | Result |
| --- | --- | --- |
| 1 | `cd web && ../node_modules/.bin/vitest run tests/public-render.test.ts tests/public-pages.test.ts tests/public-markdown-highlight.test.ts tests/public-markdown-server.test.ts tests/public-members-sort.test.ts tests/public-clipboard.test.ts` | exit 0 — 6 files, 64 tests passed |
| 2 | scoped `eslint` on the six changed source/spec files | exit 0, no output |
| 3 | `node --check web/tests/fixtures/public-data.mjs` | exit 0 |
| 4 | `pnpm -r build` under `.tools/build.lock` (three times: 09:53, and twice while iterating) | exit 0 each time |
| 5 | `E2E_PORT_BASE=3600 node web/scripts/e2e-isolated.mjs tests/e2e/public-pages.spec.ts --max-per-batch 2` | **aborted before executing anything** — see §4.1 |
| 6 | same, after another agent's policy edit landed | **aborted** — see §4.1 |
| 7 | `E2E_PORT_BASE=3600 node .tools/tmp/ppe2e/run-committed.mjs tests/e2e/public-pages.spec.ts --max-per-batch 2` (committed runner, §4.4) | see §5 |
| 8 | a local parity harness that imports the spec's own `compareToArchive` and runs all 34 regions | 6/34 → 13/34 identical (§4.3) |

### 4.1 The prescribed runner could not run at first (since fixed by the lead)

`node web/scripts/e2e-isolated.mjs …` now exits with

```
e2e-isolated: Declared skip policy is invalid:
declared skip policy entry matches no declared test: desktop::login.spec.ts:192:5::login.spec.ts > login.spec.ts > matches the archived login visuals on mobile
declared skip policy entry matches no declared test: mobile::login.spec.ts:192:5::login.spec.ts > login.spec.ts > matches the archived login visuals on desktop
```

Another agent added those two entries to `DECLARED_SKIP_POLICY` while this
workstream ran; they matched no test in the current inventory, and
`assertPolicyMatchesInventory` failed closed — for the scoped invocation the brief
prescribes **and** for a whole-suite `--dry-run`. The lead has since made that
check non-strict for a forwarded selector (entries outside the selection are
reported as unexercised), and the brief's own command now runs; §5d is its output.
Before that fix the workstream used the committed-runner driver of §4.4.

### 4.2 The baseline isolated run is invalid

The first baseline run (`baseline-isolated.log`) reached batch 13 of 24 and then
died with

```
Batch 13 report contains 1 run error(s)
[WebServer] Error: Cannot find module '…\web\.output\server\index.mjs'
```

i.e. a concurrent rebuild deleted `.output` mid-run. No baseline number from that
run is usable; the "before" column in §5 is workstream 02's recorded run
(`docs/revamp/logs/02-public-pages/README.md` §5, `E2E_PORT_BASE=3400`, revision
`0954b8a`).

### 4.3 Local parity harness

`.tools/tmp/ppe2e/all.mjs` (scratch, not committed) imports the spec's own
`compareToArchive`, `proxyArchiveRequests` and `routeArchiveIcons` from
`web/tests/e2e/support/public-pages.ts` and runs every `PARITY_TARGETS` region for
both themes and both device profiles against servers started on `E2E_PORT_BASE=3600`.
It reproduces the spec's crop, rect-parity and pixel rules exactly, so it is a
useful iteration signal, but it is **not** the E2E: it uses one long-lived server
instead of a fresh one per batch, and it is noisier on tall mobile regions (§6.4).

### 4.4 Committed runner, driven directly

`.tools/tmp/ppe2e/run-committed.mjs` imports
`git show HEAD:web/scripts/e2e-isolated.mjs` (verified byte-identical, and the only
difference from the working-tree file is the policy block) and calls its
`runIsolated` with `webRoot`, `forwarded: ['tests/e2e/public-pages.spec.ts']` and
`maxPerBatch: 2` — the same sharding, fresh-server batches, reporters and
fail-closed checks the CLI would use, with the committed empty policy. This is a
deviation from the brief's literal command and is called out as such.

## 5. Results

**Before** (workstream 02, recorded): 26 passed / 20 failed / 2 skipped.
**After** (committed runner, §4.4, `after-isolated.log`): **33 passed / 15 failed / 0 skipped**.

Nine tests newly pass and one newly fails (§5b). The run below is the second full
after-run; the first one produced 31/17/0 and is not kept, because the
`member school navigation` selector fix (§6.3.3) and the `page and range
navigation` flake (§5b) both moved between the two.

### 5a. Per-test before → after (all 48 declared tests)

`E` = expected/passed, `U` = unexpected/failed, `S` = skipped.

| Project | Test | Before | After |
| --- | --- | --- | --- |
| desktop | activities render without JavaScript and paginate with ordinary links | E | E |
| desktop | invalid and out-of-range pages answer with real status codes | E | E |
| desktop | members school filtering is encoded in the URL and isolated | **U** | **U** |
| desktop | history anchors and the month rail work before JavaScript | E | E |
| desktop | logs render server-side, redact internal ids and stay offline | E | E |
| desktop | renders metadata and sanitized body in the SSR response | E | E |
| desktop | missing and non-public records answer 404 | E | E |
| desktop | an upstream failure answers 502 and leaks nothing | E | E |
| desktop | gallery lightbox is a native modal dialog with focus return and inert background | E | E |
| desktop | nested prose typography is applied and no client parser is shipped | E | E |
| desktop | member school navigation updates the body and the canonical URL | E | E |
| desktop | page and range navigation update the body and the canonical URL | E | E |
| desktop | SSR query isolation: filters are reflected in markup and canonical | E | E |
| desktop | reports the real outcome for a denied clipboard and for a working one | **S** | E |
| desktop | /activities matches the archive (light) | E | E |
| desktop | /activities matches the archive (dark) | E | E |
| desktop | /activity/1 matches the archive (light) | **U** | E |
| desktop | /activity/1 matches the archive (dark) | **U** | **U** |
| desktop | /history matches the archive (light) | **U** | E |
| desktop | /history matches the archive (dark) | **U** | **U** |
| desktop | /members matches the archive (light) | **U** | **U** |
| desktop | /members matches the archive (dark) | **U** | **U** |
| desktop | /logs matches the archive (light) | **U** | **U** |
| desktop | /logs matches the archive (dark) | **U** | **U** |
| mobile | activities render without JavaScript and paginate with ordinary links | E | E |
| mobile | invalid and out-of-range pages answer with real status codes | E | E |
| mobile | members school filtering is encoded in the URL and isolated | **U** | E |
| mobile | history anchors and the month rail work before JavaScript | E | E |
| mobile | logs render server-side, redact internal ids and stay offline | E | E |
| mobile | renders metadata and sanitized body in the SSR response | E | E |
| mobile | missing and non-public records answer 404 | E | E |
| mobile | an upstream failure answers 502 and leaks nothing | E | E |
| mobile | gallery lightbox is a native modal dialog with focus return and inert background | E | E |
| mobile | nested prose typography is applied and no client parser is shipped | E | E |
| mobile | member school navigation updates the body and the canonical URL | **U** | E |
| mobile | page and range navigation update the body and the canonical URL | E | **U** |
| mobile | SSR query isolation: filters are reflected in markup and canonical | E | E |
| mobile | reports the real outcome for a denied clipboard and for a working one | **S** | E |
| mobile | /activities matches the archive (light) | E | E |
| mobile | /activities matches the archive (dark) | **U** | **U** |
| mobile | /activity/1 matches the archive (light) | **U** | **U** |
| mobile | /activity/1 matches the archive (dark) | **U** | **U** |
| mobile | /history matches the archive (light) | **U** | E |
| mobile | /history matches the archive (dark) | **U** | E |
| mobile | /members matches the archive (light) | **U** | **U** |
| mobile | /members matches the archive (dark) | **U** | **U** |
| mobile | /logs matches the archive (light) | **U** | **U** |
| mobile | /logs matches the archive (dark) | **U** | **U** |

### 5b. `page and range navigation` is a pre-existing, flaky defect

`filter and page reactivity > page and range navigation update the body and the
canonical URL` fails at

```
await page.goto('/logs?page=2')
await expect(page.getByText('没有找到相关记录')).toBeVisible()
```

because the page renders Nuxt's own 500 page:
`Failed to resolve module specifier "#entry"`. The SSR HTML always carries the
correct import map (`{"imports":{"#entry":"/_nuxt/Dz5p_Nd4.js"}}`) and the first
load in a tab always works; the **second** navigation in the same tab is what
breaks, and every later navigation in that tab then breaks too.

It is not caused by this workstream. The six changed files were reverted,
`pnpm -r build` re-run, and the same two-navigation probe reproduced the
identical 500 page; the files were then restored and rebuilt. It is flaky (both
projects in the first after-run, mobile only in the second), it appeared between
the recorded run's build and the current one, and it also destabilises
`members school filtering`, which does four navigations. It lives in the
build/config layer.

### 5c. Remaining failures, by cause

| Tests | Cause | Owner |
| --- | --- | --- |
| `page and range navigation` (mobile this run), `members school filtering` (desktop) | the `#entry` second-navigation defect (§5b) | build/config |
| `/members` light ×2, `/members` dark ×2 | `ProgressiveImage.vue` `managed = !painted` (§6.2.3) | homepage agent |
| `/logs` light ×2 (mobile on rect parity) | raw vs redacted `details` text (§6.2.2) | lead decision |
| `/logs` dark ×2 | missing `html.dark .border-*` remaps in `main.css` (§6.2.1) | lead |
| `/activity/1` dark desktop, `/history` dark desktop | the archived `RouteProgressBar` inside the crop (§6.2.4) | layout/global |
| `/activity/1` light+dark mobile, `/activities` dark mobile | the fixed navbar landing on different rows in the tall mobile crops (§6.2.5) | layout/global |

### 5d. After the lead's `main.css` fix (sanctioned runner, latest run)

The lead added the five missing `html.dark .bg-gray-800` / `.border-gray-*`
rules to `web/app/assets/css/main.css` and made `assertPolicyMatchesInventory`
non-strict for a forwarded selector, so the brief's own command works again:

```
E2E_PORT_BASE=3600 node web/scripts/e2e-isolated.mjs tests/e2e/public-pages.spec.ts --max-per-batch 2
```

Result: **32 passed / 16 failed / 0 skipped** (the run-to-run count moves between
32 and 33; see 5e). Region-level is the stable signal — **17 of 28 comparisons are
now byte-identical**, and the four `/activity/1` prose regions and both
`/members` charts are clean in every theme and profile:

| Region | Project | Differing px | Crop |
| --- | --- | --- | --- |
| activities-grid-dark | desktop | **0** | 1216x497 |
| activities-grid-dark | mobile | 7111 | 997x4142 |
| activities-grid-light | desktop | **0** | 1216x497 |
| activities-grid-light | mobile | 310406 | 997x4142 |
| activity-1-article-dark | desktop | **0** | 1024x1571 |
| activity-1-article-dark | mobile | 14095 | 1081x3646 |
| activity-1-article-light | desktop | 107271 | 1024x1571 |
| activity-1-article-light | mobile | 14091 | 1081x3646 |
| activity-1-prose-dark | desktop | **0** | 862x176 |
| history-month-rail-light | desktop | **0** | 69x138 |
| history-timeline-dark | desktop | 3379 | 1216x1368 |
| history-timeline-dark | mobile | **0** | 997x2719 |
| history-timeline-light | desktop | **0** | 1216x1368 |
| history-timeline-light | mobile | **0** | 997x2719 |
| logs-statistics-dark | desktop | **0** | 1120x739 |
| logs-statistics-dark | mobile | 7803 | 997x3491 |
| logs-statistics-light | desktop | **0** | 1120x739 |
| logs-statistics-light | mobile | **0** | 997x3491 |
| logs-table-dark | desktop | 4385 | 1118x893 |
| logs-table-light | desktop | 4010 | 1118x893 |
| members-chart-dark | desktop | **0** | 900x525 |
| members-chart-dark | mobile | **0** | 997x656 |
| members-chart-light | desktop | **0** | 900x525 |
| members-chart-light | mobile | **0** | 997x656 |
| members-grid-dark | desktop | **0** | 1248x304 |
| members-grid-dark | mobile | **0** | 997x2560 |
| members-grid-light | desktop | 6592 | 1248x304 |
| members-grid-light | mobile | 20491 | 997x2560 |

**What the lead's fix 1 (dark borders) explains:** `/logs` statistics dark
**desktop** went from 11 154 differing pixels to **0** — every one of those pixels
was a 1px border (`#334155` archive vs `#1e293b` port) — so that region now
passes. `/logs` statistics dark **mobile** fell from 43 624 (recorded) to 7 803,
and the 7 803 that remain are a single 3 CSS-px band (§5e), not borders. No other
region in this spec was border-driven: the pages' other border utilities carry
opacity modifiers (`border-gray-100/80`, `border-gray-200/60`), which the
archived `html.dark .border-gray-100` rule never matched either.

**What the lead's fix 2 (Tailwind `--tw-leading`) explains:** nothing that is
still failing. I had already found and fixed both instances on `/activity/1`
before the note arrived (hero `h1` `leading-tight`; description block
`md:leading-6`), and the `/activity/1` prose regions are now 0 in all four
theme/profile combinations.

**What the lead's fix 3 (`space-y-*`) explains:** nothing in this spec. The one
`space-y-12` that matters (`/history`) has block-level flex children, so TW4's
`margin-block-end` on the preceding sibling and TW3's `margin-top` on the
following one produce the same 48px; `/history` timeline is 0 on light desktop and
on both mobile profiles, and its dark desktop residual is the 3px band. The
`/logs` `space-y-*` regions are clean as well.

### 5e. The residual is now dominated by two capture races

Every remaining non-zero region is one of two things, neither of which is a
layout property:

1. **The archived page's lazy images have not entered at capture time.** The
   archive renders `pi-placeholder`/`pi-poster` until its IntersectionObserver
   fires; the port renders the server-rendered `<img>`. Whichever side wins the
   race decides the comparison, which is why the same region flips between 0 and
   tens of thousands of pixels across runs:
   `members-grid-light` desktop 6 592 / mobile 20 491 (two of three avatar boxes)
   while `members-grid-dark` is 0 on both; `activities-grid-light` mobile 310 406
   (one card cover); `activity-1-article-light` desktop 107 271 (one gallery
   image, 452×254).
2. **The archived `RouteProgressBar`** — a fixed 3px sky bar painted while the
   archived page loads — lands inside the crop's first rows: `history-timeline-dark`
   desktop 3 379, `logs-statistics-dark` mobile 7 803 and `activities-grid-dark`
   mobile 7 111 are each a single 9-device-pixel (3 CSS px) full-width band.

The `/logs` table regions are the only remaining *content* difference
(raw vs redacted `details`, §6.2.2) and `/members` dark now fails only on the
page-level `svg circle` count assertion (§6.2.3).

## 6. Unresolved limitations and deviations

### 6.1 Fixed here

Measured outcomes, not region-level claims: `/activity/1` light desktop now
matches, `/activity/1` dark desktop is down to the 3px progress-bar band (§6.2.4),
`/history` light desktop and light+dark mobile now match, `/members` chart in dark
matches on both profiles, and both `code block copy` cases now execute instead of
skipping. On the local parity harness the same changes took 6/34 regions to 13/34.

### 6.2 Blocked by files this workstream does not own

1. **`/logs` statistics in dark — FIXED by the lead.** The five missing rules are
   now in `web/app/assets/css/main.css`, and the desktop region measures 0
   differing pixels (§5d). Kept here as the record of the diagnosis. Every
   differing pixel was a 1px border
   whose colour is `#334155` in the archive and `#1e293b` in the new app. The
   archived `frontend/src/style.css` lines 35-38 carry
   `html.dark .border-gray-100 / .border-gray-200 { border-color:#334155 !important }`
   (plus `.border-gray-300`, `.border-gray-700`), and line 27 `html.dark .bg-gray-800`.
   `web/app/assets/css/main.css` had ported eight of the thirteen archived rules and
   omitted exactly those five.
2. **`/logs` table (2 tests).** The archived row prints `row.details` verbatim
   (`修改配置: smtp_password`, `封禁IP 198.51.100.7 (恶意刷接口) 至 …`); the migrated
   page prints the deliberately redacted projection
   (`修改了站点配置`, `封禁了一个访问来源`) from `projectLogDetails` /
   `redactLogDetails` in `web/server/utils/public-read.ts`. The 4 010 differing
   pixels are nine table rows of *text*, and on mobile the shorter text also changes
   the table's intrinsic width (the rect-parity assertion). This is a security
   feature, not a layout defect; making the comparison pass would mean publishing the
   raw IPs and config keys the fixture was built to prove are dropped. It needs a
   lead decision (restrict the region, or accept the deviation).
3. **`/members` grid (2 tests).** `web/app/components/ProgressiveImage.vue` sets
   `managed = !painted` at mount and renders the server-rendered `<img>` whenever the
   browser already painted it, while the archived component renders its
   `pi-placeholder`/`pi-poster` until its own IntersectionObserver fires. Every
   differing pixel is inside one of the three 88×88 avatar boxes. The file is the
   homepage agent's and is being edited by them right now, so it was not touched.
4. **The archived route progress bar.** `frontend/src/components/RouteProgressBar.vue`
   renders `div.route-progress` — `position:fixed; top:0; height:3px` with a sky
   gradient — while the archived page is loading. The migrated app has no such
   element. When the compared element's top coincides with the viewport top, the crop
   begins with those three rows and the comparison fails on a full-width 3px band
   (`/history` light desktop + dark desktop, `/activity/1` dark desktop, and the tall
   mobile crops). It is a layout/global component, outside this workstream's list.
5. **`/activities` grid on mobile.** The same crop mechanism: the archived page's
   fixed navbar and progress bar are painted at their viewport position inside a
   380×1578 crop, and the migrated page's fixed navbar lands on different rows.

### 6.3 Test changes made here (justified)

1. **`nested prose typography`, `paragraphMargin`.** Was `base * 1.2` (`20.16px`).
   That value is what the *migrated* page rendered, not what the archive rendered:
   the archived computed `margin-bottom` is `8px` (§3.1.2). The expectation is
   corrected to `8px` and a `paragraphLineHeight` assertion (`base * 1.6`) is added,
   so the test still pins the exact computed values rather than being loosened.
2. **`code block copy`.** The self-skip is gone: fixture activity 3's content now
   carries a fenced `js` block and the test navigates to `/activity/3`, asserting
   `.md-code` exists. `/activity/1` deliberately stays fence-free because it is the
   page the prose parity comparison renders, and the archived md-editor-v3 preview
   colours a fence with its own palette, which the server-side Shiki `github-light`
   tokens do not reproduce (a deviation `docs/revamp/PUBLIC-PAGES.md` already
   documents). No new fixture *row* was added, so no grid can move.
   **Not verified:** the homepage and social specs were not re-run against the
   changed fixture (§7).
3. **`member school navigation updates the body and the canonical URL`,
   selector scoping.** `page.locator('a[href="/members"]').first()` resolves to
   the layout navbar's `/members` link, which below `lg` is collapsed to a 0×0
   box, so `.click()` never becomes actionable and the mobile test times out
   after 30s (the desktop test passes only because the navbar link is visible
   there). The click is now scoped to the page body
   (`memberBody(page).locator('a[href="/members"]').first()`), matching the other
   member assertions in the same file and keeping the test's intent (navigate
   from the filtered view back to 全部). Verified with a targeted
   `--grep "member school navigation"` isolated run: 2/2 passed.

### 6.4 What this workstream could not verify

* The authoritative isolated E2E result depends on `run-committed.mjs` (§4.4)
  because the working-tree runner refuses to start (§4.1).
* The two non-visual failures (`members school filtering` desktop hydration and the
  mobile `member school navigation` timeout) could not be reproduced by hand: the
  live page keeps its chart and both circles across repeated loads on a stable build,
  and every earlier reproduction was contaminated by the concurrent rebuilds that
  served Nuxt's 500 page (`Failed to resolve module specifier "#entry"`). They are
  reported from the E2E run instead.
* `nuxt typecheck`, `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test` and the
  performance script are lead-owned and were not run.

## 7. How to re-verify

```sh
cd /e/Taropoi/workspace/GuatSWR_Website
. .tools/env.sh

# scoped unit suites
cd web && ../node_modules/.bin/vitest run \
  tests/public-render.test.ts tests/public-pages.test.ts \
  tests/public-markdown-highlight.test.ts tests/public-markdown-server.test.ts \
  tests/public-members-sort.test.ts tests/public-clipboard.test.ts
# expect 6 files / 64 tests passed

# the spec's E2E (serialized: take .tools/build.lock, build, run, release)
cd /e/Taropoi/workspace/GuatSWR_Website && . .tools/env.sh && pnpm -r build
E2E_PORT_BASE=3600 node web/scripts/e2e-isolated.mjs tests/e2e/public-pages.spec.ts --max-per-batch 2
```

The second command only works once `DECLARED_SKIP_POLICY` in
`web/scripts/e2e-isolated.mjs` matches its inventory again (§4.1).

Nothing here is an acceptance claim; the lead owns acceptance.
