# Public SEO and portable validation — independent implementation

Base: `7e0b4d9`, Windows, pinned Node 24.15.0 / pnpm 11.25.0; local-only.
This stage is in progress: whole-site performance, guest integration and admin
acceptance are not complete. No deployment or success notification occurred.

## Scope

- `web/shared/seo.ts`, `server/utils/public-index.ts`,
  `server/api/__sitemap__/urls.get.ts`, `server/routes/rss.xml.get.ts`,
  `server/plugins/sitemap-integrity.ts`: bounded public sitemap/RSS and metadata.
- `app/composables/usePublic{,Page}Seo.ts`, `app/utils/public-seo.ts`,
  `pages/activity/[id].vue`, `pages/{social,join,logs}.vue`,
  `components/events/EventBoard.vue`, `nuxt.config.ts`: canonical/share metadata,
  server-only structured data, default preview indexing policy.
- `tests/public-seo-output.test.ts`, `tests/e2e/seo.spec.ts`,
  `scripts/revamp/validate-seo-release.mjs`: executable output validation.
- `.dockerignore`, `web/Dockerfile`: copy only the three read-only archived
  login background fixtures needed by the existing tests into the build stage.
  The runtime image still contains only the new application output.
- `tests/fixtures/container-entry.mjs`, `scripts/revamp/container-smoke.mjs`,
  `.github/workflows/revamp.yml`: genuine Linux runtime verification.
- `web/scripts/e2e-isolated.mjs`: preserve exit code, signal, runtime and log
  sizes even if a native process exits without a Playwright JSON report.
- `tests/e2e/support/events-parity.ts`, `events-visual.spec.ts`,
  `public-pages.spec.ts`, `app/assets/css/main.css`: exact modal crop alignment,
  archived finite avatar radius, default logs canonical assertion. No masks,
  reduced pixel requirements or private-field disclosure.
- Root `package.json`: runner and route-accounting tests both in tooling gate.

## Executed results

Use `.tools/env.sh` in the compatible shell, or prepend `.tools/node/bin` and
set TEMP/TMP to `.tools/tmp`, PLAYWRIGHT_BROWSERS_PATH to `.tools/browsers` in
PowerShell. Set these on every new shell; system TEMP is unsuitable on this host.
All builds and browser tests are serialized using `.tools/build.lock`.

| Command / selection | Actual result | Local raw evidence |
| --- | --- | --- |
| `pnpm -r typecheck`, `lint`, `test`, `build` | All exit 0; 622 tests (68 shared + 554 web), 33 lint warnings / 0 errors | `.tools/codex-public-close-{typecheck,lint,test,build}.log` |
| `pnpm test:tooling` | 56/56 | `.tools/codex-seo-tooling.log` |
| Isolated SEO + warm-entry first selection | 16/18; default logs canonical query exposed | `.tools/codex-seo-e2e.log` |
| Exact canonical repair selection | 4/4 | `.tools/codex-seo-final-e2e.log` |
| Isolated SEO + event visuals + logs | 20/20, no skip/flaky | `.tools/codex-seo-and-visual.log` |
| Preview with accidental indexable environment flag | 4/4, no skip/flaky | `.tools/codex-preview-index-flag.log` |
| `node scripts/revamp/validate-seo-release.mjs` | 4 real production HTTP/XML scenarios pass, 0 maps | `.tools/seo-release-validation.json`, `.tools/codex-seo-release.log` |
| Route cold-browser collection | 14 public graphs pass, 117269–130120 B gzip | `.tools/codex-seo-final-routes.json` |
| Linux Docker build | 4 gates pass, 621 tests at previous candidate before one additional RSS bound case | `.tools/codex-seo-container-build.log` |
| Linux image runtime over loopback | SSR, nonces, preview noindex, RSS, sitemap source, map 404, real proxied WebP pass | `.tools/container-runtime-validation.json` |
| Homepage mobile Lighthouse, 3 valid samples | **FAIL**, median LCP 2149.3 ms, score 97; no invalid retries | `.tools/lighthouse-public-first-failure/` |

The separate release rehearsal uses a distinct build/output path and does not
modify the preview's default indexability. The Docker runtime was verified by
creating our own loopback container with PowerShell then using the smoke tool's
HTTP-only `--origin` mode: this host denied Node child-process access to Docker's
named pipe. Our containers were stopped and removed. No existing containers were
changed. The earlier failed Node/Docker attempt is retained in the runtime log.

## Remote CI and remaining work

Run [39208767023](https://github.com/guatswr/GuatSWR_Website/actions/runs/39208767023)
on `7e0b4d9` failed all three jobs: Docker lacked frozen login fixture images;
Windows one batch terminated with no report or log; Linux had two strict visual
failures (fractional mobile modal origin, one avatar border pixel). The changes
above address build input, retain native process diagnostics, and correct the
known capture/radius differences. **A new remote run is required; fixes are not
yet independently verified on Linux CI.** The integration lacks Actions rerun
permission (403), so no rerun was started through that API.

The first homepage Lighthouse failure remains a real open gate. A diagnostic
trace is retained in `.tools/lcp-trace.json`; it is not a replacement passing
sample. First layout/render cost dominates the text LCP. Below-fold render
deferral plus a faster current-clock theme boot still failed (median 2159.9 ms),
so section deferral was reverted. Removing competing public module-preload hints
improved the next measurement to 1960.7 ms / score 99, still **FAIL**. Raw samples
remain in `.tools/lighthouse-render-candidate-failure/` and
`.tools/codex-home-module-lighthouse.log`. Budgets remain score 95 / LCP 1800 ms /
initial JS 153600 B. No passing full-site performance claim is made.

Guest UI tests still stub the guest BFF: the real client lacks the CSRF hookup.
That and session-generation mutation races must be fixed and verified through
browser → actual Nuxt BFF → frozen in-memory upstream before accepting forms.
Admin BFF/pages and the remaining performance/security/release-readiness work
remain open. `frontend/` and `backend/` source have not changed.
