# Public page navigation continuity

Date: 2026-10-21 (Asia/Shanghai). Base: `3b99f15`, branch
`revamp/nuxt-foundation`. User reported that the new site's page changes felt
abrupt compared with the archive.

## Review and implementation

The archived `frontend/src/App.vue` and `layouts/EventsLayout.vue` use 200ms
opacity fades. The corresponding new root and nested event `NuxtPage` had no
transition. The new public shell already has Nuxt's loading indicator.

Restore a 200ms opacity transition for public pages and event category boards.
Keep the navbar/footer and category shell mounted. Query-only member filters
retain their component and do not fade the whole page. No initial `appear`
animation: SSR text is visible without JavaScript. Reduced-motion disables the
fade. Admin layout/focus ownership is unchanged.

The first direct port of the archive's `out-in` mode exposed an async-navigation
failure: navigate to a member page whose data is held pending, then immediately
select history, and the main region can remain empty. Use overlapping native
Vue mounting instead, with CSS scheduling the enter fade after the leave fade.
Both pages occupy the same grid cell; the taller page preserves document height
until leave completes, preventing early scroll clamping on a shorter destination.
Each root retains its own 64px navbar space (none on home), so crossing the home
boundary cannot move the outgoing page. No transform changes fixed descendants'
containing blocks. Native Nuxt scrolling remains in charge and completes before
the incoming page becomes clearly visible. Administration has no grid wrapper.

## Validation and raw evidence

| Check actually run | Result |
| --- | --- |
| `pnpm -r typecheck` | Exit 0 |
| `pnpm -r lint` | Exit 0; 0 errors, 34 existing warnings |
| `pnpm -r test` | 785/785 (73 shared + 712 web) |
| `pnpm --filter @guatswr/shared build` + isolated `buildNuxt` | Both exit 0; existing build-chain warnings remain |
| `pnpm run test:tooling` | 59/59 |
| Navigation E2E, normal and reduced motion | 16/16, 8 fresh batches |
| Existing visual/reload/admin-navigation regression | 28/28, 14 fresh batches |
| Strict approved-reference comparisons | 62 regions, 0 differing pixels; existing dark-modal deviation checks unchanged |
| Cold initial JS graphs | 15/15, 122479–137376 B gzip, budget 153600 B |
| Whole isolated artifact map scan | 0 source maps |
| Actual-backend local preview smoke | Social → join, 1 document load, 0 page errors |

Every accepted E2E case passed on its only attempt: no retry, flaky or skipped
case. Prior unsuccessful attempts are retained separately and are not counted
as acceptance. The normal-motion tests record rAF opacity/geometry/scroll frames;
they check real fade phases, both home-boundary directions, nested boards,
query-only filters, held data, cancelled pending navigation, top reset and back
restoration. They also check that the incoming page does not become clearly
visible at the old scroll position. SSR without JS and reduced-motion are covered.

See `evidence.json` for final results. Raw local evidence is under
`.tools/navigation-transitions/` and
`web/.e2e-isolated/navigation-transitions*/`. These are local generated artifacts.
The first attempted `out-in` run is preserved, including its failures. Its two
scroll failures exposed two test setup errors: desktop saved a position midway
through the existing month-link smooth scroll; mobile tried to click a desktop
rail that is intentionally hidden. Desktop now waits for the actual target.
Mobile sets a real reading position without forcing an invisible control; both
then strictly check top reset and browser history restoration. This does not
constitute a manual touch-gesture audit.
An intermediate absolute-overlap probe passed rapid navigation and corrected
history restoration, but failed the homepage geometry check: the outgoing hero
moved down 64px. Its raw report is also retained. The final grid implementation
addresses that geometry and the visible-destination scroll timing together.

The in-app browser backend was unavailable (`No Codex IAB backends were
discovered`). Browser verification uses the repository's actual Chromium
Playwright tests, not a claimed manual in-app review.

The existing production preview on port 3100 stays running. All builds and E2E
use `.tools/navigation-transitions/.output`, not `web/.output`. The build takes
its Nuxt config from committed `3b99f15`, with the production 150/300000ms rate
limit enabled. Unrelated working-tree changes to backend files, the old Vite
proxy and Nuxt's default API port/rate limiter are excluded. Fixture API origins
are provided at runtime. No deployment or main-branch changes.

The adjusted artifact now also serves **http://127.0.0.1:3101**, against the
existing local backend `http://127.0.0.1:8088`. Its helper is
`.tools/navigation-transitions/preview.mjs` (PID recorded in `preview.pid`). It
binds only loopback, uses a separate cookie name and generates a fresh sealing
key in memory; no credential is written to disk. This local preview is distinct
from deployment. The original preview remains PID 56840 on 3100; sampled
`web/.output` entry/manifest hashes are unchanged. The final real-backend browser
smoke is `.tools/navigation-transitions/preview-check.json`.

## Reproduction

Use Node 24.16.0 in `.tools/node/bin` and pnpm 11.25.0. Build normally with
`pnpm -r build` only after stopping a preview that serves `web/.output`; otherwise
use an isolated Nuxt build. This run uses `.tools/navigation-transitions/build.mjs`:
`loadNuxt({ cwd: resolve('web'), configFile: resolve('.tools/navigation-transitions/nuxt.config'), dev: false, overrides: { rootDir, srcDir, serverDir, buildDir, typesDir, nitro: { output } } })`,
then `buildNuxt(nuxt)` and `nuxt.close()`. Source is `web/app`, server is
`web/server`, both generated type/build directories are
`.tools/navigation-transitions/.nuxt`; Nitro's dir/publicDir/serverDir all point
inside the isolated output. Config snapshot: `git show 3b99f15:web/nuxt.config.ts`.

Set `E2E_NUXT_OUTPUT` to that absolute output directory,
`E2E_PORT_BASE=4100`, and `PLAYWRIGHT_BROWSERS_PATH` to `.tools/browsers`.
The test-server entry imports a file URL, so paths are never interpolated into
a shell command. Without the override it serves the standard `web/.output`.
The checked isolated runner still creates fresh servers for at most two tests
per batch; no rate-limit, retry, screenshot or threshold relaxation.

```text
node web/scripts/e2e-isolated.mjs page-transitions.spec.ts --work-dir .e2e-isolated/navigation-transitions-accepted
node web/scripts/e2e-isolated.mjs homepage-visual.spec.ts layout.spec.ts events-visual.spec.ts public-pages.spec.ts entry-loading.spec.ts admin-interface.spec.ts --grep "homepage matches|navigation and footer match|event pages match|/history matches|/members matches|hydrates after repeated|workspace navigation" --work-dir .e2e-isolated/navigation-transitions-regression
node scripts/revamp/check-route-budget.mjs --output .tools/navigation-transitions/.output --routes scripts/revamp/route-fixtures.json
```

## Scope and limits

No new animation dependency, API change or public-page redesign. The timing
change is limited to navigation; approved static visual exceptions remain
bounded as before. Final whole-migration performance, accessibility, security
and cross-platform CI gates remain open. No migration-success/QQ message.

Exact changed paths:

```text
web/app/app.vue
web/app/layouts/default.vue
web/app/pages/events.vue
web/app/assets/css/main.css
web/app/assets/css/page-transition.css (new)
web/playwright.config.ts
web/tests/fixtures/nuxt-server.mjs (new)
web/tests/e2e/page-transitions.spec.ts (new)
docs/revamp/logs/24-page-transitions/README.md (new)
docs/revamp/logs/24-page-transitions/evidence.json (new)
docs/revamp/STATUS.md
docs/revamp/logs/README.md
```
