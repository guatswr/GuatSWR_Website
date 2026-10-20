# Data and state ownership

2026-10-20. This describes the integrated code, not another dependency proposal.

| Owner | Responsibility | Lifetime / invalidation |
| --- | --- | --- |
| Nuxt `useFetch` / async data | Public configuration, article/event/member/history/log reads; SSR content and payload hydration | Explicit public keys/parameters; no private identity in shared data. Client refresh after relevant writes accompanies server invalidation. |
| Server public adapters / SWR data cache | Validate and project the frozen API, bound upstream work, reuse safe public data | Resource-specific invalidation after confirmed admin writes. Fresh HTML with a fresh CSP nonce; no shared rendered-HTML cache. See CACHE.md. |
| Pinia `ui-preferences` | Theme preference/resolved theme and its DOM/timer lifecycle | Per Nuxt app. Only the theme preference is persisted. It never owns authentication or backend resource lists. |
| Pinia `public-site` | Reactive mirror of the validated public site configuration for shared layout/page consumption | Per app, updated only by `usePublicConfig` binding to the one `public-site-config` useFetch request. No independent request, private fields or localStorage resource persistence. |
| `useBffSession` | Safe identity, auth status/expiry, memory-only CSRF coordination, session revision, private cleanup registrations | Per Nuxt app, never module-global. Explicit refresh/login/logout and protected operations; public pages do not fetch private identity merely by rendering. |
| TanStack Vue Query | Authenticated administrator resource reads and query state | One QueryClient installed after route authentication in that app; retry disabled, staleTime 0, gcTime 5 minutes, no focus refetch. Session loss cancels/clears private queries; unmount disposes registrations. |
| Closed admin/guest transports | Fixed browser-facing BFF URLs, bounded uploads/downloads, explicit write lifecycle | Cookie session + memory-only CSRF; no browser JWT or arbitrary upstream target. No automatic write retry; one explicit pre-write CSRF rejection may refresh CSRF and retry before mutation. |
| Form/component state | Unsaved editor fields, file progress, filters, modal/ranking rows | Local state, shared validation and explicit dirty/leave rules where needed. Guest draft/receipt ownership uses its dedicated BFF flow; it is never an admin Query cache or persisted JWT store. |
| `packages/shared` Zod schemas | Frozen DTO projection and validation, five-type event form semantics | Stateless functions/schemas shared by browser and server. Backend authorization and write validation remain authoritative. |

## Rules for new work

1. Keep publicly crawlable content in SSR `useFetch`/async data. Do not migrate
   it into a client-only Query request or fetch private sessions on public routes.
2. Use private Query keys for administrator reads; keep API contracts in the
   closed adapters. Never put credentials, editable forms or protected results
   in public Nuxt keys, global singletons or a shared SWR cache.
3. A successful mutation invalidates the relevant server resource cache, then
   refetches the visible private list. Failure retains input for an explicit
   retry and must not optimistically report publication as complete.
4. Bind requests, editor/upload callbacks and binary streams to their component
   and session lifetime. Losing a session must not let a late response restore
   private data or populate a different user's form.

The current choice retains both Nuxt data fetching and Query because they own
different public/private lifecycles. There is no benefit in adding a second
persisted auth store or duplicating resource lists in Pinia. The existing public
configuration mirror is explicitly fed by useFetch, not a second fetch owner.
Admin forms use
native controls with shared schemas; public event forms use the existing
TanStack Form integration. No additional state/form framework is required.
