# Approved Linux visual exception and current performance baseline

2026-10-20, Codex alone, local only. Parent `13cff96`.

The user explicitly accepted only the documented Linux mobile dark-log avatar
border pixel. The comparison helper now fails closed unless platform/project,
component/state, DPR, raw/cropped dimensions, significant difference count,
exact `(670,1789)` location, both RGBA colors and the actual red diff marker all
match the approved record. Zero-pixel images pass normally. A second pixel,
another color/location, another route/theme or another platform is not allowed.
Original/raw/archive/new/diff images remain intact; global pixelmatch threshold
0.1 and antialias policy remain unchanged. Metadata keeps `differingPixels: 1`
and records the approval separately, rather than calling it zero differences.

The pure guard's **15/15** focused tests pass, including wrong-scope/geometry,
zero/two pixels, altered colors/location and changed crop dimensions. Final
recursive typecheck/lint/test pass **767 units** (73 shared + 694 web), lint
0 errors / 34 existing warnings. Raw `.tools/codex-approved-raster-final-*.log`.
No public styling or production code has changed for this exception.

## Evidence and scope

- Fresh actual Windows public-page regression: **48/48**, 24 fresh production
  batches, one attempt each, zero retry/flaky/skip;
  [summary](windows-public-e2e.json), raw `.tools/codex-approved-raster-public.log`.
  This covers SSR/no-JS bodies, paging/filtering/errors, interactions, images,
  and 20 archive cases / 34 compared regions across desktop/mobile light/dark. Windows visual
  comparisons retain zero significant differing pixels; no exception applies.
- Fresh actual Linux Chromium: **1/1**, one attempt, no retry/flaky/skip;
  [summary](linux-e2e.json), [actual comparison](linux-comparison.json).
  Network is isolated; repository and Linux output volume are mounted read-only.
  Original/raw/archive/new/diff PNGs remain under
  `.tools/linux-browser-results/codex-approved-raster-local-geometry/`.
- The first local attempt correctly failed the initially Ubuntu-only geometry
  check. The local old/new captures have the same width as each other, but
  measure 2179 cropped / 2181 raw pixels instead of Ubuntu's 2291 / 2292.
  Both environments have height 2344, DPR 2.625 and the identical approved
  pixel coordinate/colors. The guard now enumerates just those two measured
  geometry pairs; it does not authorize any other pixel or arbitrary size.
  The failed first attempt is retained under
  `.tools/linux-browser-results/codex-approved-raster-13cff/`.
- Initial four recursive gates and a fresh Linux Docker build passed **766**
  units, zero maps, before the test-only second-geometry correction. Final
  typecheck/lint/test above include the added fifteenth test. Application source
  and production output are unchanged between these test revisions. Raw
  `.tools/codex-approved-raster-{typecheck,lint,test,build}.log` and
  `.tools/codex-approved-raster-docker-build.log`.
- Runtime: project-local Node 24.16.0, pnpm 11.25.0, default Node settings;
  pinned Playwright Chromium 1.64.1. The local browser container uses Noble and
  CJK fonts. No Windows thread-pool workaround, production CSP change, global
  visual tolerance or mask was introduced.
- All **14** cold public-route JavaScript graphs pass **119907–132798 B gzip**,
  zero sourcemaps; [budget and complete request graph](route-budget.json).
  Raw `.tools/codex-approved-raster-budget.log`. The highest is the homepage;
  the combined lazy/private client inventory is not its initial-route total.

The preceding [remote CI run](https://github.com/guatswr/GuatSWR_Website/actions/runs/39370918315)
on `13cff96` finishes with Windows **254/254**, no retry/flaky/skip, and Linux
container success. Ubuntu is **253/254**, no flakes, with only the mobile dark-log
comparison failing before this guard existed. Performance was skipped after
that Ubuntu failure; Windows performance is intentionally Linux-only in the
existing workflow. [Job record](prior-ci.json). This does not claim the new
commit's complete CI has passed.

Reproduction (project-local runtime/TEMP/browser paths, see log 15):

```powershell
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm -r build
node web/scripts/e2e-isolated.mjs public-pages.spec.ts --work-dir ../.tools/approved-raster-windows-public
node scripts/revamp/check-route-budget.mjs --routes scripts/revamp/route-fixtures.json
```

The Linux command uses the same isolated runner with `--project=mobile`,
`--grep '/logs matches the archive \(dark\)'` and a separate artifact directory.
The original CI PNG pair also passes a diagnostic offline replay with the
unchanged pixelmatch settings; this replay is not counted as a browser test.

## Current full-home performance baseline

The accepted secondary-admin output (`13cff96` production source) was measured
once with three valid cold-browser Lighthouse samples, default mobile simulated
throttling, pinned Chromium, Node 24.16.0 and the existing unchanged script.
There were no instrumentation retries or discarded valid samples:

| Run | Score | LCP (ms) |
| --- | --- | --- |
| 1 | 83 | 3509.52565 |
| 2 | 99 | 1660.9653 |
| 3 | 98 | 2260.4089 |
| Median by LCP | 98 | **2260.4089** |

This **fails** the unchanged 1800 ms limit. Server first/second warmup document
requests were 208.07/29.56 ms; every browser sample still resets its own storage
and HTTP cache. It does not measure a cold Node process as its LCP sample.
Raw `.tools/codex-admin-secondary-home-baseline.log`; all original reports are
preserved in `.tools/lighthouse-13cff-home-baseline/`. The older 1960.7 ms
candidate and early scaffold 1500 ms results must not replace this latest result.

All samples identify `h1#home-title` as LCP. The first sample's observed text
render delay is 981 ms; the other two are around 139–151 ms. In the third
sample, below-fold mascot and several module requests finish before LCP; the
second has only document/entry/hero/badge requests in that interval. This is a
render/request-order observation, not proof of one sole cause. No timing or
visual tradeoff has been implemented as a performance fix yet.

No deployment, backend/frontend source changes or QQ success message.
