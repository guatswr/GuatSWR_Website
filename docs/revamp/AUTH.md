# Opaque BFF auth server (batch S) — implementation notes

Status 2026-10-19: **source and tests written, not integrated and not executed
in this worktree.** No dependency install, build, Nuxt prepare, browser, real
backend or git operation was run here. Codex must review this diff, apply the
two integration items below, and run the real gates in the primary checkout.

> **Integrated in the primary checkout on 2026-10-19** (workstream
> `docs/revamp/logs/04-auth-bff/`), with these differences from the text below:
> the temporary `web/shared/bff-auth-contract.ts` mirror and its parity test
> were **not** copied — every import now uses the real `@guatswr/shared` export
> of `./auth` and `./admin`, and `packages/shared/src/index.ts` no longer
> declares its own `loginSchema`/`LoginInput`. The admin/account API half
> (`api/bff/admin/**`, `api/bff/account/**`, `bff-admin-resources.ts`,
> `bff-admin-upstream.ts`, `bff-protected.ts`, `ADMIN-API.md`) was **not**
> integrated this round and is a separate workstream; its three colliding row
> schemas are now `adminActivityRowSchema`/`adminMemberRowSchema`/
> `adminHistoryRowSchema` in `packages/shared/src/admin.ts`. The
> `'/api/bff/**': { security: { xssValidator: false } }` route rule below is
> still **not applied**, and every BFF POST/PUT fails closed with an empty body
> until it is. See the workstream README §3 and §5 for the full list of fixes.

Scope is the auth server only: opaque BFF sessions, explicit auth endpoints,
write/CSRF/origin/body boundaries, trusted-proxy identity resolution, restricted
upstream helpers, focused tests and an in-memory auth fixture. There is no login
UI, no guest form, no admin proxy and no change to public data or shared index.

## Endpoints

All responses are `Cache-Control: no-store, private` and `Pragma: no-cache`;
`/api/**` already has a no-store route rule, and no auth route uses SWR.

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/bff/auth/csrf` | GET | Issue an HMAC-bound CSRF token and mirror it in an HttpOnly cookie. Anonymous-safe, no identity data. |
| `/api/bff/auth/login` | POST | JSON `{ username, password, twofa? }` (second password, not TOTP). Returns `{ user, expiresAt, csrfToken }`. |
| `/api/bff/auth/session` | GET | `{ authenticated: false, user: null }` for visitors; fresh identity for a live session; 401 for an expired/revoked/invalid cookie. |
| `/api/bff/auth/logout` | POST | CSRF/origin checked; deletes the server record and both cookies. No upstream call exists. |

Error shape is `{ error: { code, message } }`; unexpected failures return a
fixed 500 body. Codes distinguish `session_expired` (401, revoked/expired/
deleted user) from `forbidden` (403, current role lacks authority).

The cookie contains only the opaque session id (h3 session id generated from 32
random bytes) and `{ id, username, role, avatar }`. It is encrypted by
nuxt-auth-utils, `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`, and `Secure`
unless the explicit loopback test switch is on. The upstream JWT is stored only
as AES-256-GCM ciphertext in a server-side record.

## Session model

`web/server/utils/bff-session.ts`

- 256-bit opaque id; only its SHA-256 hash is a store key.
- Keys are HKDF-SHA256 derived from `runtimeConfig.session.password` with
  purpose labels `guatswr:bff:upstream-token:v1` and `guatswr:bff:csrf:v1`.
  Missing or <32-character secrets throw; there is no fallback.
- AES-256-GCM with a fresh 12-byte IV and the record key as AAD. Token sealing
  is bound to the record, so moving or tampering ciphertext fails closed.
- Upstream JWT metadata is parsed only for `exp`; the signature is never treated
  as authentication. Lifetime is `min(exp, now + 24h)`; malformed, missing or
  already-expired `exp` rejects the login.
- Login calls `/api/auth/me` with the new token before creating a record; a
  login response identity is never trusted on its own.
- Every protected verification calls `/api/auth/me` again, compares the id,
  re-reads the record after the round trip (concurrent logout/rotation/expiry
  cannot resurrect it), updates the stored role and gates authority on the
  fresh role. Upstream 401/403/404 maps to local session expiry (401); role
  denial is 403 and does **not** delete the session; transport failures keep
  the session and return 503.
- Login deletes the previous local record and rotates the opaque id and CSRF
  token. Logout deletes the record (dropping the sealed token) and clears the
  cookies.

Storage is the process-local memory store (`maxEntries` default 10 000,
hard-bounded even for NaN/Infinity input). **Limitations:** restart logs every
user out; multiple instances do not share sessions; a filesystem/Redis driver
is deliberately out of scope. The profile batch must call
`revokeForUser(userId)` when a password or second password changes, because the
frozen backend does not bump `token_version` on profile updates.

## Write boundary

`web/server/utils/bff-write.ts`

- Exact `Origin` match against explicit `bffAuth.allowedOrigins`. Missing,
  empty, `null`, malformed, path-bearing, foreign or comma-joined origins are
  rejected. Host/X-Forwarded-Host are never used. Plain HTTP origins are only
  accepted for loopback test origins; real origins must be HTTPS.
- CSRF is required for login and logout: an opaque HMAC-bound token returned by
  `/csrf`, mirrored in an HttpOnly cookie, bound to `anonymous` or
  `session:<hash>`, compared constant-time, and rotated on login/logout.
  `security.csrf` (nuxt-csurf) stays disabled; the project-wide facility injects
  a meta token into every HTML response and does not give these routes their
  own binding/rotation semantics.
- JSON-only content type for login; logout also accepts an absent content type
  for a bodyless request. Declared/streamed body caps (16 KiB login, 1 KiB
  logout), 5 s deadline with a race that cannot hang on a stalled iterable,
  fatal UTF-8 decoding, object-only JSON.
- Login rate limiting is an in-memory fixed window (10/min by trusted client
  address) before any upstream call, with a bounded key map (expired windows
  swept, then the soonest-reset window evicted) and a `Retry-After` hint. The
  backend's persistent lockout is unchanged.

## Trusted client identity

`web/server/utils/bff-identity.ts` uses native `node:net` `isIP`/`BlockList`
and URL canonicalization; no new dependency is required.

- Socket address first. `X-Forwarded-For` is read only when the direct peer is
  inside `bffAuth.trustedProxyCidrs`; default is trust none.
- The chain is validated, capped at 20 hops / 2048 characters, and walked
  right-to-left to the first untrusted address. Malformed chains fail closed.
- IPv4-mapped IPv6 is normalized to IPv4 before trust matching and forwarding.
  Zone ids, ports, brackets and lists are rejected. An IPv4-mapped IPv6 CIDR
  such as `::ffff:10.0.0.0/104` is rejected rather than silently reinterpreting
  the prefix in the IPv4 family.
- `X-Real-IP`, `CF-Connecting-IP` and `Forwarded` are never consulted. Upstream
  receives exactly one `X-Forwarded-For` address and only for the login
  identity operation; `/me` gets none.
- No cookie/random/fake IP is substituted: two clients behind the same proxy
  stay distinct through the validated chain.

Deployment still needs reverse-proxy sanitation/firewall work; this batch does
not execute infrastructure changes. If Nuxt is reachable directly from the
internet, the socket address is used and XFF is ignored (safe default).

## V1 upstream helper

`web/server/utils/bff-upstream.ts` exposes only `auth.login` and `auth.me`
(fixed verb/path). It validates the configured origin, denies redirects, never
retries mutations, uses an 8 s abortable timeout, caps response bytes while
streaming and cancels the reader, parses UTF-8 JSON, and builds headers from
scratch (`accept`, optional `content-type`, server `authorization`, one XFF).
Browser Cookie/Origin/Authorization/cookies and `Set-Cookie` are never
forwarded or reflected. Later guest/admin routes can extend the route map.

Only expected backend login messages are projected, via the frozen backend's
known texts (`需要二步密码`, `二步密码错误`, `用户名或密码错误 (剩余 N 次)`,
rate-limit wait seconds). Arbitrary `message` content — SQL, stack, upstream
detail, reflected credentials — never reaches the browser. 400/429 use fixed
texts and a bounded `Retry-After`.

## nuxt-auth-utils built-in endpoints

`web/server/plugins/bff-auth-guard.ts` unshifts an h3 layer that answers 404 for
`/api/_auth*` before the module's `GET`/`DELETE /api/_auth/session` handlers.
A Nitro `request` hook cannot short-circuit (Nitro captures its errors and
continues), which is why the guard is an h3 stack layer. Because h3 rewrites
`event.path` to the post-route remainder for a matched stack layer, both the
guard and the hooks resolve the path from `req.originalUrl` through
`web/server/utils/bff-request-path.ts`; checking `event.path` there would have
silently missed `/api/_auth/session` and let the built-in endpoint through.
`sessionHeader: false` is added to the runtime session defaults so a browser
cannot supply a sealed session through `x-guatswr-next-session`.

`web/server/plugins/bff-session-hooks.ts` adds defense in depth: the module's
`fetch` hook throws for `/api/_auth*` (no stale identity), and its `clear` hook
refuses external clears. Our own logout/expiry/rotation cleanup sets
`event.context.bffAuthInternalClear` only inside a `try/finally` server-owned
wrapper; there is no query/body/header bypass. `replaceUserSession` login
rotation does not run the clear hook.

## Required integration items (outside this batch's ownership)

### 1. Disable only the body-consuming XSS validator on BFF writes

Installed evidence:
`node_modules/nuxt-security/dist/runtime/server/middleware/xssValidator.js`
defaults to methods `["GET","POST"]`; for non-multipart POST it calls
`readBody(event)` before the route handler, JSON-stringifies, runs
`FilterXSS`, and returns 400 if the output differs. That both consumes the body
this BFF reads from `event.node.req` and rejects legitimate passwords/Markdown
containing angle brackets or other escaped characters. `requestSizeLimiter.js`
only inspects `Content-Length` and does not consume the body.

Proposed patch in `web/nuxt.config.ts` (Codex-owned `routeRules`; **not applied**
here to stay inside auth runtime-default ownership):

```ts
routeRules: {
  // ...existing rules unchanged...
  '/api/bff/**': { security: { xssValidator: false } },
}
```

This disables only `xssValidator` for the reviewed explicit BFF namespace.
Headers/CSP, CORS, allowed methods, request-size limiting and the rest of
nuxt-security remain enabled. The BFF replaces it with strict Zod object
schemas, JSON-only content type, streamed byte caps, Origin/CSRF checks and no
HTML sinks. Public pages keep the validator.

### 2. Switch the temporary contract mirror

`web/shared/bff-auth-contract.ts` is a copy of `packages/shared/src/auth.ts`
because the shared package does not export `./auth` yet (index/manifest
ownership is held back). Both the BFF server utilities and the login client
import it, so there is exactly one mirror on this side; the previous
server-only file was deleted. `web/tests/auth-contract.test.ts` fails if the
copies drift, including the form schemas and normalization. After Codex exports
the compiled shared auth module: replace the mirror imports with the package
export (no raw TypeScript import from `node_modules`, no double cast), delete
the mirror and its parity test.

### 3. Dependencies

`web/package.json` needs `"zod": "4.6.7"` in `dependencies` (same exact version
as `packages/shared`) and, for the login form, `"@tanstack/vue-form": "1.33.5"`.
The BFF schemas and the login route chunk import Zod directly; the form library
is only in the `/login` route chunk. Web declares neither today. No other
dependency is needed (`node:net`, `node:crypto`, native `fetch`). The lockfile
must be updated centrally. Details in [AUTH-LOGIN.md](AUTH-LOGIN.md).

### 4. Type declaration inclusion

`web/types/auth.d.ts` holds the `#auth-utils` augmentation. Nuxt's generated
tsconfigs include `web/shared/**/*.d.ts` but not `web/types/**`, so
`web/shared/auth.d.ts` contains only a triple-slash reference to it. Verify in
the real typecheck; if Codex prefers, move the augmentation into `web/shared`
and delete the pointer.

## Configuration

Private defaults added to `runtimeConfig.bffAuth` (Nuxt env override names in
parentheses; list values accept JSON arrays):

| Key | Default | Meaning |
| --- | --- | --- |
| `allowedOrigins` (`NUXT_BFF_AUTH_ALLOWED_ORIGINS`) | `[]` | Exact write origins. Empty means every write is rejected. Local example: `["http://127.0.0.1:3100"]`; preview only after approval: `["https://next.guatswr.top"]`. |
| `trustedProxyCidrs` (`NUXT_BFF_AUTH_TRUSTED_PROXY_CIDRS`) | `[]` | Explicit proxy CIDRs. Empty means ignore XFF. |
| `allowInsecureLoopbackCookies` (`NUXT_BFF_AUTH_ALLOW_INSECURE_LOOPBACK_COOKIES`) | `false` | Test-only; honored only for non-production, a loopback socket and a loopback Host. |
| `sessionMaxAgeSeconds` | 86400 | Cookie/record cap, additionally bounded by the JWT `exp`. |
| `csrfMaxAgeSeconds` | 7200 | CSRF cookie/token lifetime. |
| `maxJsonBytes` / `maxLogoutBytes` | 16384 / 1024 | Streamed body caps. |
| `memorySessionLimit` | 10000 | Memory store bound. |
| `loginRateLimitMax` / `loginRateLimitWindowMs` | 10 / 60000 | BFF login limiter. |
| `bodyTimeoutMs` | 5000 | Body deadline. |
| `upstreamTimeoutMs` | 8000 | Upstream deadline, no retry. |
| `maxUpstreamResponseBytes` | 65536 | Streamed upstream cap. |

`runtimeConfig.session.sessionHeader` is set to `false`; no other existing
session/cookie/route/cache/CSP/SEO/module/build setting was changed.

## Tests (written, **not run** in this worktree)

Commands for the integrated checkout:

```sh
pnpm --filter @guatswr/shared test
pnpm --filter @guatswr/web exec vitest run tests/auth-session.test.ts tests/auth-identity.test.ts tests/auth-write.test.ts tests/auth-upstream.test.ts tests/auth-service.test.ts tests/auth-contract.test.ts
pnpm --filter @guatswr/web exec vitest run tests/auth-api-integration.test.ts
```

| File | Covers |
| --- | --- |
| `packages/shared/src/auth.test.ts` | Login/twofa contract, role enum, `/me` projection, 0/1 twofa flag, malformed rows. |
| `web/tests/auth-session.test.ts` | 256-bit ids/hashes, purpose-separated HKDF, GCM IV/AAD/tamper, JWT metadata, 24h cap, store expiry/eviction/user revocation, invalid capacities. |
| `web/tests/auth-identity.test.ts` | IPv4/IPv6/mapped canonicalization, CIDR config errors (including mapped notation), right-to-left trusted/untrusted hops, spoofed Real-IP/CF/Forwarded, chain bounds, distinct clients, loopback host. |
| `web/tests/auth-write.test.ts` | Exact origin, content type, streamed/declared caps, no-destroy timeout, invalid UTF-8, CSRF binding/rotation/expiry, bounded limiter flood and non-finite config, message sanitizing. |
| `web/tests/auth-upstream.test.ts` | Allowlist, header construction, redirect/timeout/abort, streamed cap and cancellation, no retry, Retry-After bound, invalid JSON. |
| `web/tests/auth-service.test.ts` | Login success/2FA/400/401/429, malformed token metadata, /me-before-session, rotation, expiry/logout/revoke, role downgrade 403 vs expiry 401, concurrent logout/rotation, independent clients, known-message projection. |
| `web/tests/auth-contract.test.ts` | Temporary mirror parity with `packages/shared/src/auth.ts`. |
| `web/tests/auth-request-path.test.ts` | Guard/hook path resolution must use `req.originalUrl`; h3 slices `event.path` for stack layers. |
| `web/tests/auth-api-integration.test.ts` + `web/tests/fixtures/auth-upstream.mjs` (+ `.d.mts` types) | Real loopback HTTP: login/me/logout, 2FA, single XFF, no Cookie/Origin forwarding, 429 Retry-After, 403 revocation, role change, oversized response. |

Written-but-unrun includes every Nuxt/Nitro event behavior: real cookie
attributes, h3 session rotation, `readEventJsonBody` over a real request,
`sessionHooks`, built-in endpoint blocking, and production middleware ordering.
`web/tests/fixtures/auth-upstream.mjs` is a new standalone fixture; existing
`upstream.mjs`/`public-data.mjs` are untouched. To wire an auth E2E webServer
later, add `node web/tests/fixtures/auth-upstream.mjs` with `PORT=3182` and
configure `NUXT_BFF_AUTH_ALLOWED_ORIGINS` for the Nuxt origin.

### Missing acceptance (honest)

- No strict gate (typecheck/lint/build), no unit execution, no browser/E2E.
- No real Nitro POST to prove the xssValidator route rule, streaming cap,
  CSRF cookies, built-in 404 and internal-clear hook ordering. Codex must run
  this after applying the routeRule patch.
- No real backend smoke. The integration fixture is process-local HTTP only.
- No cross-instance/failover storage, no filesystem driver.
- No profile-password revocation route yet; `revokeForUser` is the hook.
- No frontend state cleanup (private Query/Pinia/form state) — later UI batch.
- Login UI and admin proxying were out of scope for the server batch; the
  login/client-session batch is documented separately in
  [AUTH-LOGIN.md](AUTH-LOGIN.md).

---

# Batch S3 follow-ups (runtime cache + cookie strategy)

- The runtime caches now live in `web/server/utils/bff-runtime.ts`
  (`createBffRuntimeFactory`). The auth service is rebuilt when the secret,
  validated `apiBase`, upstream limits or the session-store instance changes,
  so a replaced store is never ignored and a backend change cannot reuse the
  previous service. Configuration errors are field-only and never echo a
  configured value.
- Production session cookies remain `Secure`. Local HTTP testing that cannot
  persist a `Secure` cookie should use `https://localhost` (secure context) or
  the explicit, non-production, loopback-only
  `bffAuth.allowInsecureLoopbackCookies` switch. No global cookie default was
  weakened.
- The protected admin/account API built on this runtime is documented in
  [ADMIN-API.md](ADMIN-API.md).
