# Activity administration — local feature accepted

2026-10-20, Codex alone, local only. Accepted parent: `18b0fed` (canonical guest
upload correction). Modern private UI follows the user's approved direction.

## Implemented and verified on the production output

- Protected event list, all eight statuses, type/status filters, current-page
  search, pagination, authenticated detail and drafts. Native forms reuse the
  shared five-type model/validation/payload preservation functions. They use
  the private transport; no guest draft, public draft read or browser JWT.
- Explicit approve/reject/delete/status confirmations; create as published or
  draft; editing preserves status, nested people, results/settlement and unknown
  content. Unsaved edits require confirmation, and failed writes retain input
  for an explicit retry.
- Protected participant listing, editable existing ranking rows, add/remove/rank
  inputs and avatar upload; result save clearly ends the activity. Bounty
  completion/betting settlement preserve other content and mark it settled.
- Each confirmed mutation uses the existing event-cache invalidation. Tests
  warm public reads first, then check actual visibility, data and statuses.

## Upload lifecycle adaptation

Frozen event create/update persists staged content images; ranking/settlement
does not run that persister. The form therefore uses authenticated staging
uploads for fields sent through create/update. Ranking/settlement avatars use
the existing `/api/upload/visitor/avatar` route, through a new **protected**
closed BFF path. Fresh admin authorization, Origin/CSRF, ID validation,
51 MiB multipart envelope/50 MiB file bounds, magic validation, timeout,
server-created filename/eid and finally cleanup remain enforced. The frozen
public-status restriction is applied server-side and explained in the UI.
The body-provided eid cannot choose a different event directory. No backend
change, fallback namespace, automatic write retry or external action is added.

The in-memory event fixture is explicitly enabled only for these workflows.
Public/archive/guest acceptance keeps its earlier immutable fixture until that
opt-in. It performs no DB/file writes or bot hooks. The mounted-route guard
also checks the new upstream operation independently of this fixture.

## Verification scope

22 actual production-output E2E cases across desktop/mobile: review and warmed
public cache invalidation; reject/edit/metadata retention; five-type creation
(including a private draft and explicit failed-submit retry); private participant
contacts/public projection; permanent ranking avatar and results; bounty/betting
settlement; ordinary-admin/anonymous/opaque-session behavior; and avatar session,
Origin, CSRF, status and server-bound storage checks. Exact controls, actual
screenshots and page containment are checked; no archive private pixel baseline.

This accepts this local feature, not the whole migration. Public advanced
Markdown, performance/security/final CI work and the Linux public dark-log pixel
remain separate open work. No deployment or QQ success message.

## First-run findings

The first artifact passed all four gates (750 units) and **18/22** actual E2E.
Its four failures were two test-protocol mistakes across both projects: issuing
the next confirmation before Element Plus removed the prior exiting dialog,
and requesting `/participants` instead of the existing `/participants/public`
browser endpoint. Waiting for the actual dialog node to disappear and checking
the correct endpoint retain real assertions, with no arbitrary sleeps or masks.
Inspection also found a real UX gap: creating from a pending-only filter hid the
new published/draft item. Creation now clears those list filters and the test
requires the created card to be visible immediately after save.

The next artifact passed **20/22**. The remaining assertions incorrectly assumed
that public participant QQ is private. Frozen `toParticipantPublic` and archived
`EventBoard.vue` explicitly render QQ, machine sign and source; shared public
schemas deliberately retain them. Under the user's public 1:1 policy they must
remain. The new assertion checks the exact seven-field whitelist, including the
expected QQ, and therefore rejects visitor IP, backend user ID and all extra
fields. The management copy is corrected: it must not falsely promise QQ is
admin-only. No public UI/visibility policy or backend contract is changed.
Ranking/settlement confirmations also explain that their resulting ended/settled
status is public. The corrected copy and assertions need fresh verification.

## Runtime correction before acceptance

Corrected activity workflows pass **22/22**, with 12 actual screenshots including
the 320px form, both list themes, participant table, ranking and settlement.
However, the next existing-admin regression is **27/28**: a worker exited with
`3221226505` / `0xC0000409` before its assertion. This reproduces the earlier
native failures despite the temporary background-pool cap; resource pressure
was only a hypothesis and is not treated as the established cause.

The symptoms match the [official Node Windows TCP defect](https://github.com/nodejs/node/issues/62991).
[Node's libuv fix](https://github.com/nodejs/node/pull/62561) initializes the
Windows version structure correctly; the [24.16.0 release](https://nodejs.org/en/blog/release/v24.16.0)
includes it. No local native dump was available, so the exact local stack is
not claimed as proven. The minimal same-LTS upgrade changes `.node-version`,
the engine floor, and the new web image's build/runtime stages to 24.16.0.
The local binary was verified against official SHA256:
`b3094d0b49f9ad602262a9921551737bb97637c05dd357a06ae98188d7290aa3`.
The old binary is retained in `.tools/node-runtime-backups/`; global runtimes
and unrelated processes are untouched. New gates/browser verification must run
on 24.16.0, without depending on the earlier pool-size mitigation or retries.

Docker review also found that the independent mount guard needs frozen route
declarations in the **build** context. Only `backend/src/app.js` and route `.js`
files are admitted/copied as read-only test input, like the existing archived
login reference images. They are never imported/executed or shipped in the final
runtime image. The backend tree is not edited. A fresh Linux container build
must verify this input correction; old image smoke results cannot substitute.

One local PowerShell invocation incorrectly splatted a single filename into
characters and inventoried all 244 cases. It was stopped during planning before
browser batches; explicit file arguments replace it. The aborted inventory is
retained and contributes no passing cases. Actual first/second/corrected reports
and the native failure remain separate evidence, not overwritten reruns.

## Accepted artifact and evidence

Checkout: `revamp/nuxt-foundation`, parent `18b0fed`, with the exact source list
in [files.txt](files.txt). Runtime: local Node 24.16.0, pnpm 11.25.0, Playwright's
pinned Chromium, local TEMP/browser paths, E2E port base 4100. No NODE_OPTIONS
thread workaround, browser-cache disable, skipped tests or assertion relaxation.

- Four recursive gates pass: typecheck, lint (0 errors/34 existing warnings),
  **750 units (73 shared + 677 web)**, production build. Raw logs:
  `.tools/codex-admin-events-node2416-{typecheck,lint,test,build}.log`.
- Tooling: **56/56**, `.tools/codex-node2416-tooling.log`.
- **62/62 unique production-browser cases**, 31 fresh batches, all reports
  merged, every case exactly one attempt, zero retries/flaky/failures/skips:
  [events 22](events-e2e.json), [existing admin 28](admin-e2e.json),
  [articles 6](articles-e2e.json), [guest 6](guest-e2e.json).
  Raw: `.tools/codex-node2416-{events,admin,articles,guest}-e2e.log` and
  `web/.e2e-isolated/codex-node2416-{events,admin,articles,guest}/`.
- Twelve real event screenshots retained in
  `.tools/admin-events-node2416-review/`; representative desktop dark list,
  narrow mobile form and mobile ranking are committed here. Labels, focus,
  confirmations and contained layouts are asserted; modern admin has no archive
  pixel baseline. Public visual thresholds are unchanged.
- All **14** public cold-route graphs pass **119904–132795 B gzip**,
  **0 sourcemaps**, [route-budget.json](route-budget.json). The complete lazy
  editor bundle is not confused with each route's initial request graph.
- Fresh Linux image `guatswr-revamp:codex-admin-events-node2416` builds with
  both stages on Node 24.16.0. Its own four gates pass the same 750 tests;
  artifact check reports 0 maps. Raw `.tools/codex-node2416-docker-build.log`.
- Actual Linux runtime smoke passes five SSR pages with nonce/JSON-LD/noindex,
  RSS, preview sitemap denial, 15 index-source entries, missing-map 404 and real
  WebP proxy. [container-runtime.json](container-runtime.json). Runtime
  filesystem checks confirm the output entry exists and backend/frontend
  source trees and `/app/.env` are absent. Raw:
  `.tools/codex-node2416-container-{smoke-direct,boundary}.log`.

The smoke script's Node-spawned Docker calls twice hit a local named-pipe
permission error, despite direct PowerShell Docker access working. Those failed
logs remain `.tools/codex-node2416-container-smoke{,-ready}.log`. The successful
smoke starts an isolated loopback-only container directly in PowerShell, then
uses the unchanged script's `--origin` mode. It uses an ephemeral generated
session secret, read-only fixture/public mounts, and stops only its returned
container ID in `finally`. Nothing is deployed or pushed to an image registry.

Reproduction after setting the documented local Node/TEMP/browser environment:

```powershell
pnpm test:tooling
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm -r build
node web/scripts/e2e-isolated.mjs admin-events.spec.ts --work-dir .e2e-isolated/codex-node2416-events
node web/scripts/e2e-isolated.mjs admin-workflows.spec.ts admin-interface.spec.ts --work-dir .e2e-isolated/codex-node2416-admin
node web/scripts/e2e-isolated.mjs admin-articles.spec.ts --work-dir .e2e-isolated/codex-node2416-articles
node web/scripts/e2e-isolated.mjs guest-integration.spec.ts --work-dir .e2e-isolated/codex-node2416-guest
node scripts/revamp/check-route-budget.mjs --routes scripts/revamp/route-fixtures.json
docker build --progress=plain -t guatswr-revamp:codex-admin-events-node2416 -f web/Dockerfile .
node scripts/revamp/container-smoke.mjs --image guatswr-revamp:codex-admin-events-node2416
```

## Remaining limits

The preceding remote `18b0fed` run 39327274634 failed: Linux container lacked the
read-only mount-guard inputs (fixed here); Windows stopped without a batch-29
report; Ubuntu had 220 expected/1 flaky article retry case/1 failed mobile dark
log comparison. Local 62/62 proves the stated scopes on this new runtime;
it does not turn that remote run green or resolve the Ubuntu flaky case. Fresh
full-site CI, public performance/advanced Markdown and secondary admin workflows
remain required. Frozen `frontend/` and `backend/` source diffs remain empty.
