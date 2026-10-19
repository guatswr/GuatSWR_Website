# Public data and read adapters

Read-only BFF adapters for the frozen Express v1 API, plus a same-origin
`/uploads/**` image proxy. Contracts live in `packages/shared/src/public.ts`
(Zod schemas + exported types); the adapters live in
`web/server/utils/public-read.ts`, `web/server/utils/public-image.ts` and
`web/server/utils/upstream.ts`.

No admin, auth, write or form endpoint is exposed here. The frozen `backend/`
and archived `frontend/` sources are untouched references.

## Route mapping

| Browser route (Nitro) | Frozen upstream | Response |
| --- | --- | --- |
| `GET /api/activities?page&limit` | `GET /api/activities` | `{ total, page, limit, items: PublicActivity[] }` |
| `GET /api/activities/:id` | `GET /api/activities/:id` | `PublicActivity` |
| `GET /api/members?school` | `GET /api/members` | `PublicMember[]` |
| `GET /api/members/stats/schools` | `GET /api/members/stats/schools` | `PublicSchoolStat[]` |
| `GET /api/history` | `GET /api/history` | `PublicHistoryEntry[]` |
| `GET /api/event?page&limit&type` | `GET /api/event` | `{ total, page, limit, items: PublicEvent[] }` |
| `GET /api/event/:id` | `GET /api/event/:id` | `PublicEvent` |
| `GET /api/event/:id/participants/public` | same | `PublicEventParticipant[]` |
| `GET /api/logs?page&limit&username&action` | `GET /api/logs` | `{ total, logs: PublicLog[] }` |
| `GET /api/logs/stats?limit` | `GET /api/logs/stats` | `PublicLogStat[]` |
| `GET /api/logs/umami?startAt&endAt&unit&limit&envType` | same | `PublicUmamiStats` |
| `GET /uploads/<path>` | the same private origin's `/uploads/<path>` | image bytes |

`GET /api/config` keeps its explicit allowlist projection; its reader now has
the same credential-free upstream boundary and composes the projected-data
cache described in [CACHE.md](CACHE.md).

The upstream origin is only ever `runtimeConfig.apiBase` (administrator
configured). Paths are fixed literals; only validated query values and numeric
ids are interpolated.

## Query surface

The browser cannot reach admin filters (`all`, `includeDeleted`, `original`,
`status`, ...): they are simply not part of any adapter's query builder.
Repeating a parameter, passing a nested value or a non-numeric id is rejected
with `400`; numeric pagination is clamped exactly like v1 (`page >= 1`,
`1 <= limit <= 100`, stats `limit <= 50`). Unknown Umami `unit`/`envType` values
fall back to the frozen defaults (`day`/`browser`), matching the backend's own
tolerance.

Omitted Umami `startAt`/`endAt` stay omitted so the frozen route keeps its
last-seven-days window; an explicit `0` is still forwarded and means "full
range". `startAt > endAt` is rejected with `400`.

## Projection and redaction

`packages/shared/src/public.ts` defines two layers per resource:

* `*Row` schemas parse what the archived backend actually returns (nullable
  text columns, JSON-stringified image/tag lists, joined author columns,
  moderation columns).
* `public*` schemas describe what may be serialized to the browser.

The adapters filter and project between the two. Deliberately dropped:

* `deleted_at`, `deleted_by`, internal `created_by`/`updated_by` numeric ids.
* Event `visitor_ip`; participant `user_id`, `visitor_ip`, `event_id`.
* Audit-log `user_id` (injected by the archived join) and any IP/session data.
* Unknown or nested event content keys; only the supported `EventCard` /
  `eventFormModel` fields are projected.
* Author-supplied `qq` inside event `initiator`/`a`/`b` blocks (no archived
  public view renders it). Public signup cards keep `qq` because the archived
  list renders it.

Legacy null/absent text becomes `''`; unmatched author joins stay `null`;
malformed `images`/`tags` data degrades to `[]` exactly like
`normalizeImages`/`parseTags`, while legitimate long lists are preserved in
full (no silent truncation).

**Audit-log details (deliberate privacy difference from frozen v1):** the
archived `/api/logs` republishes `addLog` descriptions verbatim, including
`登录成功 (IP: ${clientIp})` and `IP ${clientIp} 锁定`. The public contract
returns fixed safe text for security/admin-only actions instead — login, lock,
ban/unban, password and 2FA reset, token-version refresh, backup settings,
backup download/delete/run/failure and event-file cleanup failures — while
ordinary content actions keep their real title/name/EID information (for
example `发布活动: 秋季例会`). `UPDATE_CONFIG` keeps its description only for
`site_config` keys that are already public through `/api/config`; any other key
becomes `修改了站点配置`. On top of that, retained descriptions pass a bounded
defence-in-depth redaction that replaces IPv4/IPv6 addresses with `[ip]` and
JWT-like, credential-labelled or long token-shaped strings with `[redacted]`.

That redaction is a *bounded heuristic*, not a guarantee: it cannot sanitize
arbitrary text, so it is deliberately not the primary control. The primary
control is the fixed per-action text above, and the frozen backend and archived
frontend are unchanged. Audit-log descriptions are additionally bounded at 4096
UTF-16 code units before parsing/redaction; an over-bound description becomes
the fixed placeholder `日志详情过长，已省略`, never a partial copy. That bound
applies only to log details — article/activity `content` and other public text
are preserved in full.

**Activity Markdown:** list/home payloads (`/api/activities`) return
`content: ''`; only `/api/activities/:id` returns the raw Markdown, for a
server-side Markdown renderer. The archived list never rendered `content`.
`images`/`cover_image` are unchanged in both.

**Umami metrics:** the frozen route forwards `/stats` unchanged, and official
Umami v2 responses can be flat numbers, stringly-typed numbers, `null` (no
data) or nested `{ value, prev }`. All are flattened to the flat public metric;
missing sections become documented zeroes, while malformed metric objects (for
example `{ pageviews: { value: {} } }`) are a contract violation (`502`) rather
than a silently guessed zero.

## Errors and statuses

| Situation | Browser status |
| --- | --- |
| invalid/repeated query value, malformed id, reversed time range | `400` |
| upstream missing row, or non-public row reported as upstream `403` | `404` (existence is never disclosed) |
| public signup list for a type that never supported signups | `400` |
| upstream `5xx`, timeout, redirect, malformed JSON/row/shape, byte cap exceeded, Umami `503` | `502` |
| server-side public-data cache has all fill slots busy (new key, no usable stale entry) | `503` (fixed public "busy" text; never an empty DTO) |
| upstream image missing | `404` |
| upstream image broken, type-spoofed or over the cap | `502` |

Error bodies never contain upstream messages, SQL, stack traces or debug data;
messages are fixed strings owned by the BFF. There is no retry (`retry: 0`).

## Network and cache boundaries

* JSON reads: fixed origin/path, allowlisted query, `accept: application/json`
  only, 8 s `AbortSignal` timeout, redirects denied, and no browser Cookie /
  Authorization / Origin / `X-Forwarded-*` forwarding. The body is read through
  an 8 MiB byte budget **while streaming**; the upstream stream is cancelled as
  soon as the budget is exceeded, or immediately when the response is rejected
  unread. The deadline always starts at 8 s; only the private server-side read
  context may *lower* it (`timeoutMs`, used by tests), it can never exceed 8 s,
  and a browser query value can never influence it.
* Image proxy: same origin/path rules, `accept: image/*` only, 8 s timeout,
  redirects denied, extension allowlist (`jpg/jpeg/png/gif/webp/svg`) matching
  the frozen upload middleware, declared `Content-Type` must match the
  extension family (type spoof rejected), declared length and streamed bytes
  capped at 50 MiB (the frozen multer limit), stream cancelled on overflow or
  client disconnect, and `X-Content-Type-Options: nosniff`.
  SVGs additionally receive `Content-Security-Policy: sandbox; default-src
  'none'; style-src 'unsafe-inline'` so a directly navigated SVG cannot execute.
  `/uploads` paths are validated after the URL layer's own normalization, so a
  request can only ever read inside the uploads tree: anything that would
  resolve outside `/uploads`, encoded separators (`%2f`, `%5c`), backslashes,
  unknown extensions and over-long paths are rejected with `404` before any
  upstream request is made. A query string is ignored, exactly like the frozen
  `express.static` mount; `missing`-prefixed fixtures answer `404` on purpose.
* Caching: `/api/**` stays `Cache-Control: no-store` in the browser. The server
  keeps a bounded SWR cache of projected public DTOs only (TTLs, keys, bounds,
  failure/404 semantics and the internal invalidation contract are documented in
  [CACHE.md](CACHE.md)). Public HTML is rendered fresh with a per-response CSP
  nonce and `private, no-cache, max-age=0, must-revalidate`; it is not cached as
  a document and emits no validator, so a nonce-bearing body cannot be replayed
  through a 304. Proxied images remain `public, max-age=3600`. User-specific
  reads must never enter shared HTML caches, and no auth data is read here.

## Fixtures and tests

* `web/tests/fixtures/public-data.mjs` holds deterministic raw v1 rows
  (including private/deleted rows, visitor columns and the frozen security-log
  text with client IPs), real tiny image bytes (PNG/GIF/JPEG/SVG; the WebP is
  the repository's committed brand asset) and
  `handlePublicFixture(request, response)`, which mirrors the frozen routes'
  own filtering, projections and statuses for the isolated upstream.
  Two ids are reserved for failure coverage: `/api/activities/998` answers
  `503` with a private decoy body (so page E2E can assert the BFF's sanitized
  `502` without a global toggle or race), while `999` stays a plain `404`.
  998 is never part of the published list and there is no production switch.
* `web/tests/fixtures/upstream.mjs` delegates to it and keeps `/health`, the
  config credential-leak marker, `banner_text: '契约测试'` and the private
  `token_version` decoy.
* `packages/shared/src/public.test.ts` covers frozen-row normalization and the
  public DTO/Umami contracts.
* `web/tests/public-read.test.ts` exercises the adapters over real HTTP against
  the fixtures: projection, redaction, statuses, credential-free requests,
  bounded/cancelled reads, timestamp forwarding, image caps and traversal
  rejection.

`@guatswr/shared` is consumed through its compiled `dist`; `pnpm -r test` builds
it first (the shared `test` script runs `tsc -p tsconfig.build.json`), so web
tests never depend on a stale or missing build. `h3` is a declared direct
dependency of `@guatswr/web` because the adapters import `createError` from it.
