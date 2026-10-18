# GuatSWR frontend revamp status

Updated: 2026-10-18 (Asia/Shanghai). Branch: `revamp/nuxt-foundation`.

## Boundaries

- New code: `web/`, `packages/shared/`, root tooling, and `docs/revamp/`.
- `backend/` and `frontend/` remain in place and read-only after the WIP checkpoint.
- Frozen v1 API; public visuals will be ported 1:1 before any redesign.
- Only `revamp/*` may be pushed, via `github-second`. No push to main.
- No DNS, server, Cloudflare, production switch, or real account writes without first presenting the concrete plan.
- Never commit credentials. New production artifacts must contain no source maps.
- Pause and report any blocker lasting over 30 minutes or a major uncertain decision.

## Checkpoints

| Stage | State | Evidence / remaining acceptance |
| --- | --- | --- |
| 00 Legacy checkpoint | Done locally | `f1215d4`; annotated `v1-archive`; Vite production build passed; 55 frontend tests passed. |
| 01 Workspace / Nuxt foundation | Local gates passed; staging pending | Nuxt 4 / strict TS / Tailwind 4, shared contracts, CI and independent Docker image. All local recursive gates, 10 E2E cases, screenshots, artifact and mobile performance budgets passed. Infrastructure awaits approval/target details. |
| 02 Design system | Pending | Copy existing tokens, layout, navigation, motion, and accessible primitives; desktop/mobile visual comparisons. |
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
- The legacy build currently emits source maps and large chunks; these pre-existing risks remain in the archived old frontend and are not silently changed during the read-only migration.

## Validation log

- Legacy: `npm run build` in `frontend` passed (10.91s); existing sourcemap/chunk and Browserslist warnings recorded.
- Legacy: eight test files, 55 assertions passed using Node's test runner.
- Foundation: `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test`, `pnpm -r build` passed on Windows with Node 24.15.0. New unit tests: 10/10.
- Playwright 1.64.1 Chromium: 10/10 E2E passed with ordinary snapshot comparison (not update mode). Desktop/mobile baselines were generated and visually inspected. Covers SSR text without JS, warm SWR/CSP nonce agreement, public config projection and credential isolation, noindex, health no-store, `.map` 404 and gzip responses. Fixtures never access the real backend.
- `check:artifacts`: 0 `.map` / `.map.gz` / `.map.br` files; all public JS combined 86,649 bytes gzip (budget 153,600 bytes), stricter than this fixture's initial-route-only sum.
- Lighthouse 13.5.0, three default mobile simulated-throttling runs: performance 100/100/100; LCP 1535/1654/1654 ms, median 1654 ms; CLS 0. See [recorded metrics](evidence/foundation-performance.json). These are local fixture metrics, not real-site acceptance.
- Clean Linux/Alpine Docker build passed frozen install + all four recursive gates + artifact checks. Image: `guatswr-revamp:foundation-local`, manifest `sha256:5371e0ef92d25b8fff40cbfc9320daee6f2f6cf3150d695e1929688621b51128`. Isolated loopback container smoke confirmed health/SSR/CSP/noindex; temporary container was stopped afterward.
- CI workflow is committed for Windows browser/visual/performance gates and a separate Linux Docker build. Remote execution status must be verified after pushing; local results do not assert a remote CI pass.
- Browser skill bootstrap attempted; no IAB backends were discovered. Use the committed Playwright runner for local verification; interactive in-app browser review remains unavailable in this session.
- Browser tooling on this host needed a workspace-local temporary directory and browser cache due to EPERM in the system temp directory; this did not require changing global environment variables.
- Remaining upstream warnings: nuxt-security's esbuild logger-drop option is ignored by Vite 8's oxc path; Rollup/Vue annotation/deprecation notices. The Windows Nitro linker also reports an entities symlink collision, while runtime/E2E pass; the clean Linux build/runtime passed. Revisit these integrations during hardening rather than treating a successful build alone as runtime evidence.

## Next action

Publish the reviewed foundation only to `revamp/nuxt-foundation` via `github-second` (archive tag remains local). Review [STAGING.md](STAGING.md) and supply the target server/deployment convention, backend internal origin and preview access policy before infrastructure changes. Next code stage is the 1:1 design-system/layout port. Stages 02–07 remain unaccepted; no production/DNS/Cloudflare changes have been made.
