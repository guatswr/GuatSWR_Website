# Repository structure maintenance

Date: 2026-10-21 (Asia/Shanghai). Base: `304f579`, branch
`revamp/nuxt-foundation`. User requested implementation of the directory review.

## Scope

- Add `docs/ARCHITECTURE.md` with actual ownership, two shared layers, import
  direction, Nuxt internal modules and test/artifact lifecycle rules.
- Add an AST/SFC import-boundary gate, six tooling tests and CI execution. No
  dependency is installed; the gate resolves the web package's declared Vue and
  TypeScript tools. Runtime globals, implicit template dependencies and secret
  handling remain outside this import check's scope.
- Extract public-read query, bounded upstream transport, log projection and
  error helpers into `web/server/lib/public-read/`. Keep the stable facade and
  its exported signatures at `server/utils/public-read.ts`; existing callers
  and tests retain their import paths. No URL, schema or backend change.
- Move fixture-only projections into `web/tests/fixtures/public-contract.mjs`.
  Both immutable/public and mutable/admin servers share activity visibility,
  legacy-null detail projection, author labels, member thumbnails and history
  ordering. Add real loopback tests for mode invariance and independent mutable
  instances. Same-batch E2E state sharing still exists and is documented; this
  change does not falsely claim per-test process isolation.
- Shorten STATUS to current decisions/open work. Preserve its entire previous
  content byte-for-byte in `STATUS-HISTORY-2026-10-21.md` at the same directory
  level, retaining relative links and historical failure evidence.
- Document the two backup-script layouts and the backend's first-found script
  lookup. Do not merge or run scripts, alter backend/frontend sources, change
  deployment paths, add infrastructure or restart active previews.

Large UI components are deliberately left for future responsibility-based
refactoring; a mechanical move of every utility is not required for this scope.
Existing committed traces/images remain intact. Future bulky transient evidence
should use the existing CI artifact mechanism with explicit retention limits.

## Commands and evidence

Pinned Node 24.16.0 / pnpm 11.25.0; workspace `.tools/tmp` for TEMP/TMP and
`.tools/browsers` for Chromium. Raw logs are `.tools/structure-improvements/`.

```text
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm check:boundaries
pnpm test:tooling
pnpm --filter @guatswr/shared build
node .tools/structure-improvements/build.mjs
```

The Nuxt build uses a snapshot of the current committed `304f579` configuration,
explicit root/src/server directories and isolated build/types/Nitro output under
`.tools/structure-improvements/`. Shared uses its normal build. It does not
replace `web/.output` or the existing 3101 preview artifact. This is equivalent
workspace build coverage, not a claim that literal `pnpm -r build` was executed.
The current configuration has global `security.rateLimiter: false`; this report
records the actual config and does not borrow log 25's enabled-limit acceptance.
Production security approval remains open; this scope changes no configuration.

## Failed attempts retained

The new fixture tests first reproduced a legacy-null detail 404 and missing
author display columns after admin activation. After those were fixed, the
same test exposed changed member thumbnails and unsorted history. These were
fixture contract defects, not screenshot thresholds or production changes.
`focused-before.log` and `focused-after.log` retain the failed assertions.

An intermediate extraction accidentally moved fixture observer state out of
its owning module. The affected check timed out; that edit was corrected and
only its owned test process tree was stopped. Final `focused-contract.log`
passes 44/44 public-read and fixture assertions.

The first lint run rejected imports below the facade's re-exports. Imports now
precede exports; no rules were disabled. The first full unit run then passed
792/793, with the unchanged 20,050-key limiter test exceeding its existing 5s
deadline. The standalone 38-test auth-write file and a fresh full workspace run
pass without any timeout, scheduling or limiter change. The initial `test.log`,
`limiter-recheck.log` and final `test-final.log` remain separate; this is not
described as a first-attempt all-green run.

Final browser/budget results and exact file inventory follow in `evidence.json`.
Whole-migration performance, security, accessibility and full CI remain open.

| Gate | Final local result |
| --- | --- |
| Workspace typecheck | Pass |
| Workspace lint | 0 errors / 34 existing warnings |
| Workspace units | 793/793 pass (73 shared + 720 web), after the retained initial limiter timeout |
| Tooling | 65/65 pass, including six new boundary cases |
| Import boundaries | 127 source files checked, 0 violations |
| Shared build + isolated production Nuxt build | Pass |
| Scoped E2E | 58/58, 0 retries/flaky/skips |
| Approved-reference visual regions | 54/54 zero differing pixels |
| Protected old/backend/config sources | 139 file hashes unchanged |
| Initial JS budget / production maps | 15/15 routes, 122487–137385 B gzip (limit 153600 B); 0 maps |

The 3100/3101 listeners retain PIDs 56840/34924. No preview output was rebuilt
in place. These results are local evidence; exact-head remote CI is separate.
Before commit, `git diff --check` found one extra EOF blank line in each of the
four extracted modules. Only those terminal blank lines were removed; focused
ESLint passes again. Module bodies and the validated behavior are unchanged.

The browser selection deliberately includes all public-page tests and a mixed
admin/homepage batch. It keeps the existing zero-pixel protocol and server
isolation settings. Use `E2E_PORT_BASE=4300`, absolute `E2E_NUXT_OUTPUT` pointing
at `.tools/structure-improvements/.output`, and the pinned browser/TEMP paths:

```text
node web/scripts/e2e-isolated.mjs public-pages.spec.ts homepage-visual.spec.ts admin-interface.spec.ts events.spec.ts --grep "public-pages.spec.ts|homepage matches|workspace navigation|renders all five categories|is readable without JavaScript" --work-dir .e2e-isolated/structure-improvements
node scripts/revamp/check-route-budget.mjs --output .tools/structure-improvements/.output --routes scripts/revamp/route-fixtures.json
```

Exact scoped file inventory (machine hashes are recorded separately):

```text
.github/workflows/revamp.yml
README.md
package.json
docs/ARCHITECTURE.md
docs/revamp/STATUS.md
docs/revamp/STATUS-HISTORY-2026-10-21.md
docs/revamp/logs/README.md
docs/revamp/logs/26-structure-improvements/README.md
docs/revamp/logs/26-structure-improvements/evidence.json
scripts/README.md
scripts/revamp/check-boundaries.mjs
scripts/revamp/boundaries.test.mjs
web/server/utils/public-read.ts
web/server/lib/public-read/errors.ts
web/server/lib/public-read/query.ts
web/server/lib/public-read/transport.ts
web/server/lib/public-read/log-projection.ts
web/tests/fixture-boundaries.test.ts
web/tests/fixtures/admin-upstream.mjs
web/tests/fixtures/public-data.mjs
web/tests/fixtures/public-contract.mjs
```
