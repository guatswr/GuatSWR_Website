# Event pages and interactive form UI — implementation notes (worker H, batch 2)

> Latest independent integration (2026-10-19): guest UI now uses per-app CSRF,
> real multipart uploads and confirmed draft receipts. Six genuine desktop/mobile
> workflow cases pass against the built Nuxt BFF. See [integration evidence](logs/10-guest-integration/README.md);
> this supersedes historical source-only/proposed-BFF notes below. Whole-site
> performance and administration remain open.

Source-only. Routes: `/events` (302 → `/events/bounty`), `/events/{bounty,betting,stg,zetime,party}`.
Everything is a logical port of the archived `frontend/src` event sources; no redesign, no backend
or API contract change.

## Files

| Area | Files |
| --- | --- |
| Shared rules | `packages/shared/src/events.ts`, `packages/shared/src/events.test.ts` |
| Pages | `web/app/pages/events.vue` (archived sidebar/mobile layout), `events/index.vue` (SSR redirect), `events/{bounty,betting,stg,zetime,party}.vue` |
| Components | `web/app/components/events/{EventBoard,EventCard,EventModal,EventForm,EventSignup}.vue` |
| Helpers | `web/app/utils/{event-transport,event-display,upload-progress,compress-image}.ts`, `web/app/composables/useEventApi.ts` |
| Tests | `web/tests/{event-transport,event-display}.test.ts`, `web/tests/e2e/{events,events-visual}.spec.ts`, `web/tests/e2e/support/events-parity.ts` |

## Data contract

Public reads use D's read-only BFF exactly as landed in the primary:

- `useFetch<PublicEventsPage>('/api/event', { key: 'event-board:'+type, query: { type, limit: 50 } })`
- `GET /api/event/:id/participants/public` → `PublicEventParticipant[]`, fetched only on preview intent
- statuses are limited to `published|ongoing|ended|settled`; signup is only meaningful for `STG`/`则则`
  (`SIGNUP_EVENT_TYPES`), matching the frozen backend.

Nothing private enters SSR: the visitor's own signup is fetched from the BFF only inside the
client-opened modal, and `EventBoard` never renders a session or role into the public page. The
browser `isAdmin`/`admin` hint only changes copy and which transport variant may publish; the backend
remains the authority.

## Shared rules (`packages/shared/src/events.ts`)

A faithful port of `eventFormModel.js`: `EVENT_TYPES`, the per-type field catalogue (labels, kinds,
required flags, the archived Beijing hint, the gathering select options), `createEventFormState`,
`getEventFields`, `buildEventPayload` (retains rankings, settlement, unknown nested fields and future
content on edits), `createDraftSession` (one in-flight create, retryable failure) and `saveEventForm`
(guest draft → `submit:true`; admin publish; edits with `submit:false`).

Validation has one source: `createEventFormSchema(allowedTypes)` builds a Zod 4 schema for the flat UI
model from the same catalogue, enforces required fields for the selected type in catalogue order, and
`validateEventForm` maps the first issue back to the archived `{ field, message }` shape (used for
aria-invalid and "focus the first invalid field"). The outgoing DTO is a separate schema
(`eventPayloadSchema` / `eventSaveRequestSchema`), so the flat model can never be mistaken for a DTO.
Needs one central line: `export * from './events.js'` in `packages/shared/src/index.ts` (no index edit
in this batch, per the brief); the web code imports from `@guatswr/shared`.

## Interactive UI

- **Forms** use `@tanstack/vue-form` 1.33.5 with the shared Zod schema as a native Standard Schema
  validator (`onChange` + `onSubmit`). Submit still runs the archived pre-check so the first invalid
  field is focused, and mutations are never retried automatically.
- **Transport** (`event-transport.ts`) is the single HTTP seam. Guest paths are the proposed BFF ones:
  `POST /api/bff/guest/events/draft`, `PUT /api/bff/guest/events/:id`,
  `GET|POST|DELETE /api/bff/guest/events/:id/signup`,
  `POST /api/bff/guest/upload/{content,avatar}`, and `POST /api/bff/admin/events` only when a
  protected transport is created with `canPublish`. It sends `credentials: 'same-origin'`,
  `redirect: 'error'`, and the headers returned by one injected provider
  (`configureEventTransportHeaders`) so the auth batch wires its CSRF helper without this layer ever
  storing a token or building an `Authorization` header. 401 → "登录状态已失效", 403 → "没有权限执行该操作",
  404/5xx/network get their own typed errors.
- **Uploads** use a lazily imported XHR sender: real progress, browser-managed multipart boundary,
  `AbortController` on unmount/new file, stale-response guards, the archived 50 MB/format guard and
  the archived GIF/SVG "never re-encode" rule. `compressorjs` (quality .75, max 1920, skip < 300 KB)
  is imported lazily on first upload.
- **Modals** are native `<dialog>` + `showModal()`: page inertness, focus trap, Escape (`cancel`),
  focus return, body scroll lock and cleanup, no timers. They reproduce the archived Element Plus
  dialog chrome (92vw + max-widths 720/640 px, sky-50 header, 1.1rem sky-700 title, 70vh scrollable
  body) and add the archived close affordance. The form/signup components are
  `defineAsyncComponent({ suspensible: false })` and mount only when opened, so the public route
  never imports form/upload code eagerly.
- **State**: loading/empty/error states keep the archived copy (`这里冷冷清清的...`,
  `暂无报名人员`, `正在读取...`), plus an inline retry where the archive only had an Element Plus toast.

## Deliberate deviations (need review)

- **Signup deadline gate.** The brief requires the Beijing helper for signup deadlines and backend
  final validation. The modal now shows `报名已截止` and disables saving once the parsed deadline
  (`parseClubTime` on `deadline|time|end_time`) has passed. The archived UI had no such gate; the
  backend still validates, and free-form schedule text never gates anything.
- **Countdown** is computed from the Beijing-anchored timestamp instead of the browser-local parse,
  so `剩余` is correct outside UTC+8. Strings/thresholds and the card's `时间` text are unchanged
  (the archived `toLocaleString()` rendering is kept verbatim).
- **Toasts → inline regions**: Element Plus is not in the public bundle, so `ElMessage`
  success/warning/error copy moved into `role="status"`/`role="alert"` regions with the same strings.
- **Preview errors** get an inline message and a `重新读取` button (the archive only toasted).
- A client-side `image compression` type import is absent until `compressorjs` is installed
  centrally; the small-file path works without it.

## Central dependencies / integration

1. `packages/shared/src/index.ts`: add `export * from './events.js'` (single line).
2. Install `@tanstack/vue-form@1.33.5` and `compressorjs@1.2.1` (lazy chunks only).
3. Guest BFF routes above must be implemented by the server batch with the auth design's origin/CSRF,
   bounded multipart and trusted-proxy guest identity. Until then only the test double answers them.
4. `~/utils/club-date` (`parseClubTime`) comes from the frozen homepage batch.
5. Optional future need: a scoped `img-src blob:` for locally decoded upload previews on the
   event/admin routes only — not added here, and the global CSP was not modified.

## Tests (written, not run)

- `packages/shared/src/events.test.ts` (10): the seven archived model cases (round-trip for all five
  types, edit preservation, legacy JSON/text schedules/unknown gather labels, type/whitespace/solo-duo
  validation, one shared draft + failed-submit retry, admin publish/edit semantics, failed draft
  creation retry) plus Zod schema/DTO separation and signup bounds.
- `web/tests/event-transport.test.ts` (7): BFF paths, methods, JSON bodies, injected headers and no
  Authorization header, guest cannot publish, status→error mapping without retry, local signup
  rejection, one draft shared between upload and submit, upload progress/signal forwarding, upload
  guard.
- `web/tests/event-display.test.ts` (5): cover/deadline precedence, free-text schedules, Beijing
  countdown, signup deadline/open state, top results and status labels.
- `web/tests/e2e/events.spec.ts` (10): `/events` 302, all five categories SSR + public statuses,
  no-JS readability, archived empty state, modal mouse/Enter activation with focus trap/Escape/focus
  return/scroll-lock restore, form validation + first-invalid focus, one-draft upload/submit with a
  failed-submit retry (no auto-retry), signup read/save/cancel, 403 vs theme preservation, participant
  preview retry, deadline gate.
- `web/tests/e2e/events-visual.spec.ts`: archive vs new `main`/first card/signup-modal body for
  bounty and STG, desktop/mobile × light/dark, with archive/new/diff PNGs and a zero-diff assertion.

Manual browser contexts use an explicit `baseURL` and device options (no `page.goto('/')` in a raw
context). No `test.fixme`, no exclusions, no throwaway runners were added.
