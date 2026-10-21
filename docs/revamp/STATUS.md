# GuatSWR frontend revamp status

Updated: 2026-10-21 (Asia/Shanghai). Branch: `revamp/nuxt-foundation`.

## Current checkpoint

Repository structure maintenance is implemented. The independent shared package,
Nuxt shared code, browser code and server code now have documented boundaries;
`pnpm check:boundaries` is included in CI. Public-read query, bounded transport
and log projection implementations moved under `web/server/lib/public-read/`,
while the existing facade and API contracts remain intact.

Immutable and mutable fixtures share public projections. New loopback tests cover
legacy-null details, author fields, member thumbnails, history ordering and
independent fixture ownership. Local gates pass **793 units**, typecheck,
lint (0 errors / 34 existing warnings), **65 tooling tests** and **127** import
boundary scans. Shared/isolated Nuxt builds and **58/58 E2E** pass with zero
retries/flaky/skips; **54** approved-reference regions have zero differing
pixels. **15/15** JS graphs pass at **122487–137385 B gzip**, with **0 maps**.
One unchanged limiter stress test initially exceeded its 5s deadline;
standalone and full reruns pass without relaxing that deadline. Evidence is in
[log 26](logs/26-structure-improvements/README.md); passing prior checkpoints
must not be mistaken for validation of subsequent configuration edits.

The existing local preview is **http://127.0.0.1:3101**. This maintenance does not
restart the preview or overwrite its output. It also preserves the original 3100
preview, `backend/`, `frontend/`, their deployment paths and the backend API.

## Open migration acceptance

[CHECKLIST.md](CHECKLIST.md) remains the detailed acceptance ledger.

- **#80 Accessibility:** approved bounded colours/month targets are implemented;
  empty-event/dark-log diagnostics and manual focus/touch/motion review remain.
- **#81–82 Performance:** matched old/new cold/warm baseline and final real-page
  Lighthouse/LCP acceptance remain open; a passing JS budget is not an LCP pass.
- **#83–84 Resilience/security:** complete exception, dependency/security and
  production configuration acceptance remain open. The current configuration's
  disabled global `security.rateLimiter` is not approved by a directory refactor.
- **#85–87:** observability, build warning review and final full Windows/Linux CI
  remain open. Local scoped tests are not whole-migration or production acceptance.
- **#88–100 Deployment/cutover:** deferred. Estimated launch is 2026-11-11;
  server, DNS, Cloudflare and traffic changes require separate approval.

## Navigation and evidence

- [Architecture and ownership](../ARCHITECTURE.md)
- [Script and backup entry points](../../scripts/README.md)
- [Workstream evidence index](logs/README.md)
- [Progress-bar checkpoint](logs/25-route-progress/README.md): 791 units,
  16 progress + 26 regression E2E and 30 zero-difference regions on that artifact.
- [Full pre-maintenance status history](STATUS-HISTORY-2026-10-21.md): preserved
  verbatim, including historical failures, limitations and original evidence links.

Update this file with the current conclusion and open work. Put historical
narrative, commands, failed attempts and measurements in the workstream reports.
No deployment or migration-success/QQ message follows from this checkpoint.
