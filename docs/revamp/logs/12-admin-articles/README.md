# Article administration — local feature accepted

2026-10-20, Codex alone, local only. Foundation checkpoint: `0d7f22d`.
The foundation's 28-case acceptance is historical evidence for that artifact;
The article/editor feature now passes local production E2E and route budgets.
Whole migration acceptance, advanced public Markdown and the separate guest
URL correction remain open.

## Implemented scope, awaiting acceptance

The modern workspace now has an article list and focused editing view. It
retains title/tag/date/description, Markdown editing/import, cover and gallery
uploads, image insertion, publication, soft deletion, super-admin restoration
and pagination. Unsaved edits require confirmation before leaving and a rejected
write retains the form. A single protected draft allocation binds uploads to one
article; public detail reads must remain 404 until publication. No backend or
archived frontend source is changed.

`md-editor-v3` 6.5.4 loads as a lazy client-only private component. Local package
instances supply highlighting, formulae, diagrams, crop and fullscreen behavior;
the editor's default CDN loaders are not needed. Prettier and ECharts execution
are disabled (the archived toolbar did not expose Prettier). Preview HTML/SVG is
sanitized; Mermaid uses strict mode and bounded diagrams; KaTeX is untrusted.
Very long documents remain fully editable in source mode without attempting an
unbounded rich preview. Imported text must be bounded UTF-8.

The first dependency audit caught vulnerable default diagram/math versions.
Mermaid is pinned to 11.16.1 and KaTeX to 0.18.2, including a targeted
`mermaid>katex` override for the still-vulnerable transitive 0.16.x copy. The
override must be installed, audited and verified before acceptance; an earlier
build does not prove the patched dependency graph.

Primary advisories: [Mermaid CSS isolation fix](https://github.com/advisories/GHSA-6x64-9x62-f2gx),
[KaTeX trust/prototype fix](https://github.com/advisories/GHSA-238p-pmpm-9mq7).
The two earlier node-forge/braces build-tool findings remain separate open work.

The first real editor test confirmed imported/typed content was saved but exposed
a public renderer defect: MDC's compiler drops nonempty root text nodes,
including prose following raw HTML void tags. Six
server-pipeline cases reproduce the loss (image allowed/rejected, br, hr, inert
checkbox, rejected text input). A post-rehype plugin wraps genuine root prose
in native inline spans before compilation, keeping it as escaped text. The
tag/attribute/URL allowlists remain unchanged.
Raw proof: `.tools/codex-admin-article-void-before.log` (6 failing/7 passing).
This public correction needs its own full pipeline and production verification.

The initial E2E run is not acceptance: its first batch had the prose-loss failure
and a passing edit/delete/restore case; the next Playwright process exited with
Windows native code 3221226505 before writing a report. The isolated runner
correctly failed closed and retained `batch-02/process.json`. No skip or retry
policy was changed. The later override install/audit removed new diagram/math
advisories; only the two prior high build-tool findings remain in the audit.

Screenshot review also caught the workspace's generic 20px SVG rule shrinking
the editor diagram. Icon sizing is now scoped to actual workspace controls;
the real diagram check requires visible labels and an intrinsic size above
60×60, rather than accepting a technically visible tiny SVG. Editor screenshots
use scroll origin zero and wait for transient success messages to close; the
original unnormalized first-run screenshot remains retained separately.

The next production run (`codex-admin-article-patched`) completed all six
declared cases without a process crash, but only 3/6 passed. It exposed two
distinct causes: the injected Mermaid instance was never initialized on its
first render (only on subsequent theme changes), so labels used HTML that the
SVG sanitizer correctly removed; and two test assertions counted earlier
cases' fixture writes/drafts. First-render initialization now applies the same
strict configuration before mounting. Security-sensitive configuration,
including `flowchart.htmlLabels`, cannot be overridden by authored directives.
Tests retain exact write/upload counts but measure each case's own delta and
new IDs. A directive attempting to restore loose/HTML rendering and a dark-theme
change are now included in the actual diagram check. This remains pending E2E;
the failed run is retained and is not acceptance.

The following `codex-admin-article-ready` run passed 4/6; both publishing
workflows reached their final security assertion, including readable diagrams,
real editor image insertion, dark mode, public SSR and exact upload/write counts.
Their only failure was an overly broad console assertion on the deliberately
malicious `onerror` input. A standalone browser probe using the installed
DOMPurify reproduced the same `script-src-attr 'none'` report while removing
the handler from an inert document. Without CSP, the returned HTML still has
no handler and the attack does **not** execute. Evidence:
`.tools/codex-purify-probe.log` (string/template/detached/in-place × strict/open),
also retained as [the diagnostic log](sanitizer-probe.log). Reproduce from the
repository root, using the pinned runtime and local Playwright browser/TEMP
environment, with `node docs/revamp/logs/12-admin-articles/probes/purify-csp.mjs`.
The E2E permits only that exact blocked-inline-handler diagnostic during the
authored attack; other CSP violations and any external script/style/font loads
still fail. The production CSP is unchanged. This does not treat an attempted
attack's expected CSP block as a required resource failure.

`codex-admin-article-accepted` then passed **6/6**, three fresh-server batches,
zero retry/flaky/skipped, all blob reports merged, on the `ready` production
artifact. Its four recursive gates pass (692 units = 73 shared + 619 web;
lint 34 warnings/zero errors). Screenshots confirmed readable formula/diagram
labels in both themes, but review found the phone's horizontal split too narrow.
The subsequent responsive change stacks source and preview on phones; it needs
a fresh build, explicit pane-width/position checks, private regressions and the
public Markdown/visual selection before becoming the accepted checkpoint.
Original pre-responsive screenshots remain in `.tools/admin-article-ready-review/`.

The responsive artifact passed **82/82** (34 private cases + 48 public正文/visual
cases), 41 fresh batches, zero skip/flaky/retry; all public-route budgets and
zero maps also passed. Screenshot review nevertheless found a coverage gap:
after typing, the editor's Mermaid cache puts generated SVG through the HTML
sanitizer again, which removed it until a theme change. This is a real defect,
so that otherwise-green artifact is not the final article acceptance.
The new check waits for readable diagram labels and intrinsic size again after
image insertion/typing, before either screenshot. Safe SVG survives subsequent
preview sanitization. Generated Mermaid styles are parsed in an unadopted
stylesheet and only bounded presentation properties are inlined; `<style>`,
`foreignObject`, @rules, animations and CSS URL declarations are not retained.
Both the initial SVG and cached HTML still go through DOMPurify. Production CSP
is unchanged. This correction needs a fresh build and targeted regression.

The corrected cached-SVG artifact passes the six article workflows, including
post-edit diagram checks and actual readable screenshots. A subsequent 76-case
regression aborted at batch 21 before a report (Windows native exit 3221226505,
1.63 seconds after process start). Its prior 40 cases passed; the runner correctly
retains an incomplete/failing summary. No ports or pinned Node children remained.
An OS Application Error entry was not available; memory pressure is a hypothesis,
not a confirmed crash diagnosis. The rerun uses the same artifact/Node/Chromium
and unchanged assertions/retry policy, but caps the local Node background pool
with `NODE_OPTIONS=--v8-pool-size=2` and inventories three smaller disjoint scopes:
28 private, 24 desktop public, 24 mobile public. This changes test-process resource
usage, not browser flags, production code, security/rate limits or pixel policy.
The initial aborted report remains evidence and must not be called a pass.

Source review during this run also discovered a separate existing guest-upload
URL mismatch: the BFF and fixture agreed on `/api/upload_visitor`, while the
frozen backend mounts `/api/upload/visitor`. A new read-only mount-contract check
reproduces two failures (53/55 passing). That correction is the next checkpoint;
this article feature's tests do not establish correctness of those old guest
URLs. The earlier public/guest acceptance requires a fresh upload verification
after the route correction. Backend and archived frontend stay unchanged.

## Required evidence

- Four recursive gates and fresh production build of the patched graph.
- Genuine browser/BFF/upstream create/upload/publish, edit/delete/restore,
  public cache invalidation, safe preview and explicit retry cases on both
  projects. No external script/style/font loads or weakened CSP.
- Review of real editor screenshots, then all private regressions and public
  route budgets. The full public/guest suite still needs final migration testing.
- Formula/diagram rendering in **public** articles is not established by a
  private-editor preview test; inspect the existing safe server renderer before
  claiming all advanced Markdown parity. No public rendering policy is relaxed.

## Accepted checkpoint

Four recursive gates pass on the corrected cached-SVG build: typecheck 0,
lint 0 errors/34 existing warnings, 692 units (73 shared + 619 web), build 0.
Build size is 11.6 MB / 2.71 MB gzip; this is server output size, not initial
browser JavaScript. The 14 cold public-route graphs pass at **119792–132684 B
gzip**, with **zero source maps**. The private editor/diagram packages remain
outside those public initial graphs. See [route-budget.json](route-budget.json).

The same production output passes **82 unique E2E cases** across four disjoint
inventoried scopes: [articles 6](article-e2e.json),
[existing private workflows/interface 28](admin-regression.json),
[desktop public正文/visual 24](public-desktop.json),
[mobile public正文/visual 24](public-mobile.json). All 41 fresh-server batches
pass; each case has one attempt and zero retries, skips or flaky results. Each
scope's blob reports merged successfully. The earlier native-crash run remains
an incomplete failed run; the test runtime constraint is documented above.
The initial successful 82-case responsive run is historical evidence for its
earlier artifact, not substituted for these corrected-artifact results.

Representative original screenshots: [desktop editor](screenshots/desktop-editor.png),
[mobile dark editor](screenshots/mobile-editor-dark.png). All four editor
screenshots remain in `.tools/admin-article-cache-review/`; actual attachments
also remain in the reports. Review confirmed first-render and post-edit diagram
labels, both themes, native editor image insertion and full-width stacked mobile
panes. No public masks, crops, thresholds or archive snapshots changed.

Exact invocations (repository root, Node 24.15.0 / pnpm 11.25.0 with the documented
local TEMP/browser paths):

```powershell
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm -r build
node web/scripts/e2e-isolated.mjs admin-articles.spec.ts --work-dir .e2e-isolated/codex-admin-article-cache
# Remaining scopes use NODE_OPTIONS=--v8-pool-size=2; retry policy stays zero.
node web/scripts/e2e-isolated.mjs admin-workflows.spec.ts admin-interface.spec.ts --work-dir .e2e-isolated/codex-article-cache-admin
node web/scripts/e2e-isolated.mjs public-pages.spec.ts --project=desktop --work-dir .e2e-isolated/codex-article-cache-public-desktop
node web/scripts/e2e-isolated.mjs public-pages.spec.ts --project=mobile --work-dir .e2e-isolated/codex-article-cache-public-mobile
node scripts/revamp/check-route-budget.mjs --routes scripts/revamp/route-fixtures.json
```

Raw gate logs: `.tools/codex-admin-article-cache-{typecheck,lint,unit,build}.log`.
The locally started URL-contract correction is a separate unaccepted working
scope, excluded from this checkpoint's build and unit count. No infrastructure
change, deployment, real backend mutation or QQ success notification occurred.
