# Migration workstream logs

Every workstream writes its report here so another agent can re-verify it
without re-deriving what happened. One directory per workstream:

```
docs/revamp/logs/<workstream>/
  README.md      scope, exact file inventory, commands, measured results,
                 unresolved limitations, and the steps to re-verify
  evidence.json  machine-readable gate results and key measurements
  *.log          raw gate output where it is small enough to commit
```

Rules for a log entry:

1. **Report only what was executed.** A test that was written but not run is
   listed as `unrun`, never as passing.
2. **Name the exact commands** and the pinned runtime (`.tools/env.sh`, Node
   24.15.0, pnpm 11.25.0) so the numbers are reproducible.
3. **State the checkout and revision** the numbers came from.
4. **List limitations and deviations** explicitly, including anything a later
   agent must not treat as accepted.
5. **Point at raw logs** that live in the gitignored `.tools/` directory, since
   those are not committed.

The ledgers (`STATUS.md`, `CHECKLIST.md`) stay the authority on what is
accepted; these logs are the evidence behind them.

## Index

| Workstream | Directory | State |
| --- | --- | --- |
| Recovery of the 2026-10-19 working-tree loss | [`00-recovery-2026-10-19/`](00-recovery-2026-10-19/README.md) | Restored; four gates green; E2E baseline re-measured |
| Independent blocker review | [`08-independent-acceptance/`](08-independent-acceptance/README.md) | Warm reload fixed; all 14 route JS graphs pass; 170 unique E2E cases passed across full + exact repair selections |
| Public SEO and portable validation | [`09-seo/`](09-seo/README.md) | Local output validation passes; full-site performance and new remote CI still open |
| Genuine guest workflow integration | [`10-guest-integration/`](10-guest-integration/README.md) | Real workflow 6/6; 643 units, four recursive gates; full 188/188 E2E, zero skip/flaky/retry |
| Private administration integration | [`11-admin-integration/`](11-admin-integration/README.md) | In progress; first four-page functional selection 10/10; eight-page workflows/visuals under review |
