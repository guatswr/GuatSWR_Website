# Guest BFF for event drafts, signups and uploads — GUEST.md (revision 2)

Source-only batch. New files only; the event UI/shared batch stays frozen and the auth batch is
read-only. The frozen backend is unchanged and remains the final authority; guest identity is still its
`req.ip`.

## Routes (file-based, closed operation map)

| Method | Route | Operation → frozen v1 | Notes |
| --- | --- | --- | --- |
| POST | `/api/bff/guest/events/draft` | `POST /api/event/draft` | `{ id }`; one draft per intent; sets the opaque HttpOnly draft cookie |
| PUT | `/api/bff/guest/events/:id` | `PUT /api/event/:id` | own bound draft, `submit:true` only, receipt-based replay |
| GET | `/api/bff/guest/events/:id/signup` | `GET /api/event/:id/signup` | current visitor only; `{ data: … \| null }` |
| POST | `/api/bff/guest/events/:id/signup` | `POST /api/event/:id/signup` | shared signup schema + closed-signup guard |
| DELETE | `/api/bff/guest/events/:id/signup` | `DELETE /api/event/:id/signup` | stays available after the deadline |
| POST | `/api/bff/guest/upload/content` | `POST /api/upload_visitor` | `eid` must be a draft this BFF issued to this cookie/IP |
| POST | `/api/bff/guest/upload/avatar` | `POST /api/upload_visitor/avatar` | public signup-type event; no draft ownership |

`resolveGuestOperation` is the only place a verb and a path are combined: eight named operations, safe
positive-integer ids (`Number.isSafeInteger`, so `true`, floats, `NaN`, `Infinity` and unsafe integers
are rejected), and no arbitrary path/verb pair can be assembled. Every route goes through
`bffAuthHandler` (fixed public error bodies, `no-store`), the auth batch's `assertAllowedOrigin` and
bound-CSRF `verifyCsrf` (with the exact runtime CSRF lifetime), a guest fixed-window limiter, and the
trusted-proxy IP resolution. Content type is asserted before a single body byte is read; the JSON body
is byte-bounded. No browser cookie, `Authorization`, `Origin` or forwarding header is forwarded; each
upstream request is rebuilt with exactly one validated `X-Forwarded-For`.

## Upstream boundary

- One deadline spans response headers *and* the body (the same abort signal), plus the caller's signal.
- The body is read as a stream with a hard byte cap; an unbounded or chunked response is cancelled at
  the cap rather than buffered. A declared `content-length` over the cap short-circuits too.
- Redirects are never followed (the body is cancelled), a success status with unparseable JSON or
  invalid UTF-8 is a 502 — never a silent `null` — and upstream messages are never echoed: only fixed,
  redacted guest errors are returned.

## Draft ownership, identity and receipts

- The browser holds only an unpredictable 256-bit opaque id in an HttpOnly, SameSite=Lax cookie scoped
  to `/api/bff/guest`. The store keeps an HMAC of the id (or of an intent key) plus the issued draft
  ids, the creating IP and timestamps; the raw id is never stored and no raw secret is a map key.
- **Stable store identity:** the store is registered per `(session-store object, upstream origin,
  digest of the derived CSRF key)`, not per runtime wrapper (which `getBffRuntime` recreates per
  request). Two wrappers sharing stable components reuse one store; distinct origins or secrets are
  isolated; the registry is capped at four identities.
- **Intents without a cookie:** the first request of a visitor that has no draft cookie uses a digest
  of the bound CSRF token as its intent key, so two concurrent first requests resolve to one draft
  instead of two. Distinct visitors, distinct CSRF tokens and distinct IPs stay separate.
- **Rotation:** an expired, malformed, foreign-IP or missing record is never reassigned — the response
  rotates a fresh opaque id and the previous record is left untouched.
- **Bounds:** records (default 5 000), drafts (8), receipts (8) and in-flight work (500) are hard-capped;
  options that are `NaN`, `Infinity`, negative or absurdly large fall back to defaults; the in-flight
  slot is released on success *and* failure.
- **Receipts:** a confirmed submission records a digest of the exact payload. A retry with the identical
  body returns the recorded receipt without repeating the mutation; a different payload for a submitted
  draft is rejected (the draft is no longer owned). An upstream timeout stays **indeterminate** — the
  user may retry and the BFF never retries on its own; there is no exactly-once claim.

## Guest save payload

`parseGuestDraftSave` derives the allowed keys from the shared catalogue for the *type*: only that
type's own fields plus its person objects (`initiator`, `a`/`b`) with `id|qq|avatar|goal`, `submit:true`
required, and no other top-level key. Protected nested keys (`status`, `results`, `settlement`,
`completion`, `created_by*`, `updated_by*`, timestamps, `visitor_ip`, `user_id`, `id`) are rejected at
every depth, and content is bounded by depth, key count, string length and serialized size. Required
fields mirror the catalogue (`reward`, `*_avatar`, duo `b_id`/`b_avatar` when `b` is present). Unknown
non-protected fields are only preserved on the future protected admin route, never for guests.

## Signup rules (corrected)

The frozen STG/则则 `time` field is the **activity time**, not a signup deadline, so it never blocks
signup. Only an explicit `content.deadline` that parses as a Beijing-anchored timestamp closes signups
early; free-form text never gates. Type/status rules stay `STG`/`则则` and `published`/`ongoing`, and the
backend remains final. The avatar route keeps the frozen public-status semantics
(`published`/`ongoing`/`ended`/`settled`) so an ended event can still accept an avatar without changing
signup eligibility; a documented extra restriction limits it to the two signup form types because the
signup modal is its only caller.

## Uploads

`busboy@1.6.0` (the version the frozen backend already installs through multer) streams the single
`file` part into a private temp file (mode 0600, random name): 50 MiB per file, 51 MiB total stanza,
1 file, `eid` as the only allowed field (duplicates, unknown fields, extra files and limit events are
all rejected), 30 s request deadline, and an atomic concurrency reservation of 4 taken *before* the
first await so parallel requests cannot race the bound. The declared MIME type must be in the module's
own allowlist, the first 256 bytes must match the frozen backend's magic rules, and the file is
forwarded as a streamed multipart body via `fs.openAsBlob` (no duplicate 50 MiB buffer). Worst case one
50 MiB file plus bounded overhead is held, with four concurrent uploads maximum.
`dispose()` clears timers, detaches listeners, destroys the parser and writer, waits for the write
pipeline to settle and only then removes the temp directory — on success, failure, abort and parser
error alike. Client filenames are never reused.

## Cache invalidation

The cache worker's real helper is imported directly: `invalidatePublicData(['events','logs'])` is called
**only after a confirmed successful mutation** (draft submission, signup save/delete). It is
synchronous; a failure there cannot turn a confirmed write into a user-visible error, and it is
reported through the server error surface instead of being silently ignored.

## Central dependencies

1. Auth batch (`web/server/utils/bff-*.ts`, read-only here): `getBffRuntime`, `getCsrfBinding`,
   `readCookieSession`, `readEventJsonBody`, `resolveEventClientIp`, `bffAuthHandler`, `BffError`,
   `isLoopbackHostname`, `isLoopbackIp`, `parseIp`, `CSRF_COOKIE`, `CSRF_HEADER`,
   `assertAllowedOrigin`, `assertJsonContentType`, `createFixedWindowRateLimiter`, `verifyCsrf`,
   `FixedWindowRateLimiter`, plus `upstreamUrl`. `runtime.auth.verify(id).upstreamToken` is used
   directly (typed, non-nullable) — no cast, no cookie-role trust.
2. Cache worker: `web/server/utils/public-data.ts` (`invalidatePublicData`) and its `PublicDataKind` type.
3. `packages/shared` re-export of `events.ts`; `~/utils/club-date` (`parseClubTime`).
4. Dependencies: `busboy@1.6.0` exactly (verified from the installed backend tree). `@types/busboy` is
   not installed anywhere yet — its exact version must come from the central dependency decision, not
   from an invented range. `fs.openAsBlob` needs Node ≥ 20 (Node 24 here).
5. **Request-size limit:** the two upload routes carry up to 50 MiB plus multipart overhead, so the
   nuxt-security/body-limit configuration must allow that for these paths only; the default ~8 MiB would
   reject legitimate uploads. This is a config change owned centrally.
6. Serving: SVG stays accepted (frozen route); the served-uploads sandbox CSP belongs to the serving
   worker. Deployment: the draft store is in-memory per process (durable/multi-instance storage, restart
   semantics and reverse-proxy header sanitation remain in the deployment plan).

## Tests (written, not run here)

`web/tests/guest-drafts.test.ts` (intents, rotation, ownership, receipts, bounds, in-flight),
`web/tests/guest-bff.test.ts` (operation map + hostile ids, injected upstream route/header assertions,
streamed oversize cancel, unparseable/redirect/invalid-UTF-8, stalled deadline, projections, save
payload schema, signup rules, store-identity reuse/isolation) and `web/tests/guest-upload.test.ts`
(real HTTP multipart: happy path with exact bytes and cleanup, duplicate/unknown/extra parts,
non-allowlisted MIME, concurrency 4-admitted/5th-denied, client abort cleanup, magic bytes per format).
They import the auth helpers, so they execute after central integration; nothing here mocks the parser
or claims acceptance.
