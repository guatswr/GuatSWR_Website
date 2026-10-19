# Homepage, social and join — implementation notes (worker H)

Source-only batch. Routes: `/` (real homepage), `/social`, `/join`. Shared layout/navbar/footer
visuals and the existing global CSS are intentionally untouched.

## Files

| Area | Files |
| --- | --- |
| Pages | `web/app/pages/index.vue`, `social.vue`, `join.vue` |
| Components | `web/app/components/ProgressiveImage.vue`, `HomeSocialLinks.vue`, `home/{HomeHero,HomeAvatarToy,CirnoFreeze,HomeInterests,InterestIcon,HomeAbout,MistyLakeBackdrop}.vue` |
| Composables | `web/app/composables/{usePublicConfig,usePublicSeo}.ts` |
| Typed helpers | `web/app/utils/{image-loader,motion,scroll-motion,ice-geometry,ice-thaw,freeze-interaction,club-date,site-config,public-url,home-content,public-config-sync}.ts` |
| Layout integration | `web/app/layouts/default.vue` (config fetch replaced by `usePublicConfig`; markup unchanged) |
| Public asset | `web/public/og-image.png` copied verbatim from `frontend/public/og-image.png` |
| Tests | `web/tests/{image-loader,motion,freeze,progressive-image,public-home}.test.ts`, `web/tests/e2e/{homepage,social-join,homepage-visual}.spec.ts`, `web/tests/e2e/support/public-parity.ts` |

All CSS/HTML/behaviour is a port of the archived `frontend/src` files. `RouterLink` became
`NuxtLink` (same paths, including the singular `/activity/:id`). No Element Plus, editor, form or
query package is imported on these paths.

## Images

`ProgressiveImage` renders the real `<img>` from the start, with the source the request already
knows (`src`, else `fallbackSrc`), `alt`, native `loading="eager|lazy"`, `fetchpriority`,
`decoding="async"` and declared dimensions. The server therefore emits a visible, readable,
crawler-followable image; no-JS visitors see the hero and every lazy source.

Progressive presentation is opt-in and can only be enabled by a working client loader:
`data-image-managed` only becomes `"true"` in `onMounted`, and only when the element is not already
painted. `.is-managed` is what applies `opacity: 0`, the fade/rise transitions and the placeholder,
so an unmanaged (SSR/no-JS/late-hydration) image can never be transparent. An image the browser
already painted from the server HTML is never hidden again during hydration.

`utils/image-loader.ts` keeps the archived state machine (slow notice, decode watchdog, stale-decode
guarding, thumb→original fallback, three escalating retries with 1.5/3/4.5 s backoff, online-event
retry, cleanup) but drives **the rendered element** instead of a detached `new Image()`. Consequences:

- one fetch per attempt, no probe-plus-render double download;
- the loader never writes `src` for the first attempt (the template already published it);
- a fallback publishes the new source, lets Vue patch the element, and adopts it on a `setTimeout(0)`
  tick (`adoptLater`, at most one pending adoption per render flush, and every pending handle is
  tracked and cleared by `dispose()`/`cancel()`) instead of racing the render;
- a retry of the same URL re-runs the load algorithm on the same element at the backoff deadline, so
  the archived backoff timing survives without a second network probe. This replaces the archived
  "fresh DOM node per retry" (`requestId`-keyed) identity with a fresh attempt on a stable element,
  which is the only way to avoid the duplicate download.

Placeholder, shimmer, error text (`图片暂未加载` / `图片仍在加载，请稍候` / `正在重新加载图片` /
`暂无图片`) and the blur preview are unchanged. The placeholder is `aria-hidden` and only exists
while managed; the loading/error message is announced through a dedicated `role="status"`
`aria-live` element, so it is never an "extra loading image" in the accessibility tree.

## Public configuration

`usePublicConfig()` is synchronous. It creates one shared `useFetch('/api/config', { key:
'public-site-config', default: ... })`, binds the result into the Pinia store through
`bindPublicConfig` **inside the current effect scope**, and returns refs plus a `ready` promise.
Callers `await ready` in `script setup`; the layout awaits it before rendering, so SSR markup carries
the real configuration. The state is memoized per Nuxt app in a `WeakMap` through
`acquireScopedState`, which registers an `onScopeDispose` release with an identity guard: when the
scope that created the entry is disposed (for example the public layout being replaced and later
restored) the entry is dropped, so the next caller builds a fresh state whose request→store watcher is
still live instead of reusing a dead one. Within one application the layout and pages still share one
request, one payload entry, one watcher, and client-side navigation adds neither a request nor a
watcher. Retrying reuses the same request (`refresh()`), so layout and page see the same result.

`bindPublicConfig` uses `flush: 'sync'` so the store is current before the render that follows a
response. Unit tests drive real `effectScope()` objects: same-scope reuse, disposal + reacquisition
with a refresh reaching the store afterwards, the disposed entry no longer firing, and two simulated
SSR application instances never sharing state.

Failure UX is the archived one: `/social` shows `暂时无法加载社团信息，请稍后重试。` with
`重新加载`; `/join` shows it inside `join-error` with `重新加载入群信息`. The homepage keeps the
archived behaviour (defaults + the archive retry block) rather than inventing a new config-error
block that the archived page never had.

## SEO

`usePublicSeo` sets the page title only (`首页`, `博丽大结界`, `加入我们`); `nuxt-seo-utils` appends
`| 桂航绯想天`, reproducing the archived `<title>` format. Descriptions are the archived route
values, with the archived default description for pages without one. `robots` is always
`noindex, nofollow` while the preview origin is not approved for indexing. The canonical is the
configured `site.url` plus the page path (no tracking query); it matches the canonical that
`nuxt-seo-utils` derives, so unhead renders one tag.

`og:*`/`twitter:*` use the page's own cover when it is a safe same-origin upload path
(`utils/public-url.ts` rejects absolute URLs, `//host`, `..` segments, encoded dots, backslashes and
control characters) and otherwise the archived `/og-image.png`. That file was copied from
`frontend/public/` into `web/public/`, and E2E fetches the published og:image URL and requires a 200
image response.

## Motion, freeze and reduced motion

`utils/{motion,scroll-motion}.ts` are typed ports of the archived directives (explicit named imports,
not Nuxt directive auto-registration). They fail open without observers/matchMedia/RAF, never hide
SSR content, reveal on keyboard focus, clean up listeners, frames and the reduced-motion preference,
and pause when the document is hidden. `CirnoFreeze` is loaded with `defineAsyncComponent({
suspensible: false })` on the first freeze only: the ⑨th click still flips the state immediately and
the overlay mounts when the chunk lands. No timer pre-fetches the chunk. `utils/{ice-geometry,
ice-thaw,freeze-interaction}.ts` keep the seeded deterministic field, native-scroll thaw, bounded
fracture timers, capture-phase interaction lock and full attribute/focus restore.

`CirnoFreeze` makes the Nuxt root element (`#__nuxt`, Nuxt's default `app.rootId`) inert and pauses
its animations; if that element is ever renamed, the E2E `inert` assertion fails loudly.

## Contracts and integration notes

- `PublicActivity` / `PublicActivitiesPage` are imported **type-only** from `@guatswr/shared`. Until
  the public-data worker lands those exports, `nuxt typecheck` fails on that single import; the brief
  explicitly allows this over adding a shadow schema.
- E2E consumes the public-data worker's contract directly: types from
  `web/tests/fixtures/public-data.d.mts`, `publicConfigFixture()` called as the function it is, and
  the archived app's reads/uploads proxied to the isolated upstream (`useUpstreamFixtures`) so both
  sites render the *same raw v1 response* — `publicActivitiesFixture` itself (raw rows with private,
  draft, deleted entries and JSON-string `images`) is never re-filtered or counted by the specs.
  `upstreamActivitiesPage(request)` reads the exact `page=1&limit=3` response the BFF projects.
  The archived deliberate `/uploads/missing*` 404 probe stays available for fallback coverage.

- CSP currently allows `img-src 'self' data:`. Configured values that are absolute external URLs will
  be blocked by the browser; the UI must not claim parity for them. Any future external allowlist is
  a server/CSP decision, not a UI change.
- The public JS budget script sums every emitted JS file, so the new pages and the lazy freeze chunk
  are charged to the same total. That is the lead's manifest/route-traversal work, not a UI change.
- Tests are written but **not executed** in this worktree (no installs/builds/heavy gates per the
  brief). Unit tests import only `vue` and in-repo helpers (no `@guatswr/shared` runtime import), so
  they do not require a freshly built shared package.
