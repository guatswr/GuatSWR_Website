# Frozen API upload contract — local correction accepted

2026-10-20, Codex alone, local only. No backend/archived frontend changes.

## Discovered defect

The guest BFF mapped uploads to `/api/upload_visitor` and
`/api/upload_visitor/avatar`. The in-memory integration fixture repeated those
paths, so both sides of the earlier test agreed on an endpoint that the frozen
backend does not mount. The actual entry point `backend/server.js` imports
`backend/src/app.js`, which mounts `uploadVisitorRoutes` at
`/api/upload/visitor`; its router exposes `/` and `/avatar`. The archived client
also calls that canonical namespace. The old acceptance numbers are historical
fixture evidence, not proof that these two paths work against the frozen API.

## Correction

The new BFF and fixture use the canonical mounted paths. Browser-facing BFF URLs,
backend API, body fields, validated address forwarding, byte/deadline limits,
opaque sessions, CSRF and no-automatic-write-retry policy remain the same.
The old underscore namespace is not added as a fallback. Frozen sources stay
read-only.

An independent test inventories literal Express mounts/router declarations and
checks every closed administrator and visitor operation against them. It does
not import/start the backend, open a database, write uploads, or trigger bot
hooks. This guards the URL/verb boundary; it does not claim a live backend
integration test or validate SQL/file lifecycle behavior.

## Evidence so far

- Read-only source audit: 70 mounted routes, all 47 existing administrator
  operations matched (`.tools/frozen-route-audit.json`).
- Before correction, the new guard fails exactly the two upload operations:
  53 passing / 2 failing (`.tools/codex-frozen-api-before.log`).
- After correction, contract and existing guest-boundary tests pass 74/74
  (`.tools/codex-frozen-api-after.log`).
- Fresh production output passes all four recursive gates: typecheck 0,
  lint 0 errors/34 existing warnings, **747 units** (73 shared + 674 web), build
  success. Raw logs: `.tools/codex-frozen-api-{typecheck,lint,test,build}.log`.
- Canonical-namespace browser/BFF integration passes **6/6**, three fresh batches,
  one attempt each/zero retry, flaky or skipped cases, all blobs merged. It
  checks exact upstream paths, draft reuse, explicit failed-submit retry,
  receipt/visitor ownership, signup avatar/read/save/delete, accepted 9 MiB and
  rejected above-50 MiB uploads. See [e2e.json](e2e.json).
- All 14 public cold-route graphs pass **119792–132684 B gzip**, zero maps;
  see [route-budget.json](route-budget.json). Server-only URL corrections do
  not require new public UI baselines. Whole-site final regression remains open.

Committed diagnostic evidence: [before](before.log), [after](after.log),
[read-only mount inventory](mount-audit.json). Reproduction from the repository
root uses the pinned Node/pnpm, local browser/TEMP environment and port base 4100:

```powershell
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm -r build
# Test runtime: NODE_OPTIONS=--v8-pool-size=2; no retry/expectation changes.
node web/scripts/e2e-isolated.mjs guest-integration.spec.ts --work-dir .e2e-isolated/codex-frozen-api-guest
node scripts/revamp/check-route-budget.mjs --routes scripts/revamp/route-fixtures.json
```

This checkpoint excludes the later activity-administration/extra avatar endpoint
work in the local tree. Its production artifact and 747-unit count cover the
canonical guest URL correction and 55-operation contract guard. No backend or
archived frontend modifications, deployment or real upstream mutation occurred.

## Follow-up found while implementing activity administration

Event create/update moves staged `/uploads/upload/*` URLs into an event
directory. Frozen ranking and settlement saves do not call that persister.
Their new UI must therefore use the existing event-avatar storage route for
permanent avatar uploads, with fresh administrator authorization, CSRF, bounded
multipart reconstruction, server-bound event ID and the frozen public-status
restriction. General staged uploads remain suitable for event form content
that is later passed through create/update. This is a front-end/BFF adaptation;
no backend contract change is needed. Activity administration is not accepted yet.
