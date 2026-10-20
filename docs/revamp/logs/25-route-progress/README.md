# Navigation progress feedback

Date: 2026-10-21 (Asia/Shanghai). Base: `866ee36`, branch
`revamp/nuxt-foundation`. User requested a page-transition progress bar like the
archive, with inspiration from established sites.

## Result and design references

Use the top-edge slim-bar pattern demonstrated by [NProgress](https://rstacruz.github.io/nprogress/)
and retain the archive's 3px blue gradient and light/dark glow. Navigation starts
feedback immediately, estimated progress approaches 92% while pending, and the
current page's actual `onAfterEnter` fills the bar. It holds full briefly, fades,
then resets invisibly. The bar does not delay routing or capture pointer input.
Reduced-motion keeps waiting progress static and removes easing. SSR first
paint is visible without a loading overlay. This is estimated navigation
feedback, not a displayed byte/download percentage.

Nuxt's router starts the operation before route chunks and awaited page data.
A generation token captured by each transition owns its completion. Late
callbacks, cancelled navigation and old hide/reset timers cannot finish a newer
operation, including a later visit to the same URL. Same-page query/hash and
trailing-slash changes do not wait for a nonexistent page transition. Admin
navigation is excluded, matching archived `router.js`'s `disableRouteProgress`.
Passive/lazy images retain their own progressive presentation.

No dependency was added. A client plugin manages the scoped lifecycle; the
pure controller owns one interval while pending and two short completion timers.
Cleanup removes router hooks and timers when the app is disposed. There is no
image/DOM scan or forced successful completion after an arbitrary request timeout.

## Review evidence and unsuccessful attempts

The previous `<NuxtLoadingIndicator>` had a 200ms throttle, hiding most cached
page changes. A minimal zero-throttle wrapper was tried first, based on the
[official Nuxt component](https://github.com/nuxt/nuxt/blob/main/packages/nuxt/src/app/components/nuxt-loading-indicator.ts)
and installed Nuxt 4.6.2 sources. Its actual Chromium run passed **10/14** and
failed **4**: both dark-theme style checks and both stale-navigation checks.
The dark scoped selector did not target the bar as intended; native global
finish/error signals from the older page hid feedback for the next pending page.
Raw failures are retained in `web/.e2e-isolated/route-progress/`.

The final implementation uses a uniquely named unscoped CSS selector for dark
mode and navigation-owned completion. The intermediate `build-owned.log` was
stopped when adding same-document URL normalization; it is not a passing build.
The next browser run also revealed a cancelled page resuming asynchronous setup
after disposal and attempting to register SEO metadata without live site context
(`Invalid URL`). `usePublicSeo` now exits for disposed scopes/components; live
origin validation is unchanged. The browser gate still requires zero unhandled
errors and asserts the final history title and configured-origin canonical URL.
Its same-document test also initially expected Vue Router to replace a trailing
slash. A duplicate navigation actually retains the URL; the corrected test
strictly asserts that URL, the same DOM root and zero visible progress.
Two mixed regression runs passed 25/26. The missing homepage region was initially
misdiagnosed as a cover decode race; an isolated probe passed, but the full mixed
selection reproduced the same 49,201-pixel failure. Trace/source review confirmed
the whole third card was absent: the concurrent admin test enables a mutable
fixture whose public list incorrectly excluded legacy `status=null` activities.
The immutable archive fixture and frozen backend (`backend/src/routes/activities.js:30`)
include them. Fix only the mutable test fixture's list predicate to match that
contract. The speculative decode/paint wait is removed; screenshot readiness,
raw captures, whole-device-pixel crops and zero-difference thresholds are unchanged.
Final acceptance retains the same mixed selection, including concurrent admin
activation, rather than separating suites to hide the fixture inconsistency.

Admin layout boundaries clear feedback because the new layout's first page has
no enter animation. The existing desktop/mobile workspace test now also logs
out through the actual fixture BFF and verifies the public login bar is idle.

Final build evidence is `build-closed.log`. No timeout, retry,
rate-limit, screenshot threshold or approved visual allowance is relaxed.

The in-app browser connector returned `No Codex IAB backends were discovered`.
Verification therefore uses repository Chromium Playwright, not a claimed manual
in-app review. Raw top-of-page images show both themes and device projects;
rAF samples retain actual visible progress through page entry.

## Commands and final acceptance

Final results and file hashes are in `evidence.json`. Raw logs are under
`.tools/route-progress/`; browser artifacts use the isolated directories below.
Typecheck/lint/test use the workspace scripts, with Node 24.16.0 and pnpm 11.25.0.
Lint retains 34 existing warnings. Whole-migration acceptance remains open.

The production build uses committed `866ee36:web/nuxt.config.ts`, with the
150 requests / 300000ms rate limit enabled. `buildNuxt` redirects both build/type
directories and all Nitro output directories into `.tools/route-progress/`;
the shared package builds with its normal script. This protects the active
`web/.output`/3100 preview and the previous 3101 artifact. Unrelated backend,
legacy Vite and Nuxt runtime-default working-tree edits are excluded.

```text
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm --filter @guatswr/shared build
pnpm run test:tooling
node .tools/route-progress/build.mjs
```

Set `E2E_NUXT_OUTPUT` to the absolute `.tools/route-progress/.output`,
`E2E_PORT_BASE=4100`, `PLAYWRIGHT_BROWSERS_PATH` to `.tools/browsers`, and use
the checked isolated runner (at most two tests per fresh production server):

```text
node web/scripts/e2e-isolated.mjs route-progress.spec.ts --work-dir .e2e-isolated/route-progress-closed
node web/scripts/e2e-isolated.mjs page-transitions.spec.ts homepage-visual.spec.ts layout.spec.ts admin-interface.spec.ts --grep "page-transitions.spec.ts|homepage matches|navigation and footer match|workspace navigation" --work-dir .e2e-isolated/route-progress-fixture-reviewed
node scripts/revamp/check-route-budget.mjs --output .tools/route-progress/.output --routes scripts/revamp/route-fixtures.json
```

The new browser suite checks cached navigation, long held requests, both themes,
late cancelled data while the successor stays pending, event category changes,
same-document canonicalization, failed data and reduced motion. Six unit tests
exercise ownership, repeated paths, old timers, slow requests and disposal.

| Gate | Final result |
| --- | --- |
| Workspace typecheck / lint / units | Pass; 0 lint errors, 34 existing warnings; 791 units (73 shared + 718 web) |
| Tooling | 59/59 pass |
| Shared build + isolated production Nuxt build | Pass; active preview artifacts protected |
| Progress E2E | 16/16 pass |
| Existing mixed navigation / visual / admin logout regression | 26/26 pass after fixture correction |
| Approved-reference visual regions | 30/30 zero differing pixels |
| Initial public JS graphs / output maps | 15/15 pass, 122487–137385 B gzip (budget 153600 B); 0 source maps |

Both final E2E selections have zero retries, flaky results or skips. Earlier
failed runs remain separate evidence and are not included in passing counts.

The refreshed local preview is **http://127.0.0.1:3101**, backed by the existing
local backend on 8088, a distinct session cookie and an in-memory random sealing
key. Chromium confirms `/api/config` 200, theme interaction, visible progress
during social-to-join navigation, one document load and zero page errors. The
first preview check could not launch Chromium with the default Windows TEMP;
rerunning with the same workspace TEMP/TMP used by the gates passes. No app
change was needed. The old 3101 process was verified as this task's previous
preview before replacement. Original 3100 PID 56840 and sampled production
artifact hashes are preserved. Refresh the browser to load this new artifact.

## Changed file inventory

```text
web/app/app.vue
web/app/layouts/default.vue
web/app/pages/events.vue
web/app/components/RouteProgressBar.vue (new)
web/app/composables/usePublicPageTransition.ts (new)
web/app/composables/usePublicSeo.ts
web/app/plugins/route-progress.client.ts (new)
web/app/utils/route-progress.ts (new)
web/tests/route-progress.test.ts (new)
web/tests/e2e/route-progress.spec.ts (new)
web/tests/e2e/admin-interface.spec.ts
web/tests/fixtures/admin-upstream.mjs
docs/revamp/STATUS.md
docs/revamp/logs/README.md
docs/revamp/logs/25-route-progress/README.md (new)
docs/revamp/logs/25-route-progress/evidence.json (new)
```

No backend/API changes or deployment. Final migration performance, full
accessibility/security/manual touch review and cross-platform CI remain open;
there is no migration-success/QQ message for this local UI checkpoint.
