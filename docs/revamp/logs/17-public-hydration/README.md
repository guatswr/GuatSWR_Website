# Public idle hydration — local acceptance

2026-10-20, Codex alone, parent `6ad9a1a`. Local only.

The complete-home baseline remains **2260.4 ms / score 98**, three valid
Lighthouse mobile simulated-throttling samples; see log 16. It fails 1800 ms.

A passive browser diagnostic (three fresh contexts, same Chromium process,
412×823 / DPR 1.75, no network or CPU throttle) records inline CSS followed
by duplicate CSS network requests from Vite's dynamic-import preload helper.
It records first title paint before the end of its animation. Therefore the
animation duration is not established as the sole reason for LCP; it was not
shortened or removed. These unthrottled observations are diagnostic, not a
replacement for the Lighthouse gate. Raw `.tools/home-paint-diagnostic.json`
and `.tools/codex-home-paint-diagnostic.log`.

## Candidates

1. Use native Nuxt `defineLazyHydrationComponent('idle', ...)` for homepage
   interests and about sections. The full sections, links and images still
   render on the server; only client hydration waits for browser idle time.
   Four recursive gates pass **767 units**, lint 0 errors / 34 existing
   warnings. Lighthouse's first complete measurement is:

   | Sample | Score | LCP (ms) |
   | --- | --- | --- |
   | 1 | 84 | 3502.6025 |
   | 2 | 99 | 1810.8141 |
   | 3 | 98 | 1138.532 |

   Median **1810.8141 ms / 99** still **fails** 1800 ms. No valid sample was
   removed, repeated or replaced; [complete summary](home-only-performance.json).
   Original reports: `.tools/lighthouse-home-idle/`; raw
   `.tools/codex-home-idle-{typecheck,lint,test,build,performance}.log`.
   The first launcher attempt used a wrong local TEMP path, failed before
   Chrome started and produced **zero samples**; [failure](launcher-failure.json).
   The corrected absolute-path launch produced the complete three-sample run
   above. This is not a slow-sample retry.

2. Additionally idle-hydrate the shared below-fold footer, preserving all SSR
   text, links and reactive config updates. This uses the same native Nuxt/Vue
   strategy; no hand-written import delay, fixed loading timer, markup removal,
   CSP change or global scheduling interception. Four recursive gates pass
   **767 units**, lint 0 errors / 34 existing warnings. Its first complete
   unchanged Lighthouse run passes both configured routes:

   | Route | LCP samples (ms) | Median (ms) | Median sample score |
   | --- | --- | --- | --- |
   | `/` | 3579.7515 / 1659.926 / 1662.1452 | **1662.1452** | **98** |
   | `/__revamp/layout` | 2556.30275 / 1360.6452 / 1514.64255 | **1514.64255** | **98** |

   [Complete summary](final-performance.json). No invalid attempts or discarded
   valid measurements; the slow first samples are retained. The unchanged
   policy is the median of three valid cold-browser samples per route, on a
   document-prewarmed serving process. This does not claim every individual
   sample is below 1800 ms, nor that all public routes or production are measured.
   Original reports: `.tools/lighthouse-home-footer-idle/`; raw
   `.tools/codex-home-footer-idle-{typecheck,lint,test,build,performance}.log`.

The actual no-JS homepage test now additionally asserts interests/about body
headings and footer history/login hrefs. Client deferral must not become server
content deferral. The integrated production/visual regression passes **96/96**,
48 fresh production batches, one attempt each, zero retry/flaky/skip:
[complete case summary](e2e.json). This covers homepage interaction/freeze,
reduced motion, delayed hydration, image fallback/retry, no-JS content, navigation/
footer, social/join and public-body/paging/filtering/SEO/error paths. **64**
archive comparison regions have **zero** significant differing pixels on
Windows; all 312 retained PNG files (raw/cropped/diff and state captures) remain
under `.tools/home-footer-idle-regression/`. Raw
`.tools/codex-home-footer-idle-regression.log`.

All **14** cold public-route JavaScript graphs pass **121133–135910 B gzip**,
zero sourcemaps; [complete request graph](route-budget.json), raw
`.tools/codex-home-footer-idle-budget.log`. The home graph is 135910 B versus
the baseline 132798 B: native hydration wrappers add a small amount of code.
This change improves when client work runs; it does **not** claim fewer total
initial-route bytes. The interaction-free two-second accounting window and
completion checks are unchanged and still include idle-loaded code.

## Cross-platform baseline follow-up

The preceding pixel-approval commit `6ad9a1a` has unchanged application source.
Its actual Ubuntu run [39373187255](https://github.com/guatswr/GuatSWR_Website/actions/runs/39373187255)
passes **254/254 E2E**, zero retry/flaky/skip, and the Linux container job passes.
It now reaches Lighthouse and fails only that gate: real home median **2034.0 ms /
99** (1962/2410/2034), layout fixture **908.9 ms / 100**. This is a Linux baseline,
not the Windows candidate result above. New hydration source is not in that
remote run. Windows was still running when checked; no full green CI is claimed.

The production source changes are limited to homepage and default-layout
component declarations. No dependency, backend/legacy source, v1 API, public
styling, animation timing, pixel threshold or performance budget changed.
The E2E-only no-JS assertion additions followed the production build; final
typecheck/lint are repeated on those assertions without rebuilding unchanged
application output. This accepts a local performance/visual checkpoint, not
the whole migration or final CI. Accessibility, remaining public advanced
Markdown, comparable old/new first/warm-visit baseline, full-route performance,
security/monitoring and complete CI remain open. No deployment or QQ success.

Reproduction after setting project-local Node/TEMP/browser paths (log 15):

```powershell
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm -r build
# Run from web/ with absolute TEMP and PLAYWRIGHT_BROWSERS_PATH:
node scripts/performance.mjs / /__revamp/layout
# Run from repository root, E2E_PORT_BASE=4100:
node web/scripts/e2e-isolated.mjs homepage.spec.ts homepage-visual.spec.ts layout.spec.ts public-pages.spec.ts social-join.spec.ts --work-dir ../.tools/home-footer-idle-regression
node scripts/revamp/check-route-budget.mjs --routes scripts/revamp/route-fixtures.json
pnpm -r typecheck
pnpm -r lint
```

Exact changed files: [files.txt](files.txt). First-home-only and final production
measurements are separate immutable records, not merged samples. This evidence
does not establish a statistical speedup for real users on production hardware.
