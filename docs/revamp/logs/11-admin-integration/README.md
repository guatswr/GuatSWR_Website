# Private administration integration — in progress

2026-10-19–20, `revamp/nuxt-foundation`, Codex alone. Local only; no deployment,
DNS, server or Cloudflare change. `frontend/` and `backend/` remain frozen.

## Scope and evidence so far

The primary checkout now contains closed admin/account BFF controllers and a
per-app private browser transport/query runtime. Eight resource pages are
implemented (members, history, config, profile, home-links, logs, users, backups).
**The workspace foundation/core workflow selection is accepted locally; the full
admin stage is incomplete.** Article/editor and event-admin pages
remain to be migrated. Do not interpret a route file or a test count as proof
that its complete workflow works.

The four-page functional selection passed **10/10** through the actual Nuxt
production output, desktop/mobile, with no route interception, skip or retry:

- Member upload, create, edit, order, soft delete and restore; a previously
  warmed public read changes only after the confirmed upstream mutation.
- Missing CSRF, ordinary super-admin denial, revoked identity and private-page
  redirect; browser requests/storage contain no backend Authorization/JWT.
- History HTML controls, sanitized private/public rendering, edit/delete/restore.
- Configuration client validation before any write and actual public cache
  invalidation after a confirmed change.
- Confirmed credential change removes the current cookie and revokes a copied
  old opaque session; login with the new password works.

Raw evidence: `.tools/codex-admin-second-e2e.log`,
`web/.e2e-isolated/codex-admin-second/summary.json`. That artifact preceded the
subsequent outer-frame parity fix, extra pages and binary cancellation hardening;
the new artifact must be rebuilt and reverified before a milestone commit.

Then-current recursive gates passed (676 units = 73 shared + 603 web), with
34 lint warnings (33 historical style warnings plus the explicitly sanitized
private HTML preview), no errors. Current targeted gate run has 678 units
(73 + 605), including FIFO/bounded account-mutation serialization. Raw logs:
`.tools/codex-admin-{current,third}-{lint,unit}.log`,
`.tools/codex-admin-third-typecheck.log`; the third build subsequently passed.

The third artifact's broader functional run finished 18/20. The two failing
cancellation cases first exposed an invalid test assumption about minimum TCP
buffer size, then a missing explicit HEAD route and accumulated fixture samples.
The corrected cancellation protocol now passes **2/2** on the same artifact:
both live upstream byte counters settle under backpressure, client abort closes
both streams, and a following actual GET succeeds. Raw logs:
`.tools/codex-admin-{third-e2e,cancel-repair,cancel-corrected}.log`.
The fourth artifact passed all four recursive gates (686 units = 73 + 613).
An explicit HEAD route is added and its desktop real-HTTP check passed in the
first modern-interface run. A single complete green run on the revised artifact
is still required.

The first member visual selection exposed inherited `@source not` exclusions:
referencing `main.css` also excluded every private source from `admin.css`, so
the desktop grid was missing. The compiler probe measured 116 candidates and
no private grid before, then 890 candidates with the actual grid after isolating
shared token references. See `.tools/codex-admin-css-{before,after}.log` and
[Tailwind's source-scanning documentation](https://tailwindcss.com/docs/detecting-classes-in-source-files).
No snapshot/geometry tolerance was changed.

## Modern interface decision and verification

On 2026-10-20 the user explicitly authorized a modern, simple administration UI
and flexible page grouping. This supersedes private archive pixel parity; public
pixel acceptance stays unchanged. See [ADMIN-UI](../../ADMIN-UI.md). The old
private comparison spec was removed because it asserts the superseded design.
It is replaced by actual screenshots, named-control/layout/keyboard checks and
the existing genuine BFF workflow suite; no public comparison was removed.

The new sidebar/mobile navigation, overview and all eight resource templates
share light/dark tokens and simple visible actions. The first artifact passed
typecheck/test/build and lint (34 warnings, zero errors; 686 units), zero maps.
The default-port attempt could not start because existing Hermes/dev services
owned 3182/3100; they were left running. Tests use E2E_PORT_BASE=4100.

The first modern-interface run declared 28 tests. It exposed two selector bugs
(a changing mobile-toggle name and duplicate permission-error text) and actual
layout defects: intrinsic input width/height and populated mobile tables could
widen the page and shift pointer/dialog coordinates. Screenshots and traces
retain the failures. The source now bounds fields and grid tracks, and tests
also check field containment, populated-table page width and a 320px viewport.
The revised artifact passes the complete **28/28** selection in 14 fresh-server
batches, zero skipped/flaky/retried, all 14 blob reports merged. In particular,
the previously broken mobile account/IPv6 unban and manual-backup dialog now
work; GET/HEAD and byte-exact download pass on both projects. Four recursive
gates pass (686 units, lint 34 warnings/zero errors, build success); zero maps;
all 14 public cold-route graphs pass at **119347–132231 B gzip**.
Raw evidence: `.tools/codex-admin-modern-4100-e2e.log`,
`web/.e2e-isolated/codex-admin-modern-4100/summary.json`,
`.tools/admin-modern-review/`, `.tools/codex-admin-modern-final-*.log`.

Committed machine evidence: [E2E summary](e2e.json),
[public-route budget](route-budget.json). The 36 original Playwright screenshot
attachments are also extracted without edits to `.tools/admin-modern-final-review/`.
Reviewed examples: [desktop overview](screenshots/desktop-workspace.png),
[mobile dark members](screenshots/mobile-members-dark.png). These use only the
loopback fixture's synthetic data. They do not change any public pixel policy.

This evidence does not yet cover article/event management, the complete private
security review, recycle purge/global login refresh and icon upload through the
UI, or native large-file download handoff. Those secondary workflows need final
integration checks. The original 188-case public/guest suite must be rerun on the
complete migrated artifact; the old public run is not relabeled as a new run.

Remote follow-up for the exact `0d7f22d435d9070a1d5712654f5b45c49880166e`
checkpoint: [run 39286792392](https://github.com/guatswr/GuatSWR_Website/actions/runs/39286792392).
Windows job 118175587447 passed **216/216**, zero flaky/failure/skip; the Linux
container job 118175586865 passed. Ubuntu job 118175587267 passed **215/216**,
with only mobile `/logs matches the archive (dark)` unexpected. Its result is
not a new approval for that existing public visual blocker. The decoded job logs
confirm the counts. This remote artifact includes the 28 new private tests but
does not include the later local article/editor work.

All 14 public cold-route JS budgets still passed on the earlier private-page
artifact: **118981–131857 B gzip**, cap 153600, no sourcemaps. Private Element
Plus/query/styles are dynamically loaded on verified admin routes. Raw report:
`.tools/codex-admin-route-budget.json`. This must be rerun after the remaining
private page/editor integration.

## Corrections to the imported candidate

- Bind the fresh server-owned JWT and resolved client address after merging
  call options, so a caller cannot override either. The old candidate created
  an unbound client; the tightened real HTTP fixture exposes that defect.
- Import the real shared contracts, distinguish normal 403 from invalid-session
  401, drain bodyless/chunked mutations and invalidate the actual public cache.
- Revoke server records and clear cookies after credential changes/global
  refresh; re-check identity/target inside the local user-delete critical section.
- Block stale operations from the beginning of login/logout, including the
  second CSRF attempt. Old responses cannot resurrect or clear a newer session.
- Install one per-Nuxt-app QueryClient; cancel/clear it on identity or role loss.
  Private component requests/uploads abort on scope disposal or private cleanup.
- Clear only the four archived host-only credential cookies/storage keys on
  this origin, preserving theme and BFF cookies. The preview cannot clear the
  old main origin's storage; do not claim otherwise.
- Add the standalone shared subpath to `tsconfig.build.json` and synchronize
  injected workspace dependencies after build/test. Typecheck alone had missed
  the absent emitted subpath; the real production build exposed it.
- Exempt the seven backup API source controllers from the repository's broad
  `backups/` ignore rule. The pre-commit source manifest caught that a local
  green build otherwise would not include these files in a fresh checkout.
  Runtime backup data remains ignored.

## Deliberate implementation choices and open limits

Element Plus 2.13.1 matches the frozen lockfile. The editor's old version has a
published fence-language XSS advisory; 6.5.4 is the first patched version in
[GHSA-3rm2-h79c-8qw6](https://github.com/advisories/GHSA-3rm2-h79c-8qw6).
It is installed for the pending private editor, not yet accepted or used by a
public route. No CDN/CSP exception has been added.

Small backup files retain bounded in-page download progress (64 MiB cap).
Larger files are handed to the native browser download manager, avoiding a
multi-gigabyte Blob in the browser heap; the UI reports the handoff, never a
false completion. Server downloads stream with backpressure, a byte limit,
deadline, fixed attachment headers, JWT/address binding and no redirect. A
genuine cancellation test proves both concurrency slots are released after
clients stop reading, on desktop and mobile. Native download handoff is an
intentional functional improvement, retained in the modern interface.

The last-super-admin guard protects one BFF process. Multiple processes or
simultaneous writes through frozen v1 still require a future backend transaction
for a cross-process guarantee. The backend is not changed here.

Two pre-existing high build-tool audit findings (node-forge/braces, no published
patched range in the measured audit) remain to be assessed at final security
review; neither was present in the checked runtime output. Do not claim a clean
dependency audit. `.tools/codex-admin-audit-patched.json` retains the result.

Public blockers remain: homepage mobile median LCP 1960.7 ms exceeds 1800 ms;
Linux public mobile dark logs has one differing pixel. Same-source Linux output
reproduces it. Full computed avatar styles match; moving row dividers to v1's
edge did not resolve it and the diagnostic injection was removed. No masks,
tolerances or approval deviations were introduced.
