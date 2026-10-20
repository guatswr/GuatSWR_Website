# Secondary administrator workflows — locally accepted

2026-10-20, Codex alone, local only. Parent `953dc79`.

## Scope and source findings

- Add genuine production-browser/BFF checks for avatar-only profile saves,
  independent same-user session revocation, enabling/disabling the existing
  second password, explicit global logout/cancellation/role denial, exact
  recycle purge scope/cancellation, fixed-category home icon uploads, and actual
  100 MiB native browser download without a Blob allocation or false completion.
- Correct the recycle copy: the frozen purge handler removes soft-deleted
  article/member/history rows and associated files, not event records. No
  backend behavior or destructive live operation is changed.
- Correct the in-memory auth oracle against frozen `auth.js`: login follows
  `twofa_enabled`; disabling clears the secret; a new second password enables
  it; global token refresh increments a version and `/me` rejects old versions.
  Fixture-only tests guard enabled-flag/version behavior.
- The earlier article failure injection applied to whichever upstream request
  arrived first. It is now scoped to `POST /api/activities`, with a test proving
  background reads/other writes cannot consume it. This removes a potential
  test race; it does not establish the exact cause of the previous remote flake
  without that attempt's trace.
- Specify the session transition in `SESSION-CUTOVER.md`: independent preview,
  no old JWT exchange, future explicitly gated main-origin cleanup, no automatic
  backend global refresh. It is a plan, not an executed deployment or cleanup.
- Mark the early scaffold Lighthouse report as historical. Current real-home
  performance still fails at the last measured 1960.7 ms, despite score 99.

No frozen backend/frontend source changes, real DB/uploads/bot hooks, deployment,
main-site session cleanup or QQ success notice.

## Verification underway

The first oracle update exposed test-initialization mistakes: the immutable
public fixture deliberately stores a nonnumeric `token_version` sentinel, and
the new oracle test used `PUT /api/config` instead of frozen `POST`. The first
unit run failed eight cases. Auth's opt-in mutable fixture now owns a valid
version counter; the independent targeted test uses the actual method. The
corrected focused fixture/auth selection passes **9/9**. Failed logs retained:
`.tools/codex-admin-secondary-test.log`,
`.tools/codex-admin-secondary-fixture-corrected.log`; corrected:
`.tools/codex-admin-secondary-fixture-final.log`.

The first browser diagnostic was **5/10**. It found a real untranslated default
`Cancel` in the global logout dialog (now explicitly `取消`), plus test-protocol
errors: the icon scenario omitted the required title, and a post-purge manual
request reused a CSRF value after the page correctly refreshed its token.
The restore check now obtains a current token and still requires 404; no CSRF
policy is weakened. Test-protocol edits landed between diagnostic batches, so
that run is not an immutable acceptance run and none of its partial passes
are used as accepted counts. Its full failed/merged report remains
`web/.e2e-isolated/codex-admin-secondary-first/`.

The final, immutable source passes all four recursive gates: **752 units
(73 shared + 679 web)**, lint 0 errors/34 existing warnings, build success.
Raw `.tools/codex-admin-secondary-reviewed-{typecheck,lint,test,build}.log`.
It then passes **10/10** new browser cases, five fresh batches, one attempt
each/zero retry, flaky or skip; all blobs merged. Both desktop and mobile
actually finish the 100 MiB native download and verify its size, reported
upstream bytes, no Blob URL, and honest handoff status. Raw
`.tools/codex-admin-secondary-reviewed-e2e.log` and
`web/.e2e-isolated/codex-admin-secondary-reviewed/`.

Broader regression passes **82/82** declared cases (28 existing admin,
6 articles, 22 events, 20 login, 6 guest), 41 fresh batches on that same output.
The ten new cases plus this selection total **92 unique cases**. Both scopes
have one attempt per case, zero retries/flaky/failures/skips and complete merged
reports. See [new workflows](secondary-e2e.json) and
[regression](regression-e2e.json). Raw regression log:
`.tools/codex-admin-secondary-regression-e2e.log`.

## Remote flake diagnosis and correction

Actual `953dc79` Ubuntu artifact 12240298746 was downloaded and its SHA256
verified as `64c83a7519e9f7e3eacee9922a79bee60ef78160b6cf4ae2f2e2dd0ea884f8eb`.
The [three non-passing cases](ci-953-linux-failures.json) identify the two
article flakes precisely: `getByLabel('标题')` sometimes matches the loaded
editor's **toolbar button** as well as the article title input. The test now
uses the textbox role plus exact accessible name, retaining strictness and all
publication/cache/security assertions. This is not a retry or timing workaround.

After the immutable 82-case run ended, only the test selectors changed; the
production artifact did not change. Lint was repeated successfully, then all
**6/6 article cases** passed again, three fresh batches, one attempt each:
[selector verification](article-selector-e2e.json), raw
`.tools/codex-admin-secondary-selector-{lint,e2e}.log`. Those six supersede the
corresponding article protocol in the earlier 82-case selection. In total,
98 case executions across 49 batches cover 92 unique cases; no automatic retry
or partial diagnostic pass is counted as accepted.

## Final scope and reproduction

- All **14** public initial-route graphs pass **119907–132798 B gzip**, zero
  sourcemaps; [route-budget.json](route-budget.json). Full lazy editor bytes are
  not substituted for a public route's cold browser graph.
- The regression retains 52 real interface/editor/event screenshots, including
  36 modern admin light/dark captures. The updated narrow-phone config and
  account pages were visually reviewed and are committed here. No public pixel
  threshold, archive rendering, masks or production CSP changed.
- Four recursive gates cover the same production source. The final selector
  correction changes tests only, and its lint/browser checks use that unchanged
  production output. Node 24.16.0/pnpm 11.25.0, default Node options, pinned
  Chromium, local TEMP/browser paths and E2E_PORT_BASE=4100.

```powershell
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm -r build
node web/scripts/e2e-isolated.mjs admin-secondary.spec.ts --work-dir .e2e-isolated/codex-admin-secondary-reviewed
node web/scripts/e2e-isolated.mjs admin-workflows.spec.ts admin-interface.spec.ts admin-articles.spec.ts admin-events.spec.ts login.spec.ts guest-integration.spec.ts --work-dir .e2e-isolated/codex-admin-secondary-regression
node scripts/revamp/check-route-budget.mjs --routes scripts/revamp/route-fixtures.json
# After the test-only selector correction, without rebuilding the output:
pnpm -r lint
node web/scripts/e2e-isolated.mjs admin-articles.spec.ts --work-dir .e2e-isolated/codex-admin-secondary-selector
```

Exact files: [files.txt](files.txt). This accepts local administrator workflows,
not full migration. Public advanced Markdown, current real-page performance,
full accessibility/security/monitoring and final complete Windows/Linux CI
remain open. The Linux dark-log pixel decision is documented separately in
[the visual report](../../evidence/linux-log-raster-953dc79/README.md); no exception
is implemented while user confirmation is pending. The remote `953dc79` run is
not green: Linux container passed, Ubuntu has 241 expected/2 flaky/1 failed;
Windows was still running at this checkpoint. No deployment or QQ success.
