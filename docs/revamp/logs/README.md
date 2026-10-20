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
2. **Name the exact commands** and the runtime from `.node-version` (currently
   24.16.0, pnpm 11.25.0) so the numbers are reproducible. Historical 24.15.0
   evidence stays dated; the Windows TCP native-crash fix starts with log 14.
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
| Private administration integration | [`11-admin-integration/`](11-admin-integration/README.md) | Foundation accepted at 0d7f22d: 686 units, 28/28 E2E, 36 retained screenshots, 14 public JS budgets; full admin stage open |
| Article administration | [`12-admin-articles/`](12-admin-articles/README.md) | Local feature accepted: 692 units, 82 unique E2E, 14 route budgets, zero maps; public advanced Markdown and full migration open |
| Frozen API upload contract | [`13-frozen-api-contract/`](13-frozen-api-contract/README.md) | Canonical paths fixed; independent mounted-route guard, 747 units, 6/6 real guest E2E, 14 route budgets, zero maps |
| Activity administration and runtime correction | [`14-admin-events/`](14-admin-events/README.md) | Local feature accepted: Node 24.16.0, 750 units, tooling 56/56, 62/62 E2E, 14 route budgets, Linux build/runtime smoke; full migration open |
| Secondary administrator workflows | [`15-admin-secondary/`](15-admin-secondary/README.md) | Local workflows accepted: 752 units, 92 unique E2E, six article selector checks repeated, 14 route budgets, zero maps; final full-site acceptance open |
| Approved raster exception | [`16-approved-raster/`](16-approved-raster/README.md) | User-approved single Linux dark-log pixel; 767 units, 48/48 Windows regression, 1/1 Linux test |
| Independent advanced Markdown review | [`19-public-markdown-review/`](19-public-markdown-review/README.md) | Correction checkpoint: 783 units, 72/72 E2E, 50 zero-difference regions, 15 JS budgets (advanced 130206 B); current local Lighthouse still fails at 1811.9 ms; broader Markdown/final acceptance open |
| Public idle hydration | [`17-public-hydration/`](17-public-hydration/README.md) | Native idle hydration for homepage and footer; 767 units, 96/96 E2E, Lighthouse 1662.1ms / 98 |
| Public Markdown KaTeX and Mermaid parity | [`18-public-markdown/`](18-public-markdown/README.md) | Server KaTeX + client lazy Mermaid; 774 units, 14 route budgets (<=128 KB gzip), 0 maps, E2E passing |
