# Working-tree loss and recovery — 2026-10-19

Checkout: primary `E:/Taropoi/workspace/GuatSWR_Website`, branch
`revamp/nuxt-foundation` at `aa6e84d`.

## What happened

While freeing space on a full `E:` volume (749 MB free, 100 % used), a scratch
cleanup removed `E:/Taropoi/workspace/GuatSWR_Website/.tools/stale-*`. The
cleanup followed a directory link out of `.tools/`, and `web/**` and
`packages/shared/**` were deleted from the working tree — 70 tracked files plus
every untracked file of the two uncommitted batches (homepage/`/social`/`/join`,
and the public-data cache). `frontend/`, `backend/`, `docs/`, `scripts/`,
`node_modules/` and `.tools/` were untouched, and no commit, branch, or remote
was changed.

Nothing was lost permanently: both batches also exist in their own worktrees,
and the two primary-only files were recoverable from the worker transcript.

## How it was restored

| Lost content | Recovery source |
| --- | --- |
| 70 tracked files under `web/`, `packages/shared/` | `C:/Users/water/.codex/worktrees/revamp-admin-content/GuatSWR_Website` — a clean checkout of the same commit `aa6e84d` (plain file copy, no git operation) |
| Homepage batch (37 files, worktree `revamp-homepage`) | copied verbatim, including `web/app/layouts/default.vue` and `web/app/pages/index.vue` |
| Cache batch (24 files, worktree `revamp-cache`) | copied verbatim, including its 16 modified tracked files |
| `web/scripts/e2e-isolated.mjs`, `web/scripts/e2e-isolated.test.mjs` | replayed from `.tools/claude-e2e-isolation.jsonl` (the original write/edit tool calls), then re-verified by the file's own 22 unit tests |
| Primary-only integration fixes | re-applied; see below |

`frontend/` and `backend/` were verified unchanged: `git diff --name-only
v1-archive -- frontend backend` is empty.

### Fixes that existed only in the primary checkout

The two integration workers had applied corrections in the primary checkout
that were never written back to their worktrees. Each was re-derived from the
recorded description and the failing gate, then confirmed by the gate itself:

1. **Strict TypeScript fixes for the homepage batch** (`nuxt typecheck` failed
   with 11 errors on the raw worktree files):
   - `app/utils/freeze-interaction.ts` — `surface.focus?.(…)` at both call
     sites, matching the already-optional `FocusTarget.focus`.
   - `app/components/home/HomeAvatarToy.vue` — `popFrame` initialised to `0`
     (`cancelAnimationFrame` does not accept `undefined`).
   - `app/utils/motion.ts` — the global `IntersectionObserver` instead of the
     non-existent `Window.IntersectionObserver` property, adapted to the narrow
     `RevealObserver` contract, with `AddEventListenerOptions` casts.
   - `app/utils/scroll-motion.ts` — read the narrowed environment through a
     `const` and fall back to `0` for the partial environment's `innerHeight`.
   - `app/components/ProgressiveImage.vue` — the `fit` prop is typed
     `PropType<CSSProperties['objectFit']>` and both images share one typed
     `fitStyle` binding.
   - `app/pages/index.vue` — `@click="reloadArchives()"` so the refresh
     function is invoked instead of being handed to the DOM as a handler.
2. **Cache C3 corrections** (documented in `.tools/claude-cache-integrated-result.md`):
   - `server/utils/public-data.ts` — all twelve `readCached*` wrappers are
     `async`, so the strict upstream-origin check (which still runs *before* the
     cache lookup) rejects the returned promise instead of throwing
     synchronously.
   - `tests/public-log-redaction.test.ts` — the over-bound row carries an ASCII
     `OVERSIZED-DECOY-MARKER` instead of asserting the absence of a character
     the Chinese placeholder itself contains.
3. **Lint-clean rewrites that the primary had and the worktrees did not**:
   - `app/utils/public-url.ts` — control characters are rejected by a code-point
     check rather than a control-character regex (`no-control-regex`).
   - `scripts/e2e-isolated.test.mjs` — the unused `E2EIsolationError` import is
     gone (`no-unused-vars`).
   - `tests/freeze.test.ts` — the thaw harness exposes `emit` as well as
     `dispatch`, and the mutually-referencing thaw controller/lock pair uses a
     single holder instead of a reassigned local (`prefer-const`).

## Verification of the restored tree

Pinned runtime: `.tools/env.sh` (Node 24.15.0, pnpm 11.25.0), `TEMP`/`TMP`
inside `.tools/tmp`, browsers in `.tools/browsers`.

| Gate | Exit | Result |
| --- | --- | --- |
| `pnpm -r typecheck` | 0 | shared `tsc --noEmit` + `nuxt typecheck` clean |
| `pnpm -r lint` | 0 | 0 errors, 15 pre-existing `vue/html-self-closing` warnings |
| `pnpm -r test` | 0 | shared 23/23 + web 147/147 |
| `pnpm -r build` | 0 | client + server + nitro complete |
| `node --test web/scripts/e2e-isolated.test.mjs` | 0 | 22/22 |
| `node web/scripts/e2e-isolated.mjs --dry-run` | 0 | 70 declared tests, 35 shards |
| `node scripts/revamp/check-artifacts.mjs` | — | 0 source maps |

`web/.output` had to be deleted before the build: the interrupted tree left a
partial Nitro `node_modules` whose `parse5`/`entities` link could not be
replaced (`ENOTEMPTY`). This is the known Windows Nitro linker collision, not a
source defect.

Full isolated E2E and the archived visual comparisons are recorded in
`evidence.json` once the run completes.

## Limitations

- The restoration is byte-identical for tracked files and for the two batches,
  but it is a reconstruction: the primary-only fixes above were re-derived, not
  copied, so they may differ in wording from the original edits. Every one is
  covered by a passing gate.
- `web/public/og-image.png` was restored from the homepage worktree; it is a
  verbatim copy of `frontend/public/og-image.png`.
- The pre-incident `web/.output` was rebuilt from scratch.
- `E:` free space was recovered from the same cleanup: `.tools/stale-*` are
  gone (about 18 GB). Those directories were explicitly-labelled stale copies
  of old `node_modules` trees; nothing referenced them.
