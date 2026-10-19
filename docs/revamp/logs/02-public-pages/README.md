# Workstream 02 — public prose pages (`/activities`, `/activity/:id`, `/members`, `/history`, `/logs`)

## 1. Scope

Integrate the already-written public-pages batch into the primary checkout,
verify it, and put its three content routes on the cached public-data wrappers.
This is an **integration** workstream: the batch was copied, not rewritten.

| | |
| --- | --- |
| Primary checkout | `E:/Taropoi/workspace/GuatSWR_Website` |
| Branch / base revision | `revamp/nuxt-foundation` at `0954b8a` |
| Batch source worktree | `C:/Users/water/.codex/worktrees/revamp-public-pages/GuatSWR_Website` at `c4d6694` |
| Runtime | `.tools/env.sh` — Node 24.15.0, pnpm 11.25.0 |
| E2E port base | `E2E_PORT_BASE=3400` (app 3400, fixture upstream 3481, archived SPA 5474) |
| Batch's own report | `docs/revamp/PUBLIC-PAGES.md` (copied here as one of the 56) |
| Lead briefs read | `.tools/brief-pages.md`, `.tools/claude-pages-correction4.md`, `.tools/agent-protocol.md` |

The batch declares itself source-only: every test in it was written but never
executed. It arrived with **8 failing unit assertions** and **4 lint errors**.

## 2. Exact file inventory

### 2a. Copied verbatim (no edit after the copy) — 37 files

| Path | State | Note |
| --- | --- | --- |
| `docs/revamp/PUBLIC-PAGES.md` | new | verbatim from the batch worktree |
| `web/app/components/ImageLightbox.vue` | new | verbatim from the batch worktree |
| `web/app/components/ParliamentChart.vue` | new | verbatim from the batch worktree |
| `web/app/components/PublicPagination.vue` | new | verbatim from the batch worktree |
| `web/app/components/SafeMarkdown.vue` | new | verbatim from the batch worktree |
| `web/app/components/SafeMarkdownNode.vue` | new | verbatim from the batch worktree |
| `web/app/components/SafeMarkdownPre.vue` | new | verbatim from the batch worktree |
| `web/app/composables/usePublicPageSeo.ts` | new | verbatim from the batch worktree |
| `web/app/utils/beijing-time.ts` | new | verbatim from the batch worktree |
| `web/app/utils/clipboard.ts` | new | verbatim from the batch worktree |
| `web/app/utils/history.ts` | new | verbatim from the batch worktree |
| `web/app/utils/logs.ts` | new | verbatim from the batch worktree |
| `web/app/utils/members.ts` | new | verbatim from the batch worktree |
| `web/app/utils/parliament.ts` | new | verbatim from the batch worktree |
| `web/app/utils/public-image.ts` | new | verbatim from the batch worktree |
| `web/app/utils/public-pagination.ts` | new | verbatim from the batch worktree |
| `web/app/utils/public-seo.ts` | new | verbatim from the batch worktree |
| `web/app/utils/safe-markdown-render.ts` | new | verbatim from the batch worktree |
| `web/public/icons/env/SOURCES.md` | new | verbatim from the batch worktree |
| `web/public/icons/env/android-22c55e.svg` | new | verbatim from the batch worktree |
| `web/public/icons/env/apple-111827.svg` | new | verbatim from the batch worktree |
| `web/public/icons/env/apple-6b7280.svg` | new | verbatim from the batch worktree |
| `web/public/icons/env/brave-f97316.svg` | new | verbatim from the batch worktree |
| `web/public/icons/env/firefox-ff7139.svg` | new | verbatim from the batch worktree |
| `web/public/icons/env/generic-browser-64748b.svg` | new | verbatim from the batch worktree |
| `web/public/icons/env/generic-desktop-64748b.svg` | new | verbatim from the batch worktree |
| `web/public/icons/env/generic-device-64748b.svg` | new | verbatim from the batch worktree |
| `web/public/icons/env/gnome-64748b.svg` | new | verbatim from the batch worktree |
| `web/public/icons/env/googlechrome-4285f4.svg` | new | verbatim from the batch worktree |
| `web/public/icons/env/linux-7c3aed.svg` | new | verbatim from the batch worktree |
| `web/public/icons/env/opera-ff1b2d.svg` | new | verbatim from the batch worktree |
| `web/public/icons/env/qq-12b7f5.svg` | new | verbatim from the batch worktree |
| `web/public/icons/env/robotframework-0ea5e9.svg` | new | verbatim from the batch worktree |
| `web/public/icons/env/safari-2563eb.svg` | new | verbatim from the batch worktree |
| `web/server/utils/highlight.ts` | new | verbatim from the batch worktree |
| `web/server/utils/markdown.ts` | new | verbatim from the batch worktree |
| `web/server/utils/member-sort.ts` | new | verbatim from the batch worktree |
| `web/shared/content.ts` | new | verbatim from the batch worktree |
| `web/tests/e2e/public-pages.spec.ts` | new | verbatim from the batch worktree |
| `web/tests/public-clipboard.test.ts` | new | verbatim from the batch worktree |
| `web/tests/public-markdown-server.test.ts` | new | verbatim from the batch worktree |
| `web/tests/public-members-sort.test.ts` | new | verbatim from the batch worktree |

### 2b. Copied, then edited here — 19 files

| Path | State | Note |
| --- | --- | --- |
| `web/app/pages/activities.vue` | new | copied, then `eslint --fix` style only (§3d) |
| `web/app/pages/activity/[id].vue` | new | copied, then `eslint --fix` style only (§3d) |
| `web/app/pages/history.vue` | new | copied, then `eslint --fix` style only (§3d) |
| `web/app/pages/logs.vue` | new | copied, then `eslint --fix` style only (§3d) |
| `web/app/pages/members.vue` | new | copied, then control-char predicate + style (§3d) |
| `web/app/utils/public-query.ts` | new | copied, then `parsePageParam` + control-char predicate (§3b.2, §3d) |
| `web/server/api/content/activity/[id].get.ts` | new | copied, then cached wrapper (§3a) |
| `web/server/api/content/history.get.ts` | new | copied, then cached wrapper (§3a) |
| `web/server/api/content/members.get.ts` | new | copied, then cached wrapper (§3a) |
| `web/shared/markdown.ts` | new | copied, then `img` drop + control-char predicate + dead assignment (§3b.1, §3d) |
| `web/tests/e2e/support/public-pages.ts` | new | copied, then port derivation (§3e) |
| `web/tests/public-pages.test.ts` | new | copied, then assertions corrected (§3c) |
| `web/tests/public-render.test.ts` | new | copied, then assertion corrected (§3c) |
| `web/app/utils/safe-markdown-render.ts` | new | copied, then `#shared` alias (§3f) |
| `web/app/utils/public-image.ts` | new | copied, then `#shared` alias (§3f) |
| `web/app/utils/members.ts` | new | copied, then `#shared` alias (§3f) |
| `web/server/utils/markdown.ts` | new | copied, then `#shared` alias (§3f) |
| `web/tests/public-markdown-highlight.test.ts` | new | copied, then assertion corrected (§3c) and `#shared` alias (§3f) |

### 2c. Created by this workstream

| Path | State | Note |
| --- | --- | --- |
| `docs/revamp/logs/02-public-pages/README.md` | new | this file |
| `docs/revamp/logs/02-public-pages/evidence.json` | new | machine-readable results |
| `docs/revamp/logs/02-public-pages/vitest-scoped-before-fixes.log` | new | raw vitest output before the fixes |
| `docs/revamp/logs/02-public-pages/vitest-scoped-after-fixes.log` | new | raw vitest output after the fixes |
| `docs/revamp/logs/02-public-pages/eslint-scoped-before-fixes.log` | new | raw eslint output before the fixes |
| `docs/revamp/logs/02-public-pages/build.log` | new | raw `pnpm -r build` output (the failing attempt and the green one) |
| `docs/revamp/logs/02-public-pages/e2e-isolated.log` | new | raw console output of the isolated E2E runner |
| `docs/revamp/logs/02-public-pages/e2e-public-pages.log` | new | raw output of the invalid 8-worker E2E run (kept as a record, §5d) |

**No file that already existed in the primary checkout was modified.** Before
copying, every one of the 56 source paths was tested for existence in the
primary and **none** existed; after copying, all 56 were confirmed
byte-identical to the worktree source with `cmp`. `git status --porcelain -uall`
in the primary lists exactly those 56 new files plus the pre-existing
`web/.e2e-isolated/**` artefacts owned by another worker.

The four tracked files the brief warns about (`web/app/pages/index.vue`,
`web/app/utils/image-url.ts`, `web/app/utils/theme.ts`,
`web/app/utils/dialog-reka.ts`) are **not** in the batch's untracked list and
were never copied.

## 3. Edits made after the copy, and why

### 3a. Contract fix the batch does not contain (lead-mandated step 3)

`docs/revamp/CACHE.md` requires every server-side public composition to read
through the cached wrappers. The batch's three content routes called the raw
readers. Changed:

- `web/server/api/content/activity/[id].get.ts` — `readActivity` → `readCachedActivity`
- `web/server/api/content/history.get.ts` — `readHistory` → `readCachedHistory`
- `web/server/api/content/members.get.ts` — `readMembers` → `readCachedMembers`
  (`parseSchoolQuery` still comes from `server/utils/public-read.ts`)

Imports now come from `server/utils/public-data.ts`. Response shapes
(`ActivityContentResponse` / `HistoryContentResponse` / `MembersContentResponse`
from `#shared/content`) and the 404/502 propagation are unchanged: the cached
wrappers are `async`, so they resolve with the same projected DTO or reject with
the reader's error, exactly like the raw readers.

`#shared` resolution is confirmed active: `web/tsconfig.json` references
`./.nuxt/tsconfig.shared.json`, and `web/shared/` contains only the batch's two
files. The types they need are exported by `packages/shared/src/public.ts`:
`PublicActivity`, `PublicHistoryEntry`, `PublicMember` (used by
`web/shared/content.ts`) and the rest of the `Public*` set.

### 3b. Two implementation bugs the never-run tests exposed

Both were fixed in the implementation, not by relaxing the test.

1. **`web/shared/markdown.ts` — an `<img>` with an undisplayable source was
   still emitted.** `sanitizeProps('img', …)` returned `{}` when `safeImageSrc`
   rejected the source, so the element survived as an attribute-less `<img>`
   that the browser paints as a broken image. Two independent tests in the
   batch (`tests/public-pages.test.ts` "drops images and links whose sources are
   unsafe", `tests/public-markdown-server.test.ts` "renders raw HTML links and
   images through the allowlist") both assert the element is gone, and
   `docs/revamp/PUBLIC-PAGES.md` §5 says a remote origin is "dropped instead of
   emitted". The sanitizer now returns `null` for an `img` whose sanitized props
   carry no `src`. A displayable image is unaffected — a new assertion in
   `tests/public-pages.test.ts` pins that down.
2. **`web/app/utils/public-query.ts` — `?page=02` answered 400.** The regex was
   `^[1-9][0-9]{0,5}$`, so a leading zero was rejected. The documented contract
   (`docs/revamp/PUBLIC-PAGES.md`, "Status codes") is that a `?page=` that is
   *not a positive integer* is 400, and `02` is a positive integer; the batch's
   own test lists the invalid values (`0`, `-1`, `1.5`, `abc`, `1e3`, ` `,
   `page=2`) and deliberately does **not** include `02`. Leading zeros are now
   accepted and normalized; `0`, negatives, fractions, exponents and non-digits
   still return `null`. **This is a judgement call — see §6.1.**

### 3c. Test corrections (tests that were factually wrong about the framework or the archive)

| Test | Was | Now | Why |
| --- | --- | --- | --- |
| `tests/public-markdown-highlight.test.ts` | `expect(JSON.stringify(nodes)).toContain('const answer')` | asserts flattened text contains `const answer = 42 // comment` | Shiki emits one `<span>` per token, so the source text is split across sibling text nodes and never appears contiguously in the serialized tree. Every token/colour assertion around it is unchanged. |
| `tests/public-pages.test.ts` (tag allowlist) | `isSafeMarkdownTag('input') === true` | `=== false` | Stale pre-P4 expectation. After P4 `input` is deliberately *outside* the generic allowlist; the browser renderer admits exactly one inert checkbox shape through its own closed branch (`safeTaskCheckboxProps`) checked **before** the generic allowlist. The sibling `tests/public-render.test.ts` checkbox tests (which pass) prove that branch works. |
| `tests/public-pages.test.ts` (icon rows) | `environmentIconUrl('Android', 'device')` → the android mark | → `generic-device-64748b.svg`, plus a new `('Android', 'os')` assertion | The archived table is authoritative: `deviceIconList` in `frontend/src/views/public/Logs.vue` has keywords desktop/pc/laptop/computer, mobile/phone/smartphone, tablet/ipad, bot/spider/crawler — **no** `android`. `android` is an *os* keyword and keeps its real mark there. |
| `tests/public-pages.test.ts` ("never emits an external environment icon") | asserted `environmentIconUrl(...) === null` for every row | asserts every row matches `^/icons/env/[a-z0-9.-]+\.svg$` | Self-contradictory: the test directly above it asserts the same calls return `/icons/env/...` paths. The property that matters is "same-origin, never a remote origin"; the rewritten assertion pins that down and also proves no row is left empty. |
| `tests/public-render.test.ts` (refused tags) | `expect(await render(...)).toBe('')` | `toBe('<!---->')` | The renderer returns `null` for a refused node, which Vue serializes as its empty comment placeholder. Verified directly against `vue/server-renderer`: `null` → `'<!---->'`, `''` → `''`. The assertion still proves no element markup and no subtree text is emitted; it is pinned to the exact placeholder rather than loosened. `null` is also the hydration-stable choice (a comment node round-trips; an empty text node does not). |

### 3d. Lint

Scoped `eslint` on all 39 owned source/test files reported **4 errors**
(3 × `no-control-regex`, 1 × `no-useless-assignment`) and 28 warnings. The
primary checkout's own files lint clean, so this was a regression introduced by
the batch.

- The three control-character regexes (`app/pages/members.vue`,
  `app/utils/public-query.ts`, `shared/markdown.ts`) were replaced by an
  explicit code-point predicate (`codePoint < 0x20 || codePoint === 0x7f`) with
  **identical semantics** — no regex literal, so no `eslint-disable` was needed.
  `stripControlCharacters` is exported from `app/utils/public-query.ts` and
  reused by `members.vue`.
- `shared/markdown.ts` — `let decoded = raw` was dead (both `try` and `catch`
  assign); changed to a definite-assignment `let decoded: string`.
- The 28 warnings were all `vue/html-self-closing` (27) and
  `vue/attributes-order` (1) in the five page templates. Fixed with scoped
  `eslint --fix`; the resulting diff is **purely** `<div></div>` → `<div />`
  and one attribute reorder, verified by diffing each file against the worktree
  original. These are warnings, so they would not have failed `eslint .`, but
  the primary baseline is warning-free.

### 3e. E2E support: ports

`web/tests/e2e/support/public-pages.ts` hardcoded
`ARCHIVE_ORIGIN = 'http://127.0.0.1:5174'` and
`FIXTURE_ORIGIN = 'http://127.0.0.1:3181'`. `web/playwright.config.ts` derives
all three ports from `E2E_PORT_BASE`, so on this workstream's assigned base
(3400) both origins pointed at nothing. Rewritten to the same derivation the
sibling `support/public-parity.ts` and `support/events-parity.ts` already use
(`portBase + 2074` for the archived SPA, `portBase + 81` for the fixture
upstream), with the same explanatory comment.

### 3f. `#shared` alias instead of relative paths (lead-directed)

`pnpm -r build` failed with

```
RollupError: Could not resolve "../../../../../web/shared/markdown.ts"
  from "node_modules/.cache/nuxt/.nuxt/dist/server/_nuxt/usePublicPageSeo-*.js"
```

`web/shared/**` sits outside Vite's app root, so a relative import of it is
emitted into the chunk as a path Nitro cannot resolve. Five files were switched
to Nuxt's `#shared/...` alias (the rest of the batch already used it):

- `web/app/utils/safe-markdown-render.ts` (2 imports)
- `web/app/utils/public-image.ts` (1)
- `web/app/utils/members.ts` (1)
- `web/server/utils/markdown.ts` (2)
- `web/tests/public-markdown-highlight.test.ts` (2)

The lead added matching `#shared` / `~` aliases to `web/vitest.config.ts` (not
edited here) so unit tests resolve them too; the now-obsolete "relative so the
focused unit tests can load this module without a Vitest alias" comments were
replaced with the reason the alias is required.

Three other test files still import the shared directory relatively
(`tests/public-pages.test.ts`, `tests/public-render.test.ts`,
`tests/public-markdown-server.test.ts`). They are **not** build offenders -
test files are never bundled - so they were left alone as the lead scoped this
change to five files. Switching them is a cosmetic follow-up.

### 3g. Type errors (`nuxt typecheck`, lead-reported)

Two root causes, both fixed at the source rather than by widening to `unknown`
or casting at nine call sites:

1. **`web/app/utils/public-query.ts`** - `QueryValue` was
   `string | string[] | null | undefined`, but vue-router 5 types
   `route.query[key]` as `LocationQueryValue | LocationQueryValue[] | undefined`
   (`LocationQueryValue = string | null`), so `(string | null)[]` was not
   assignable and nine call sites in `logs.vue` / `members.vue` /
   `activities.vue` failed. `QueryValue` is now
   `string | null | undefined | (string | null)[]`. This is a **type-only**
   change: every parser still validates the untrusted value at runtime, and no
   call site was cast. (A `readonly (string | null)[]` variant was tried first
   and rejected: TypeScript's `Array.isArray` does not narrow a `readonly`
   array, which broke `queryValue`'s return type.)
2. **`web/shared/markdown.ts`** - `SafeCheckboxProps` was an `interface`, and an
   interface has no implicit index signature, so it was not assignable to
   `SafeMarkdownProps` (`Readonly<Record<string, string | number | boolean>>`)
   at both construction sites (the `taskCheckbox` element and the `input` case
   of `sanitizeProps`). It is now an object **type alias**, which does get an
   implicit index signature. No widening to `unknown`.

## 4. Commands actually run, with results

All commands were run from the primary checkout after `. .tools/env.sh`.

| # | Command | Result |
| --- | --- | --- |
| 1 | `git status --porcelain -uall` in the worktree | 56 untracked files, 0 tracked modifications |
| 2 | existence scan of all 56 paths in the primary | 0 collisions |
| 3 | copy, then `cmp` every copied file against its source | 56 copied, 56 byte-identical |
| 4 | `cd web && ../node_modules/.bin/vitest run tests/public-pages.test.ts tests/public-render.test.ts tests/public-clipboard.test.ts tests/public-markdown-highlight.test.ts tests/public-markdown-server.test.ts tests/public-members-sort.test.ts` (before fixes) | **exit 1** — 4 files failed, 8 assertions failed, 56 passed (64 total) |
| 5 | same vitest command (after §3b/§3c) | **exit 0** — 6 files passed, 64 tests passed |
| 6 | `cd web && ../node_modules/.bin/eslint <39 owned files>` (before fixes) | **exit 1** — 4 errors, 28 warnings |
| 7 | same eslint command (after §3d) | **exit 0** — 0 errors, 0 warnings |
| 8 | `eslint --fix` on the five page templates, then `diff` each against the worktree original | only self-closing / attribute-order lines changed |
| 9 | `cd web && ../node_modules/.bin/vitest run <same six files>` (after the lint edits) | **exit 0** — 6 files passed, 64 tests passed |
| 10 | `vitest run` over all 12 `tests/public-*.test.ts` (scoped unit, no shared state) | first attempt **exit 1**: a worker fork crashed (`0xC0000409`) while running `tests/public-read.test.ts`; re-run **exit 0** — 12 files, 156 tests passed; `public-read.test.ts` alone: 42 passed |
| 11 | take `.tools/build.lock`, then `pnpm -r build` (lock released at 08:56:46) | **exit 1** — `RollupError: Could not resolve "../../../../utils/bff-auth-context" from "server/api/bff/guest/upload/avatar.post.ts"`; no `.output/server/index.mjs` was emitted |
| 12 | `#shared` alias fix (§3f), then `vitest run` on the six files + scoped eslint | **exit 0** — 64 passed; 0 lint errors |
| 13 | take `.tools/build.lock`, `pnpm -r build`, release (09:04:54 → 09:07:35) | **exit 0** — `.output/server/index.mjs` emitted; the guest workstream had removed its unresolved BFF routes in the meantime |
| 14 | `E2E_PORT_BASE=3400 ../node_modules/.bin/playwright test tests/e2e/public-pages.spec.ts` (8 workers — the run the lead flagged as invalid) | 19 passed, 27 failed, 2 skipped |
| 15 | `E2E_PORT_BASE=3400 node web/scripts/e2e-isolated.mjs tests/e2e/public-pages.spec.ts --max-per-batch 2` | **26 passed, 20 failed, 2 skipped**; the runner exits non-zero because both skips are undeclared |
| 16 | targeted `e2e-isolated … -g "members school filtering"` after the chart fix | mobile passed, desktop still failed (deterministic, twice) |
| 17 | standalone `tsc --noEmit --strict --noUncheckedIndexedAccess` over `shared/markdown.ts`, `app/utils/public-query.ts` and a vue-router query-shape probe | **exit 0** |
| 18 | `vitest run` on the six files and on all 12 `public-*` files, plus scoped eslint (after §3f/§3g) | **exit 0** — 64 and 156 passed; 0 lint errors |

Raw output: `vitest-scoped-before-fixes.log`, `vitest-scoped-after-fixes.log`,
`eslint-scoped-before-fixes.log` in this directory.

Only the batch's own six unit files plus `public-read.test.ts` (row 10) were
executed. No other suite in `web/tests/` imports a module this workstream
changed, so no other suite was affected by §3b/§3d.

**Not run by this workstream** (lead-owned, serialized gates): `nuxt prepare`,
`nuxt typecheck`, `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test`, and the
performance script. Type checking of the new server routes and pages is
therefore **unverified** here.

## 5. E2E (Playwright, `E2E_PORT_BASE=3400`)

**Isolated-run result: 26 passed, 20 failed, 2 skipped** (48 tests; desktop
14/9/1, mobile 12/11/1). Raw console output: `e2e-isolated.log`; per-batch JSON
reports and `summary.json` under `web/.e2e-isolated/2026-10-19T01-12-56-807Z/`.

The runner exits non-zero for two reasons, neither of which is a page defect:
its `DECLARED_SKIP_POLICY` is empty (by design) and two tests skip themselves.

### 5a. The 2 skips, explained

`code block copy > reports the real outcome for a denied clipboard and for a
working one` (desktop and mobile) calls
`test.skip(true, 'fixture activity content has no fenced code block')`. The
deterministic fixture activity has no fenced block, so the spec cannot observe
`.md-code` at all. That is the state the batch's own report documents ("a fenced
code block … would let the E2E observe the code chrome"); the fixture is the
data workstream's file, not this one's, so the skip is left in place. The
clipboard outcomes themselves are covered by `tests/public-clipboard.test.ts`
(6 tests, all passing). Adding a fence to the fixture would let this test run.

### 5b. Fixes applied to the spec/support after the first (8-worker) run

| Cause | Fix |
| --- | --- |
| `TypeError: The "cb" argument must be of type function` at `support/public-pages.ts:95` - `readFile` was imported from `node:fs`, whose `readFile` is the *callback* API, and awaited | import it from `node:fs/promises` (the same API the sibling `tests/fixtures/legacy.mjs` uses) |
| 5 failures from `getByText('Taropoi')` matching the member card **and** the layout footer's "Designed by Taropoi" (strict-mode violations and a wrong `toHaveCount(0)`) | member assertions scoped to the page body via a `memberBody(page)` helper, and the SSR assertions scoped to the `<main>` slice via `mainOf(html)` |
| `nested prose typography` compared `"25.200000000000003px"` (binary float of `16.8 * 1.5`) against the DOM's `"25.2px"` | expectations rounded to three decimals |
| the members chart was asserted on `/members?school=不存在学院`, where **neither** this page nor the archived one renders it (`v-if="parliamentData.length > 0"`, `frontend/src/views/public/Members.vue:240`) | the chart is now asserted on `/members` after the empty-filter check |

### 5c. Remaining failures (all unresolved)

**A. Visual parity with the archived site - 18 of the 20 failures.**
Whole-device-pixel crops, rect parity, zero differing pixels. Measured:

| Region | Result |
| --- | --- |
| `/activity/1` article (light + dark, desktop + mobile) | height 1571.031 (archive) vs 1532.109 (new) - 38.9 px shorter |
| `/history` timeline (light + dark, desktop + mobile) | height 1368 vs 1364.469 - 3.5 px shorter |
| `/members` grid (light, desktop + mobile) | 11 085 differing pixels |
| `/members` chart (dark, desktop + mobile) | 4 584 differing pixels |
| `/logs` table (light, desktop + mobile) | 4 010 differing pixels (mobile also fails rect parity: width differs) |
| `/logs` statistics panel (dark, desktop + mobile) | differing pixels |
| `/activities` grid (dark, mobile) | differing pixels |

These are genuine layout differences between the archived SPA and the migrated
pages, not harness artefacts: the isolated runner gives each batch fresh servers
and the same fixture on both sides, and the geometry failures are rect
mismatches measured before any pixel comparison. They are **not diagnosed** -
each needs a side-by-side layout investigation (computed styles of the region
on both pages). The nine replaced environment icons are *not* an explanation:
`support/public-pages.ts` serves the pinned local marks to the archived page for
exactly those CDN slugs, so both sides render identical bytes.

**B. `members school filtering` - desktop only, deterministic** (failed twice in
isolation, passes on mobile). `svg[role="img"]` is found and its `aria-label`
matches, but `locator('svg[role="img"]').first().locator('circle').first()` is
not found. A direct `curl` of the SSR HTML for `/members` shows exactly one
`role="img"` element and two `<circle>` seat marks, so the circles exist in the
server response; the desktop client must lose them after hydration. Not
diagnosed.

**C. `member school navigation updates the body and the canonical URL` - mobile
only**: `Test timeout of 30000ms exceeded`, in the client-side
filter -> all -> other navigation. Not diagnosed; it did not time out on
desktop.

### 5d. The earlier 8-worker run is not a valid signal

`e2e-public-pages.log` (8 workers against one production server) reported
19/27/2. The lead had already flagged that pattern as rate-limiter saturation.
It is kept only as a raw record; **every conclusion above comes from the
isolated runner**. That run also predates §3f and §3g, but both are type-only or
build-graph-only changes, so the executed build's runtime behaviour is
unchanged.

## 6. Unresolved limitations and deviations

### 6.1 Open decisions a reviewer should second-guess

1. **`parsePageParam` accepts leading zeros** (§3b.2). The alternative reading is
   that the canonical decimal form is part of the contract and `?page=02` should
   stay a 400. Nothing else in the batch depends on either choice.
2. **The `<img>` drop** (§3b.1) changes security-relevant code. The change is
   narrow (only an `img` whose `src` was rejected) and is covered by an explicit
   "a displayable image survives" assertion, but the lead may want to review it
   as a product decision rather than a bug fix.
3. **`toContain` on flattened text** in the highlight test (§3c) is a weaker
   *shape* of assertion than the original JSON-substring check, though it is the
   only form that can be true given Shiki's per-token spans.

### 6.2 Known limitations inherited from the batch (unchanged, deliberate)

1. **Highlight colours are `github-light` only.** The archived preview used
   `md-editor-v3`'s own light/dark palettes. Server tokens come from Shiki's
   `github-light`; the block background/radius still follow the archived page. A
   fenced block added to the fixture would make the prose parity comparison
   report that difference — the current fixture has none, so no comparison
   exercises it.
2. **Nine archived icon URLs are dead upstream** (`cdn.simpleicons.org` 404 for
   Edge/Windows/IE, Chromium, Yandex, UC, 360, ChromeOS and `devices`). Those
   rows use three locally authored `generic-*.svg` marks (and the Chrome mark for
   Chromium/ChromeOS). This is a **functional replacement, not the archived
   artwork**, and the parity comparison for those cells is expected to differ.
   `web/public/icons/env/SOURCES.md` records the mapping; the E2E support file's
   `ARCHIVED_ICON_FILES` serves the same bytes to the archived page so the
   comparison is deterministic rather than network-dependent.
3. **Two SEO helpers coexist.** The batch adds
   `app/composables/usePublicPageSeo.ts` (`buildPublicSeo` + a getter input)
   while the primary has `app/composables/usePublicSeo.ts`. All five migrated
   pages use the batch's helper; `SITE_NAME`/`DEFAULT_DESCRIPTION` are duplicated
   between `app/composables/usePublicSeo.ts` and `app/utils/public-seo.ts`. The
   P4 brief anticipated the SEO worker consolidating these; not done here
   because `usePublicSeo.ts` is outside this workstream's ownership.
4. **Legacy history descriptions** are parsed as Markdown with raw HTML passed
   through the allowlist (`<p>` survives), matching the archived rendering.
5. **Archived full-screen loaders** render only during client-side
   revalidation; redirect-to-list-on-error was replaced by real 404/502.

## 7. How to re-verify

```sh
cd /e/Taropoi/workspace/GuatSWR_Website
. .tools/env.sh

# 1. scoped unit suites (no shared state; safe to run at any time)
cd web && ../node_modules/.bin/vitest run \
  tests/public-pages.test.ts tests/public-render.test.ts tests/public-clipboard.test.ts \
  tests/public-markdown-highlight.test.ts tests/public-markdown-server.test.ts \
  tests/public-members-sort.test.ts
# expect: 6 files passed, 64 tests passed

# 2. scoped lint (39 owned files; expect exit 0, no output)
cd web && ../node_modules/.bin/eslint \
  app/pages/activities.vue "app/pages/activity/[id].vue" app/pages/history.vue \
  app/pages/logs.vue app/pages/members.vue app/components/ImageLightbox.vue \
  app/components/ParliamentChart.vue app/components/PublicPagination.vue \
  app/components/SafeMarkdown.vue app/components/SafeMarkdownNode.vue \
  app/components/SafeMarkdownPre.vue app/composables/usePublicPageSeo.ts \
  app/utils/beijing-time.ts app/utils/clipboard.ts app/utils/history.ts \
  app/utils/logs.ts app/utils/members.ts app/utils/parliament.ts \
  app/utils/public-image.ts app/utils/public-pagination.ts app/utils/public-query.ts \
  app/utils/public-seo.ts app/utils/safe-markdown-render.ts shared/content.ts \
  shared/markdown.ts server/utils/highlight.ts server/utils/markdown.ts \
  server/utils/member-sort.ts "server/api/content/activity/[id].get.ts" \
  server/api/content/history.get.ts server/api/content/members.get.ts \
  tests/public-pages.test.ts tests/public-render.test.ts tests/public-clipboard.test.ts \
  tests/public-markdown-highlight.test.ts tests/public-markdown-server.test.ts \
  tests/public-members-sort.test.ts tests/e2e/public-pages.spec.ts \
  tests/e2e/support/public-pages.ts

# 3. E2E (serialized; take the build lock first, release it afterwards)
until mkdir /e/Taropoi/workspace/GuatSWR_Website/.tools/build.lock 2>/dev/null; do sleep 15; done
cd /e/Taropoi/workspace/GuatSWR_Website && . .tools/env.sh && pnpm -r build
cd web && E2E_PORT_BASE=3400 ../node_modules/.bin/playwright test tests/e2e/public-pages.spec.ts
rmdir /e/Taropoi/workspace/GuatSWR_Website/.tools/build.lock
```

The lead owns acceptance. Nothing in this log is an acceptance claim.

## 8. Status

Source integration complete. `pnpm -r build` is **green** (the `#shared` alias
fix, §3f). Scoped unit suites (64 in the six assigned files, 156 across all
`public-*`) and scoped lint are **executed and green**, and the two type-error
root causes are fixed (§3g) with a standalone `tsc` run to back them.

The E2E spec has been executed through the isolated runner: **26 passed, 20
failed, 2 skipped**. The 2 skips are explained in §5a; 18 of the 20 failures are
undiagnosed visual-parity geometry/pixel differences between the archived SPA
and the migrated pages (§5c).

`nuxt typecheck` itself and the recursive gates were not run here (lead-owned),
so the page-level type fixes are verified only by the standalone probe.

Nothing here is an acceptance claim; the lead owns acceptance.
