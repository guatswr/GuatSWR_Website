# Migration coordination

Updated 2026-10-19 (Asia/Shanghai).

The user assigned Codex engineering leadership and independent acceptance, with
Claude Code (the configured Opus 5 model) implementing concrete batches. Multiple
Claude workers are authorized. Hermes is the delivery channel for the final QQ
notification, after the local migration has actually passed acceptance.

## Ownership

| Worker | Checkout | Current scope | Integration boundary |
| --- | --- | --- | --- |
| Acceptance | Primary `revamp/nuxt-foundation` | CI cross-platform correction; legacy typography and exact component screenshot bounds | No API/package changes or competing builds/performance tests. |
| Public data | Originally managed `revamp-public-data`; candidate files now in primary | Correct projected DTOs, public read adapters, bounded reads and fixtures; run real recursive gates | Owns only data-related package/lock changes; no UI, CI or ledger edits. |
| Homepage candidate | Frozen managed `revamp-homepage` worktree | Homepage, social/join, progressive images, typed motion/freeze logic and tests ready for integration | Source reviewed; actual integrated gates and browser acceptance still owed. |
| Events UI | Managed `revamp-events` worktree, same H implementer | Event categories/cards/forms/signup UI, typed form models and shared rules | No guest-server endpoints, auth helpers, package/lockfile or ledger edits. |
| Public prose pages | Managed `revamp-public-pages` worktree | Activities/detail, members, history, logs, safe Markdown, exact member sorting and local icons | Server-only highlighter/pinyin imports proposed centrally; no homepage, public read adapters or package edits. |
| Auth server / client | Managed `revamp-auth` worktree | Server session candidate plus login/client CSRF/session boundary | Auth-only runtime defaults; no guest/admin CRUD, shared index, package/lock or public API changes. |
| Codex | Primary checkout | Architecture, cross-boundary review, integration, acceptance, commits/pushes and reporting | Only reviewed changes enter the revamp branch. |

Workers do not commit, push, switch branches, deploy, or send external messages.
They preserve the archived `frontend/` and `backend/` sources and v1 contract.
Each batch returns an explicit file inventory, test evidence and unresolved
limitations. A worker's completion report alone is not acceptance.

The first public-data pass reached its turn limit without a final report. Its
temporary syntax/Vitest shim was not integrated and is not test evidence. Only
the reviewed candidate source files were copied; the correction turn must use
the primary checkout's actual installed toolchain. Public UI and prose-page
workers likewise label unexecuted tests honestly until integration.

## Integration and verification

1. Review each worktree diff against the frozen API and archived UI. Resolve
   ownership and interface differences before integrating reviewed files.
2. Run Nuxt prepare/typecheck/lint/build sequentially: they share generated files.
   Do not run competing builds or heavy jobs during Lighthouse measurement.
3. Enforce the recursive typecheck/lint/test/build gates and whole-artifact
   sourcemap scan. Run relevant E2E and real old/new visual comparisons. Keep
   Lighthouse's valid slow samples and fixed budgets; distinguish instrumentation
   errors from over-budget measurements.
4. Update `STATUS.md`, `CHECKLIST.md` and scoped machine-readable evidence with
   actual results. Push only `revamp/*`, through `github-second`, and inspect
   Windows/Linux CI for the pushed commit.
5. Archive an implementation worktree only after its needed changes are integrated
   and verification evidence is preserved. Keep recoverable snapshots.

## Remaining batches

- Complete public-page migration, SSR data isolation, safe Markdown, images and
  route-specific SEO/cache behavior.
- Implement shared validation and visitor draft/upload/signup flows, preserving
  Beijing time rules and the backend's IP-based guest identity semantics.
- Implement opaque BFF sessions with the upstream JWT stored only on the server,
  current backend identity/role checks, write-request origin/CSRF protection and
  private cache cleanup; migrate administration with private-only dependencies.
- Complete cross-platform, functional, visual, accessibility, performance and
  security acceptance; prepare local release/rollback documentation.

All work remains local. The estimated launch date is 2026-11-11. Server, DNS,
Cloudflare and traffic changes are deferred until separately approved. Optional
enhancements are not required for the migration-success notification. That
notification must distinguish local migration completion from actual deployment.
