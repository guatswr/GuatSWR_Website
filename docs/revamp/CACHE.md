# Public data SWR and fresh HTML nonces

Status: source batch implemented in the `revamp-cache` worktree, based on
`6c07760`. Unit/integration/E2E specs in this batch are **UNRUN** until the
primary worker runs the central gates. This document describes the intended
contract; it is not a claim of measured performance.

## Why data SWR instead of HTML SWR

Caching a rendered public page also caches its CSP nonce. Replaying that HTML
means replaying a nonce that may already have been observed, and rewriting
nonces inside an HTML body is brittle. The route-level SWR rules for public
pages were therefore removed:

* public HTML is rendered fresh for every `GET`/`HEAD`;
* every response gets its own CSP nonce, and that nonce matches every rendered
  `nonce` attribute;
* public HTML uses
  `Cache-Control: private, no-cache, max-age=0, must-revalidate`, emits no
  `ETag`/`Last-Modified`, and is never answered with `304`;
* `no-store` remains on `/api/**`, `/join` and admin routes, and staging
  `X-Robots-Tag: noindex, nofollow` is unchanged.

The maintained `compression` middleware skips `no-store` HTML but accepts the
new `private, no-cache` policy, so public HTML keeps gzip/Brotli/identity
negotiation. HEAD requests are answered successfully; the middleware
deliberately does not compress HEAD bodies.

Only **projected public data** is cached, in the server process. See
`web/server/utils/public-cache.ts` (generic bounded cache) and
`web/server/utils/public-data.ts` (cached composition used by every API route).

## Cached reads and TTLs

| Kind | Cached reads | Fresh TTL | Max stale |
| --- | --- | --- | --- |
| `config` | `/api/config` (homepage links/configuration) | 60 s | 300 s |
| `activities` | `/api/activities`, `/api/activities/:id` | 120 s | 600 s |
| `events` | `/api/event`, `/api/event/:id`, participants | 60 s | 300 s |
| `members` | `/api/members`, `/api/members/stats/schools` | 300 s | 1800 s |
| `history` | `/api/history` | 300 s | 1800 s |
| `logs` | `/api/logs`, `/api/logs/stats`, `/api/logs/umami` | 30 s | 120 s |

Only the reader output after filtering, projection and redaction is stored.
Cached DTOs are treated as immutable: server composition must not mutate a value
returned by a cached read. Raw rows, upstream JSON, rendered Markdown/HTML, CSP
nonces, cookies, authorization headers, IPs and private status are never cached.
The loaders are the credential-free adapters in `public-read.ts`; the cache key
never contains a browser-derived credential or request header.

## Keys

Keys are `JSON.stringify([kind, generation, canonicalOrigin, parameters])`.

* `parameters` are built by the cached wrappers from already parsed and clamped
  values (for example `parsePageQuery` turns omitted, empty and explicit
  defaults into `1/20`). Supported filters, pages and types are included;
  unsupported admin filters cannot reach the readers.
* An absent filter is normalized to `null`; `null` and `0` are distinct.
* Each endpoint family has a stable tag (`list`, `detail`, `participants`,
  `school-stats`, `stats`, `umami`, `config`) so parameter lists with the same
  shape cannot collide.
* `canonicalOrigin` isolates different administrator-configured backends. It is
  never taken from the browser. The origin is validated with the strict
  upstream-origin rule **before** the cache lookup, so a warm entry can never
  hide an invalid `apiBase` (credentials, path, query, fragment, non-HTTP).
* The per-kind generation is part of the key, so invalidation starts a new key
  space instead of mutating keys that an old fill may still hold.
* Parameter length is bounded by the actual parsers: ids are digit-only
  (≤ 15 digits, positive safe integer); page/limit are digit-only ≤ 9 digits and
  then clamped (`page` ≤ 100000, list `limit` ≤ 100, stats/Umami `limit` ≤ 50);
  filters (`username`/`action`/`school`) are ≤ 50 chars after trimming and
  rejecting control characters; `type`/`unit`/`envType` are ≤ 32 chars. No raw
  query string or unbounded browser value becomes key text.

Client `useFetch`/`useAsyncData` keys in migrated pages must follow the *same
normalized query object* (defaults applied, unsupported parameters excluded), so
a filter/page/type change is a distinct client key rather than a stale reuse of
the previous request's key.

## Bounds and retention

`PUBLIC_CACHE_HARD_LIMITS` is a documented, non-negotiable ceiling; constructor
options may only lower it:

* at most **500 retained keys**, evicted least-recently-used;
* at most **64 concurrent fills** (`inflight`), including obsolete-generation
  fills that are still settling;
* at most **2 MiB serialized bytes per entry**;
* at most **8 MiB serialized bytes total**.

A resolved value above a retention bound is returned to the caller but not
retained. Cache keys can include attacker-selectable pagination/filter values, so
the key bound is what prevents an unbounded key space; an evicted entry is simply
read again. Parameter length is bounded by the parsers (see Keys above), so key
memory is bounded by key count × bounded parameter size.

Concurrent fills are deduplicated per key. A key that is already admitted always
joins its existing fill; a *new* key beyond the 64-fill ceiling is refused with a
public-safe `503 Public data busy` rather than being queued or turned into an
empty successful payload. There is deliberately **no wait queue**; the caller
retries later. A background refresh at capacity is simply skipped while the
readable stale DTO is still returned successfully. Settling (success, failure or
404) always releases its slot.

## SWR semantics

1. **Fresh**: return the stored DTO without contacting upstream.
2. **Stale within max stale**: return the stored DTO immediately and start one
   background refresh for that key. Concurrent callers share the same fill.
3. **No entry, or older than fresh + max stale**: discard the entry and wait
   for a fill.

Failure behavior:

* A rejected loader is never cached. With an empty cache the caller receives the
  reader's error (`400`/`404`/`502`).
* A background refresh failure is caught and the still-in-window stale DTO stays
  available; at the end of max stale the next request waits for a fill and
  surfaces the error. Staleness is never unbounded.
* A `404` during a background refresh deletes the retained entry (deleted or
  unpublished content stops being served after at most one stale response).
  An empty-cache `404` is propagated and not cached.
* A malformed/error response is never turned into an empty successful DTO.
* When every fill slot is busy, a caller that needs a new fill receives the
  explicit `503 Public data busy`; it never receives an empty or fabricated
  public DTO. Invalid configuration (including a credentialed/path/fragment/
  non-HTTP `apiBase`) still fails closed with the reader's `502` even when a
  matching warm entry exists.

## Invalidation contract

`invalidatePublicData(kinds)` in `web/server/utils/public-data.ts` is the typed
internal hook for **successful BFF admin mutations**. That module is the single
authority for the cache and its generations; root integration imports the hook
from exactly `web/server/utils/public-data.ts` (no duplicate cache and no
re-export cycle). Kinds are intentionally coarse:

* `activities` also covers activity details;
* `events` also covers event details and public participant lists;
* `members` also covers school stats;
* `logs` also covers log stats and Umami;
* `config` covers home links/config;
* `history` covers the history list.

Invalidation clears retained entries for the kind and increments its
generation. Any older in-flight fill checks the generation before storing and
therefore cannot resurrect pre-mutation data into the current generation.
Callers already awaiting that old fill may still receive its result, which was
requested before the mutation.

There is **no anonymous revalidate HTTP route**. The frozen legacy admin writes
bypass the BFF; their changes converge through the normal TTL/max-stale windows
until the admin migration calls this contract. The cache is per server process
(the `node-server` preset is single-process); a future multi-process deployment
must invalidate every process or accept the TTL window.

## Composition for content, sitemap and RSS

Page loaders, sitemap/RSS builders and other server-side public composition must
use the `readCached*` wrappers, not the raw readers, so there is one cached
projected layer. The public JSON routes already do this. Content pages that still
call the raw readers in this source batch (activity/member/history/log page
loaders live in other workers) must be switched to
`readCachedActivity`/`readCachedHistory`/`readCachedMembers`/`readCachedLogsPage`
before root acceptance; sitemap/RSS must follow the same wrappers. There is
deliberately no second parsed-Markdown cache with an independent invalidation
lifetime: render Markdown from a cached activity detail per request, or derive it
in the same request without retaining a separately stale copy.

## HTML headers and nonces

`routeRules` in `web/nuxt.config.ts` no longer contain `swr` for public pages.
The public HTML routes now set:

```text
Cache-Control: private, no-cache, max-age=0, must-revalidate
```

Because no validator is emitted, a conditional request is answered with a fresh
`200` and a fresh nonce rather than `304`. Repeated GET/HEAD calls, warm
requests, compressed and identity responses all carry a nonce that matches every
script/style nonce attribute and the CSP header. The browser API remains
`no-store`; the server-side data cache is invisible to the browser cache.

## Trade-off, stated honestly

Caching projected DTOs avoids repeated frozen-backend work for anonymized
public reads, and it prevents repeated parsing/projection of the same rows. It
does **not** make the migrated pages inherently faster: every public HTML
response is rendered fresh to get a safe nonce, so SSR work still happens per
request. Actual per-page Lighthouse/JS numbers must be measured on the central
build after page migration; no speedup is claimed from the architecture alone.

## Tests in this batch

Written and marked **UNRUN** in this source-only worktree:

* `web/tests/public-cache.test.ts` — fake-clock TTL/stale/max-stale, dedupe,
  key separation, generation vs in-flight, 404/error semantics, key/body bounds,
  inherited action/kind names.
* `web/tests/public-cache-limits.test.ts` — hard-ceiling clamping, inflight
  admission/503, dedupe of admitted keys, slot release on success/failure,
  stale refresh skipped at capacity, bounded pending fills across repeated
  invalidation.
* `web/tests/public-data-cache.test.ts` — real HTTP against the deterministic
  fixture: canonical pages, origin isolation, fail-closed origin validation
  before a warm hit, projected config, invalidation, non-cached
  404/invalid-config, stale background refresh, credential-free reads.
* `web/tests/public-log-redaction.test.ts` — prototype-named actions, 4096 bound,
  pathological padded token, and proof that article `content` is not truncated.
* `web/tests/e2e/cache-nonces.spec.ts` — fresh nonce on repeated GET/HEAD,
  private/validator-free headers, conditional requests never `304`, gzip/identity
  negotiation, `no-store` credential-independent APIs, staged noindex.

`web/tests/e2e/foundation.spec.ts` remains owned by the primary worker. Its
existing assertions still hold, but its “warmed SWR response” wording describes
the removed HTML cache; the lead may rename that comment to “repeated response”.
