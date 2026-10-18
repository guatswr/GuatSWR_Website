# GuatSWR frontend revamp status

Updated: 2026-10-18 (Asia/Shanghai). Branch: `revamp/nuxt-foundation`.

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
| 02 Design system | In progress; stopped for performance sync | Shared tokens/layout/navigation/theme/dialog ported. Four recursive gates, 18 E2E and 10 archive visual comparisons pass. Mobile LCP median ~1806ms exceeds 1800ms; stage is not accepted. |
| 03 Public pages | Pending | Preserve existing URLs (including singular `/activity/:id`), SSR/SWR, content SEO, images, sitemap/RSS. |
| 04 Interactive forms | Pending | Existing guest upload/submission/signup contracts; shared zod + vee-validate; TanStack Query. |
| 05 Administration | Pending | Element Plus only in admin chunks; BFF encrypted HttpOnly session; CSRF; no JWT serialization. |
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

## Next action

Stage 02's performance gate is closed locally (checklist 01–04 verified; the earlier "unaccepted checkpoint" note above is superseded). Per checklist 05 the branch is pushed through `github-second` for the revised remote CI; verify the Windows/Linux runs, then continue with checklist 06–10 (implementation decisions) and Stage 03 (public pages) one item at a time, each self-verified and ticked in [CHECKLIST.md](CHECKLIST.md). Items 94–99 stay untouched without explicit approval. Deployment remains deferred; no production/DNS/Cloudflare changes have been made.

Foundation `f587518` was published through `github-second`; remote main remains `9cef07a`, archive tag remains local. [First CI run](https://github.com/guatswr/GuatSWR_Website/actions/runs/39133021626) found cross-machine scaffold screenshot differences; the revised archive-comparison approach is verified locally only. [STAGING.md](STAGING.md) is retained for later planning. Local development/testing only; deployment remains deferred with the user's estimated launch date 2026-11-11. Stage 02's performance gate is now closed (see above); Stages 03–07 remain unaccepted. No production/DNS/Cloudflare changes have been made. No infrastructure approval or server credentials are needed now.
