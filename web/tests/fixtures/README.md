# Test fixtures

* `public-data.mjs` — deterministic public-data fixture shared by the isolated
  upstream server and by unit/E2E specs. It exports the raw v1 datasets
  (`publicActivitiesFixture`, `publicMembersFixture`, `publicHistoryFixture`,
  `publicEventsFixture`, `publicEventParticipantsFixture`, `publicLogsFixture`,
  `publicLogStatsFixture`, `publicUmamiFixture`, `publicConfigFixture`), real
  tiny image bytes (`publicImageFixtures` / `publicImageFixture`), observable
  request state (`publicFixtureState`, `resetPublicFixtureState`) and
  `handlePublicFixture(request, response)`.
  It never contacts the network and never writes to disk. Image URLs resolve to
  in-memory bytes; `/uploads/missing*` is the deliberate 404 probe for image
  fallback/retry coverage. Log ids 5-13 keep frozen `addLog` text verbatim
  (client IPs, admin-only actions, a credential-shaped decoy) so the public
  redaction is tested against real shapes. Reserved activity ids:
  `/api/activities/998` answers `503` with a private decoy body for sanitized
  `502` coverage, while `999` stays a `404`.
* `public-data.d.mts` — types for the fixture module, so TypeScript specs can
  import `public-data.mjs` without `allowJs`.
* `upstream.mjs` — the isolated v1 upstream server used by Playwright and the
  performance harness. It delegates to `handlePublicFixture` and keeps the
  existing `/health`, config credential-leak marker and private decoy keys.
* `legacy.mjs` — serves the already-built archived Vue frontend read-only,
  without loading Vite config or creating files in `frontend/`.

Visual tests render the archive and Nuxt UI in the same browser/device/theme,
using native fonts on that host, and require zero differing component pixels.

The WebP fixture bytes come from `web/public/brand/group-avatar.webp` because
this workspace has no WebP encoder; swap in a generated minimal WebP when one
is available.
