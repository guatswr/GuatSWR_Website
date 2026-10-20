# GuatSWR frontend revamp status

Updated: 2026-10-20 (Asia/Shanghai). Branch: `revamp/nuxt-foundation`.

Latest local checkpoint: public accessibility semantics and keyboard scrolling.
Wordmark/card names include visible labels, headings follow page hierarchy,
duplicate avatar names are suppressed, code/log scroll areas accept native Tab
and arrows with visible focus. Final 60-state axe scan removes the name,
heading, alt, scroll-focus and duplicate-landmark findings. Existing contrast
**60 states / 268 node records** and month-target **2 / 4** findings remain.
The [bounded visual proposal](logs/22-public-accessibility/VISUAL-PROPOSAL.md)
has nine actual before/after desktop previews, candidate checks clear in those
states, and awaits the user's 1:1 exception decision; colours/rail geometry in
the app remain unchanged. Checklist #80 stays open.

Four recursive gates pass **785 units**, lint **0 errors / 34 warnings**;
tooling **59/59**, **112/112** actual E2E in 56 fresh batches, no retry/flaky/skip.
All **88** archive regions have zero differing pixels on Windows. **15/15**
initial JS graphs pass **122319–137070 B gzip**; whole output has **0 maps**.
See [log 22](logs/22-public-accessibility/README.md). Full-host CI is being
requested for this checkpoint; previous f8a4dbe results below are historical.
Current public LCP has no new accepted result; final performance/security/
monitoring and extended Markdown remain open. No deployment or QQ success.

Latest local test correction: shared mutable article 1 is replaced by stable,
detail-only fixture IDs 991/992. Every math case warms advanced content first
through the real BFF and checks ordinary article 1 afterwards. Natural-context
viewport captures replace formula captures polluted by fixed navigation/cover
pixels. **8/8 unique cases**, plus **4/4 repeated mixed cases**, all pass without
retry/flaky/skip; all **16** unique formula/prose regions are zero-difference.
Four recursive gates pass **785 units**, lint 0 errors / 34 warnings, zero maps.
Production app/cache/backend/frozen frontend source is unchanged in this
workstream. See [log 21](logs/21-markdown-fixture-isolation/README.md).
Fresh full CI remains required; earlier f8a4dbe host results are red.

Runtime correction after f8a4dbe: renewed rate-limit windows are now evicted by
expiry instead of insertion order; three-sample score/LCP medians are independent.
Four recursive gates pass **784 units**, lint 0 errors / 34 warnings, tooling
**59/59**, actual auth/guest/warm-reload E2E **32/32** without retry/flaky/skip,
all **15** JS graphs pass and **0 maps**. The public module-preload experiment
worsened LCP and is withdrawn; current public performance remains unaccepted.
See [log 20](logs/20-runtime-hardening/README.md). Both f8a4dbe host CI jobs are
red; Linux container succeeds. Ubuntu's only E2E failure is confirmed fixture
contamination: advanced Markdown and math reuse cached article 1. Separate
fixture-only IDs are being prepared without changing production cache policy.
The fresh 60-state public a11y scan also has unresolved findings. No deployment
or complete-migration/QQ success claim.

Latest correction checkpoint: independent Markdown review of `11e9bcc`.
The user's **click “显示图表” before downloading Mermaid** decision is verified,
with readable SSR source and unchanged JS budget. Nine math regressions,
generated-node provenance, MathML, typography, matrix clipping and dark CSS
are corrected. Four recursive gates pass **783 units**; lint **0 errors / 34
warnings**. **72/72** final E2E cases pass, 36 fresh batches, no retry/flaky/skip;
**50** archive comparison regions have zero differing pixels. **15/15** JS
graphs pass **122334–137112 B gzip**; advanced article **130206 B**, versus at
least 360073 B of automatic scripts before explicit activation. Whole output
contains **0 maps**; tooling **56/56**. See [log 19](logs/19-public-markdown-review/README.md).
This verifies scoped interaction/common-formula corrections. Item #24 remains
open for code-fence palette and additional math-style coverage; no palette or
budget exception granted. Current local Lighthouse **fails**: home **1811.9 ms /
99**, layout **1809.7 ms / 98**, all valid slow samples retained. Performance,
broader accessibility/security/monitoring and final CI remain open.
Incoming `11e9bcc` CI is checked: Windows and Linux container pass; Ubuntu
E2E passes 254/254 without flakes, but home LCP remains **2486.9 ms**, above
1800 ms. This is an open final acceptance blocker, not an all-green CI result.

Previous accepted local improvement: native idle hydration for homepage interests/
about and the shared footer, preserving complete SSR text, images and links.
Four recursive gates pass **767 units** (final test-only assertions also pass
typecheck/lint). **96/96** actual production/visual cases pass, 48 fresh batches,
zero retry/flaky/skip; **64** archive comparison regions have zero significant
differences on Windows. Home Lighthouse median **1662.1 ms / 98**, layout fixture
**1514.6 ms / 98**, all valid slow samples retained. All **14** initial JS graphs
pass **121133–135910 B gzip**, zero maps. Native wrappers slightly increase JS;
the improvement is client scheduling. See [log 17](logs/17-public-hydration/README.md).
These are local fixture measurements, not a production speedup claim or final
full-site performance acceptance. Fresh Windows/Linux CI is still required.

Latest accepted functional feature: secondary administrator workflows. Actual
desktop/mobile tests cover avatar-only saves, 2FA enable/disable/re-login,
independent user/global session revocation, explicit global-logout cancellation,
exact recycle purge scope, icon upload, and a real 100 MiB native download.
Four recursive gates pass **752 units**, lint 0 errors/34 warnings; **92 unique
E2E cases pass** with zero retry/flaky/skip (10 new + 82 regression). A test-only
title-selector correction then passes all 6 article cases again, on the same
unchanged output; 98 executions/49 fresh batches, 92 unique cases. All 14 public
JS graphs pass **119907–132798 B gzip**, zero maps; 52 actual screenshots are
retained. See [secondary evidence](logs/15-admin-secondary/README.md).

State ownership and session transition are now recorded in STATE-BOUNDARIES.md
and SESSION-CUTOVER.md. The latter describes the existing same-origin limited
legacy cleanup and the future separately approved main-origin rehearsal; it
does not execute cutover or affect the old site's origin from preview.

Current follow-up: the user approved the single documented Linux mobile dark-log
border pixel. The exact coordinate/color/count/scope guard passes 15/15 focused
tests; final recursive typecheck/lint/test pass **767 units**. Fresh actual
Windows public-page regression passes **48/48** (24 batches, no retry/flaky/skip,
34 compared regions with zero significant differences). Fresh Linux mobile
dark-log comparison passes **1/1**, retaining **one** explicitly approved pixel.
No global threshold or masking change. See [log 16](logs/16-approved-raster/README.md).
The complete-home **baseline before the newer idle-hydration source** is
**2260.4 ms / score 98**, three valid Windows samples, over 1800 ms. The newer
local home result is 1662.1 ms / 98 above. The previous 1960.7 ms is historical.

Latest Ubuntu artifact pinpoints article flakes to an ambiguous title locator
(input plus editor toolbar); corrected by role, not sleeps/retries. The public
dark-log comparison still detects one significant avatar-border pixel. See
[the decision report](evidence/linux-log-raster-953dc79/README.md). User confirmation
was subsequently granted for that tightly bounded exception; all other pixels
retain the zero-difference gate. The fresh local comparison is accepted in log 16.
Prior `13cff96` CI completes: Windows **254/254**, zero flakes; Linux container
passes; Ubuntu **253/254**, zero flakes, only the pre-approval dark-log pixel
fails. Its performance step was skipped, so this is not complete CI acceptance.
The subsequent `6ad9a1a` Ubuntu run passes **254/254 E2E**, zero flakes, and the
Linux container passes. Its unchanged pre-hydration home fails LCP at **2034.0 ms /
99** (layout 908.9 ms / 100). New hydration source was not in that run.
Full-route performance, public advanced Markdown, full accessibility/security/
monitoring and final complete CI remain open. No deployment or QQ success.

Previous accepted feature: modern activity administration, including review,
five-type creation/editing, participants, ranking, bounty/betting settlement and
confirmed-write public cache invalidation. Permanent ranking avatars use the
frozen canonical upload endpoint behind a protected, server-bound BFF route.
All four recursive gates pass **750 units**, tooling **56/56**, and **62/62**
unique production-browser cases (22 events + 28 existing admin + 6 articles +
6 guests), 31 fresh batches, zero retry/flaky/skip. Twelve actual screenshots
are retained; 14 public JS graphs pass **119904–132795 B gzip**, zero maps.
Fresh Linux image build and runtime SSR/SEO/image smoke pass. See
[activity evidence](logs/14-admin-events/README.md).

Runtime is now **Node 24.16.0** (same LTS, project-local only), including the
upstream Windows TCP fix matching the observed native exits. No local native
dump establishes an exact stack; fresh gates and 62 browser cases pass with
default Node settings. Historical 24.15.0/pool-cap evidence below is retained
as historical. Docker build-only route declarations are now included for the
independent frozen API guard and excluded from the runtime image.

At the activity checkpoint, secondary administrator workflows and the article
flake were still open; the newer log 15 supersedes those local items. Public
article formula/diagram parity, homepage LCP (1960.7 ms > 1800), Ubuntu public
dark-log pixel, final security and full-site CI remain open. Remote `18b0fed`
run 39327274634 failed; it is not accepted as green.
No deployment, infrastructure changes or QQ success notification.

## Earlier accepted feature checkpoints

Latest accepted local feature: protected article administration, lazy local
Markdown editor/import/images and safe private formula/diagram preview. A real
public prose-loss bug and first-render/cached-diagram defects are fixed. Four
recursive gates pass (692 units, lint 0 errors/34 existing warnings), **82/82
unique E2E** on the corrected production output (6 articles, 28 other private,
48 public正文/visual; zero retry/flaky/skip), actual screenshots reviewed,
14 public cold-route graphs **119792–132684 B gzip**, zero maps.
See [article evidence](logs/12-admin-articles/README.md). A Windows native process
startup failure remains retained; successful regression scopes cap only local
Node background threads and retain all browser/assertion/security policies.

Guest upload correction now passes local acceptance: source review found that guest upload BFF/fixtures
used the unmounted underscore namespace. The frozen backend mounts
`/api/upload/visitor`. An independent read-only mount/verb guard fails those
two paths before correction (53/55 pass), then passes with the boundary tests
(74/74). The corrected artifact passes four recursive gates, **747 units**,
**6/6 genuine browser/BFF guest cases**, 14 public JS budgets at the same
119792–132684 B range, zero maps. Exact upstream paths are checked. See
[contract evidence](logs/13-frozen-api-contract/README.md). This replaces the
old guest URL evidence for that boundary; it is a later artifact than the
article checkpoint `a6868ce`. Full migration acceptance remains open.
Activity review/settlement/ranking UI is accepted by the newer log 14 above.
Public article formula/diagram parity, LCP, the Linux dark-log pixel and final
full-site/security acceptance remain open. No deployment or QQ success notice.

Latest user decision (2026-10-20): the administration UI may be redesigned and
regrouped for modern, simple operation. Public visual parity stays in force;
private archive pixel parity is superseded by workflow/permission, responsive,
keyboard and new screenshot review. The modern workspace and eight resource
pages pass the local foundation selection: four recursive gates, 686 units,
28/28 desktop/mobile E2E (zero retry/flaky/skip), 36 retained interface screenshots,
zero sourcemaps, and all 14 public-route JS budgets (119347–132231 B gzip).
This accepts the workspace foundation/core workflows, not the full admin stage:
event pages and secondary workflow/security checks remain open; article
administration is covered by the newer evidence above. See
[the UI decision](ADMIN-UI.md) and [evidence](logs/11-admin-integration/README.md).

Remote follow-up: [0d7f22d run 39286792392](https://github.com/guatswr/GuatSWR_Website/actions/runs/39286792392)
passes Windows 216/216 and the Linux container job. Ubuntu is 215/216; only the
same mobile public dark-log archive comparison fails. No public threshold was
relaxed. Local article/editor work after that checkpoint is in progress and is
not covered by those counts; see [log 12](logs/12-admin-articles/README.md).

## Current independent review (Codex, after `bf18a36`)

Latest local follow-up (2026-10-19): public metadata/JSON-LD, bounded RSS and
the sole sitemap source are implemented. Actual production-output SEO/event/log
selection passes 20/20; preview indexability-flag probe passes 4/4; local release
XML rehearsal passes four scenarios. Default preview still forbids indexing.
Linux Docker build/runtime smoke passed locally. Remote run 39240208835 passed
the Windows job (complete 188-case suite) and the Linux container job; Ubuntu
finished 187/188, with one differing pixel in mobile dark public logs, reproduced
locally using the exact `cf17273` Linux output. See [SEO](SEO.md) and
[workflow evidence](logs/09-seo/README.md).

Homepage performance is still open: first mobile median LCP 2149.3 ms / score
97; speculative-module correction candidate 1960.7 ms / score 99, still over the
1800 ms limit. No thresholds were changed. Guest integration also exposed the
missing per-app CSRF hookup and stale-identity mutation races. These are fixed:
genuine browser → Nuxt BFF → in-memory frozen upstream workflow passes 6/6 on
desktop/mobile, including 9 MiB accepted / above-50 MiB rejected uploads. Four
recursive gates pass (643 units), tooling 56/56, no maps, all 14 initial route
graphs pass (117275–130126 B gzip). The complete 188-case E2E passed on the
same `cf17273` artifact in 94 batches, 0 skip/flaky/retry, all reports merged.
See [guest integration evidence](logs/10-guest-integration/README.md). Remote
run 39240208835 therefore remains red overall. Admin source integration is now
in progress and is not included in these public-artifact acceptance numbers.
Administration and full-site acceptance remain incomplete. No deployment or QQ
success notification has occurred. Older checkpoint evidence below is historical.

Private-workflow follow-up (local working tree): closed admin/account BFF routes,
server-owned JWT/address binding, successful-write public cache invalidation,
fresh role enforcement, bounded JSON/multipart/binary transports and private
query cleanup are integrated. Members/history/config/profile functional selection
passed **10/10** on desktop/mobile, no skip/retry/flaky. It includes genuine
Nuxt BFF uploads/CRUD/restore, previously warmed public reads, CSRF/role/session
denials, HTML preview sanitization and password-change session revocation. The
then-current four gates passed (676 units, lint 0 errors, build 0). This is
functional evidence for that artifact, not acceptance of later layout/page edits.
The fourth artifact subsequently passed all four recursive gates (686 units =
73 shared + 613 web); it preceded the newly authorized modern layout. The
administration workspace now has its own sidebar/topbar and responsive forms.
Logs/home-links/users/backups, the explicit backup HEAD route and the new
interface now pass the 28-case local selection. Article editing,
event administration, full private screenshot/functional acceptance and final full-site
gates remain open. Details: [private integration log](logs/11-admin-integration/README.md).

User steering: continue directly, without Claude/subagent delegation; local
testing only. The warm-cache `#entry` 500 was independently reproduced in
headless/full Chromium and fixed by preserving import-map-before-module ordering.
Four recursive gates pass (604 unit tests), runner tests 22/22, new warm-cache
and existing session-redirect subset 8/8 with no skip/retry. Public-page visual
review and the independently confirmed 177,477 B initial JS failure are being
resolved next; admin/SEO/full-site acceptance remain open. Detailed scope and
limits: [independent acceptance log](logs/08-independent-acceptance/README.md).
The historical entries below retain their original checkpoint-specific status.

Public follow-up: all 14 public initial-route graphs now pass the fixed 150 KiB
budget (116,609–129,542 B gzip; home down from 177,477 B). The eight residual
article/log visual cases pass; log privacy is an explicit, evidenced deviation.
Full 170-case isolated E2E is running; no full-site performance acceptance yet.

That run finished 166/170 (0 flaky/skipped); the four failures were hardcoded
layout fixture ports. The same artifact passed the exact four-case repair
selection after using derived origins. All 170 unique cases have now passed
across those two runs; a single complete green run remains owed. Genuine guest
BFF browser integration, administration and complete SEO/performance acceptance
remain open.

## Boundaries

- New code: `web/`, `packages/shared/`, root tooling, and `docs/revamp/`.
- `backend/` and `frontend/` remain in place and read-only after the WIP checkpoint.
- Frozen v1 API; public visuals will be ported 1:1 before any redesign.
- Only `revamp/*` may be pushed, via `github-second`. No push to main.
- No DNS, server, Cloudflare, production switch, or real account writes without first presenting the concrete plan.
- User steering (2026-10-18): local development/testing only for now; do not deploy. Target launch remains 2026-11-11. Infrastructure is deferred, not a prerequisite for subsequent local migration stages.
- Never commit credentials. New production artifacts must contain no source maps.
- Pause and report any blocker lasting over 30 minutes or a major uncertain decision.

## Checkpoints

| Stage | State | Evidence / remaining acceptance |
| --- | --- | --- |
| 00 Legacy checkpoint | Done locally | `f1215d4`; annotated `v1-archive`; Vite production build passed; 55 frontend tests passed. |
| 01 Workspace / Nuxt foundation | Local gates passed | `f587518`, pushed only to `revamp/nuxt-foundation`; all local gates passed. Deployment deferred by user. |
| 02 Design system | Codex local acceptance passed; CI instrumentation correction pending | Shared tokens/layout/navigation/theme/dialog ported. Windows four gates, 15 unit tests, 20 E2E, 10 zero-difference archive comparisons and fixed performance budgets pass (1509.1 / 1656.3 ms). Independent Linux container gates and runtime smoke also pass. See [acceptance report](ACCEPTANCE-2026-10-19.md). This is shared-layout acceptance, not whole-site acceptance. |
| 03 Public pages | Homepage/`/social`/`/join` and the data cache integrated (`beb85c0`); 14 new E2E cases failing; prose pages in a parallel workstream | Preserve existing URLs (including singular `/activity/:id`), SSR/data SWR, content SEO, images, sitemap/RSS. Four recursive gates are green; the isolated E2E suite is 56/70 with every failure inside the new specs. See [COORDINATION.md](COORDINATION.md) and [logs](logs/README.md). |
| 04 Interactive forms | Event UI/shared rules implementation started in isolation | Existing guest upload/submission/signup contracts; shared Zod 4 with a native Standard Schema form integration to be verified; Query only where interactive data needs it. Guest BFF still required. |
| 05 Administration | Auth server source candidate delivered; login/client work started; admin pending | Server candidate has not passed integrated tests. Element Plus remains planned only in admin chunks; opaque HttpOnly session id with the backend JWT stored only on the server; current backend identity checks and CSRF. |
| 06 Performance / security | Pending | Mobile Lighthouse ≥95, LCP ≤1.8s, initial JS ≤150KB gzip, a11y, monitoring, full E2E/visual gates. |
| 07 Cutover readiness | Pending | Approved next.guatswr.top deployment, production-sized data verification, ≤5-minute rollback rehearsal; traffic switch separately approved. |

## Decisions

- Preserve root `frontend/` and `backend/`; only `web` and `packages/*` join pnpm workspace. Backend cannot consume shared schemas until separately authorized; mirror and test frozen contracts for now.
- Node 24.15.0 is pinned for the new workspace; existing Node 22.23.2 cannot run nuxt-security 2.6.0. Do not replace the user's global runtime.
- Use exact registry-verified versions and a committed lockfile. Add Reka UI, forms/query, and admin dependencies when their consuming stage lands.
- Use TypeScript 6.0.2 because the current typescript-eslint 8.71.2 support range is `>=4.8.4 <6.1.0` ([official compatibility table](https://typescript-eslint.io/users/dependency-versions/)); keep strict checking, and reconsider TS 7 when the lint/parser toolchain supports it. Pin the existing pnpm 11.25.0 rather than adopting a second package-manager major during framework migration.
- Align Vue Router 5.4.0 with Nuxt 4.6.2's declared dependency; do not introduce a second router major. Vue stays on 3.5.44.
- pnpm uses a hoisted layout to avoid the observed Windows directory-junction resolution failure. Dependency installation is explicit; script execution cannot silently reinstall modules. Nuxt prepare/lint/typecheck/build run sequentially because they share generated `.nuxt` files.
- Shared runtime exports are compiled JS, with source types, so Nitro never has to execute raw TypeScript from `node_modules`. The shared build precedes web builds/development.
- Enable Nitro gzip/Brotli precompression and reuse the existing 64px brand PNG favicon. The first uncompressed baseline scored 96 but missed LCP (2.40s); these changes brought the same mobile simulation to 100 / 1.65s without weakening thresholds.
- Staging is `noindex` everywhere, with sitemap/OG generation disabled until real public routes land; indexing must remain off on `next.guatswr.top`.
- Foundation home is a temporary SSR smoke fixture, not a migrated homepage or accepted visual design. Foundation snapshots do not count as old/new visual acceptance.
- Public backend reads never forward browser credentials. No blanket authenticated proxy is enabled.
- Public defaults have a pure shared export so the global client layout does not import zod. Validation remains in the BFF; Pinia state is scoped to each Nuxt application, with explicit `usePinia()` injection.
- Port the existing Tailwind 3 palette, component CSS and markup to Tailwind 4. Preserve the mobile menu's original spacing explicitly. Theme keeps the Beijing 19:00–08:00 automatic schedule and applies through a CSP-nonced prepaint script.
- Actual navbar/footer/mobile-menu visuals are compared directly with the archived app in the same browser, device, theme and fixture data. Remove the unapproved temporary scaffold goldens and their font fixtures; retain semantic/CSP smoke checks and diagnostic screenshots for that scaffold.
- Inline global critical CSS; negotiate dynamic HTML gzip/Brotli with standard compression middleware. API responses and no-store HTML bypass that middleware. Cached compression variants must retain matching CSP nonces.
- Disable automatic public session loading; the future admin middleware must explicitly fetch and enforce its BFF session. Keep normal component hydration: dialog interaction hydration failed its first-activation test, and footer visibility hydration worsened LCP. Both experiments were reverted.
- The legacy build currently emits source maps and large chunks; these pre-existing risks remain in the archived old frontend and are not silently changed during the read-only migration.

## Validation log

- Latest data/typography candidate independently passed all four recursive gates in the primary checkout after the redaction/deadline correction: 23 shared + 55 web = 78 unit tests. The same rebuilt artifact then passed nine production-HTTP smoke checks, all 20 E2E cases and ten zero-difference archived-layout comparisons. Production has 0 maps and 125,859 B client JS gzip. The final footer comparison retains uncropped PNGs and compares every fully covered device pixel; only the fractional outside edge is excluded (mobile 0.500 / 0.012 device pixels). See [data acceptance](PUBLIC-DATA-ACCEPTANCE-2026-10-19.md) and [machine-readable evidence](evidence/public-data-validation.json). Public-page, cache, auth and whole-site performance acceptance remain open.

- First public-data candidate (before the subsequent log-redaction/deadline correction) passed the real pinned Windows recursive typecheck, lint, test (23 shared + 47 web = 70), build, and nine production-HTTP smoke checks against an isolated fixture. Clean shared `dist` was rebuilt before recursive tests, and `h3` is declared directly without a version change. Artifact inspection found 0 maps and 125,859 B total client JS gzip. This validates adapters, not migrated UI or complete-site performance.
- Independent E2E on that built data/typography artifact initially passed 17/20. Screenshot review found an unequal archive upload-image fixture and an out-of-component footer edge row. With equal image fixtures and bounded component captures, the existing 20/20 cases and ten zero-difference comparisons passed locally; exact device-pixel capture refinement and a new remote CI run remain pending. Do not attribute these local fixture failures to the earlier Linux number-line-height regression.

- Remote run [39157921834](https://github.com/guatswr/GuatSWR_Website/actions/runs/39157921834) on `c4d6694`: Linux container passed; Windows four gates, production-artifact check, archived build and all 20 E2E cases passed. Lighthouse produced `NO_NAVSTART` on both its first attempt and the permitted fresh-browser retry; neither attempt had a valid performance measurement. Reports were downloaded and inspected. Checklist 05 remains open.
- CI now runs functional, visual and build gates on both Linux and Windows, with CJK fonts installed on Linux. The unchanged three-sample Lighthouse command and fixed budgets run on Linux; the repeated Windows tracing failure is an instrumentation issue, not a performance pass. No cross-host number is reported as a code speedup. This workflow correction still needs an actual successful remote run.

- Legacy: `npm run build` in `frontend` passed (10.91s); existing sourcemap/chunk and Browserslist warnings recorded.
- Legacy: eight test files, 55 assertions passed using Node's test runner.
- Foundation: `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test`, `pnpm -r build` passed on Windows with Node 24.15.0. New unit tests: 10/10.
- Playwright 1.64.1 Chromium: 10/10 E2E passed with ordinary snapshot comparison (not update mode). Desktop/mobile baselines were generated and visually inspected. Covers SSR text without JS, warm SWR/CSP nonce agreement, public config projection and credential isolation, noindex, health no-store, `.map` 404 and gzip responses. Fixtures never access the real backend.
- `check:artifacts`: 0 `.map` / `.map.gz` / `.map.br` files; all public JS combined 86,649 bytes gzip (budget 153,600 bytes), stricter than this fixture's initial-route-only sum.
- Lighthouse 13.5.0, three default mobile simulated-throttling runs: performance 100/100/100; LCP 1535/1654/1654 ms, median 1654 ms; CLS 0. See [recorded metrics](evidence/foundation-performance.json). These are local fixture metrics, not real-site acceptance.
- Clean Linux/Alpine Docker build passed frozen install + all four recursive gates + artifact checks. Image: `guatswr-revamp:foundation-local`, manifest `sha256:5371e0ef92d25b8fff40cbfc9320daee6f2f6cf3150d695e1929688621b51128`. Isolated loopback container smoke confirmed health/SSR/CSP/noindex; temporary container was stopped afterward.
- First remote CI run: Linux container passed; Windows typecheck/lint/unit/build passed, 8 functional E2E cases passed, and two golden screenshots failed on 125 text-edge pixels. The downloaded diff was inspected; stage 02 replaces those unapproved scaffold goldens with direct archived-UI comparisons, verified locally. The remote performance step was not reached, so no remote all-green claim is made.
- Browser skill bootstrap attempted; no IAB backends were discovered. Use the committed Playwright runner for local verification; interactive in-app browser review remains unavailable in this session.
- Browser tooling on this host needed a workspace-local temporary directory and browser cache due to EPERM in the system temp directory; this did not require changing global environment variables.
- Remaining upstream warnings: nuxt-security's esbuild logger-drop option is ignored by Vite 8's oxc path; Rollup/Vue annotation/deprecation notices. The Windows Nitro linker also reports an entities symlink collision, while runtime/E2E pass; the clean Linux build/runtime passed. Revisit these integrations during hardening rather than treating a successful build alone as runtime evidence.

### Stage 02 local checkpoint

- Final Windows `pnpm -r typecheck/lint/test/build` passed sequentially. Unit tests: 15/15. Playwright: 18/18, including first mouse/Enter dialog activation, Escape/focus return, browser CSP/hydration errors, and gzip/identity/Brotli negotiation against warmed SWR HTML.
- Ten desktop/mobile, day/night navbar/footer/mobile-menu comparisons passed with zero differing pixels after pixelmatch antialias filtering. Archive/new/diff PNGs are generated in ignored test results. The reproducible protocol is in [DESIGN.md](DESIGN.md).
- Final production artifacts: 0 source maps; all client JavaScript combined 126,249 bytes gzip (budget 153,600). This conservative total is broader than initial-route JS.
- Final Linux/Alpine build passed all four recursive gates and artifact checks. Local image `guatswr-revamp:design-local`, manifest `sha256:872751fd6cb15ef9b87eae620bcc405e32863cab3ce4c9e6a5b26c8ed160f3e9`. Loopback smoke passed health, layout SSR, fixture API, CSP nonce and noindex; the temporary container was removed.
- Final Lighthouse default-mobile simulation, three runs per route: `/` score 99/99/99, LCP 1816/1805/1806ms (median 1805.665ms); `/__revamp/layout` score 97/98/97, LCP 2105/1806/1805ms (median 1805.518ms). **Performance command exits with failure:** the 1800ms threshold remains unchanged. No further retries or performance changes were made after this final rollback verification.
- [Machine-readable stage evidence](evidence/design-validation.json) records every visual comparison, all six Lighthouse runs and the artifact/runtime results. These are fixture/shared-layout measurements, not migrated homepage or complete-site acceptance.
- Current stage changes are a local checkpoint only, not pushed. Remote CI still refers to the published foundation revision; no claim is made that the revised visual tests have passed remote CI.
- `git diff --name-only v1-archive -- frontend backend` is empty. No real backend/account writes or infrastructure changes were made.

### Stage 02 closure — performance gate passed (2026-10-19, checklist 01–04)

- [Trace analysis](evidence/lcp-trace-analysis.md) attributes the ~1806 ms simulated LCP: ~453 ms simulated TTFB, the ×4-CPU main-thread term dominant, plus SSR `rel="prefetch"` hints and an eager dialog chunk finishing just before the LCP moment and being counted as render-blocking by the LCP graph model (150 ms RTT grid).
- Fixes landed: `web/server/plugins/head-hints.ts` (prefetch hints deferred to `load`; modulepreload/preload hoisted ahead of the inline critical CSS), `web/app/components/ui/Dialog.vue` + `web/app/utils/dialog-reka.ts` (Reka dialog runtime lazy on first open, tree-shaken shim, idle prefetch, focus return preserved), `web/scripts/performance.mjs` (render-path warm-up before measuring).
- Final artifact, medians of three runs, 1800 ms threshold unchanged: `/` LCP 1507.7 ms (was 1806.3); `/__revamp/layout` LCP 1654.6 ms (was 1805.6); scores 100/99; the performance command exits 0.
- Full gates green on the same artifact: typecheck/lint/unit 15/15, build, E2E 18/18 (including lazy-dialog first activation, Escape/focus return, and ten zero-pixel visual comparisons), 0 source maps, all client JavaScript 125,504 bytes gzip (budget 153,600).
- Recorded follow-ups (not blocking): duplicate CSS download via the Vite preload helper (Nuxt inlineStyles issue class), 9.8 KB favicon, router R0004 warnings for unmigrated routes, occasional warm-run 150 ms grid step, HTTP/1.1 preview vs HTTP/2 production.
- Historical result: Codex independently reproduced a passing local run on clean Hermes HEAD `eca246c` (`/` median 1554.9 ms, layout 1504.8 ms; 18 E2E passed). During subsequent robustness work, Codex introduced a static Reka `Primitive` import; that intermediate working tree increased the eager graph and failed the layout budget at 1804.8 ms. The Batch A section records its removal and the final result. The retained failure belongs to that intermediate Codex change, not the unmodified Hermes delivery. Remote Windows CI on `eca246c` separately failed at `NO_NAVSTART`.

### Batch A follow-up — native dialog trigger, smaller eager module wave (2026-10-19, implementation worker)

The retained valid performance run for the intermediate Codex working tree failed the layout budget
(`/` median 1657.7 ms, `/__revamp/layout` median 1804.8 ms; raw reports preserved under
`.tools/lighthouse-failed-2026-10-19/`). Lantern attribution from a captured artifact set showed the
layout LCP graph ending on the entry chunk, with the eight initial module requests reaching it in a
chain of ~150 ms (one simulated RTT) steps each.

- **UiDialog owns its trigger.** `Dialog.vue` no longer statically imports Reka's `Primitive`. It renders
  its own `<button type="button">`, so `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls` (only
  while open), `aria-busy` and `disabled` are declarative SSR state; keyboard activation, intent
  prefetch and focus return use the element ref. A `triggerClass` prop carries the consumer's classes;
  the only consumer, the internal `/__revamp/layout` fixture, passes them and supplies text (not a button)
  through the trigger slot. The Reka dialog runtime stays a lazy, deduplicated import that is fetched on
  intent or activation, still with the recoverable error message, the unmount guard, the mounted
  controlled Root and no timers.
- Removing that import also changed Rollup's chunking: the initial request wave for the layout fixture
  is now **5 script requests / 96,499 B transfer** (five parallel, all finished within 11 ms observed)
  instead of **8 requests / 100,157 B**, and the Reka dialog runtime (~33.7 KB raw) is no longer reachable
  from the eager graph. All client JavaScript is 125,861 B gzip (budget 153,600) with 0 source maps.
- `performance.mjs` now requires a finite performance score and a finite positive LCP before a sample
  counts; a missing audit value is recorded as an instrumentation failure instead of being coerced into
  a pass. The bounded `NO_NAVSTART` retry, the never-retry-a-valid-slow-sample rule and the thresholds
  are unchanged.

Result of one three-sample run per target on this artifact, threshold unchanged at 1800 ms,
`invalidAttempts: []`: `/` runs 1560.9 / 1509.1 / 1506.6 ms, median **1509.1 ms**, score 100;
`/__revamp/layout` runs 2107.8 / 1654.4 / 1656.3 ms, median **1656.3 ms**, score 99. The command exits 0.
The first sample of each route is the largest observed sample in this run; no sample was retried and no
valid slow result was discarded. The server render path is prewarmed before Lighthouse, and Lighthouse
clears browser storage/cache for each sample. These are cold-browser samples against a warm server;
the maximum sample is not a separate cold-server or warm-browser benchmark. The two document-request
warm-up timings are retained separately. Full real-page cold/warm comparison remains checklist 81.

Sequential verification on the same build output: `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test`
(15/15), `pnpm -r build`, `check:artifacts` (0 maps, 125,861 B gzip), `pnpm test:e2e` (20/20, including
the lazy-dialog download-failure/reload case and the ten zero-pixel archive comparisons) and then the
single performance run above. Logs: `.tools/claude-{typecheck,lint,test,build,artifacts,e2e,performance}.log`.

The implementation worker did not rebuild the Linux/Alpine container or run remote CI. Codex is verifying
the current source independently, including a local Linux build, before committing and pushing the
reviewed revamp branch. No deployment or infrastructure change is authorized by this verification.

## Next action

Codex independently reviewed the source diff and raw Windows gate/browser/visual/performance evidence.
A fresh Linux/Alpine build passed all four recursive gates (15 unit tests), 0 maps and 125,859 B gzip JS;
image `guatswr-revamp:accepted-stage02`, manifest
`sha256:3ec900700f4381be8c61b4eea6f6246a1591d38a2a827aae9e9f84f9c8b41917`.
An isolated loopback container passed health, SSR/layout, public config projection, credential isolation,
gzip and CSP/header consistency; it was stopped and removed. See [runtime evidence](evidence/design-linux-smoke.json).

One hardening follow-up was verified: full-page SWR reuses the cached HTML nonce, while the uncached layout
generates a new nonce per response. Before release, use fresh HTML nonces with SWR on projected public data,
or validate an equally strict maintainable CSP/cache alternative. This remains stage 06/checklist 84;
shared-layout acceptance does not certify the final security architecture.

Push only the reviewed revamp branch through `github-second`, inspect the new Windows/Linux CI and close
checklist 05 only on actual success. Public API and homepage workers are implementing isolated batches;
remaining public pages, forms, BFF and administration follow [COORDINATION.md](COORDINATION.md). Items 94–99
stay untouched without explicit approval, and 101–107 remain optional for the 2026-11-11 target.

Foundation `f587518` was published through `github-second`; remote main remains `9cef07a`, the archive tag
remains local. [First CI run](https://github.com/guatswr/GuatSWR_Website/actions/runs/39133021626) found
cross-machine scaffold screenshot differences; the revised archive-comparison approach is verified locally
only, and [the later run](https://github.com/guatswr/GuatSWR_Website/actions/runs/39152214698) failed Windows
only at Lighthouse `NO_NAVSTART` while the Linux container passed — that is an instrumentation failure, not an
over-budget measurement. [STAGING.md](STAGING.md) is retained for later planning. Local development/testing
only; deployment remains deferred with the user's estimated launch date 2026-11-11. No production, DNS or
Cloudflare changes have been made and no server credentials are needed now.

### Public-data checkpoint — remote CI accepted (2026-10-19)

Commit `6c07760` was pushed only to `revamp/nuxt-foundation` through `github-second`.
[CI run 39163987930](https://github.com/guatswr/GuatSWR_Website/actions/runs/39163987930)
completed successfully in all three jobs: Windows foundation, Ubuntu foundation and Linux container.
The committed source passed the four recursive gates (78 unit tests), 20 E2E cases and ten zero-pixel
archived-layout comparisons, with 0 production source maps and 125,859 B gzip for all client JavaScript.
Linux Lighthouse retained all three valid samples per route with no invalid retries: scaffold home
771.6 / 1513.5 / 1511.4 ms (median 1511.4 ms, score 100); internal layout
2116.0 / 1511.3 / 1659.6 ms (median 1659.6 ms, score 99). The 1800 ms median gate is unchanged.
Server render paths were prewarmed; browser caches were reset for each sample. These are fixture
measurements, not a migrated-homepage speed comparison or final whole-site acceptance.
[Machine evidence](evidence/public-data-ci-validation.json) closes checklist 05. Homepage, public prose,
event UI and login/auth candidates remain subject to central integration and independent acceptance.
Guest/private admin APIs and fresh-HTML-nonce/data-SWR hardening are being implemented in isolated
worktrees. Local testing only; deployment and infrastructure remain deferred.

### Initial-route budget tooling — integration in progress (2026-10-19)

The accounting tool now unions SSR script/preload seeds, the transitive static-import graph and actual
cold-browser requests, including automatic prefetch. It rejects empty/error pages, failed/stalled scripts,
missing/foreign assets and any production source maps. The fixed budget remains 153,600 B gzip.
Codex independently reproduced 27/27 tooling unit cases. The first CI fixture set covers only the
already accepted scaffold and internal shared-layout route, while their all-JS gate is kept unchanged.
Real browser accounting on CI is still pending; checklist 82 remains open. Migrated homepage candidates
have passed four recursive gates (136 unit tests) but their first E2E run failed, with real UI/test issues
and later production-rate-limit saturation; they are not accepted or included in this tooling commit.

### Working-tree loss, recovery and the parallel workstream round (2026-10-19, Claude Code as lead)

**Incident.** While freeing a full `E:` volume (749 MB free), a scratch cleanup removed
`.tools/stale-*`; the cleanup followed a directory link out of `.tools/` and deleted `web/**` and
`packages/shared/**` from the working tree — 70 tracked files plus every untracked file of the two
uncommitted batches. `frontend/`, `backend/`, `docs/`, `scripts/`, `node_modules/` and `.tools/` were
untouched; no commit, branch, remote, DNS or server state changed. Both batches also existed in their
own worktrees and the two primary-only files were recoverable from the worker transcript, so nothing
was lost permanently. Full account, recovery sources and re-derived fixes:
[logs/00-recovery-2026-10-19](logs/00-recovery-2026-10-19/README.md). About 18 GB was freed from the
same explicitly-stale scratch.

**Recovered and committed.**

- `beb85c0` — the migrated homepage, `/social` and `/join` (worker H batch) plus the projected-public
  data SWR cache and fresh per-response HTML CSP nonces (worker C batch), and the isolated E2E runner.
  Tracked files were restored byte-identically from a clean checkout of the same commit; the
  primary-only strict-TypeScript and cache-C3 corrections were re-derived and are each covered by a
  passing gate. Gates on this tree: typecheck 0, lint 0 (15 pre-existing warnings), test 0
  (shared 23/23 + web 147/147), build 0, `check:artifacts` 0 source maps,
  `node --test web/scripts/e2e-isolated.test.mjs` 22/22, isolated-runner dry run 70 tests / 35 shards.
- `0954b8a` — the page/event dependencies (`pinyin-pro` 3.28.0, `shiki` 4.5.0,
  `@tanstack/vue-form` 1.33.5, `compressorjs` 1.2.1) and a configurable `E2E_PORT_BASE` for the three
  Playwright servers, defaulting to the previous fixed ports 3100 / 3181 / 5174.

**Open, and not accepted by these commits.** The full isolated E2E suite is 56/70. All 14 failures are
in the newly added specs (`homepage-visual`, `homepage`, `social-join`), on both projects: two visual
parity cases, two unscoped navigation locators, the thumbnail fallback, the archive retry state, the
join page without JavaScript and the QR retry. The previously accepted foundation, cache and
shared-layout suites still pass, so this is unfinished new work rather than a regression. Checklist 03
therefore remains open.

**Parallel round.** Three workstreams are running concurrently in the primary checkout with disjoint
file ownership and per-workstream port bases, each required to write a re-verifiable report under
`docs/revamp/logs/<workstream>/` (convention: [logs/README.md](logs/README.md); protocol:
`.tools/agent-protocol.md`): homepage/social/join E2E fixes (`logs/01-homepage-e2e`), public prose
pages integration (`logs/02-public-pages`), and event UI plus the guest BFF (`logs/03-events-guest`).
The lead owns `package.json`, the lockfile, `packages/shared/src/index.ts`, `web/nuxt.config.ts`,
`web/playwright.config.ts`, the recursive gates, the performance harness and the ledgers; builds and
Playwright runs are serialized through `.tools/build.lock` because `.nuxt/`, `.output/` and
`test-results/` are shared. Authentication/BFF and the SEO outputs are deliberately deferred to the
next round so that they do not contend for the shared configuration files.

### Round 1 progress — events batch partially integrated, guest BFF parked (2026-10-19)

The event workstream integrated its UI, shared rules and transport and found four real defects in the
process (an unexecuted TTL check in `guest-drafts.ts` that let an expired cookie be reused instead of
rotated; two hardcoded Playwright port sets; a real `TS2345` in the event form schema; several lint
errors). 33 of its 45 unit cases now execute and pass.

Its guest BFF cannot be integrated in this round: `web/server/utils/guest-bff.ts` imports
`./bff-auth-context`, `./bff-identity`, `./bff-errors` and `./bff-write` (the authentication round's
files, not in the tree) and `guest-upload.ts` additionally needs `busboy`. The workstream correctly
refused to stub that contract. Those eleven paths are parked in `.tools/parked/03-events-guest/`
rather than deleted, and the decision, the restore list and the two real gaps it leaves open — save
locking is neither implemented nor tested, and upload oversize has no test at all — are recorded in
[logs/03-events-guest/LEAD-NOTE.md](logs/03-events-guest/LEAD-NOTE.md).

Authentication/BFF is therefore promoted from a later stage to the critical path: it is what unblocks
the guest draft/upload/signup flows and the event signup UI. Its brief is `.tools/brief-auth.md`; the
SEO outputs follow it (`.tools/brief-seo.md`).

Lead-owned integration fixes applied this round: `web/vitest.config.ts` now aliases `#shared` and `~`
(any module importing either could not previously load under Vitest), and five type errors in the
event files were fixed after that workstream closed. Unit tests across the workspace are 35 shared +
232 web, all passing.

### Authentication round integrated; guest BFF restored (2026-10-19, `4ed54a8`)

The authentication workstream integrated the `revamp-auth` candidate: an opaque 256-bit session id in
an encrypted cookie, the upstream JWT stored only as AES-256-GCM ciphertext with purpose-separated
HKDF, exact origin checks, session-bound CSRF, JSON content-type enforcement, bounded bodies and a
fixed-window login limiter. The client side lands `/login`, the admin middleware and the session
composable. The guest BFF that was parked pending these helpers is restored, and the two gaps the
earlier round recorded are now closed by tests: a per-draft in-flight submission marker returning
`409 submission_in_progress`, and a real oversize upload returning `413`.

Nothing in that batch had ever been executed before this round. Running it found real defects:
`login()` returned an undeclared `expiresAt` (a `ReferenceError` on every login); `guest-upload`'s
`detach()` removed its listeners before destroying the stream, so an aborted upload leaked its
concurrency slot and temp directory; the guest content-bound check rejected the payloads the guest
form builds; `safeLocalReturnPath` accepted `/admin\t`; `useBffSession` used a non-existent Nuxt
hook; and the admin star export collided with `public.js` on three row schemas, which an ambiguous
star export would have dropped at runtime.

**Lead integration fixes.** `xssValidator` is disabled for `/api/bff/**` only: nuxt-security's
validator runs as a Nitro middleware and consumes the request stream with `readBody(event)`, while the
BFF reads its body itself as a bounded raw stream, so every write arrived empty. The change is scoped
to the BFF write namespace, which enforces its own origin, content type, size/time bounds and Zod
validation, and whose output is sanitized or escaped; it is verified end to end, since the same login
now reaches the upstream and returns its `401 invalid_credentials`. The Playwright auth wiring, the
port derivation in `login.spec.ts`, the `web/shared/auth.d.ts` consolidation (replacing a
triple-slash reference the lint config forbids) and the two declared skips for that spec's
project-conditional loop are also lead-owned changes in the same commit.

**Measured.** typecheck 0, lint 0 (33 pre-existing warnings), test 0 — shared 68 + web 535 = 603 unit
tests, up from 267. Build 0. The login E2E ran for the first time: 15/22 passed, 5 real failures
(the reloaded-session redirect, the client-validation focus, and the desktop archived-visual
comparison), now assigned to a dedicated workstream.

**Still open at this point.** The public-pages E2E (18 visual-parity differences plus two functional
cases) and the event E2E (a form/hydration defect plus visual differences) are being worked in
parallel. The route-level JavaScript budget is measured at 177,477 B gzip against a 153,600 B ceiling
— a real overage in client code, unrelated to the BFF, which ships no browser bytes. The admin BFF
API, the eleven admin pages, the SEO outputs and all of stages 06–07 remain outstanding.

### E2E infrastructure: the fixture leak that blocked whole-suite runs (2026-10-19, `046fcab`)

The full isolated suite kept aborting at batch 2 with "did not write report.json".
The cause was not the batch under test: Playwright's `webServer` does not reliably
reap the fixture servers, so batch 1's legacy fixture kept its port and batch 2's
`webServer` — configured with `reuseExistingServer: false` — could not start. It
surfaced as a missing report rather than a port conflict, which is why it read as a
runner defect. Each fixture command now calls `exitWithParent()`, which polls its
parent and exits when the parent is gone; it is only installed from a fixture's
command-line entry point, so an importing test never starts it. Verified with a
five-batch run: 10/10 passed and zero listeners remained on any fixture port.

`web/scripts/e2e-isolated.mjs` also accepts a subset again. The shipped skip policy
is validated strictly only for a whole-suite run; with a forwarded selector, entries
outside the selection are reported as unexercised, while the runtime check still
fails any skip the selection actually produces and does not declare.
