# 03 — event UI, shared event rules and the guest BFF (integration)

## 1. Scope

Integrate the source batch produced in the managed worktree
`C:/Users/water/.codex/worktrees/revamp-events/GuatSWR_Website` (base `1cfe6b8`,
39 untracked files, no tracked file modified there) into the primary checkout and
execute its suites.

- Checkout: primary `E:/Taropoi/workspace/GuatSWR_Website`
- Branch: `revamp/nuxt-foundation`, base commit `0954b8a`
- Runtime: pinned `.tools/env.sh` (Node 24.15.0, pnpm 11.25.0)
- Assigned Playwright port base: `E2E_PORT_BASE=3500`
- Brief: `.tools/brief-events.md`; protocol: `.tools/agent-protocol.md`

**Outcome in one line:** all 39 files are integrated verbatim (29 byte-identical,
10 changed on purpose), 33 of the batch's 45 tests execute and pass, and 23 tests
(plus both E2E specs and `pnpm -r build`) **cannot run at all** because the guest
BFF depends on `web/server/utils/bff-*.ts` and `busboy`, neither of which exists
in the primary and both of which are outside this workstream's ownership.

## 2. Exact file inventory

### 2a. Copied verbatim from the source batch (39 paths)

All 39 were copied with `cp -p`; sha256 of each was compared against the source
afterwards. 29 remain byte-identical; the 10 changed are listed in 2c.

New (untracked) in the primary:

```
docs/revamp/EVENTS.md
docs/revamp/GUEST.md
packages/shared/src/events.ts
packages/shared/src/events.test.ts
web/app/components/events/EventBoard.vue
web/app/components/events/EventCard.vue
web/app/components/events/EventForm.vue
web/app/components/events/EventModal.vue
web/app/components/events/EventSignup.vue
web/app/composables/useEventApi.ts
web/app/pages/events.vue
web/app/pages/events/index.vue
web/app/pages/events/bounty.vue
web/app/pages/events/betting.vue
web/app/pages/events/stg.vue
web/app/pages/events/zetime.vue
web/app/pages/events/party.vue
web/app/utils/event-transport.ts
web/app/utils/event-display.ts
web/app/utils/upload-progress.ts
web/app/utils/compress-image.ts
web/server/api/bff/guest/events/draft.post.ts
web/server/api/bff/guest/events/[id]/index.put.ts
web/server/api/bff/guest/events/[id]/signup.get.ts
web/server/api/bff/guest/events/[id]/signup.post.ts
web/server/api/bff/guest/events/[id]/signup.delete.ts
web/server/api/bff/guest/upload/content.post.ts
web/server/api/bff/guest/upload/avatar.post.ts
web/server/utils/guest-bff.ts
web/server/utils/guest-drafts.ts
web/server/utils/guest-upload.ts
web/tests/event-transport.test.ts
web/tests/event-display.test.ts
web/tests/guest-bff.test.ts
web/tests/guest-drafts.test.ts
web/tests/guest-upload.test.ts
web/tests/e2e/events.spec.ts
web/tests/e2e/events-visual.spec.ts
web/tests/e2e/support/events-parity.ts
```

### 2b. Tracked file modified — exactly one line, as granted by the brief

```
packages/shared/src/index.ts   modified, +1 line:  export * from './events.js'
```

`git diff --stat` shows `packages/shared/src/index.ts | 1 +`. No export-name
collision: `events.ts` exports (`EVENT_TYPES`, `EVENT_*`, `eventPayloadSchema`,
`eventSignupSchema`, `createEventFormState`, …) share no identifier with
`public.ts`, `config.ts` or `index.ts`.

The other five tracked modifications visible in `git status` in this shared
checkout (`web/app/components/ProgressiveImage.vue`, `web/app/pages/join.vue`,
`web/tests/e2e/homepage.spec.ts`, `web/tests/e2e/social-join.spec.ts`,
`web/tests/e2e/support/public-parity.ts`) belong to another agent; I did not
touch them.

### 2c. Files changed after the verbatim copy (10), with the reason

| Path | Change | Reason |
| --- | --- | --- |
| `packages/shared/src/events.ts` | typed the `superRefine` callback model | `tsc -p tsconfig.build.json` failed `TS2345` at `events.ts:227`; `z.object(Record<string, z.ZodType>)` types the callback model as `{[k:string]: unknown}`, so `getEventFields(model)` did not accept it. Cast to `Pick<EventFormModel,'type'|'betMode'>` — the schema guarantees both keys. **Real type error in the batch.** |
| `web/server/utils/guest-drafts.ts` | `issue()` now treats an expired record as absent | **Real bug.** `issue()` read `records.get(recordKey)` and only compared `clientIp`, never the TTL, so an expired cookie was *reused* instead of rotated — the exact behaviour the correction demanded. `guest-drafts.test.ts:104` failed on it. Fixed by treating a record past `ttlMs` as absent (and deleting it) before the owner/IP decision. |
| `web/server/utils/guest-bff.ts` | removed the unused imports `digestGuestPayload` and `GuestSubmissionState` | `eslint @typescript-eslint/no-unused-vars` errors. The digest is used through `store.digest()`; nothing else needed them. |
| `web/app/components/events/EventForm.vue` | merged three `@guatswr/shared` imports into one | `eslint import/no-duplicates`. |
| `web/app/components/events/EventSignup.vue` | merged three `@guatswr/shared` imports into one | `eslint import/no-duplicates`. |
| `web/app/components/events/EventModal.vue` | `defineProps({...})` no longer assigned to an unused `props` | `eslint no-unused-vars`. Verified with `@vue/compiler-sfc` that the unassigned call still registers `title`/`maxWidth` as `props` template bindings, so the template is unaffected. |
| `web/app/pages/events.vue` | moved the leading template comment inside the root element | `eslint vue/no-multiple-template-root` (comment before the root node). |
| `web/tests/guest-upload.test.ts` | merged the two `node:http` imports; dropped the unused `MAX_UPLOAD_BYTES` / `MAX_UPLOAD_TOTAL_BYTES` | `eslint import/no-duplicates` + `no-unused-vars`. See §4: the unused imports were the leftovers of an oversize test that the batch never wrote. |
| `web/tests/e2e/support/events-parity.ts` | `ARCHIVE_ORIGIN`/`UPSTREAM_ORIGIN` derived from `E2E_PORT_BASE` instead of hardcoded `5174`/`3181` | **Real integration bug.** `web/playwright.config.ts` derives the legacy/upstream ports from `E2E_PORT_BASE`; on the assigned base 3500 they are 5574/3581, so every archive/upstream read would have hit a dead port. `support/public-parity.ts` already carries the identical fix and comment. |
| `web/tests/e2e/events.spec.ts` | `BASE_URL` derived from `E2E_PORT_BASE` instead of hardcoded `3100` | Same bug, same fix; this constant feeds the manual `browser.newContext({ baseURL })` for the no-JS test. |

Nothing outside the 39 paths, the one barrel line and
`docs/revamp/logs/03-events-guest/**` was created or edited.

## 3. Commands actually run and their results

Every command below was executed. Nothing here is projected.

### 3.1 Copy and integrity

| Command | Result |
| --- | --- |
| `git status --porcelain -uall` (source worktree) | 39 untracked paths, no tracked modification |
| per-file `cp -p` loop over the 39 paths | copied |
| `git status --porcelain -uall` (primary) | additions only; no tracked file modified by the copy |
| `sha256sum` comparison, all 39 | `ALL 39 FILES IDENTICAL` |
| `grep -n '^export '` on `events.ts`/`public.ts`/`config.ts` | no identifier collision for the barrel line |

### 3.2 Unit tests

```
. .tools/env.sh && cd web && ../node_modules/.bin/vitest run tests/event-transport.test.ts tests/event-display.test.ts
```
First run: **4 failed | 8 passed**. Cause: `packages/shared/dist/` (the
`@guatswr/shared` runtime entry, `"import": "./dist/index.js"`) was stale and did
not contain `events.js`, so `createDraftSession` was `undefined` and
`eventSignupSchema` was `undefined`. Not a batch defect — a build-order defect.
After `packages/shared` was rebuilt (3.3) the same command: **12 passed (12)**.

```
. .tools/env.sh && cd web && ../node_modules/.bin/vitest run tests/event-transport.test.ts tests/event-display.test.ts tests/guest-bff.test.ts tests/guest-drafts.test.ts tests/guest-upload.test.ts
```
**2 suites failed to load, 1 test failed | 20 passed (21).**
- `tests/guest-bff.test.ts` — `Error: Cannot find module '#imports' imported from web/server/utils/guest-bff.ts`.
- `tests/guest-upload.test.ts` — `Error: Cannot find package 'busboy' imported from web/server/utils/guest-upload.ts`.
- `tests/guest-drafts.test.ts` — `expected 100 not to be 100` at line 104 (the TTL bug, §2c).

```
. .tools/env.sh && cd ../packages/shared && ../node_modules/.bin/vitest run src/events.test.ts
```
**12 passed (12)** (the batch report claims 10; the file contains 12).

Final re-runs, raw logs kept:

| Command | Result | Log |
| --- | --- | --- |
| `vitest run src/events.test.ts` (packages/shared) | **12 passed (12)**, exit 0 | `test-shared-events.log` |
| `vitest run tests/event-transport.test.ts tests/event-display.test.ts tests/guest-drafts.test.ts` | **21 passed (21)**, exit 0 | `test-web-runnable.log` |
| `vitest run tests/guest-bff.test.ts tests/guest-upload.test.ts` | **2 failed (2), no tests**, exit 1 | `test-web-blocked.log` |

**Executed and passing: 33 of the batch's 45 test cases** (12 shared + 12 event
UI + 9 draft store). **Unrun: 16 + 7 = 23** (guest BFF, guest upload).

### 3.3 Shared package build (needed before the web tests can see the barrel line)

```
. .tools/env.sh && cd packages/shared && ../../node_modules/.bin/tsc -p tsconfig.build.json
```
- Before the `events.ts` fix: `src/events.ts(227,39): error TS2345 …` (exit 0, dist emitted anyway).
- After the fix: **exit 0, no output**.

### 3.4 Scoped lint

```
. .tools/env.sh && cd web && ../node_modules/.bin/eslint <the 20 owned paths>
```
- Before: `30 problems (12 errors, 18 warnings)`.
- After the fixes in §2c: **`18 problems (0 errors, 18 warnings)`, exit 0**. All 18
  are `vue/html-self-closing` warnings, the same class the integration plan
  records as the repo's pre-existing baseline. Log: `lint-scoped.log`.

### 3.5 Build (under `.tools/build.lock`, released in every case)

```
until mkdir .tools/build.lock; do sleep 15; done
. .tools/env.sh && pnpm -r build
rmdir .tools/build.lock
```

1. **With the batch present:** `BUILD_EXIT=1`
   ```
   [nitro] ERROR RollupError: Could not resolve "../../../../utils/bff-errors"
   from "server/api/bff/guest/upload/content.post.ts"
   [ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @guatswr/web@0.0.0 build: `nuxt build`
   ```
   Log: `build.log`. `packages/shared`'s `tsc` step passed in the same run.
   This build **removed `web/.output/server/index.mjs`**; the checkout has no
   runnable app output as a result.

2. **Control experiment — batch's guest *server* paths parked** (moved to
   `.tools/tmp/events-guest-parked/`, then restored byte-identically):
   `BUILD_EXIT=1` again, but on a **different** error:
   ```
   Could not resolve "../../../../../web/shared/markdown.ts"
   from "node_modules/.cache/nuxt/.nuxt/dist/server/_nuxt/usePublicPageSeo-HrCPiqnG.js"
   ```
   Reproduced twice (logs `build-without-guest-server.log`,
   `build-without-guest-server-retry.log`). `web/shared/markdown.ts` and
   `web/app/composables/usePublicPageSeo.ts` belong to the in-flight public-pages
   batch, not to this workstream. So the primary currently does **not** build for
   two independent reasons, one of which is not mine.

3. `node -e "require.resolve('busboy')"` from `web/` →
   `UNRESOLVED busboy: MODULE_NOT_FOUND`; `@types/busboy` likewise. `busboy@1.6.0`
   exists only at `backend/node_modules/busboy` (multer's tree) and is absent from
   the root lockfile, so `guest-upload.ts` cannot resolve it from `web/`.

### 3.6 Playwright

**Not run.** Both E2E specs need a fresh `.output`, and no build succeeds in this
checkout (§3.5). `E2E_PORT_BASE=3500` was assigned but never exercised. No E2E
result of any kind is claimed.

### 3.7 Static checks I ran instead (clearly not substitutes for the above)

- `grep` for `parseClubTime` → `web/app/utils/club-date.ts` exists in the primary
  (integrated by the homepage batch); `guest-bff.ts` imports `~/utils/club-date`.
- `grep` for `invalidatePublicData` → `web/server/utils/public-data.ts:82`
  exports `(kinds: readonly PublicDataKind[]) => void`, matching the call in
  `guest-bff.ts`.
- `grep` for `upstreamUrl` → `web/server/utils/upstream.ts:16` matches its use.
- `@vue/compiler-sfc` check that an unassigned `defineProps` still binds
  `title`/`maxWidth` for the template (see §2c).
- `grep` for `bff-*.ts` across the whole checkout and every other worktree: the
  only copy lives in the unintegrated `revamp-auth` worktree.

## 4. Unresolved limitations and deviations

These are the things a reviewer must second-guess.

1. **The guest BFF suites cannot execute (23 tests).** `guest-bff.ts` statically
   imports `./bff-auth-context`, `./bff-identity`, `./bff-errors`, `./bff-write`
   and `#imports`; `guest-upload.ts` imports `./bff-errors` and `busboy`. None of
   `web/server/utils/bff-*.ts` exists in the primary, and the brief forbids this
   workstream from creating them ("those belong to a later round"). `busboy` is
   not installed in the web workspace and `package.json`/`pnpm-lock.yaml` are the
   lead's. I did **not** stub, alias or shim these modules: doing so would have
   validated `guest-bff.ts` against a fake auth contract, which is exactly what
   `GUEST.md` and the correction forbid. The 16 + 7 tests stay `unrun`.
2. **The primary does not build with this batch integrated.** Until the auth batch
   (`bff-*.ts`) and `busboy` land, `pnpm -r build` fails on
   `server/api/bff/guest/upload/content.post.ts`, and the checkout has no
   `web/.output`. The lead must sequence the auth integration before any event
   E2E.
3. **A second, unrelated build failure exists** on the public-pages batch's
   `web/shared/markdown.ts` / `usePublicPageSeo.ts` (§3.5.2). It is not mine and
   I did not touch those files; the lead needs to know the checkout is currently
   unbuildable for two reasons.
4. **"Save locking" is not tested and, as far as I can read, does not exist.**
   `events/[id]/index.put.ts` checks `store.owns(intent, id)` and then
   `beginSubmission(...)`, but `owns()` is still true until
   `confirmSubmission()` runs after the upstream write. Two concurrent identical
   saves therefore both return `{kind:'new'}` and both reach the frozen backend.
   The correction lists save locking as an acceptance item; no test in the batch
   covers it, and I did not invent a lock I could not execute.
5. **Upload oversize is untested.** `guest-upload.test.ts` originally imported
   `MAX_UPLOAD_BYTES`/`MAX_UPLOAD_TOTAL_BYTES` without using them — the remains of
   an oversize test that was never written. `GUEST.md` records oversize as left to
   central acceptance because it needs a real ~50 MiB transfer. I removed the dead
   imports rather than write an unrunnable test; **the 50 MiB / format guard is
   therefore still only unit-visible through the code, never executed.**
6. **`~/utils/club-date` and `#imports` have no vitest alias.** Even once the auth
   helpers exist, `guest-bff.test.ts` will still fail to load until
   `web/vitest.config.ts` (not owned by me) aliases `#imports` and `~/utils/*`.
   This is a second, independent blocker behind #1.
7. **The archived 50 MB/format guard and the GIF/SVG no-re-encode rule are
   preserved verbatim** in `guest-upload.ts` (`MAX_UPLOAD_BYTES = 50*1024*1024`,
   `UPLOAD_MIME_EXTENSIONS`, `assertImageMagic`) and in
   `app/utils/compress-image.ts`; I did not change either. I could not *execute*
   them.
8. **The initial-route JavaScript budget is unverified.** `compress-image.ts`
   and the upload sender are lazily imported, but the route budget script is
   lead-owned and needs a build. Not run.
9. **The visual spec's capture protocol was not ported.** `events-visual.spec.ts`
   uses the plain `screenshot` + `pixelmatch(threshold: 0.1)` protocol, the same
   one the already-integrated `support/public-parity.ts` uses, not
   `layout.spec.ts`'s device-pixel crop. I could not run it, so I cannot say
   whether a crop is needed; the brief's instruction ("if a capture artifact is
   the cause, port the crop protocol") is therefore still open.
10. **`E2E_PORT_BASE` plumbing.** Two hardcoded fixture/app origins were real bugs
    (§2c) and are fixed; the visual spec's archive origin now resolves to
    `127.0.0.1:5574` on base 3500. Untested end to end.
11. **The barrel line is the only shared-package change I made**, and I rebuilt
    `packages/shared/dist` (gitignored, generated) to make the web suites see it.
    That rebuild is shared state: it is deterministic from `src/`, but another
    agent running web tests during the window could have read a partially written
    `dist`.
12. **The draft store's per-process lifetime, the indeterminate timeout, and the
    avatar route's documented type restriction** are unchanged from the batch and
    remain deployment-plan items, not verified here.

## 5. How to re-verify

```sh
cd /e/Taropoi/workspace/GuatSWR_Website
. .tools/env.sh

# 1. the one tracked line I own
git diff packages/shared/src/index.ts

# 2. shared package build (must be clean; this is the TS2345 fix)
cd packages/shared && ../../node_modules/.bin/tsc -p tsconfig.build.json && cd ../..

# 3. everything that executes today — expect 12 / 12 / 9 / 21
cd packages/shared && ../../node_modules/.bin/vitest run src/events.test.ts && cd ../..
cd web && ../node_modules/.bin/vitest run tests/event-transport.test.ts tests/event-display.test.ts tests/guest-drafts.test.ts

# 4. the blocked suites — expect the two load errors recorded in §3.2
cd web && ../node_modules/.bin/vitest run tests/guest-bff.test.ts tests/guest-upload.test.ts

# 5. scoped lint — expect 0 errors, 18 html-self-closing warnings
cd web && ../node_modules/.bin/eslint app/utils/event-transport.ts app/utils/event-display.ts \
  app/utils/compress-image.ts app/utils/upload-progress.ts app/composables/useEventApi.ts \
  app/components/events app/pages/events.vue app/pages/events server/utils/guest-bff.ts \
  server/utils/guest-drafts.ts server/utils/guest-upload.ts server/api/bff/guest \
  tests/event-transport.test.ts tests/event-display.test.ts tests/guest-bff.test.ts \
  tests/guest-drafts.test.ts tests/guest-upload.test.ts tests/e2e/events.spec.ts \
  tests/e2e/events-visual.spec.ts tests/e2e/support/events-parity.ts

# 6. the exact failing build (take the lock first, release after)
until mkdir .tools/build.lock 2>/dev/null; do sleep 15; done
. .tools/env.sh && pnpm -r build ; rmdir .tools/build.lock

# 7. after the auth batch + busboy land, the full brief step 4:
cd web && E2E_PORT_BASE=3500 ../node_modules/.bin/playwright test tests/e2e/events.spec.ts
cd web && E2E_PORT_BASE=3500 ../node_modules/.bin/playwright test tests/e2e/events-visual.spec.ts
```

Raw evidence kept in this directory: `build.log`,
`build-without-guest-server.log`, `build-without-guest-server-retry.log`,
`test-shared-events.log`, `test-web-runnable.log`, `test-web-blocked.log`,
`lint-scoped.log`.
