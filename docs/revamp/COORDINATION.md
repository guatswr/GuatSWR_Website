# Migration coordination

Updated 2026-10-19 (Asia/Shanghai).

The user assigned Codex engineering leadership and independent acceptance, with
Claude Code (the configured Opus 5 model) implementing concrete batches. Multiple
Claude workers are authorized. Hermes is the delivery channel for the final QQ
notification, after the local migration has actually passed acceptance.

## Ownership

| Worker | Checkout | Current scope | Integration boundary |
| --- | --- | --- | --- |
| Acceptance | Primary `revamp/nuxt-foundation` | Dialog lifecycle/loading, performance collection and CI diagnostics, stage 02 evidence | Finish or report a concrete blocker before taking another batch. |
| Public data | Managed `revamp-public-data` worktree | Projected shared DTOs, public v1 read adapters, bounded upload reads, deterministic fixtures | No UI, package/lockfile, CI or general status edits. |
| Public UI | Managed `revamp-homepage` worktree | Homepage, social/join, progressive images, typed motion/freeze logic and focused tests | No API/schema, package/lockfile, CI or general status edits. |
| Codex | Primary checkout | Architecture, cross-boundary review, integration, acceptance, commits/pushes and reporting | Only reviewed changes enter the revamp branch. |

Workers do not commit, push, switch branches, deploy, or send external messages.
They preserve the archived `frontend/` and `backend/` sources and v1 contract.
Each batch returns an explicit file inventory, test evidence and unresolved
limitations. A worker's completion report alone is not acceptance.

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
