# Protected administration API

2026-10-20, `revamp/nuxt-foundation`. Integrated local implementation, still
under acceptance. Article/event UI acceptance remains open. Exact verification
and limitations: [integration evidence](logs/11-admin-integration/README.md).
The original source-only batch report is superseded by this document.

## Browser boundary

The browser sends only an opaque BFF session cookie and a CSRF header on writes.
Backend JWTs remain in the server session store. Every private operation checks
the live backend identity/role. Neither a browser role hint nor hidden navigation
grants authority. Private responses use no-store; public cache projections never
contain these responses.

| BFF endpoint | Operation / authority |
| --- | --- |
| `GET /api/bff/account/me`, `PUT …/profile` | Verified identity; update own profile/security |
| `GET/POST /api/bff/admin/activities`, `GET/PUT/DELETE …/:id` | List/read/create/update/soft-delete articles; admin |
| `POST …/activities/draft`, `POST …/activities/:id/restore` | Allocate upload draft; restore requires super-admin |
| `GET/POST …/members`, `PUT/DELETE …/members/:id`, `POST …/:id/restore` | Member management; restore/includeDeleted require super-admin |
| `GET/POST …/history`, `PUT/DELETE …/history/:id`, `POST …/:id/restore` | History management; restore/includeDeleted require super-admin |
| `GET/PUT …/config` | Ten explicit editable keys; admin; upstream writes use frozen POST contract |
| `GET …/logs`, `DELETE …/logs/:id` | Read as admin; permanently delete as super-admin |
| `GET/POST …/users`, `DELETE …/users/:id`, `PUT …/:id/password`, `PUT …/:id/twofa-reset` | Account management; super-admin |
| `POST …/token-version/refresh` | Revoke all admin logins; super-admin |
| `GET/POST …/events`, `GET/PUT …/events/:id` | Event list/detail/create/edit; admin |
| `POST …/events/:id/approve`, `reject`, `status`, `settle`; `DELETE …/events/:id`; `PUT …/events/:id/results`; `GET …/events/:id/participants` | Explicit frozen event operations; admin; backend retains final business checks |
| `POST …/upload?activityId=…` or `?category=icon_svg` | Authenticated bounded multipart upload; selectors mutually exclusive |
| `GET/POST …/bans`, `DELETE …/bans/:ip` | IPv4/IPv6 access restrictions; super-admin |
| `GET …/backups`, `DELETE …/backups?type=full&file=…` | Explicit full backup file list/deletion; super-admin |
| `GET/PUT …/backups/settings`, `POST …/backups/run` | Backup configuration/manual execution; super-admin |
| `GET/HEAD …/backups/download?type=full&file=…` | Bounded streaming attachment; super-admin |
| `POST …/recycle-bin/purge` | Permanent recycle-bin purge; super-admin |

All abbreviated `…` paths above begin `/api/bff/admin`. Route files choose one
literal operation. The browser cannot supply an upstream URL, arbitrary path,
verb, headers or query key. Positive integer IDs and basename/IP selectors are
validated before constructing upstream paths. JSON responses are projected
through shared Zod schemas; raw password fields, secrets and unknown columns
are excluded. The private backup-settings projection redacts raw last-error
diagnostics. Fixed error messages do not reflect SQL text or stack traces.

## Session and write behavior

- Missing/expired/rejected identities return 401 and clear session/CSRF cookies;
  an existing server record is revoked. An ordinary permission denial returns
  403 and keeps the session. A verification outage remains unavailable/5xx.
- The BFF binds its own verified JWT and resolved client address after merging
  internal request options. Browser Authorization/Cookie/Origin/forwarding
  headers are never copied upstream. Client-address handling follows the
  configured trusted-proxy policy; it is not absent from admin requests.
- Writes require an exact allowed Origin and a valid session-bound CSRF token.
  Bodyless operations drain/check actual bytes even without Content-Length.
  JSON/multipart requests have byte caps and deadlines. Uploads validate image
  magic, reconstruct multipart with a fixed filename and dispose temporary
  state. The public image proxy already sandboxes SVG responses.
- Confirmed password/2FA changes revoke all local sessions for that user and
  require a fresh login. Account deletion/password reset/2FA reset revoke the
  target's local sessions. Global refresh invalidates all local sessions.
- User deletion freshly checks identity/list inside a bounded FIFO critical
  section, denies self-deletion and protects the final super-admin. This lock
  covers one Nuxt runtime/store; it is **not a distributed backend transaction**.
  Concurrent legacy-site writes/multiple processes remain an explicit boundary
  while the backend contract/source stays frozen.
- Confirmed content writes invalidate the actual relevant public-data cache
  plus public logs. Indeterminate writes are not retried. Browser transport may
  retry one explicit CSRF rejection after obtaining a new CSRF token.
- Login/logout begin a new client identity generation. In-flight old work cannot
  overwrite a newer session or adopt stale mutation results. Private requests
  abort and query data clears on identity/role loss or scope disposal.

## Backup transport

The binary handler validates a fixed upstream attachment, disallows redirects
and content encoding, uses a byte cap/deadline and two concurrent slots by
default. A paused or cancelled client destroys both the fetch and paused Node
stream; finally releases the slot. Errors after partial output close the stream
rather than appending JSON to an archive. HEAD has an explicit Nitro route.

Browser downloads up to 64 MiB may use a bounded Blob with progress. Larger
files use the native browser download manager and the UI reports a handoff,
not completed delivery. The manual backup route has a separate five-minute
upstream deadline and no automatic retry. Configuration remains private.

## Verification scope

Unit tests cover shared input/output contracts, fixed transports, session races,
bounded binary reads and user-lock behavior. Real production-output E2E uses a
loopback in-memory frozen-v1 fixture, never the real backend or user data. It
verifies mutations, public cache invalidation, CSRF/role/session denials, actual
multipart and byte-exact backup download/cancellation. UI presence alone is
not evidence that a pending article/event workflow is complete.
