# Workstream 04 — authentication, BFF session, guest BFF restore

Round 1, 2026-10-19. Checkout `E:/Taropoi/workspace/GuatSWR_Website`, branch
`revamp/nuxt-foundation`, base commit `319e295`. Runtime pinned by
`.tools/env.sh` (Node 24.15.0, pnpm 11.25.0).

Source of the integrated code: the `revamp-auth` worktree
(`C:/Users/water/.codex/worktrees/revamp-auth/GuatSWR_Website`, based on
`1cfe6b8`), which had never been installed, built, typechecked, linted, tested
or run. Every file below was copied from it and then corrected where it did not
survive execution. Nothing was committed.

---

## 1. Scope

Integrate the session / identity / CSRF / login base of the auth worktree plus
the login client, restore the parked guest BFF, and run the suites that had
never run. Explicitly out of scope this round: the admin/account BFF API half of
the worktree (`api/bff/admin/**`, `api/bff/account/**`, `bff-admin-resources.ts`,
`bff-admin-upstream.ts`, `bff-protected.ts`, `web/shared/admin-contract.ts`,
`tests/admin-{contract,resources}.test.ts`, `docs/revamp/ADMIN-API.md`) — those
files were **not** copied, and a smoke check confirms `/api/bff/admin/**` and
`/api/bff/account/**` are 404 in the built server.

Owned and used this round: `packages/shared/src/index.ts` (the one delegated
task), and everything created by this workstream. Not edited:
`web/nuxt.config.ts`, `web/package.json`, `pnpm-lock.yaml`,
`web/vitest.config.ts`, `web/playwright.config.ts`, `docs/revamp/STATUS.md`,
`docs/revamp/CHECKLIST.md`.

## 2. Exact file inventory

### New — copied from the worktree, then corrected (see §3)

Shared contract:

- `packages/shared/src/auth.ts`
- `packages/shared/src/auth.test.ts`
- `packages/shared/src/admin.ts` (the three colliding row schemas were renamed — §3.1)
- `packages/shared/src/admin.test.ts` (same rename)

Server base (auth):

- `web/server/utils/bff-errors.ts`
- `web/server/utils/bff-session.ts`
- `web/server/utils/bff-identity.ts`
- `web/server/utils/bff-write.ts`
- `web/server/utils/bff-upstream.ts`
- `web/server/utils/bff-auth-service.ts`
- `web/server/utils/bff-auth-context.ts`
- `web/server/utils/bff-runtime.ts`
- `web/server/utils/bff-request-path.ts`
- `web/server/api/bff/auth/csrf.get.ts`
- `web/server/api/bff/auth/login.post.ts`
- `web/server/api/bff/auth/logout.post.ts`
- `web/server/api/bff/auth/session.get.ts`
- `web/server/plugins/bff-auth-guard.ts`
- `web/server/plugins/bff-session-hooks.ts`
- `web/types/auth.d.ts`
- `web/shared/auth.d.ts`

Login client:

- `web/app/pages/login.vue`
- `web/app/components/login/ConfirmDialog.vue`
- `web/app/composables/useBffSession.ts`
- `web/app/middleware/admin.ts`
- `web/app/utils/bff-client.ts`
- `web/app/utils/bff-session-core.ts`
- `web/app/utils/bff-private-cleanups.ts`
- `web/app/utils/login-background.ts`
- `web/app/utils/login-form.ts`
- `web/public/login-bg/1.jpg`, `2.jpg`, `3.jpg` (byte-identical copies of
  `frontend/src/bg/login/*`)

Restored from `.tools/parked/03-events-guest/` (contents unchanged except where
§3.4/§3.5 says otherwise):

- `web/server/utils/guest-bff.ts`
- `web/server/utils/guest-upload.ts`
- `web/server/api/bff/guest/events/draft.post.ts`
- `web/server/api/bff/guest/events/[id]/index.put.ts`
- `web/server/api/bff/guest/events/[id]/signup.{get,post,delete}.ts`
- `web/server/api/bff/guest/upload/{content,avatar}.post.ts`
- `web/tests/guest-bff.test.ts`
- `web/tests/guest-upload.test.ts`
- `web/tests/e2e/events.spec.ts`
- `web/tests/e2e/events-visual.spec.ts`
- `web/tests/e2e/support/events-parity.ts`

New tests authored this round:

- `web/tests/compress-image.test.ts` (new file; closes lead-note item 4b)

Docs copied from the worktree:

- `docs/revamp/AUTH.md`
- `docs/revamp/AUTH-LOGIN.md`

Workstream log:

- `docs/revamp/logs/04-auth-bff/README.md` (this file)
- `docs/revamp/logs/04-auth-bff/evidence.json`
- `docs/revamp/logs/04-auth-bff/smoke-transcript.md`
- `docs/revamp/logs/04-auth-bff/raw/**` (build log, BFF route-chunk list, E2E
  runner log, shared/web test output, smoke server log)
- `docs/revamp/logs/04-auth-bff/e2e-evidence/**` (summary + comparison JSON +
  error-context snapshots of the 10 E2E failures; the 389 MB of traces, videos
  and reports were deleted after extraction)

### Modified

- `packages/shared/src/index.ts` — deleted the duplicated `loginSchema` and
  `LoginInput`, added `export * from './auth.js'` and `export * from './admin.js'`.
  `publicConfigSchema`, `PublicSiteConfig`, `export * from './public.js'` and
  `export * from './events.js'` are untouched.
- `web/server/utils/guest-drafts.ts` — per-draft in-flight submission marker
  (lead-note item 3).
- `web/tests/guest-drafts.test.ts` — two new tests for that marker.

### Not created (deliberate)

`web/shared/bff-auth-contract.ts` and `web/tests/auth-contract.test.ts` from the
worktree were **not** copied: with the shared export in place the mirror is a
second authority. Every import that pointed at the mirror now points at
`@guatswr/shared`, and no `bff-auth-contract` reference remains in the tree.

## 3. Corrections made because the code had never been executed

### 3.1 `packages/shared/src/index.ts` — the re-export collided (blocking)

`export * from './admin.js'` and `export * from './public.js'` both export
`activityRowSchema`, `memberRowSchema` and `historyRowSchema` (TS2308; and at
runtime an ambiguous star export removes the name from the package namespace,
which would have broken `web/server/utils/public-read.ts`). The two schemas are
genuinely different projections, so the admin ones were renamed to
`adminActivityRowSchema` / `adminMemberRowSchema` / `adminHistoryRowSchema`
(type aliases `AdminActivity` / `AdminMember` / `AdminHistory` unchanged) and a
comment records why. **The later admin workstream must use the new names.**

### 3.2 Real bugs found by running the tests

- `bff-auth-service.ts` — `login()` returned `expiresAt` from an undeclared
  binding (`ReferenceError` on every successful login). Now `record.expiresAt`.
- `guest-upload.ts` — `detach()` called `writeStream.removeAllListeners()`
  before `destroy()`, which strips the listeners `pipeline()` relies on; the
  pipeline promise never settled, so an aborted upload held its concurrency slot
  (and its temp directory) forever instead of releasing it. The concurrency test
  that follows it then saw `503 upload_busy`. Verified with a standalone probe
  (`pipeline` stays `pending` after `removeAllListeners()`; rejects after a plain
  `destroy()`). Fixed by destroying without stripping listeners.
- `guest-bff.ts` — `assertContentBounds` rejected the protected key `id` at every
  depth, including inside the `initiator`/`a`/`b` person objects that the
  archived guest form builds and that `parseGuestDraftSave`'s own member
  allowlist (`id`, `qq`, `avatar`, `goal`) accepts. The protected-key check now
  exempts exactly the person-member key set one level below a person key; `id`
  stays protected everywhere else.
- `bff-client.ts` — `safeLocalReturnPath` trimmed the raw value before the
  control-character check, so `/admin\t` was accepted as `/admin`. The raw value
  is now rejected outright.
- `bff-client.ts` — `BffErrorCode` was missing `unauthenticated`, `not_found`,
  `conflict` and `upstream_error`, which `SAFE_ERROR_CODES` already listed.
- `useBffSession.ts` — `nuxtApp.hook('app:beforeUnmount', …)` is not a Nuxt 4.6
  hook, so the disposal never ran. Now `nuxtApp.vueApp.onUnmount(…)`.
- `bff-auth-context.ts` — `sessionHeader: false` widened to `boolean`, which is
  not assignable to `SessionConfig`; and `Retry-After` was passed as a string to
  a typed-header overload that requires a number.

### 3.3 Test bugs (fixed the test, never the assertion)

- `auth-session.test.ts` — `${ciphertext}A` does not tamper with a base64url
  string whose length is a multiple of four (the decoder drops the extra
  character), so the tamper case proved nothing. Now flips an interior character
  and asserts the decoded bytes actually changed.
- `auth-session.test.ts` — the invalid-capacity flood used a fixed absolute
  expiry, so every record after the first 1000 was already expired and the flood
  never reached the store. Now each record expires relative to its own creation.
- `auth-service.test.ts` (4 cases) and `auth-api-integration.test.ts` (1 case) —
  the fakes could not distinguish the login-time `/me` from the protected-time
  `/me`, so the login itself was rejected / hung. The fakes now count calls.
- `bff-session-core.test.ts` and `login-form.test.ts` — `await Promise.resolve()`
  is not enough to reach the fetch/submit; both now wait on an explicit
  "started" promise.
- `login-form.test.ts` — the standalone `Field` export of `@tanstack/vue-form`
  requires a `form` prop; the test now uses `form.Field`. The submit-error shape
  was also wrong: for a Standard Schema submit validator, 1.33.5 puts the
  path-keyed map on `form.state.errorMap.onSubmit` and the per-field issues on
  `getFieldMeta(name).errorMap.onSubmit` — there is no `{ fields }` wrapper.
- `guest-upload.test.ts` — the "cleanup on abort" test passed in isolation only
  because three of four slots happened to be free; it exposed the §3.2 pipeline
  leak when run after the concurrency test.

### 3.4 Lead-note item 3 — save locking (implemented)

`owns()` stays true until `confirmSubmission()` runs, so two concurrent
identical saves both got `{kind:'new'}` and both reached the frozen backend.
`createGuestDraftStore` now takes an exclusive per-draft in-flight marker:
`beginSubmission` returns the new `{kind:'busy'}`, `confirmSubmission` and the
new `abortSubmission` release it, and the marker is only released for the record
the caller actually owns (`read` enforces the client-IP binding, so a foreign
client cannot free the owner's marker). The marker set is bounded by
`maxInflight` with the same documented eviction trade-off as the rest of the
file. `events/[id]/index.put.ts` maps `busy` to `409 submission_in_progress` and
releases the marker on a failed or non-200 upstream write. Two tests cover the
lock, the release-after-failure path, the replay path, per-draft isolation and
the foreign-client case.

### 3.5 Lead-note item 4 — upload oversize and the no-re-encode rule (tested)

- `guest-upload.test.ts`: a real 51 MiB upload is refused with `413 too_large`,
  and a file of exactly `MAX_UPLOAD_BYTES` is also refused (busboy@1.6.0 emits
  `limit` as soon as the part *reaches* `fileSize`, so the effective maximum is
  `MAX_UPLOAD_BYTES - 1`).
- `web/tests/compress-image.test.ts`: GIF and SVG of any size, non-images, and
  sub-300 KB images are returned as the identical `File` object (never
  re-encoded). The re-encode path itself needs `compressorjs` and a canvas and
  remains a browser item.

### 3.6 Guest restore plumbing

`guest-bff.ts` imported `useRuntimeConfig` from `#imports`, which cannot resolve
under plain Vitest. It now uses the same bare Nitro auto-import as
`bff-auth-context.ts`, so no virtual-module stub or extra Vitest alias was
needed — `web/vitest.config.ts` was left untouched.

## 4. Commands actually run, and their results

All through `. .tools/env.sh`. Playwright only through
`web/scripts/e2e-isolated.mjs` with `E2E_PORT_BASE=3700`.

The working tree moved during this round: another agent committed `1b6358f`
(homepage / social / join E2E fixes, `web/app/pages/index.vue`,
`web/app/pages/join.vue`, `ProgressiveImage.vue` and their specs). It touches
none of this workstream's files. The build and the event E2E in rows 9–10 ran on
the tree at base `319e295`, i.e. just before that commit; the unit suites were
re-run afterwards on the current tree.

| # | Command | Result |
| --- | --- | --- |
| 1 | `pnpm --filter @guatswr/shared typecheck` | FAILED first with 3 × TS2308 (the §3.1 collision); clean after the rename |
| 2 | `pnpm --filter @guatswr/shared test` | **5 files / 68 tests passed** (builds `dist`, which `@guatswr/shared` resolves to) |
| 3 | `cd web && ../node_modules/.bin/vitest run tests/auth-*.test.ts tests/bff-*.test.ts tests/login-*.test.ts` | **15 files / 274 tests passed** |
| 4 | same, plus the 4 guest/compress files | **19 files / 312 tests passed** |
| 5 | `cd web && ../node_modules/.bin/vitest run` (whole web package) | **39 files / 535 tests passed**, reproduced 3 × |
| 6 | `../node_modules/.bin/eslint <every file this workstream owns>` | clean (4 errors found and fixed: 2 × `no-control-regex`, 2 × useless/`prefer-const` assignment) |
| 7 | `vue-tsc --noEmit -p .nuxt/tsconfig.server.json` (read-only use of the existing typegen) | clean after §3.2 fixes |
| 8 | `vue-tsc --noEmit -p .nuxt/tsconfig.app.json` | clean except two `Cannot find name 'useBffSession'` — stale `.nuxt/imports.d.ts`; see §5 |
| 9 | `pnpm -r build` (under `.tools/build.lock`) | **exit 0**, 1 m 14 s; `.output` contains every `api/bff/auth/*` and `api/bff/guest/*` route chunk |
| 10 | `cd web && E2E_PORT_BASE=3700 node scripts/e2e-isolated.mjs tests/e2e/events.spec.ts tests/e2e/events-visual.spec.ts --work-dir .e2e-isolated/auth-events` | **16 passed / 10 failed / 0 skipped** of 26 declared (see §5.2) |
| 11 | live smoke against the built server (ports 3800/3882, then stopped) | see `smoke-transcript.md`; §5.1 is the headline |

## 5. Unresolved limitations, blockers and deviations

### 5.1 BLOCKER (lead-owned): the BFF write routes are unusable at runtime

`nuxt-security`'s `xssValidator` (installed 2.6.0, confirmed present in the
built `nitro.mjs`) calls `await readBody(event)` for POST **before** the route
handler. The BFF reads its body from `event.node.req`, which is then already
drained:

```
POST /api/bff/auth/login   origin+csrf+content-type all correct
→ 400 {"error":{"code":"invalid_request","message":"请求内容无效"}}
```

That is the BFF's own empty-body error, not a validation error. The fix is the
one-line route rule already specified in `docs/revamp/AUTH.md` §1, and
`web/nuxt.config.ts` is lead-owned:

```ts
routeRules: {
  // ...existing rules unchanged...
  '/api/bff/**': { security: { xssValidator: false } },
}
```

Until it is applied, login, logout and every guest POST/PUT cannot work against
the real server, and no browser E2E that touches them can pass. Everything that
does *not* need the body was verified live (§ smoke-transcript): origin
rejection, content type, CSRF, the rate limiter with `Retry-After`, the
anonymous session, forged-cookie cleanup, cookie attributes and the `/api/_auth`
404 guard.

### 5.2 The restored event E2E specs fail, and not because of this workstream

`16 passed / 10 failed`. The specs stub `/api/bff/**` in the browser
(`stubGuestBff`), so no auth or guest BFF code runs in them. All ten failures are
in the event UI integrated by workstream 03 / commit `6be6e8e`:

- `events.spec.ts` × 3 tests × 2 projects — after the form is filled and
  submitted, the modal shows the client-side validation alert `请填写标题` while
  the `input[name="title"]` DOM value is set, i.e. the EventForm model never
  received the value and the submit never reached the network. Evidence:
  `e2e-evidence/error-context--events-event-board-interac-*.md` (note the page
  snapshot also reports `Hydration completed but contains mismatches`).
  `web/app/components/events/EventForm.vue` is not in this workstream's
  ownership, so it was not edited.
- `events-visual.spec.ts` × 2 themes × 2 projects — pixel/size differences from
  the archived page (e.g. `board-悬赏令-dark-desktop` 23 901 differing pixels;
  mobile width 992 vs 914). Evidence:
  `e2e-evidence/*-comparison.json`.

### 5.3 The login E2E cannot run: lead-owned Playwright wiring is missing

`web/tests/e2e/login.spec.ts` is restored but **unrun**. It needs, in
`web/playwright.config.ts` (lead-owned):

- a fourth webServer `node tests/fixtures/auth-upstream.mjs` on
  `portBase + 82` (the spec's constants assume the default base);
- on the Nuxt webServer: `NUXT_API_BASE=http://127.0.0.1:<portBase+82>`,
  `NUXT_BFF_AUTH_ALLOWED_ORIGINS=["http://127.0.0.1:<portBase>"]`,
  `NUXT_SESSION_PASSWORD=<32+ chars>`;
- `BFF_AUTH_E2E=1` in the environment.

The spec also hardcodes `3100 / 3182 / 5174`, so it additionally needs to derive
those from `E2E_PORT_BASE` before it can run on base 3700. Without the flag the
suite is skipped, and `e2e-isolated.mjs` fails any undeclared skip — so it must
not be run through the isolated runner until the wiring lands.

### 5.4 Other limitations

- `vue-tsc -p .nuxt/tsconfig.app.json` reports `Cannot find name 'useBffSession'`
  in `app/middleware/admin.ts` and `app/pages/login.vue`. This is stale typegen:
  `.nuxt/imports.d.ts` predates the new composable (it already lists `useTheme`
  from the same directory). `nuxt typecheck` runs `nuxt prepare` first, so the
  lead's gate should clear it. Left on auto-imports rather than adding explicit
  imports, to match the existing convention.
- `pnpm -r typecheck` / `pnpm -r lint` were not run (lead-owned). The scoped
  typechecks in §4.7/§4.8 and scoped lint in §4.6 are this workstream's evidence.
- One full-suite run out of four reported `530 passed / 1 error` with no failing
  test named; it did not reproduce in the three following runs or in five
  consecutive runs of the guest suites. Not explained; watch it at integration.
- Session storage is process-local memory: a restart logs everyone out and
  multiple instances do not share sessions. `revokeForUser` exists but no
  profile-password route calls it yet.
- The admin BFF API, the admin page, and attaching `middleware: 'admin'` are
  later workstreams. `/admin` currently renders an empty SPA shell.
- Not verified: real cookie persistence through a browser, h3 session rotation
  under a real browser, the login page's client-side flow against a live BFF
  (blocked by §5.1), and the `compressorjs` re-encode path.

## 6. How to re-verify

```sh
cd /e/Taropoi/workspace/GuatSWR_Website
. .tools/env.sh

# shared contract (also rebuilds packages/shared/dist, which web resolves)
pnpm --filter @guatswr/shared test

# this workstream's unit suites (19 files / 312 tests)
cd web
../node_modules/.bin/vitest run \
  tests/auth-session.test.ts tests/auth-identity.test.ts tests/auth-write.test.ts \
  tests/auth-upstream.test.ts tests/auth-service.test.ts tests/auth-request-path.test.ts \
  tests/auth-api-integration.test.ts tests/bff-runtime.test.ts tests/bff-client.test.ts \
  tests/bff-session-core.test.ts tests/bff-private-cleanups.test.ts tests/bff-session-race.test.ts \
  tests/login-form.test.ts tests/login-form-utils.test.ts tests/login-background.test.ts \
  tests/guest-bff.test.ts tests/guest-upload.test.ts tests/guest-drafts.test.ts \
  tests/compress-image.test.ts
cd ..

# scoped lint / typecheck
cd web
../node_modules/.bin/eslint server/utils/bff-*.ts server/utils/guest-*.ts \
  server/api/bff app/utils/bff-*.ts app/utils/login-*.ts app/composables/useBffSession.ts \
  app/middleware/admin.ts app/pages/login.vue app/components/login \
  tests/auth-*.test.ts tests/bff-*.test.ts tests/login-*.test.ts tests/guest-*.test.ts \
  tests/compress-image.test.ts tests/e2e/events*.spec.ts tests/e2e/login.spec.ts
../node_modules/.bin/vue-tsc --noEmit -p .nuxt/tsconfig.server.json
cd ..

# build + restored event E2E (serialized; take .tools/build.lock first)
pnpm -r build
cd web && E2E_PORT_BASE=3700 node scripts/e2e-isolated.mjs \
  tests/e2e/events.spec.ts tests/e2e/events-visual.spec.ts --work-dir .e2e-isolated/reverify
```

Then re-run the live smoke in `smoke-transcript.md` after the lead applies the
`/api/bff/**` route rule: a login POST must answer 200 with
`{ user, expiresAt, csrfToken }` and a `Set-Cookie` for `guatswr-next` that is
`HttpOnly; Secure; SameSite=Lax; Path=/` with no `Domain`, and no JWT may appear
in any browser-facing byte.
