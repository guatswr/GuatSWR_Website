# Genuine guest workflow integration

2026-10-19, primary `revamp/nuxt-foundation`, after `7e0b4d9`. Codex implemented
this directly, without delegation. Local only; v1 frontend/backend unchanged.

## Independently found defects and fixes

- The guest UI's module-global CSRF header provider was never registered. It now
  uses the owning Nuxt app's lazy coordinator. Reads/rendering remain anonymous.
- A mutation could survive logout/disposal or retry under a newer identity.
  Generation checks now guard sends, CSRF recovery and results; an old in-flight
  token promise is detached from a new generation. Auth retries have the same
  guard. This cannot undo writes the server already accepted.
- Both uploads threw before forwarding: the shared URL boundary rejected `_`
  in the frozen `/api/upload_visitor` path. A local Node inspector probe isolated
  the exception in the built application. The closed route table remains fixed.
- The save route rejected submitted IDs before checking confirmed receipts.
  Owners can now replay identical confirmed bodies; modified bodies conflict.
  Receipt matching includes draft ID, preserving identical content in two drafts.
- A lost first Set-Cookie created a second upstream draft. A bounded short-lived
  first-response cache recovers the same ID/cookie for the same CSRF intent and
  address. Simultaneous intents on different addresses are separated. Record
  indices stay hashed; cached first-response cookies remain private server
  memory only, never logs/JSON. This is process-local, not durable exactly-once
  delivery across a restart or an indeterminate upstream timeout.
- Submission-lock saturation formerly evicted a live lock and could permit a
  duplicate. Saturation now refuses work; expired/evicted records release their
  orphaned locks. Record and first-response caches retain hard bounds.
- The default middleware's 8 MB upload threshold contradicted the 50 MiB file
  contract. Guest upload ingress now permits 51 MiB including multipart overhead;
  exact file/total/time/concurrency/magic-byte stream guards remain active.
- Client JSON reads now have a 64 KiB streamed cap and 15 s deadline. XHR sets
  its previously missing timeout (60 s) and bounds responses. Only an explicit
  pre-write 403 `csrf_invalid` retries once; network, generic 403 and 5xx do not.

## Exact changed/new inventory

- `web/app/composables/useEventApi.ts`
- `web/app/utils/{event-transport,upload-progress,bff-client,bff-session-core}.ts`
- `web/server/utils/{upstream,guest-drafts}.ts`
- `web/server/api/bff/guest/events/[id]/index.put.ts`
- `web/nuxt.config.ts` (guest upload ingress rule)
- `web/tests/{bff-session-race,guest-bff,guest-drafts,event-bff-integration}.test.ts`
- `web/tests/fixtures/{auth-upstream,guest-upstream}.mjs`
- `web/tests/e2e/guest-integration.spec.ts`
- `web/tests/e2e/support/events-parity.ts` (existing UI stub's CSRF response;
  the new genuine integration spec never intercepts BFF requests)

## Executed evidence

Pinned Node 24.15.0 / pnpm 11.25.0, `.tools/tmp` TEMP/TMP and pinned browser
cache in every shell. Builds/browser runs serialized by `.tools/build.lock`.

| Command / selection | Actual result | Raw local evidence |
| --- | --- | --- |
| New genuine draft browser case before fix | 0/1, upload blocked | `.tools/codex-guest-before.log` |
| Four new mutation races before fix | 4 fail, 12 old cases pass | `.tools/codex-mutation-races-before.log` |
| Session/client/theme selection after fix | 94/94 | `.tools/codex-mutation-races-after.log` |
| Typed event client + per-app CSRF | 7/7 | `.tools/codex-event-csrf-units.log` |
| First genuine four-case run after hookup | 0/4; upload URL 500 exposed | `.tools/codex-guest-first.log` |
| `pnpm -r typecheck/lint/test/build` (separate commands) | All exit 0; 643 units (68 shared + 575 web); lint 33 warnings / 0 errors | `.tools/codex-guest-final-{typecheck,lint,test,build}.log` |
| Typecheck after final E2E assertions | exit 0 | `.tools/codex-guest-e2e-typecheck.log` |
| `pnpm test:tooling` | 56/56 | `.tools/codex-public-guest-tooling.log` |
| `node scripts/revamp/check-artifacts.mjs` | 0 maps | `.tools/codex-public-guest-artifacts.log` |
| `node scripts/revamp/check-route-budget.mjs --routes scripts/revamp/route-fixtures.json` | 14 routes pass, 117275–130126 B gzip | `.tools/codex-public-guest-routes.json` |
| Isolated `guest-integration.spec.ts` | **6/6**, 0 skip/flaky/retry | `.tools/codex-guest-upload-repair.log`, `web/.e2e-isolated/codex-guest-upload-repair/summary.json` |

The six cases use genuine browser/HTTP → built Nuxt BFF → in-memory frozen-v1
upstream requests: one draft across upload/manual retry/lost Cookie recovery,
confirmed replay, foreign-cookie isolation, signup avatar/save/reopen/read/delete,
9 MiB accepted ingress and 50 MiB + 1 B rejection without upstream upload. They
assert server-built address forwarding and no browser Cookie/Origin/Authorization
on anonymous upstream writes. No real database/backend/notifications are used.

Full 188-case public/auth/guest E2E is running on the same artifact; the six-case
result is not a full green run. Mobile LCP remains over 1800 ms (latest candidate
1960.7 ms / score 99). Administration, full security/performance and new remote
CI remain open. No deployment or QQ success notification occurred.
