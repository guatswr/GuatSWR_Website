# Approved public accessibility visual corrections

Validated 2026-10-20; closed 2026-10-21, Codex alone, base `37fea3c`. Local only. The user approved the
bounded [log 22 proposal](../22-public-accessibility/VISUAL-PROPOSAL.md):
“接受这组限定的无障碍修复（推荐）”. No backend/frozen frontend source writes.

## Scope

Component-scoped footer/home/member/log/event contrast changes follow the
proposal. Log action badges are changed in both themes, as explicitly shown
in the approved dark preview. Passing event dark variants remain unchanged.
History retains its original 14px dots (active scale 1.1) inside independent
44×44px links, 4px gaps and a 56px rail. Long rails scroll within the viewport;
native Tab brings the last target into view. The log rules heading h4→h3
fixes a newly observed semantic issue without changing explicit visual styles.

The independently specified legacy reference projection is test-only and
rejects any origin except the isolated archive. Every projected document
retains its unmodified full-page PNG and a per-property modification record.
Production styles are never imported into the reference. Existing pixel
thresholds, whole-device-pixel cropping and the single Linux raster allowance
are unchanged. Approved colours and geometry are additionally checked against
the real production DOM and axe, not merely compared between two screenshots.

## Reproduction / evidence

Runtime: `.tools/node/bin/node.exe` 24.16.0, pnpm 11.25.0. Prepend the pinned
Node directory to PATH; set TEMP/TMP to the workspace `.tools/tmp`,
PLAYWRIGHT_BROWSERS_PATH to `.tools/browsers`, E2E_PORT_BASE=4100. Serialize
builds, browser suites, route-budget collectors and Lighthouse.

Application gate commands use the pinned pnpm entry
`C:/Users/water/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pnpm/bin/pnpm.mjs`:

```powershell
node $pnpmEntry -r typecheck
node $pnpmEntry -r lint
node $pnpmEntry -r test
node $pnpmEntry -r build
```

The successful application build is `.tools/codex-approved-a11y-accepted-build.log`.
After the reference-only selector correction, typecheck/lint/test are repeated
at `.tools/codex-approved-a11y-closed-{typecheck,lint,test}.log`. Source fingerprints
prove the application, dependencies and other tests are unchanged.

Final browser/output commands (repository root):

```powershell
node web/scripts/e2e-isolated.mjs public-accessibility.spec.ts public-pages.spec.ts --grep 'approved filters|month links|long month rail|/history matches' --work-dir .e2e-isolated/codex-approved-a11y-accepted-focus
node web/scripts/e2e-isolated.mjs events-visual.spec.ts --work-dir .e2e-isolated/codex-approved-a11y-closed-reference-repair
node web/scripts/e2e-isolated.mjs public-accessibility.spec.ts public-pages.spec.ts homepage-visual.spec.ts events-visual.spec.ts events.spec.ts public-markdown-advanced.spec.ts public-math-visual.spec.ts layout.spec.ts --work-dir .e2e-isolated/codex-approved-a11y-closed-regression
node web/scripts/e2e-isolated.mjs public-accessibility-audit.spec.ts --work-dir .e2e-isolated/codex-approved-a11y-closed-audit
node scripts/revamp/check-route-budget.mjs --routes scripts/revamp/route-fixtures.json
node scripts/revamp/check-artifacts.mjs
node --test scripts/revamp/route-budget.test.mjs web/scripts/e2e-isolated.test.mjs web/scripts/performance-metrics.test.mjs
```

`events.spec.ts` also selects `admin-events.spec.ts` by Playwright's filename
matching, so the 132-case selection includes those administrator regressions.
The route collector owns both port 3300 and its port 3381 fixture; do not start
a separate fixture. Fresh output/work directories are needed for re-verification.
Final measurements and exact changed-source inventory are in `evidence.json`.
Raw logs are `.tools/codex-approved-a11y-closed-*.log`; full original screenshots,
JSON results and traces stay in the named isolated directories. Committed
representative screenshots are diagnostic records, not a whole-page visual gate:
full-page captures can include fixed navigation at the current viewport offset.

## Final measured results

| Gate | Result |
| --- | --- |
| Recursive typecheck / lint / test / build | All pass; 785 units (73 shared + 712 web), 0 lint errors / 34 existing warnings |
| Tooling | 59/59 |
| Final production regression | 132/132, 66 fresh batches, 0 retries / flakes / skips |
| Focus / reference correction repeats | 16/16 + 4/4, another 10 fresh batches; repeated coverage, not extra unique cases |
| Automated scan | 60 executions / 30 batches: 56 strict closed states pass; 4 empty-state diagnostics remain unaccepted |
| Additional strict interaction checks | 11 pass; 3 dark-rule diagnostics remain unaccepted |
| Visual comparisons | 98 regions, 0 unapproved pixels against independently projected approved references |
| Initial JavaScript | 15/15 routes, 122334–137088 B gzip (limit 153600 B) |
| Production sourcemaps | 0 in validated output |

See [evidence.json](evidence.json), [strict audits](evidence/strict-audits.json),
[unaccepted states](evidence/UNACCEPTED-states.json),
[comparisons](evidence/visual-comparisons.json) and
[exact reference properties](evidence/reference-projections.json).
The [unmodified mobile archive](evidence/mobile-bounty-unmodified-archive.png)
is retained separately from the earlier [707-pixel failed reference](evidence/failed-mobile-nav-archive.png)
and its [diff](evidence/failed-mobile-nav-diff.png).

All 20 scoped sources match the final frozen inputs, apart from removing one
extra empty EOF line from `EventBoard.vue` before commit; original and current
hashes plus the verified whitespace-only distinction are recorded. Later,
unrelated edits were found in backend files, `frontend/vite.config.js`, and
`web/nuxt.config.ts` (default API port and disabling rate limiting), with a new
`.output` build at 01:09 on 2026-10-21. Validation logs finish before those
changes, on 2026-10-20. Those edits are excluded from this commit and are not
validated here; they are preserved in the working tree. The current ignored
output is **not** the artifact covered by these results. Baseline config hashes
and this provenance distinction are recorded in `evidence.json`.

## Discovered limits (not acceptance)

The first controls run is retained at
`web/.e2e-isolated/codex-approved-a11y-controls/`: **12/16 pass, 4 fail**, no
retries. It exposed a skipped heading level in expanded log rules and contrast
debt in their dark panel. The heading is corrected. The dark panel's
semi-transparent light surface and nested explanation colours are outside this
approval, so they remain unchanged. Its full diagnostic axe findings and actual
screenshots are retained; its diagnostic is not a passing WCAG gate. Checklist
#80 remains open for that visual decision and manual/incomplete/other dialog,
touch and motion checks. No rules are disabled in the strict closed-state scan.

An initial audit inventory failed because a Node 24 JSON import lacked its
`with { type: 'json' }` attribute; that test import is corrected. Both attempts
are retained separately from final results.

The first full scan (`codex-approved-a11y-final-audit`) also caught a regression
in the new event navigation: an explicit dark child colour replaced the old
passing parent inheritance (rendered contrast 4.08:1). The implementation now
retains the original opacity/inheritance in dark mode and scopes the approved
solid colour/opacity adjustment to light mode only. The failed scan is retained;
the final scan uses a separate directory and a fresh rebuilt output. This scan
was **51/60 passing, 9 failing**, without retries; it also found the existing
empty-board message contrast in `/events/zetime` (both themes/devices). That
message is outside the approved published-status label scope and stays unchanged.

The permanent strict closed-state gate therefore explicitly covers **56**
states. The four empty-board states execute the same full axe scan as clearly
named **UNACCEPTED diagnostics**, with all findings retained and no rule disabled.
Expanded dark log rules also retain diagnostic findings. These are outstanding
acceptance blockers for #80, not approved visual exceptions or WCAG passes.

The intermediate `codex-approved-a11y-verified-regression` is incomplete and is
not counted as passing. It exposed a test locator that stopped matching when
the rules button changed from “如何计算贡献？” to “收起算法说明”; the locator now
matches both actual names. Editing test line positions during that old run
invalidated its planned identities, and the isolation runner correctly stopped
at batch 19. No process was killed by the attempted owned-runner cleanup (the
runner had already exited). Final test sources are fixed before inventory.

Final review also replaces the board's broad colour override with `text-sky-700`
utility classes on its two exact labels, preserving the original hover-white
state. A new native-hover assertion guards that interaction on devices reporting
`(hover: hover)`; touch devices check their real default/tap state. Their lack of
a hardware hover capability is not treated as a skipped test or simulated
desktop CSS support. Existing unaccepted hover contrast is not claimed as a
WCAG pass. All other screenshot thresholds and timeouts remain unchanged.

The complete `codex-approved-a11y-accepted-regression` then records **131/132**
passing, one failed, no retries/flakes/skips. The failure is exactly 707 pixels
in the active mobile light event navigation label. The original archive uses
a `div` mobile navigation container; the independent reference projection had
matched `nav` and missed that approved element. Its selector now names the
archive's actual `.md:hidden` mobile container and active link classes.
The original 707-pixel diff and both PNGs are retained; no allowance is added.
Fingerprint comparison proves that only this test helper changed after the
successful application build. Typecheck/lint/unit gates are repeated; the final
browser and budget runs use that same unchanged production output.

Previous-commit CI (`37fea3c`, run 39425554089): Windows foundation and Linux
container succeed; Ubuntu foundation fails performance: home **2762.8ms / 91**,
layout **1664.7ms / 99**, with all three valid samples retained. Ubuntu E2E is
265 passed + 1 flaky (desktop dark members visual), not zero-flake acceptance.
These are historical host results, not measurements of this patch.

Public LCP, final security/observability, extended Markdown and full-host
acceptance remain open. No deployment and no migration-success/QQ message.
