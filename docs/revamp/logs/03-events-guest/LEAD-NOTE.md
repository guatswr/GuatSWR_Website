# Lead note — the guest BFF is parked until the auth round

Written by the lead after workstream 03 reported. This note is the authority on
what of that batch is in the tree and what is not.

## Decision

The guest BFF cannot be integrated in this round. `web/server/utils/guest-bff.ts`
imports `./bff-auth-context`, `./bff-identity`, `./bff-errors` and `./bff-write`,
and `guest-upload.ts` imports `./bff-errors` plus `busboy`. Those helpers are the
authentication round's files (`revamp-auth`, 92 files, never executed) and are
not in the tree; `busboy` is not a `web` dependency. A build with those files
present fails with
`RollupError: Could not resolve "../../../../utils/bff-errors" from
"server/api/bff/guest/upload/content.post.ts"`, and that failure also wiped
`web/.output/server/index.mjs`, which blocked the other two workstreams.

The workstream correctly refused to stub or shim the auth contract to make its
own tests run — that would have validated the guest BFF against a fake identity
layer. Parking is the honest alternative.

## Parked (moved to `.tools/parked/03-events-guest/`, contents unchanged)

```
web/server/api/bff/guest/events/draft.post.ts
web/server/api/bff/guest/events/[id]/{index.put,signup.get,signup.post,signup.delete}.ts
web/server/api/bff/guest/upload/{content,avatar}.post.ts
web/server/utils/guest-bff.ts
web/server/utils/guest-upload.ts
web/tests/guest-bff.test.ts          (16 tests, never executed)
web/tests/guest-upload.test.ts       (7 tests, never executed)
web/tests/e2e/events.spec.ts         (needs the guest endpoints at runtime)
web/tests/e2e/events-visual.spec.ts
web/tests/e2e/support/events-parity.ts
```

These are parked, not deleted: the auth round restores them together with the
`bff-*` helpers, `busboy`, and the vitest alias question below.

## Kept and integrated

Everything else from the batch, including `web/server/utils/guest-drafts.ts` and
its 9 passing tests (it imports only `node:crypto`, so it is standalone and is
the part of the guest flow that is genuinely verified today).

## Carried into the auth round

1. Restore the parked paths and install `busboy` (the frozen backend already
   ships `busboy@1.6.0`, so the version is known).
2. `web/vitest.config.ts` has no alias for `#imports` or `~/utils/*`, so any
   module under test that imports them cannot load. The existing suites avoid
   this by using relative imports; the guest suites do not. Decide the alias (or
   the `@nuxt/test-utils` environment) as part of that round — it is lead-owned
   infrastructure.
3. **Save locking is neither implemented nor tested.** `events/[id]/index.put.ts`
   checks `owns()` and then `beginSubmission()`, but `owns()` stays true until
   `confirmSubmission()` runs after the upstream write, so two concurrent
   identical saves both return `{kind: 'new'}` and both reach the frozen backend.
   This is a real correctness gap to close with a test, not a documentation item.
4. **Upload oversize has no test at all.** The archived 50 MB/format guard and
   the GIF/SVG no-re-encode rule are preserved verbatim in
   `compress-image.ts`/`guest-upload.ts` but were never executed.
