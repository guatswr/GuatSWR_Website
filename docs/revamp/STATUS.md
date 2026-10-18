# GuatSWR frontend revamp status

Updated: 2026-10-19 (Asia/Shanghai). Branch: `revamp/nuxt-foundation`.

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
| 03 Public pages | Data candidate passed first full local gates; UI candidates under review | Preserve existing URLs (including singular `/activity/:id`), SSR/data SWR, content SEO, images, sitemap/RSS. Homepage source is ready for integration; remaining pages still need parity fixes and real gates. See [COORDINATION.md](COORDINATION.md). |
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
