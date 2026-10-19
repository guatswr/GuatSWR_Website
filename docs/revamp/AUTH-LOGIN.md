# Login and client session boundary (batch S2)

Status 2026-10-19: source and tests written, **not executed or integrated** in
this worktree. No dependency install, build, Nuxt prepare, browser, real backend
or git operation was run. All tests below are written but unrun. The auth
server batch is documented in [AUTH.md](AUTH.md).

> **Integrated in the primary checkout on 2026-10-19** (workstream
> `docs/revamp/logs/04-auth-bff/`). The temporary `web/shared/bff-auth-contract.ts`
> mirror and `web/tests/auth-contract.test.ts` were not copied: the login form
> schemas are imported from the real `@guatswr/shared` export. The E2E below is
> restored but **unrun** — `web/playwright.config.ts` still needs the auth
> fixture webServer and the BFF environment, and `BFF_AUTH_E2E=1`.

## Files

- `web/app/pages/login.vue` — archived Login markup/copy/background with
  accessible labels, autocomplete, field errors, loading/disabled state, focus
  of the first invalid field, and the native confirmation modal.
- `web/app/components/login/ConfirmDialog.vue` — native `<dialog>` preserving
  `数据无价，谨慎操作。` / `进入管理端` without Element Plus or Reka.
- `web/app/composables/useBffSession.ts` — per-Nuxt-app session state.
- `web/app/utils/bff-client.ts` — allowlisted same-origin fetch, error mapping,
  CSRF mutation with one strictly bounded retry, safe local redirect.
- `web/app/utils/bff-session-core.ts` — framework-free controller used by the
  composable and directly by unit tests.
- `web/app/utils/login-background.ts`, `web/app/utils/login-form.ts` —
  deterministic background picker and validation/focus helpers.
- `web/app/middleware/admin.ts` — future admin-page guard (not attached yet).
- `web/public/login-bg/{1,2,3}.jpg` — byte-identical copies of
  `frontend/src/bg/login/*`.
- `web/types/auth.d.ts` — `#auth-utils` user and `#app` PageMeta augmentations.
- Tests: `bff-client`, `bff-session-core`, `login-form`, `login-form-utils`,
  `login-background`, extended `auth-contract`, `tests/e2e/login.spec.ts`.
- `packages/shared/src/auth.ts` — form field/form schemas, defaults,
  `normalizeLoginFormValue`; mirrored in `web/shared/bff-auth-contract.ts`.

## Form contract

`@tanstack/vue-form@1.33.5` with the shared Zod 4 Standard Schema (the local
mirror until the compiled shared export lands). Field validators use
`loginUsernameField` / `loginPasswordField` / `loginTwofaField` on blur and
submit; the form-level `loginFormSchema` validates the whole value on submit.
TanStack does not preserve schema transforms, so `normalizeLoginFormValue`
runs once in `onSubmit`:

- username trimmed exactly like the backend;
- password never trimmed or altered;
- blank/whitespace-only `twofa` becomes **absent**, not `''` or `null`;
- non-blank second passwords keep their exact bytes and 4–50 length;
- no TOTP conversion exists anywhere.

The page uses `novalidate` so the accessible per-field errors (and focus of the
first invalid field) replace native validation bubbles; the `required`
attributes are retained for semantics. Duplicate submits are prevented by
TanStack `canSubmit`/`isSubmitting` plus the disabled button.

## Session behavior

- State lives on the Nuxt app (`nuxtApp._bffAuth`), never in a module-global
  cache; an SSR request and every browser app are isolated. Session identity is
  not stored in `useState`, so it cannot be serialized into the public payload.
- No private request is made until `refresh`, `login`, `logout` or `mutate` is
  called explicitly. Public routes render without touching `/api/bff/auth/*`.
- `refresh()` treats **401 as invalid session**: it runs registered private
  cleanup callbacks (future scoped QueryClient per app via
  `registerPrivateCleanup`), drops the safe user/CSRF token, and becomes
  anonymous. A **403 permission denial never clears**; it reports unavailable.
  A 502/503/network failure becomes `unavailable` while retaining any prior
  safe user, distinct from anonymous.
- Login fetches CSRF from the explicit endpoint, stores the token in memory
  only, posts the normalized body with `x-csrf-token`, and adopts the rotated
  token returned by login. Logout resolves only after the server confirms the
  record/cookie clear; a network/5xx failure throws a retryable error and keeps
  the authenticated state instead of pretending the cookie is gone.
- `bffMutation` retries exactly once and only for a server response that is
  `403` with `error.code === 'csrf_invalid'` (proving rejection before a write).
  Network, timeout, 5xx, `forbidden` and every other status are never retried.
- The client sends only the four allowlisted paths, same-origin cookies,
  JSON + `x-csrf-token`. It never adds `Authorization`, never targets an
  external origin, and never stores tokens in localStorage/sessionStorage, the
  cookie JSON, URLs, logs or the Nuxt payload.
- `admin` middleware re-verifies the session (which re-checks backend identity
  and role) before entry, redirects unauthenticated visitors to
  `/login?redirect=<safe-local-path>`, refuses super-admin pages for a
  downgraded role, and treats 502 as unavailable, not anonymous. Route meta
  can only restrict; server authorization stays authoritative.

## Login visuals

The archived route renders `Login.vue` inside `App.vue`, so the new page keeps
the default layout (navbar + footer) instead of inventing a standalone design.
The wrapper, overlay, card, heading copy, labels, placeholders, error/verify
blocks, button classes and `fadeIn` keyframes mirror the archived component.
The three background images are copied byte-for-byte; selection stays
client-side after mount (like the archive), so SSR and the first client render
agree and there is no hydration mismatch. Visual tests seed `Math.random` to
force the same image on old and new.

Deliberate additions (not visual redesign): `for`/`id` labels, autocomplete
hints, `aria-invalid`/`aria-describedby`, `role="alert"` errors, `aria-busy`,
focus of the first invalid field, and a reduced-motion rule for the card.

## Required integration for this batch

1. Add to `web/package.json` dependencies: `"@tanstack/vue-form": "1.33.5"`
   (plus `"zod": "4.6.7"` from the server batch). No Query/form library is
   loaded globally; only the `/login` route chunk imports the form library and
   Zod.
2. Apply the nuxt-security `xssValidator` route rule from `AUTH.md`; otherwise
   login POST bodies are consumed before the BFF handler.
3. Wire the auth E2E (config change owned centrally), not applied here: add
   `node tests/fixtures/auth-upstream.mjs` (port 3182) to
   `web/playwright.config.ts` webServer, point the Nuxt webServer's
   `NUXT_API_BASE` at `http://127.0.0.1:3182`, set
   `NUXT_BFF_AUTH_ALLOWED_ORIGINS=["http://127.0.0.1:3100"]` and
   `NUXT_SESSION_PASSWORD`, and run with `BFF_AUTH_E2E=1`. The spec is skipped
   without that flag so it can never pass against the public-data fixture.
4. Attach `middleware: 'admin'` when the first admin page lands; there is no
   admin layout/CRUD in this batch.
5. `/login` currently has no cache route rule (and contains only the public
   form/background/copy). If a later batch adds SWR/caching for public routes,
   add an explicit `no-store` rule for `/login` at the same time.
6. Legacy localStorage-token migration is **not implemented**. At the approved
   final cutover only, the release page may read the old `token`/user keys once
   on the final domain, discard the JWT immediately, and call
   `useBffSession().logout()` against the BFF if a stale value is found; no
   cross-domain credential passing, no token in URLs, and no production write
   happens from the staging origin. Running that cleanup now would be an
   unauthorized production write.

## Tests (written, not run)

| File | Covers |
| --- | --- |
| `web/tests/bff-client.test.ts` | Allowlist, same-origin headers, no Authorization, 401/403/503/network/timeout mapping, CSRF retry strictly once only on `csrf_invalid`, no retry otherwise, safe redirect. |
| `web/tests/bff-session-core.test.ts` | Anonymous/auth refresh, 401 cleanup vs 403 no-clear, 502 retains user, malformed payload, login normalization/rotation/duplicate submit, logout failure keeps session, 401 logout, per-app isolation. |
| `web/tests/login-form.test.ts` | Real TanStack Form SSR render: submit blocked on schema issues, valid submit, dirty/submitting/canSubmit state, reset, normalization of blank twofa and untouched password. |
| `web/tests/login-form-utils.test.ts` | Error message extraction from Standard Schema issues; focus selection. |
| `web/tests/login-background.test.ts` | Seeded deterministic picker, empty list, copied assets byte-identical to the archive. |
| `web/tests/auth-contract.test.ts` | Existing plus form schema/normalization/field parity between the mirror and `packages/shared/src/auth.ts`. |
| `web/tests/e2e/login.spec.ts` | Wrong credentials, second password, duplicate submit, reload with session, role change/expiry via BFF session API, CSRF-required logout, JWT absence in storage/HTML/payload/URLs/headers/console, keyboard + modal focus, old/new full-page visuals on desktop and mobile. |

Commands after integration:

```sh
pnpm --filter @guatswr/shared test
pnpm --filter @guatswr/web exec vitest run tests/bff-client.test.ts tests/bff-session-core.test.ts tests/login-form.test.ts tests/login-form-utils.test.ts tests/login-background.test.ts tests/auth-contract.test.ts
BFF_AUTH_E2E=1 pnpm --filter @guatswr/web test:e2e
```

## Limits for this batch

- The TanStack form test needs the dependency installed; it has never been
  executed, so the exact 1.33.5 API surface is verified only against the
  official docs (fetched read-only while writing it), not by a run.
- No browser run: cookie attributes, real middleware ordering, focus behavior
  and the pixel comparison are unverified until the E2E wiring lands.
- Admin middleware is written but no admin route attaches it yet; there is no
  admin layout, CRUD, logout button or navbar change in this batch.
- `refresh()` is client-only; an SSR admin route would need an explicit
  server-side session check (the route rule keeps admin client-side).
- Session identity and CSRF token are memory-only, so a full page reload
  re-fetches the session once on login/admin intent; this is intentional.
- The client allowlist currently contains only the four auth paths. Guest,
  upload and admin batches must add their reviewed paths to
  `BFF_AUTH_PATHS` explicitly; there is deliberately no wildcard proxy.
- Per-app isolation is unit-tested at the controller level; the NuxtApp
  binding itself (and SSR request isolation) is only verified by a real
  Nuxt/browser run after integration.

---

# Client corrections (lead review follow-up)

Frozen UI files were not touched; only client helpers, their tests and docs.

- **Lifetime cleanup registrations.** `web/app/utils/bff-private-cleanups.ts`
  holds handlers until their own unsubscribe (or app teardown). A session loss
  runs every handler from a snapshot and keeps the registrations, so one
  per-app QueryClient registration keeps clearing private data across repeated
  expiry/logout/login cycles; a handler that registers/unregisters another
  cannot extend the pass.
- **Generation/serialization in `bff-session-core`.** Every async operation
  captures the current generation; logout, a new login, a different
  identity/role and disposal bump it, so a delayed `/me` after logout, an
  old-user refresh after a newer login or a stale 401 can no longer resurrect or
  overwrite newer state. Refresh and CSRF fetches are deduplicated, and an older
  CSRF fetch can never overwrite a newer rotation. Adopting a *different* user
  or role clears private data first (first adoption has nothing to clear).
- **Typed CSRF/mutation facade.** `useBffSession()` exposes `csrf`
  (`token`/`ensure`/`invalidate`) and `performMutation({ send, isCsrfRejection? })`
  for future closed guest/admin transports. The facade never accepts a URL: the
  transport owns its allowlisted path and asks for a header value. The retry is
  exactly once and only when the transport reports an explicit pre-write
  `csrf_invalid`; network, timeout, 5xx and `forbidden` are never retried.
  Guest upload XHR code should set `x-csrf-token` from `csrf.ensure()` in the
  request-header callback and must never add `Authorization`.
- **Request hardening.** `bffRequest` now sends `redirect: 'error'` (a 30x can
  never resend a credentialed body), refuses to fetch when the caller signal is
  already aborted, caps the response while streaming it, and projects only known
  error codes plus a short, control-character-free message (never a 5xx body).
- **Redirect hardening.** `safeLocalReturnPath` decodes percent-encoding
  (bounded) before validation, then resolves against a fixed trusted local base,
  rejecting authorities (`//`, `%2f%2f`, double-encoded), backslashes, control
  characters, `..` segments, external schemes and every normalized login-loop
  variant (`/login`, `/login/`, `/LOGIN`, `/%6cogin`, `/login#x`, `/login?...`).
- Session identity still lives on the Nuxt app (never `useState`), so it cannot
  be serialized into the public payload; the CSRF token stays memory-only.
