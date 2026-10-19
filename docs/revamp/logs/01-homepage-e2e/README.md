# 01 — homepage / social / join E2E failures

Checkout: primary `E:/Taropoi/workspace/GuatSWR_Website`, branch
`revamp/nuxt-foundation`, base commit `0954b8a` (HEAD at the time of writing:
`45b0e51`, plus the two peer batches' uncommitted files). Assigned Playwright
port base: `E2E_PORT_BASE=3200`.

## 1. Scope

Resolve the 14 recorded E2E failures in `web/tests/e2e/homepage*.spec.ts` and
`web/tests/e2e/social-join.spec.ts` (7 tests × desktop + mobile) without
weakening an assertion, mask, tolerance or snapshot, and without touching files
outside the ownership list in `.tools/brief-homefix.md`.

Result: **12 of the 14 are fixed and verified** through the isolated runner.
The remaining 2 (`homepage-visual.spec.ts` light/dark on the **desktop**
project only) are blocked by a genuine archived-vs-new layout difference whose
cause is in `web/app/pages/index.vue` — a file the brief forbids this workstream
from editing. Details in §4.1.

## 2. Exact file inventory

### Modified (5)

| Path | Change |
| --- | --- |
| `web/tests/e2e/support/public-parity.ts` | `ARCHIVE_ORIGIN`/`UPSTREAM_ORIGIN` derived from `E2E_PORT_BASE` (were hardcoded `5174`/`3181`); `compareRegion` rewritten to the layout.spec footer capture protocol (align to viewport origin, assert equal rounded bounds, whole-device-pixel crop, raw captures kept). |
| `web/tests/e2e/homepage.spec.ts` | `openNavLink` scoped to `getByRole('navigation', { name: '主导航' })` with `exact: true`; the thumbnail 404 route glob widened from `**/uploads/*-thumb.webp` to `**/uploads/**/*-thumb.webp`. |
| `web/tests/e2e/social-join.spec.ts` | the no-JS group-number assertion scoped to `getByRole('main')`. |
| `web/app/components/ProgressiveImage.vue` | `onMounted` now also enters the loader when the server-rendered element already finished **with a failure** (`complete && !naturalWidth`), so a missing thumbnail falls back instead of staying `managed`/`idle` forever. |
| `web/app/pages/join.vue` | `ref="qrImage"` on the QR `<img>` plus an `onMounted` adoption of the element's own state, so a QR request that failed before hydration still reaches the archived failure state (and `qrLoaded`). |

### New (2, plus copied evidence)

| Path | Content |
| --- | --- |
| `docs/revamp/logs/01-homepage-e2e/README.md` | this file |
| `docs/revamp/logs/01-homepage-e2e/evidence.json` | machine-readable results |
| `docs/revamp/logs/01-homepage-e2e/isolated-run-after.log` | authoritative isolated run, 38/40 |
| `docs/revamp/logs/01-homepage-e2e/bare-playwright-before.log` | pre-fix bare-Playwright run (16 failures; 14 real + 2 rate-limit/port artefacts) |
| `docs/revamp/logs/01-homepage-e2e/visual-community-diff.txt` | community `h2` measurement that blocks the 2 desktop visual tests |

**Not modified** (owned but needed no change): `homepage-visual.spec.ts`,
`image-loader.ts`, `HomeSocialLinks.vue`, `social.vue`,
`components/home/**`, `utils/home-content.ts`,
`tests/{progressive-image,image-loader,public-home}.test.ts`.

Throwaway probe scripts live in `.tools/` (not repo source, safe to delete):
`homefix-probe.mjs`, `homefix-probe-archive.mjs`, `homefix-diag.mjs`,
`homefix-edge.mjs`, `homefix-band.mjs`, `homefix-band2.mjs`,
`homefix-diffpix.mjs`, `homefix-dump.mjs`, `homefix-rle.mjs`,
`homefix-offset.mjs`, `homefix-pin.mjs`, `homefix-community.mjs`,
`homefix-h2.mjs`, and the `.tools/homefix-*.log` files.

## 3. Commands actually run, and their results

All under `. .tools/env.sh` (Node 24.15.0 / pnpm 11.25.0).

| # | Command | Result |
| --- | --- | --- |
| 1 | `cd web && E2E_PORT_BASE=3200 ../node_modules/.bin/playwright test tests/e2e/homepage.spec.ts tests/e2e/homepage-visual.spec.ts tests/e2e/social-join.spec.ts --reporter=list` (before any change) | **16 failed, 24 passed** (bare Playwright, 8 workers) |
| 2 | `mkdir .tools/build.lock` → `pnpm -r build` → release | attempt 1 failed on a **peer** file (`server/api/bff/guest/events/draft.post.ts` → missing `utils/bff-auth-context`); attempt 2 failed on another peer file (`web/shared/markdown.ts` resolution from the cached `.nuxt`); attempt 3 **succeeded** |
| 3 | same three specs, bare Playwright, after the code fixes | 15 failed, 23 passed — desktop clean apart from the visual pair; **all mobile failures were rate-limiter false negatives** (the lead's warning) |
| 4 | `E2E_PORT_BASE=3200 node web/scripts/e2e-isolated.mjs tests/e2e/homepage.spec.ts tests/e2e/homepage-visual.spec.ts tests/e2e/social-join.spec.ts --max-per-batch 2` | **passed 38/40, flaky 0, failed 2, skipped 0** (20 shards) — the 2 failures are `desktop::homepage-visual.spec.ts::19:3` light and dark |
| 5 | `cd web && ../node_modules/.bin/vitest run tests/progressive-image.test.ts tests/image-loader.test.ts tests/public-home.test.ts` | **34/34 passed** (3 files) |
| 6 | `cd web && ../node_modules/.bin/eslint <owned files>` | **0 errors**, 15 pre-existing `vue/html-self-closing` warnings (the repo baseline) |

Not run: `nuxt typecheck`, `pnpm -r lint/test/typecheck` (lead-owned gates).

### Per-test before/after (the 14 recorded failures)

Before = the lead's recorded run (`now-e2e-isolated.log`, 26/40 in these three
specs). After = command #4.

| Spec:test | Project | Before | After |
| --- | --- | --- | --- |
| `homepage-visual.spec.ts` light layout | desktop | fail (`about` pixels) | **fail** — `community` bounds differ, see §4.1 |
| `homepage-visual.spec.ts` dark layout | desktop | fail (`about` pixels) | **fail** — same cause |
| `homepage-visual.spec.ts` light layout | mobile | fail | **pass** |
| `homepage-visual.spec.ts` dark layout | mobile | fail | **pass** |
| `homepage.spec.ts` fetches the hero image exactly once | desktop | fail (strict mode, 3 elements) | **pass** |
| `homepage.spec.ts` fetches the hero image exactly once | mobile | fail (strict mode) | **pass** |
| `homepage.spec.ts` falls back to the original when the thumbnail is missing | desktop | fail (`src` still `-thumb.webp`) | **pass** |
| `homepage.spec.ts` falls back … thumbnail missing | mobile | fail | **pass** |
| `homepage.spec.ts` keeps the archived archive retry state | desktop | fail (strict mode) | **pass** |
| `homepage.spec.ts` keeps the archived archive retry state | mobile | fail | **pass** |
| `social-join.spec.ts` join page renders group details without JavaScript | desktop | fail (heading/strict) | **pass** |
| `social-join.spec.ts` join page renders group details without JavaScript | mobile | fail | **pass** |
| `social-join.spec.ts` join page shows the QR failure state and retries it | desktop | fail (state never appears) | **pass** |
| `social-join.spec.ts` join page shows the QR failure state and retries it | mobile | fail | **pass** |

Two further tests failed in my own pre-fix run and are now green:
`homepage.spec.ts:18` "is readable … with JavaScript disabled" (both projects —
it failed on `ECONNREFUSED 127.0.0.1:3181`, the hardcoded upstream port) and
`homepage.spec.ts:255` "reduced motion keeps the freeze static" (desktop; flaky,
green in the isolated run).

## 4. Unresolved limitations and deviations

### 4.1 BLOCKER — the 2 desktop visual tests need a file I do not own

`homepage-visual.spec.ts` on **desktop** now fails with a *layout* assertion, not
a pixel difference:

```
region bounds differ from the archived site
  - "height": 579.609   (archive, community section)
  + "height": 592.359   (nuxt)
```

Root cause, measured in the browser (see `visual-community-diff.txt`): the
community heading

```html
<h2 class="club-display mt-3 text-2xl font-semibold leading-relaxed sm:text-3xl">幻想乡的下一页，和我们一起写。</h2>
```

| | font-size | line-height | box height |
| --- | --- | --- | --- |
| archived (`frontend/dist`, Tailwind 3) | 30px | **36px** | 36 |
| nuxt (Tailwind 4) | 30px | **48.75px** | 48.75 |

The archived stylesheet emits `.leading-relaxed{line-height:1.625}` and, inside
the `@media (min-width:640px)` variant block, `.sm\:text-3xl{font-size:1.875rem;line-height:2.25rem}` —
the variant is emitted later, so it wins. Tailwind 4 instead routes the line
height through `--tw-leading`, which `leading-relaxed` sets, so `leading-relaxed`
wins at every breakpoint. Below `sm` the two agree (that is why the **mobile**
comparison passes).

This markup is in `web/app/pages/index.vue`, which `.tools/brief-homefix.md`
explicitly forbids this workstream to edit ("If a fix genuinely needs one of
them, report it instead"), and the cascade itself is the design-system layer
(`web/app/assets/css/**`, also not mine). Two candidate fixes for the owner:

1. systemic: make the `sm:`-variant `text-*` utilities reset `--tw-leading`, so
   a variant font-size keeps its own line-height as in Tailwind 3;
2. minimal, per-element: add `sm:leading-9` (2.25rem = 36px) to that one `h2`,
   which reproduces the archived rendering at both breakpoints without touching
   the sub-`sm` behaviour.

Option 2 was **verified without editing the file**, by setting the same computed
line height on the live element:

```
APP community  before:                            section 592.359375, h2 48.75, line-height 48.75px
APP community  with line-height forced to 2.25rem: section 579.609375, h2 36,    line-height 36px
APP community  below sm (leading-relaxed kept):    section 592.359375, h2 48.75, line-height 48.75px
archived target:                                   section 579.609375, h2 36,    line-height 36px
```

i.e. the whole 12.75px difference is that one line-height, and matching it makes
the bounds identical — which is what the visual comparison asserts before it
compares any pixel.

Note this is very likely not limited to this element: any `sm:text-*` combined
with `leading-*` on the same element has the same TW3→TW4 behaviour, so the
public-pages and events batches should be checked for it too.

### 4.2 The capture protocol changed (deliberate, please second-guess)

`compareRegion` now pins both regions to the viewport origin
(`position: fixed; top: 0; left: 0; width: 100%; z-index: 9999`) before
capturing, exactly as `layout.spec.ts` already does for the footer, and compares
a `floor(rect × dpr)` crop of the raw capture.

Why it was necessary — evidence:

- `about` differed by exactly **1 pixel** (`differingPixels: 1`), in row 1 of a
  1280×706 capture, while the two sections' geometry was identical
  (`y=1285.890625, h=704.625` on both sides).
- A locator screenshot of a region far down the page is a document-space
  capture. I measured its origin: locator row 0 = document y 1285, i.e.
  `floor(box.y + scrollY)`. The capture is 706 rows for a 704.625-tall box, so
  it starts on a partial row.
- The differing pixels are the fixed navbar composited into that capture at the
  page's scroll offset. The two pages scroll to **different** offsets (their
  total heights differ, 3659 vs 3672), so the navbar lands on different rows and
  its (blue, antialiased) edge lands at a different x. A full-page capture of
  document y 1276–1295 is byte-identical between the two pages.
- The brief's prescribed crop alone would **not** have fixed this: the artefact
  is at the *top* of the capture, and `floor(704.625) = 704` rows from the
  top-left still include row 1. The pinning step is what removes it; the crop is
  the accompanying hygiene the brief asked for.

Verified layout-neutral: pinning changed no region's box on either page
(`1280×704.625 → 1280×704.625`, etc.), and the archive and nuxt bounds are now
asserted equal before any comparison, so a real layout difference fails loudly
(the `community` case above proves that assertion bites).

If the lead prefers a protocol that does not touch the page styles, the
alternative is to scroll both pages to an identical offset before capture — but
Playwright's own scroll-into-view overrides it for any region taller than the
viewport (e.g. `archive`, 730px on desktop and 1627px on mobile), so it is not
deterministic.

### 4.3 Test defects fixed (with justification)

- **`openNavLink` strict-mode violation** — `getByRole('link', { name })` matches
  by *substring*, so `首页` also matched the wordmark
  (`aria-label="桂航绯想天同好会首页"`) and the footer link: 3 elements. The page
  legitimately renders the same destination three times; scoping to the primary
  navigation with `exact: true` is the fix, not changing the page.
- **thumbnail 404 route never matched** — `**/uploads/*-thumb.webp` cannot match
  the nested archived path `/uploads/img/activity/3/cover-thumb.webp`, because a
  single `*` does not cross `/` (verified against Playwright's
  `globToRegexPattern`). The thumbnail was therefore never missing and the
  assertion was testing nothing. Widened to `**/uploads/**/*-thumb.webp`; the
  assertion itself is unchanged.
- **no-JS group number** — `getByText('123456789', { exact: true })` also matched
  the footer's copy; scoped to `getByRole('main')`.

### 4.4 Product defects fixed

- **QR failure state (join.vue)** — the server renders the QR from the config it
  already fetched, so the image request can 404 *before* hydration attaches
  `@error`; the event is never delivered and `二维码暂时未能显示` never appeared.
  The archived page never hit this because it only rendered the image after a
  client-side config fetch. Fixed by adopting the element's own state on mount.
- **Thumbnail fallback (ProgressiveImage.vue)** — with the route glob corrected,
  the first archive card stayed `data-image-managed="true"` / `data-image-state="idle"`
  forever: the browser had already finished the server-rendered thumbnail with a
  404 (Chromium's native lazy-load distance is larger than the component's
  `600px` observer margin), so the element never fires `error` again and the
  observer never reached it. `onMounted` now enters the loader when the element
  is `complete` but has no natural width, which drives the documented
  thumbnail→original fallback.

### 4.5 Environment / process

- The checkout was **unbuildable for ~40 minutes** because of the two peer
  batches' uncommitted files (missing `web/server/utils/bff-auth-context.ts`,
  then `web/shared/markdown.ts` resolution). Both peers fixed their own trees;
  my third build attempt succeeded. Two failed `pnpm -r build` attempts
  destroyed `web/.output` in between, so nothing could run E2E until then.
- The build lock was removed by another agent while my run held it (my
  `rmdir` on release reported "No such file or directory"). Not mine to police,
  but the lead should know the lock is not currently respected by everyone.
- Bare Playwright with 8 workers produces **false** "element not found" failures
  from the nuxt-security rate limiter; only the isolated runner's numbers are
  meaningful.

## 5. How to re-verify

```sh
cd /e/Taropoi/workspace/GuatSWR_Website
. .tools/env.sh

# unit tests (no shared state)
cd web && ../node_modules/.bin/vitest run tests/progressive-image.test.ts \
  tests/image-loader.test.ts tests/public-home.test.ts && cd ..

# build under the lock (release even on failure)
until mkdir .tools/build.lock 2>/dev/null; do sleep 15; done
pnpm -r build; rmdir .tools/build.lock

# authoritative E2E
E2E_PORT_BASE=3200 node web/scripts/e2e-isolated.mjs \
  tests/e2e/homepage.spec.ts tests/e2e/homepage-visual.spec.ts \
  tests/e2e/social-join.spec.ts --max-per-batch 2
```

Expected: 34/34 unit tests; **38/40** E2E, with
`desktop::homepage-visual.spec.ts::19:3` light and dark failing on
`region bounds differ from the archived site` (community `579.609` vs `592.359`)
until §4.1 is fixed by the owner of `web/app/pages/index.vue` or the design
system. After that fix both should reach zero differing pixels with no mask and
no tolerance change.
