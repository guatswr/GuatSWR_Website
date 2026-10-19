# Public prose pages (`/activities`, `/activity/:id`, `/members`, `/history`, `/logs`)

Focused implementation notes for worker P's batch. Scope is source only: this
worktree has no `node_modules`, so everything below is written but **not run**
here. Codex owns integration and acceptance.

## Files added

Server (new ownership: `server/api/content/**`, `server/utils/markdown.ts`,
`server/utils/highlight.ts`, `server/utils/member-sort.ts`):

| File | Purpose |
| --- | --- |
| `web/shared/markdown.ts` | Allowlisted prose vocabulary, URL/attribute sanitizer, deterministic heading ids + fragment rewriting, completeness signal. Shared with the browser renderer by types only. |
| `web/shared/content.ts` | Display contracts for the content endpoints, page-size constants. |
| `web/server/utils/markdown.ts` | Runs the installed MDC parser on the server once per request, highlights fences, then the shared sanitizer; falls back to the whole article as plain text. |
| `web/server/utils/highlight.ts` | Server-only Shiki highlighter (explicit theme/languages, bounded input, no browser runtime). |
| `web/server/utils/member-sort.ts` | Archived `getSortKey` with `pinyin-pro` 3.28.0, server-side only. |
| `web/server/api/content/activity/[id].get.ts` | `GET /api/content/activity/:id` → display metadata + sanitized body from **one** `readActivity` call. |
| `web/server/api/content/history.get.ts` | `GET /api/content/history` → history entries with server-sanitized descriptions. |
| `web/server/api/content/members.get.ts` | `GET /api/content/members` → projected members + serialized sort keys. |

Pages/components/utils/tests/docs: `app/pages/{activities,members,history,logs}.vue`,
`app/pages/activity/[id].vue`, `app/components/{PublicPagination,SafeMarkdown,SafeMarkdownNode,ImageLightbox,ParliamentChart}.vue`,
`app/utils/{public-query,public-pagination,public-image,public-seo,beijing-time,members,parliament,history,logs}.ts`,
`app/composables/usePublicPageSeo.ts`, `web/tests/public-pages.test.ts`,
`web/tests/e2e/public-pages.spec.ts`, `web/tests/e2e/support/public-pages.ts`.

## Data flow

- Ordinary public reads use SSR `useFetch` with stable keys and reactive
  query objects (`public-activities`, `public-members`,
  `public-member-school-stats`, `public-history`, `public-logs`,
  `public-log-stats`, `public-logs-umami`). No client-only public render, no
  query/editor/Element Plus dependency on these paths.
- Filter and page state lives in the URL (`?page=`, `?school=`, `?username=`,
  `?action=`, `?limit=`, `?range=`, `?env=`, `?top=`). Pagination and filter
  controls are real links, so every state is reachable with JavaScript off;
  the log filter controls also sit inside a real `GET` form.
- Only allowlisted query keys are ever written back into a link or a canonical
  URL (`buildPublicPath`), so tracking parameters are not propagated.
- The content routes call the shared public readers directly
  (`readActivity({ apiBase }, id)`, `readHistory({ apiBase })`,
  `readMembers({ apiBase }, school)` with `useRuntimeConfig(event)`): one
  projected upstream read, no internal HTTP hop, no synthetic self request, and
  nothing from the browser request (credentials, `Host`, port) reaches upstream.
- The detail page makes exactly one request, `/api/content/activity/:id`, which
  returns both the header metadata and the body: the two can never describe
  different upstream records. Raw Markdown is not duplicated in the response.
- Status codes: list pages keep their inline error + retry UI, but SSR sets
  `502` when the upstream read failed; `?page=` that is not a positive integer
  is `400`; a page beyond the result range is `404`; a missing, deleted or
  private activity is `404`; any other content-endpoint failure is `502`.

## Markdown design

1. `@nuxtjs/mdc`'s parser runs on the server, once per request.
2. Every node is reduced to native prose tags with a fixed attribute
   allowlist. Custom/MDC component tags are **unwrapped** (content kept, all
   props dropped); active-content tags (`script`, `style`, `iframe`, `svg`,
   `math`, form controls, `template`, …) are **dropped with their subtree**, so
   a `<script>` payload never becomes visible article text.
3. Parser-only props (`code`, `meta`, `language`, `__ignoreMap`) are discarded,
   so the fenced source is not duplicated into attributes.
4. URLs: `javascript:`/`data:`/`vbscript:`/`file:`, protocol-encoded and
   whitespace-split variants, `//authority`, `/\authority`, credentials in
   absolute URLs and traversal paths are rejected. Validation runs on every
   decoding round, but the **original** text is what is emitted, so legitimate
   path/query encoding is preserved.
5. Images: same-origin paths only, plus normalization of legacy absolute
   `/uploads/...` URLs to the equivalent path. The deployment CSP is
   `img-src 'self' data:`, so a remote origin would render as a blocked
   request; remote origins are therefore dropped instead of emitted.
6. Headings get deterministic `md-<slug>` ids (prefixed so they cannot clobber
   `window`/`document` properties, uniquified with `-1`, `-2`), and in-article
   `#fragment` links are rewritten to those ids using the heading text, its
   slug and the parser's own id as aliases.
7. The browser renders the tree with `h(tag, props, children)` over a string
   tag — never `<component :is>` — so a sanitizer bug cannot resolve an app or
   admin component, and no parser/highlighter code is shipped.
8. Completeness: article text is never silently truncated. If the body exceeds
   the parse budget or a sanitizer node/depth budget is exhausted, the **whole**
   article is rendered instead as escaped plain text and `complete: false` is
   reported internally.
9. Code fences are highlighted **on the server** by the declared `shiki`
   dependency (one lazily created highlighter, explicit `github-light` theme and
   language list, JavaScript regex engine, 20 000-character and 24-block
   bounds). Unsupported languages keep their plain text. The coloured spans go
   through the same sanitizer, so only `color`/`font-*`/`--shiki-*` tokens
   survive; the theme stylesheet and `pre` background/tabindex are dropped.
10. Code blocks render the archived chrome natively (`SafeMarkdownPre.vue`):
    language label plus a copy button with Clipboard API, selection fallback,
    and a polite live region for success/failure. No editor runtime.
11. GFM task lists: only an inert checkbox survives (`type=checkbox`,
    `disabled` forced true, sanitized `checked`, no name/id/events/bindings);
    every other `input`/`form`/`button` is still dropped.

## Determinism (SSR vs hydration)

- Member sort keys are computed on the server with the pinned `pinyin-pro`
  3.28.0 (`pinyin(firstChar, { pattern: 'first', toneType: 'none' })`, the
  archived `getSortKey` categories/keys) and returned with the member list. The
  browser only sorts by those keys: no pinyin library, no ICU bucket
  differences, and the same order on the first render, on a filter change and
  on client-side navigation.
- The members chart subtitle date and the Umami request window are computed
  once on the server and replayed from the payload, so hydration never refetches
  with a clock that has moved on.
- Log timestamps use explicit arithmetic instead of `toLocaleString`: legacy
  SQLite wall-clock values print unchanged (what the archived browser showed),
  offset-qualified ISO strings are rendered in UTC+8, and chart buckets are
  derived in UTC. Chart geometry and the parliament seat layout are pure
  functions of the data.

## Known limitations and deviations (for lead review)

1. **Highlight colours are `github-light` only.** The archived preview used
   `md-editor-v3`'s own themes (separate light/dark palettes). Server tokens come
   from Shiki's `github-light`; the block background/radius still follow the
   archived page. The head bar keeps the archived default-theme colour
   (`#282c34`), which the page's own override never changed.
2. **Nine archived icon URLs no longer exist - the replacements are functional,
   not 1:1.** Microsoft Edge/Windows/Internet Explorer, Chromium, Yandex, UC,
   360, ChromeOS and `devices` answer HTTP 404 at `cdn.simpleicons.org`
   (verified 2026-10-19); the archived page rendered broken images for those
   rows. The approved replacement is: a locally authored generic mark
   (browser/desktop/device) for the browser, desktop and device rows, and the
   Chrome mark for Chromium and ChromeOS. That is a deliberate functional
   substitution for a dead asset - it is **not** the archived artwork and the
   parity comparison for those cells is expected to differ. The other 12 marks
   are the pinned official SVGs; see `web/public/icons/env/SOURCES.md`.
3. **Code-copy fallback** uses `document.execCommand('copy')` when the Clipboard
   API is unavailable. The earlier note here claimed the fallback "does not
   pretend success" - that was **wrong** at the time: `legacyCopy` returned
   `copied || text.length > 0`, so any non-empty block reported success even
   when the command returned false or threw. Corrected in P4: the outcome is the
   command's real result, the reader's selection is saved and restored, and no
   timer is scheduled after unmount.
4. **Legacy history descriptions** are parsed as Markdown with raw HTML passed
   through the allowlist (`<p>` survives), which matches the archived rendering
   for the stored rich-text values.
5. **Archived full-screen loaders** are preserved as markup but only render
   during client-side revalidation, because these pages are server-rendered
   rather than fetched after mount. Redirect-to-list-on-error was replaced by
   real 404/502 responses.
6. **The `/logs` statistics panels** render whenever the adapter succeeds; an
   unconfigured Umami instance answers 503, which is shown as
   `统计数据暂不可用` and never as zeroes.


## P4 corrections

- **Clipboard outcome** (above) and **checkbox rendering**: the sanitizer
  already emitted inert task checkboxes, but the browser renderer's generic tag
  check dropped them. The renderer now has a closed branch *before* the generic
  allowlist (`safeTaskCheckboxProps`: exact checkbox, forced `disabled`,
  normalized `checked`, no other attributes, no children), so checked and
  unchecked tasks render as disabled boxes and hostile inputs do not render at
  all. Covered by SSR-markup tests (`vue/server-renderer`).
- **Reactive page state**: every query-dependent `useFetch` is keyed by its
  normalized query (`public-members-<school>`, `public-activities-<page>`,
  `public-logs-<page>-<size>-<user>-<action>`, `public-logs-umami-<range>-<env>-<top>`),
  so filters no longer share one cache slot, and `usePublicPageSeo` takes a
  getter so the canonical/OG values follow client-side navigation instead of
  freezing the setup-time selection.
- **Untrusted lookups**: highlighter aliases, Umami page titles, icon tables and
  member sort keys are resolved with `Map`/`Object.hasOwn`, so `constructor`,
  `toString` or `__proto__` can never resolve an inherited member.
- **Walk budget**: the parsed tree is checked iteratively (depth 48, 40 000
  nodes) *before* highlighting or sanitizing; exceeding it returns the whole
  article as escaped plain text - never a silently truncated one.
- **Visual coverage**: the parity spec now compares, on desktop and mobile in
  light and dark, the activity grid, the activity detail article and prose, the
  history timeline and month rail, the members chart and grid, and the logs
  statistics panel (which contains the environment icons) and table - each with
  whole-device-pixel crops, rect parity, kept raw/archive/new/diff PNGs and a
  zero-differing-pixel bar. Contexts are pinned to `Asia/Shanghai` because the
  archived members chart printed the browser's local date.
- **Known visual deviation**: a fenced code block inside an article would show
  the archived `md-editor-v3` theme colours against this server's
  `github-light` tokens. The current fixture has no fence, so no comparison
  exercises it; when one is added, the prose comparison is expected to report
  that difference rather than hide it.

## Integration dependencies (not in this worktree)

- `@guatswr/shared` must export `PublicActivity`, `PublicActivitiesPage`,
  `PublicMember`, `PublicSchoolStat`, `PublicHistoryEntry`, `PublicLog`,
  `PublicLogsPage`, `PublicLogStat`, `PublicUmamiStats` (worker D).
- `ProgressiveImage` with the agreed prop contract, and the data-worker's
  `/uploads` proxy and `public-data.mjs` fixtures.
- The visual parity spec expects the fixture upstream to serve the frozen v1
  routes for both the app and the archived SPA (`tests/fixtures/upstream.mjs`
  delegating to `handlePublicFixture`).
- New direct dependencies to declare centrally (both server-only, neither
  imported by any browser-entry module): `shiki@4.5.0` for highlighting and
  `pinyin-pro@3.28.0` for member sort keys.
- The isolated fixture's reserved `activity id 998` must answer `503` with a
  private error decoy (worker D); `/activity/998` is the real SSR 502 test.
  `999999` remains the 404 case.
- A fenced code block and a GFM task list in the fixture content would let the
  E2E observe the code chrome and checkbox rendering; the unit tests already
  cover the highlighter and sanitizer directly.
