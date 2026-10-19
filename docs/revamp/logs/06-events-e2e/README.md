# 06 — event E2E failures (form model, hydration, visual parity)

Checkout: primary `E:/Taropoi/workspace/GuatSWR_Website`, branch
`revamp/nuxt-foundation`, base commit `319e295` plus the peer batches'
uncommitted work (the tree moved under me; see §5.1). Assigned Playwright port
base: `E2E_PORT_BASE=3900`. Runtime pinned by `.tools/env.sh` (Node 24.15.0).

## 1. Scope

Close the 10 recorded event E2E failures (6 in `events.spec.ts`, 4 in
`events-visual.spec.ts`) without weakening an assertion, mask, tolerance or
snapshot, and without editing anything outside the ownership list in
`.tools/brief-events-e2e.md`.

Result: **24 passed / 2 failed / 0 skipped** of 26 (was 16/10/0). The two
remaining failures are the dark-theme signup-modal *pixel* comparison in both
projects; §4.1 explains why closing them requires deliberately reproducing an
archived rendering bug and is left to the lead.

## 2. Exact file inventory

### Modified — application code (7)

| Path | Change |
| --- | --- |
| `web/app/components/events/EventForm.vue` | `const values = computed(() => form.state.values)` → `form.useSelector((state) => state.values)`. **This is the root cause of the 6 interaction failures** (§3.1). |
| `web/app/components/events/EventBoard.vue` | `$fetch(...participants/public, { retry: 0 })` — ofetch retries a failed GET once, immediately, hiding the archived error state (§3.2). Board `<h1>` gains `md:leading-10` (§3.3). |
| `web/app/components/events/EventCard.vue` | The `时间` row is rendered only after mount — `Date#toLocaleString()` is locale-dependent and the SSR (Node, `zh-CN`) and client (browser) strings differ, which is the recorded hydration mismatch (§3.4). |
| `web/app/components/events/EventModal.vue` | Panel `padding: 16px` (Element Plus's `.el-dialog` padding), no border in either theme, `margin: 15vh auto 50px` (Element Plus's `.el-dialog` rule), a pinned 58px header, and the close button loses `min-h-11 min-w-11` (§3.5). |
| `web/app/components/events/EventSignup.vue` | Restores the archived body box: the avatar / progress / preview / submit rows move out of the field grid with `mt-3`/`mt-2`/`mt-3`/`mt-4`, the three buttons lose `min-h-11`, and the controls gain `mt-1` to restore the Tailwind 3 `space-y-1` gap (§3.6). |
| `web/app/pages/events.vue` | The three `dark:border-[#1e1f22]` become `dark:border-[#334155]`, and the rail collapse button loses `min-h-11 min-w-11` (§3.7). |
| `web/tests/e2e/events.spec.ts` | Three test defects fixed; every assertion kept or strengthened (§3.8). |
| `web/tests/e2e/support/events-parity.ts` | `stubGuestBff`'s `saveStatus` now governs the signup POST as well as the event PUT (§3.8). |

### New — workstream log

- `docs/revamp/logs/06-events-e2e/README.md` (this file)
- `docs/revamp/logs/06-events-e2e/evidence.json`
- `docs/revamp/logs/06-events-e2e/isolated-run-1.log` (20/26)
- `docs/revamp/logs/06-events-e2e/isolated-run-2.log` (22/26)
- `docs/revamp/logs/06-events-e2e/isolated-run-3.log` (24/26, authoritative)
- `docs/revamp/logs/06-events-e2e/summary-run-3.json` (runner summary of run 3)

### Owned but NOT changed

`web/app/utils/{event-transport,event-display,upload-progress,compress-image}.ts`,
`web/app/composables/useEventApi.ts`, `packages/shared/src/events.ts` and its
test, `web/tests/event-*.test.ts`, `web/tests/compress-image.test.ts`,
`web/tests/e2e/events-visual.spec.ts`.

### Not edited (other owners)

`web/nuxt.config.ts`, `web/playwright.config.ts`, `web/scripts/e2e-isolated.mjs`,
`web/app/assets/css/**`, `web/server/**`, the homepage/public-pages specs, the
ledgers. Two findings need an owner (§4.2, §4.3).

### Throwaway probes (not repo source, safe to delete)

`.tools/tmp/e2e-probe/`: `probe.{html,mjs}`, `archive-geometry.mjs`,
`app-geometry.mjs`, `signup-compare.mjs`, `dark-styles.mjs`, `board-diff.mjs`,
`chips.mjs`, `h1.mjs`, `dialog.mjs`, `dark-modal.mjs`, `dark-test.mjs`,
`hydration.mjs`, `events-isolated.mjs`, plus their `.json`/`.png` output.

## 3. Root causes

### 3.1 The form model never received the typed value — `form.state` is not reactive

`EventForm.vue` held

```js
const values = computed(() => form.state.values as EventFormModel)
```

`@tanstack/vue-form@1.33.5` exposes `form.state` as a **plain snapshot**, not a
reactive source: the reactive read is `form.useSelector(...)`. A `computed` over
`form.state` therefore evaluates once and never invalidates. The inputs stayed
correct because they are bound to `field.state.value`, which *is* reactive
(`useField` uses `useSelector`), so the DOM showed the typed text while
`values.value` still held the empty defaults. `handleSubmit()` runs the archived
pre-check `validateEventForm(values.value, …)` **before** `form.handleSubmit()`,
so the empty title produced `请填写标题`, focused the title input and returned —
the submit never reached the network, exactly as recorded.

Proved outside the app with a standalone browser probe
(`.tools/tmp/e2e-probe/probe.mjs`, no build lock, no app server) that reproduces
the exact binding shape:

```
after filling #title-input with 测试悬赏:
  form.state.values (read at render)  {"title":"测试悬赏",...}
  computed(() => form.state.values)   {"title":"",...}          <- stale
  form.useSelector(s => s.values)     {"title":"测试悬赏",...}  <- reactive
  onSubmit value                      {"title":"测试悬赏",...}
```

The same staleness also froze `fields` (the per-type field catalogue) and the
`values.type === '对赌协议'` branch, which the `useSelector` change fixes too.

### 3.2 The participant-preview failure was a hidden automatic retry

`EventBoard.openPreview` used `$fetch` (ofetch 1.5.1), whose default is one
retry for a non-payload method with `retryDelay || 0` — i.e. **an immediate
retry**. The spec stubs a 502 for the first `…/participants/public` call and
expects the archived error state; ofetch swallowed it and the second attempt
returned the list, so the error region never appeared. The archived page used
axios (no retry). Fixed with `{ retry: 0 }`.

### 3.3 Desktop board pixels — the Tailwind 3 → 4 `--tw-leading` cascade

Board `<h1 class="… text-3xl font-semibold leading-relaxed md:text-4xl">`.
Computed `line-height`:

| | <768px | ≥768px |
| --- | --- | --- |
| archived (Tailwind 3) | 48.75px | **40px** (`.md\:text-4xl{…line-height:2.5rem}`, emitted after `.leading-relaxed`) |
| nuxt before fix (Tailwind 4) | 48.75px | **58.5px** (`md:text-4xl` reads `line-height: var(--tw-leading, …)`, which `leading-relaxed` set to 1.625) |

Measured in the browser (`h1.mjs`): archive `{fs:36px, lh:40px, h:40}` vs app
`{fs:36px, lh:58.5px, h:58.5}`; the whole board below the heading shifted
18.5px, which is the recorded 19 281 (light) / 23 901 (dark) differing pixels.
`md:leading-10` (2.5rem = 40px) restores it; the base (<768px) behaviour was
already identical, which is why the mobile board comparisons passed.

### 3.4 The hydration mismatch — locale-dependent SSR text

`EventCard` renders `eventDeadlineText()` → `new Date(value).toLocaleString()`
verbatim (the archived rendering). The Nitro process runs with the machine
locale `zh-CN`, the Playwright browser with `en-US`:

```
SSR HTML (/events/bounty):  2026/11/30 23:59:00
client (after hydration):   11/30/2026, 11:59:00 PM
```

so every card with a schedule produced
`Hydration completed but contains mismatches.` (visible in the recorded trace
`.tools/tmp/tr/1-trace.trace`, page `/events/bounty`). The row is now rendered
only after mount — the archived card was client-only anyway. Verified: no
console error on `/events/bounty`, `/events/stg` or `/events/zetime` after the
fix (`hydration.mjs`).

### 3.5 The signup modal box (visual spec compares `[data-region="modal-body"]`)

The spec compares the archived `.el-dialog__body` against the ported modal body,
so the *box* has to match, not just the content. Measured with `dialog.mjs` /
`signup-compare.mjs`:

| | archived (Element Plus) | ported, before | ported, after |
| --- | --- | --- | --- |
| dialog padding | `16px` (`.el-dialog`) | 0 | `16px` |
| dialog border (light / dark) | `0` / `0` | `1px` / `1px` | `0` / `0` |
| dialog margin | `15vh auto 50px` | `auto` | `15vh auto 50px` |
| header box | 58px | 59.39px | 58px |
| body box (mobile) | `347.03125 x 565` at `x=32.484375` | `377.03125 x 573` at `x=20` | `347.03125 x 565` at `x=32.484375` |
| body PNG | `914 x 1486` | `992 x 1507` | `914 x 1486` |

The dark border is a dead rule in the archive: `:deep(.dark .touhou-dialog)`
compiles to `[data-v-bd090f2b] .dark .touhou-dialog`, and Element Plus teleports
the dialog to `<body>`, so it never has that ancestor — the archived dialog is
borderless in both themes (measured `border-width: 0px`, background
`rgb(255,255,255)` even in dark).

The vertical position matters for the *pixels*, not only the size: the element
screenshot is snapped to the device-pixel grid, and a body `y` whose fractional
device row differs makes Chromium rasterise the text one row lower while the
input boxes stay put. Reproducing `margin: 15vh auto 50px` and the 58px header
makes the body `y` identical (199.84375), and the capture then matches exactly.

### 3.6 EventSignup body geometry

Row-by-row measurement (`signup-compare.mjs`) gave, at the archived content
width (299.03px):

| row | archived | ported, before | fix |
| --- | --- | --- | --- |
| header row | 40 (`mb-4` 16) | 44 (`min-h-11` delete button) | drop `min-h-11` |
| field grid | 315 (4 × 70 + 3 × 12) | 439 | see below |
| avatar row | `mt-3` + 56 (32px button) | grid child, 68 (44px button) | move out, drop `min-h-11` |
| submit row | `mt-4` + 36 | grid child, 44 | move out, drop `min-h-11` |

Two Tailwind 3 → 4 differences were behind the grid height:

- **`space-y-1`**: Tailwind 3 emits `margin-top` on the *following* sibling
  (the input), Tailwind 4 emits `margin-block-end` on the preceding inline
  `<span>` — a vertical margin on an inline box has no effect, so each label
  lost its 4px (70px → 66px, ×4 labels). Restored with an explicit `mt-1` on
  each control.
- the port had moved the avatar/progress/preview/submit rows *into* the grid
  (`md:col-span-2`) and replaced the archived `mt-3`/`mt-2`/`mt-3`/`mt-4` with
  the grid `gap-3`; they are moved back out.

### 3.7 Dark board pixels — a dead legacy override

The archived `frontend/src/style.css` carries
`html.dark .border-gray-200 { border-color: #334155 !important }`, which beats
the `dark:border-[#1e1f22]` utility on the same elements. The port restored the
`bg-*`/`text-gray-*` halves of that override in
`web/app/assets/css/main.css` but not the `border-gray-*` ones, so the mobile
category chips and the rail header rendered `#1e1f22` instead of `#334155`
(measured: archive `rgb(51,65,85)` vs app `rgb(30,31,34)`). That was the whole
3 719-pixel dark-mobile difference; the three `events.vue` classes now pin the
archived value.

### 3.8 Test defects (fixed the test, never the assertion)

- `shares one draft between upload and submission and retries with the same id`
  — the test set files on the hidden `<input type=file>` without pressing the
  field's upload button. Both the archived form and the port bind the input to
  the field whose button opened it (`chooseImage(key)` sets `uploadTarget`
  before `input.click()`; `handleFileChange` returns early when it is empty), so
  the upload never ran. It now drives the real flow through the `filechooser`
  event. Second defect: the success copy `提交成功，等待管理员审核` can never be
  seen, because the board closes the dialog the moment the form emits
  `submitted` (`@submitted="() => { formOpen = false; … }"`) — in the archive
  too. Replaced with `await expect(modal).toHaveCount(0)`, which is the
  observable outcome and a *stronger* assertion than the copy it replaces.
- `distinguishes permission errors from an expired session` — two defects. (a)
  the archived signup refuses to save without an avatar (`请先上传头像`), so the
  test seeded no signup and never reached the network; it now seeds one with an
  avatar (the sibling "reads, saves and cancels" test already did). (b)
  `stubGuestBff`'s `saveStatus` only governed the event PUT, so the signup POST
  answered 200 and the modal reported success; `saveStatus` now governs the
  signup POST too.

## 4. Commands actually run, and their results

All through `. .tools/env.sh`. Playwright only on `E2E_PORT_BASE=3900`.

| # | Command | Result |
| --- | --- | --- |
| 1 | standalone `@tanstack/vue-form` probe (`.tools/tmp/e2e-probe/probe.mjs`, static server on 3999 + playwright library) | reproduced the stale-`computed` root cause (§3.1) |
| 2 | `node .tools/tmp/e2e-probe/archive-geometry.mjs` / `h1.mjs` / `dialog.mjs` / `signup-compare.mjs` / `dark-styles.mjs` / `board-diff.mjs` / `chips.mjs` (legacy fixture on 5975, upstream on 5976) | measured the archived boxes, line heights, chip colours and the exact pixel-diff bounding boxes |
| 3 | `mkdir .tools/build.lock` → `pnpm -r build` → event specs → `rmdir .tools/build.lock` | build exit 0 (1m 17s, then 1m 10s on the second pass) |
| 4 | `E2E_PORT_BASE=3900 node .tools/tmp/e2e-probe/events-isolated.mjs tests/e2e/events.spec.ts tests/e2e/events-visual.spec.ts` (run 1) | **20 passed / 6 failed / 0 skipped** of 26 |
| 5 | same (run 2) | **22 passed / 4 failed / 0 skipped** |
| 6 | same (run 3, authoritative — `isolated-run-3.log`) | **24 passed / 2 failed / 0 skipped** |
| 7 | `cd web && ../node_modules/.bin/vitest run tests/event-transport.test.ts tests/event-display.test.ts tests/compress-image.test.ts tests/public-pages.test.ts` | **4 files / 50 tests passed** |
| 8 | `../node_modules/.bin/eslint <every file this workstream owns>` | **0 errors**, 18 `vue/html-self-closing` warnings (repo baseline) |
| 9 | `node .tools/tmp/e2e-probe/hydration.mjs` (built server on 3900) | no console error on `/events/bounty`, `/events/stg`, `/events/zetime` |

### Per-test before/after (all 10 recorded failures)

Before = `docs/revamp/logs/04-auth-bff/e2e-evidence/summary.json` (base 3700).
After = run 3 (base 3900).

| Spec:test | Project | Before | After |
| --- | --- | --- | --- |
| `events.spec.ts` shares one draft between upload and submission and retries with the same id | desktop | fail (`请填写标题`, no request) | **pass** |
| same | mobile | fail | **pass** |
| `events.spec.ts` distinguishes permission errors from an expired session | desktop | fail (`请先上传头像`) | **pass** |
| same | mobile | fail | **pass** |
| `events.spec.ts` shows the participant preview and retries after a failure | desktop | fail (auto-retry hid the 502) | **pass** |
| same | mobile | fail | **pass** |
| `events-visual.spec.ts` light layout | desktop | fail (19 281 px) | **pass** |
| `events-visual.spec.ts` light layout | mobile | fail (size 992×1507 vs 914×1486) | **pass** |
| `events-visual.spec.ts` dark layout | desktop | fail (23 901 px) | **fail** — `signup-modal-dark-desktop`, 222 636 px (§4.1) |
| `events-visual.spec.ts` dark layout | mobile | fail (3 719 px) | **fail** — `signup-modal-dark-mobile`, 1 196 436 px (§4.1) |

Every `board-*` and `card-*` region now reports `differingPixels: 0` in both
themes and both projects (see the `*-comparison.json` under
`web/.e2e-isolated/events-e2e/batch-*/test-results/`), and
`signup-modal-light-{desktop,mobile}` report 0 too.

## 5. Unresolved limitations and deviations

### 4.1 OPEN — the dark signup-modal comparison needs an archived *bug* reproduced

In dark mode the archived dialog is a **light island**: the `.touhou-dialog`
chrome rules are scoped (`[data-v-bd090f2b] .dark .touhou-dialog …`) and the
dialog is teleported to `<body>`, so they never match. Measured in dark mode:

| | archived | ported |
| --- | --- | --- |
| dialog / panel background | `rgb(255, 255, 255)` | `rgb(15, 23, 42)` |
| header background | `rgb(240, 249, 255)` (sky-50) | `rgb(11, 18, 32)` |
| body text colour | `rgb(96, 98, 102)` (Element Plus) | `rgb(226, 232, 240)` |

The archived dark modal therefore renders dark-mode text classes on a white
panel — its `报名信息` heading and both pill buttons are effectively invisible
(screenshot: `.tools/tmp/e2e-probe/dark-modal-archive.png`). The port renders it
correctly (`.tools/tmp/e2e-probe/dark-modal-app.png`).

Injecting `html.dark .event-modal-panel { background: #fff !important }` in the
browser (plus the border removal that is already applied) drops the mobile diff
from 1 196 436 px to **2 739 px**, and those remaining 2 739 px are exactly the
capture's first three rows — i.e. the archived header's sky-100 bottom border
showing through, which is also dead in the archive's dark theme. So closing
these two tests means making the whole events modal chrome light in dark mode
(panel background, header background and header border), reproducing an
unreadable dialog.

That is a product decision, not a parity bug in the port, so it is left to the
lead. Options: (a) reproduce the archived light chrome in dark mode (the tests
pass; the dark signup modal becomes unreadable, as in the archive); (b) keep the
correct dark chrome and treat these two assertions as encoding an archived bug —
which would need a lead-owned decision to change the spec, not a silent mask.

### 4.2 `web/app/assets/css/main.css` is missing the archived border overrides

`frontend/src/style.css` has `html.dark .border-gray-{100,200,300,700}
{ border-color: … !important }`; the port's `main.css` restored only the `bg-*`
and `text-gray-*` halves. Any other component that puts `border-gray-*` on an
element with a `dark:` border will render the archived *light* value where the
archive rendered `#334155`. This workstream pinned the three `events.vue` cases;
the systemic fix belongs to the owner of `main.css`.

### 4.3 `space-y-*` semantics changed between Tailwind 3 and 4

Tailwind 3 puts the gap on the following sibling (`margin-top`); Tailwind 4 puts
`margin-block-end` on the preceding one. Where the preceding sibling is an
inline element (a `<span>` above an `<input>`, as in the signup labels and the
event form), the gap silently disappears. This workstream restored it locally
with `mt-1` on the control; other components (including the public pages) may
have the same latent 4px loss.

### 4.4 The isolated runner cannot run a subset of the suite

`web/scripts/e2e-isolated.mjs` validates its `DECLARED_SKIP_POLICY` against the
inventory of the forwarded selectors. The policy names two `login.spec.ts`
identities, so the brief's prescribed command

```sh
node web/scripts/e2e-isolated.mjs tests/e2e/events.spec.ts tests/e2e/events-visual.spec.ts
```

fails immediately with *"declared skip policy entry matches no declared test"*,
and running `login.spec.ts` is not possible either (it self-skips without the
lead's auth wiring and those skips are undeclared). To keep every other
safeguard, the runs went through `.tools/tmp/e2e-probe/events-isolated.mjs`,
which imports `runIsolated`/`createSpawnExec` from the runner unchanged —
sequential fresh-server batches, coverage verification, blob merge — and passes
`policy: []`. An **empty** policy is stricter than the default for this
inventory: any skip in the event specs still fails the run (the run reports
`skipped 0`). The lead may want to make the policy per-inventory.

### 4.5 Other

- `pnpm -r typecheck` / `pnpm -r lint` / `pnpm -r test` were not run
  (lead-owned). Scoped lint and the scoped vitest run are this workstream's
  evidence.
- The tree moved during the round: the peer public-pages agent rebuilt
  `web/.output` twice (10:26, 10:59) while I was diagnosing, so two of my early
  probes measured a build that already contained part of my work. Every number
  quoted in §3 comes from a probe re-run against a build whose content is stated
  in the surrounding text; the run results in §4 come from builds I took the
  lock for.
- Not verified: the `compressorjs` re-encode path (unchanged, browser-only), and
  the real guest BFF server routes (the specs stub `/api/bff/**` in the browser,
  as the brief requires).
- `.tools/tmp/e2e-probe/dark-test.mjs` and the other probes read
  `web/.output` and start servers on 3900/3981/5975/5976 only; they were run
  outside the build lock for diagnosis (they never write shared state) and
  inside it for the post-fix verification.

## 6. How to re-verify

```sh
cd /e/Taropoi/workspace/GuatSWR_Website
. .tools/env.sh

# scoped unit suites
cd web
../node_modules/.bin/vitest run tests/event-transport.test.ts tests/event-display.test.ts \
  tests/compress-image.test.ts tests/public-pages.test.ts
../node_modules/.bin/eslint app/components/events app/pages/events.vue \
  app/utils/event-transport.ts app/utils/event-display.ts app/utils/upload-progress.ts \
  app/utils/compress-image.ts app/composables/useEventApi.ts \
  tests/e2e/events.spec.ts tests/e2e/events-visual.spec.ts tests/e2e/support/events-parity.ts
cd ..

# build + event E2E (take .tools/build.lock first, release with rmdir)
pnpm -r build
E2E_PORT_BASE=3900 node .tools/tmp/e2e-probe/events-isolated.mjs \
  tests/e2e/events.spec.ts tests/e2e/events-visual.spec.ts
# expected: 24 passed / 2 failed / 0 skipped, the two failures being
# signup-modal-dark-{desktop,mobile} (§4.1)

# hydration-mismatch check (built server on 3900, upstream on 3981)
node .tools/tmp/e2e-probe/hydration.mjs
# expected: [] for /events/bounty, /events/stg, /events/zetime
```
