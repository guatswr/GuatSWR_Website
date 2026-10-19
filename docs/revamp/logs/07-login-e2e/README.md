# 07 — login E2E failures

Checkout: primary `E:/Taropoi/workspace/GuatSWR_Website`, branch
`revamp/nuxt-foundation`, base commit `4ed54a8` plus the two peer batches'
uncommitted files. Assigned Playwright port base: `E2E_PORT_BASE=3970`.

## 1. Scope

Resolve the five recorded login E2E failures (`.tools/lead-login-e2e2.log`,
15 passed / 5 failed / 2 skipped of 22) without weakening an assertion, mask,
tolerance or snapshot:

| Identity | Project |
| --- | --- |
| `login.spec.ts:83` redirects a reloaded login page when a valid BFF session already exists | desktop + mobile |
| `login.spec.ts:181` focuses the first invalid field when client validation fails | desktop + mobile |
| `login.spec.ts:192` matches the archived login visuals on desktop | desktop (mobile passes) |

Everything ran through `web/scripts/e2e-isolated.mjs` on base 3970; the
lead-owned `web/playwright.config.ts` and `web/scripts/e2e-isolated.mjs` were
not touched.

## 2. Exact file inventory

### Modified

| Path | Change |
| --- | --- |
| `web/app/pages/login.vue` | submit button: `:disabled="!canSubmit \|\| isSubmitting \|\| verifying"` → `:disabled="isSubmitting \|\| verifying"` (+ comment); `submit()` now `await nextTick()` before `focusFirstInvalidField` (+ comment); `form.Subscribe` slot no longer destructures `canSubmit` |
| `web/tests/e2e/login.spec.ts` | the archived page's `**/uploads/**` requests are now proxied to the app origin (like `support/public-parity.ts#useUpstreamFixtures`), so both navbars render the same `badge_image` bytes |
| `web/tests/login-form.test.ts` | new characterization test: `canSubmit` is already `false` after a blur validation failure, before any submit |

### New

- `docs/revamp/logs/07-login-e2e/README.md` (this file)
- `docs/revamp/logs/07-login-e2e/evidence.json`
- `docs/revamp/logs/07-login-e2e/before-isolated.log` (the lead's recorded run)
- `docs/revamp/logs/07-login-e2e/before-batches/batch-{02,05,08,10}.log` (the four failing batches)
- `docs/revamp/logs/07-login-e2e/before-evidence/*` (error contexts, the desktop visual diff and the two logo crops)
- `docs/revamp/logs/07-login-e2e/after-isolated.log` (the isolated run after the fixes)
- `docs/revamp/logs/07-login-e2e/after-batches/batch-{02,05,08,10}.log`
- `docs/revamp/logs/07-login-e2e/after-evidence/reload-{desktop,mobile}-error-context.md` (the two remaining failures)
- `docs/revamp/logs/07-login-e2e/build-after.log`
- `docs/revamp/logs/07-login-e2e/entry-race-probe.log` (the `#entry` root-cause probe)

Throwaway probe scripts (not repo source) live in `.tools/tmp/login-probe/`
(import-map ordering) and `.tools/tmp/login-repro/` (`entry-probe.mjs` and the
earlier one-off probes).

### Not modified

`web/app/composables/useBffSession.ts`, `web/app/middleware/admin.ts`,
`web/app/utils/{bff-client,bff-session-core,bff-private-cleanups,login-background,login-form}.ts`,
`web/app/components/login/**`, `web/tests/{login-*,bff-*}.test.ts` (other than
`login-form.test.ts`), `web/nuxt.config.ts`, `web/playwright.config.ts`,
`web/scripts/e2e-isolated.mjs`, `web/tests/fixtures/**`.

## 3. Root causes

### 3.1 `login.spec.ts:181` (both projects) — the submit button is disabled before it can be clicked

Not a focus bug at all: the click never happens. TanStack Form 1.33.5 computes

```js
canSubmit = submissionAttempts === 0 && !isTouched && !hasOnMountError
         || !isValidating && !isSubmitting && isValid
```

so as soon as a field is **touched and invalid**, `canSubmit` is `false`. The
spec fills `bad user` into Username and then `x` into Password; moving focus to
Password fires Username's `onBlur` validator, which fails, so the form is
invalid *before* the submit button is ever pressed. The page bound
`:disabled="!canSubmit || isSubmitting || verifying"`, so the button was
disabled for the whole 30 s click retry.

Evidence: both error contexts show the form already invalid before the click
(`textbox "Username" [invalid]` plus the rendered `用户名仅允许…` alert) and
`button "登录系统" [disabled]`; the desktop trace resolves the locator to
`<button disabled type="submit" aria-busy="false">` and then retries with
`element is not enabled` until the 30 s test timeout (the mobile log prints the
same as 57 consecutive retries). `verifying` and `isSubmitting` are ruled out:
`/api/bff/auth/session` answered `{"authenticated":false}` in 14 ms and
`aria-busy` was `false`.

The archived page only ever disabled the button for `loading || verifying`
(`frontend/src/views/public/Login.vue`), and the documented design
(`docs/revamp/AUTH-LOGIN.md`) is that the per-field errors and the focus of the
first invalid field *replace* native validation bubbles — a path that requires
being able to submit invalid input.

Second, independent defect on the same test: `submit()` called
`focusFirstInvalidField(formElement.value)` in the `finally` of
`await form.handleSubmit()`, i.e. before Vue had flushed the `aria-invalid`
patch, so `querySelector('[aria-invalid="true"]')` found nothing and focus
stayed where the click left it.

Fixes: `:disabled="isSubmitting || verifying"` (archive parity; duplicate
submits are still prevented by `isSubmitting` and the in-flight label, which the
"blocks duplicate submits" test continues to cover) and `await nextTick()`
before the focus call.

### 3.2 `login.spec.ts:192` desktop — the two origins render different navbar logo bytes

The full-page comparison includes the navbar. On desktop (and only on desktop —
`ClubAvatar` is `hidden … lg:block`) the diff is a single 34 × 35 px blob at
`x ∈ [33, 66], y ∈ [14, 48]`: the club avatar.

- archive origin (`tests/fixtures/legacy.mjs` → frozen `frontend/dist`):
  `GET /uploads/img/config/badge.svg` → **404**, so `ClubAvatar` falls back to
  its bundled `/brand/group-avatar.webp` (the real emblem);
- app origin: `GET /uploads/img/config/badge.svg` → **200** (the public-data
  fixture's deterministic `SVG_BODY` placeholder), which is what the new app
  renders.

Both apps use the same component and the same `badge_image`, so this is a
fixture asymmetry, not an app difference: the spec aligned `/api/**` but not
`/uploads/**`, while every other archived comparison in this repo aligns both
(`support/public-parity.ts#useUpstreamFixtures` routes `**/api/**` *and*
`**/uploads/**` to the isolated upstream). The spec now routes the archive's
uploads to the app origin, which is where the new app reads the same asset.

### 3.3 `login.spec.ts:83` (both projects) — a global, pre-existing reload defect; NOT fixable in this workstream

The reloaded page renders Nuxt's own 500 page:

```
500 / Internal Server Error
Failed to resolve module specifier "#entry". Relative references must start with either "/", "./", or "../".
```

so `onMounted` never runs, `session.refresh()` is never called (the trace shows
no `/api/bff/auth/session` request after the reload) and the redirect to `/admin`
cannot happen. The session, the composable and the middleware are all fine: the
sibling test `keeps the session server-authoritative…` passes, and the trace
shows the `guatswr-next` cookie being sent on the reload.

The defect is not login-specific. Reproduced against the built app with a
standalone probe (`E2E_PORT_BASE=3970`, `tests/fixtures/auth-upstream.mjs`):

| Probe | Result |
| --- | --- |
| `/login`, `/`, `/members` — first load in a fresh context | page renders |
| same pages, `reload()` in the same context (warm HTTP cache) | **Nuxt 500 page** (`Failed to resolve module specifier "#entry"`) |
| same pages, `Network.setCacheDisabled(true)` then `reload()` | page renders |
| `/login` twice in one context, cache disabled | page renders |
| headless-shell and full Chromium | identical failure |

So it is a race between the document parse and the modulepreload fetches: on a
cold cache the preloaded chunks arrive after the parser has registered the
inline `<script type="importmap">`, on a warm cache they resolve first and
`#entry` is unresolvable at that moment. The SSR head emits the 26
`<link rel="modulepreload">` hints **before** the import map in both the page
and the SPA-shell documents, and delivering the same document instantly through
a Playwright route makes the reload pass. The import map itself is correct and
works afterwards (`await import('#entry')` from the error page resolves).

Corroboration: workstream 05 (`docs/revamp/logs/05-public-pages-e2e/README.md`
§5b) independently found the same defect and also assigns it to build/config.

Why only this test failed: Playwright gives every test a fresh
`BrowserContext`, so the first `page.goto()` in a test is always a cold load.
`login.spec.ts:83` is the only test in this spec that loads `/login` twice in
one context.

This lives in the Nuxt SSR head ordering / build configuration
(`web/nuxt.config.ts` is lead-owned) and cannot be fixed from any file this
workstream owns. It is reported as a blocker.

## 4. Commands actually run, and their results

All under `. .tools/env.sh` (Node 24.15.0 / pnpm 11.25.0).

| # | Command | Result |
| --- | --- | --- |
| 1 | `cd web && ../node_modules/.bin/vitest run tests/login-form.test.ts tests/login-form-utils.test.ts tests/login-background.test.ts tests/bff-client.test.ts tests/bff-session-core.test.ts tests/bff-private-cleanups.test.ts tests/bff-session-race.test.ts` | **7 files / 100 tests passed** (includes the new characterization test) |
| 2 | `cd web && ../node_modules/.bin/eslint app/pages/login.vue app/components/login tests/login-form.test.ts tests/login-form-utils.test.ts tests/login-background.test.ts tests/e2e/login.spec.ts` | clean |
| 3 | build-lock → `pnpm -r build` → `E2E_PORT_BASE=3970 node web/scripts/e2e-isolated.mjs tests/e2e/login.spec.ts --max-per-batch 2` → release | build exit 0 (1 m 11 s, `build-after.log`); **passed 18/22, flaky 0, failed 2, skipped 2** (`after-isolated.log`) |
| 4 | `node .tools/tmp/login-repro/entry-probe.mjs` (standalone, `E2E_PORT_BASE=3970`) | `entry-race-probe.log` — see §3.3 |
| 5 | `mkdir .tools/build.lock` had to wait ~24 min for a peer build+run (11:42 → 12:06); the lock was taken and released by the wrapper script (`trap … EXIT`), never removed by hand | ok |

## 5. Per-test before/after

Before = `.tools/lead-login-e2e2.log` (the recorded run, 15/5/2).
After = command #3, `after-isolated.log`: **passed 18/22, flaky 0, failed 2,
skipped 2** (the same two declared visual skips; no new skip).

| Spec:test | Project | Before | After |
| --- | --- | --- | --- |
| `login.spec.ts:181` focuses the first invalid field | desktop | fail — click retried 30 s against a disabled button | **pass** (`batch-05`: 2 passed, 18.1 s) |
| `login.spec.ts:181` focuses the first invalid field | mobile | fail — `locator.click: element is not enabled` | **pass** (`batch-10`: 2 passed, 17.3 s) |
| `login.spec.ts:192` matches the archived login visuals | desktop | fail — 863 differing pixels | **pass** (`batch-05`) |
| `login.spec.ts:83` redirects a reloaded login page | desktop | fail — 500 `#entry` page | **fail** — unchanged, same 500 page (`batch-02`) |
| `login.spec.ts:83` redirects a reloaded login page | mobile | fail — 500 `#entry` page | **fail** — unchanged, same 500 page (`batch-08`) |

The eleven other tests were already green and stayed green (including
`blocks duplicate submits while the first login is in flight`, which is the test
that covers the behaviour the removed `!canSubmit` gate used to share).

Raw per-batch logs: `before-batches/` and `after-batches/`.

## 6. Unresolved limitations and deviations

- §3.3 is unresolved and is the reason two of the five recorded failures remain.
- The `login.spec.ts:192` change alters the *test wiring* (an extra
  `archive.route('**/uploads/**')`), not an assertion, mask, tolerance or
  snapshot. A reviewer should second-guess it: the alternative reading is that
  the archived bundle's fallback to `/brand/group-avatar.webp` is "the archived
  rendering" and the new app should match it. That is rejected here because the
  fallback is caused by the frozen bundle not shipping `/uploads/**`, while the
  new app correctly renders the configured `badge_image`; every other archived
  comparison in the repo aligns the uploads for exactly this reason.
- The `#entry` reorder experiment (moving the import map to the start of the
  head) is *suggestive but not clean*: it was run through a Playwright route,
  and route interception alone also makes the reload pass. It is reported as a
  direction, not as a proven fix.
- Direction for the owner of §3.3: the import map must be registered before any
  module load is triggered, so the `<script type="importmap">` has to be emitted
  before the `<link rel="modulepreload">` hints. Nuxt's renderer pushes it first
  (`node_modules/nuxt/dist/runtime/server/renderer/index.js`, the
  `entryImportMapPath` block) but the emitted head has it after the 26 preload
  links, and unhead supports ordering with `tagPriority: 'before:<key>'`
  (`node_modules/unhead/dist/shared/unhead.D9VfQWNo.mjs`). That, a Nuxt patch, or
  disabling whatever reorders the head are the candidates; none was verified
  here because the head is rendered by the framework, not by an app file.

## 7. How to re-verify

```sh
cd /e/Taropoi/workspace/GuatSWR_Website
. .tools/env.sh

cd web && ../node_modules/.bin/vitest run \
  tests/login-form.test.ts tests/login-form-utils.test.ts tests/login-background.test.ts \
  tests/bff-client.test.ts tests/bff-session-core.test.ts

# take .tools/build.lock (mkdir, retry), build, run, release
cd /e/Taropoi/workspace/GuatSWR_Website && pnpm -r build
cd web && E2E_PORT_BASE=3970 node scripts/e2e-isolated.mjs tests/e2e/login.spec.ts --max-per-batch 2
```
