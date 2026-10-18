# Frozen frontend migration inventory

Source of truth: archived `v1-archive` (`f1215d4`), especially `frontend/src/router.js`, page components, and `backend/src/routes/*`. No API or backend changes are authorized by this migration.

| Existing URL | New rendering / cache intention | Port scope |
| --- | --- | --- |
| `/` | SSR + SWR 60s | Hero/toy/freeze, interests, about, three archives, social links. Existing motion is progressive enhancement. |
| `/activities` | SSR + SWR 120s | Archive filtering/gallery; preserve query behavior and pagination. |
| `/activity/:id` | SSR + SWR 120s | Singular existing detail URL; MDC content, gallery, SEO metadata. Do not rename to `/activities/:id`. |
| `/events`, `/events/zetime`, `/events/stg`, `/events/party`, `/events/betting`, `/events/bounty` | SSR + SWR 60s for public reads | Existing tab/filter rules and five event types. Signup/submission state must never enter shared HTML caches. |
| `/members` | SSR + SWR 300s | School filter, parliament visualization, member cards. |
| `/history` | SSR + SWR 300s | Alternating timeline and month navigation. |
| `/social` | SSR + SWR 300s | Existing curated link index with safe HTTP(S) URLs. |
| `/join` | SSR, no-store | Existing group number/link/question/QR behavior. |
| `/logs` | SSR + SWR 30s for public reads | Preserve public redaction and pagination. |
| `/login` | SSR, no-store (stage 05) | BFF session login; preserve existing second-password semantics. |
| `/admin/**` | Client-rendered, no-store/noindex | Dashboard, activity/member/history/event/config/link/user/profile/log/backup management. Element Plus/editor only here. |

## API adaptation

- Public configuration: `GET /api/config` (explicit public field projection).
- Public content: activities/detail, members/school statistics, history, event/detail/public participants, public logs/statistics. Inspect each handler's pagination and visibility semantics before creating shared DTOs; do not assume consistent response envelopes.
- Interactive: visitor upload/draft/submit and event signup routes must be ported from the existing form model and route implementations. Keep draft IDs and retry behavior intact.
- Auth: backend `POST /api/auth/login` returns a 24-hour JWT plus user metadata; `GET /api/auth/me` validates current identity. Nitro must keep JWT in encrypted session `secure` data only, omit it from public session payloads, and validate upstream identity/role for protected requests. Cookie lifetime cannot exceed token lifetime. Cross-origin state changes must fail CSRF/origin checks.
- Backend schemas currently remain independent. `packages/shared` mirrors only contracts whose consumers are implemented; it is not a claim that the frozen backend has already adopted shared validation.

## Acceptance separation

Foundation smoke snapshots and metrics measure a temporary two-line SSR fixture. They cannot establish old/new visual parity or final-site Lighthouse compliance. Capture old/new desktop/mobile states against the same deterministic API fixtures and images during stages 02/03, then rerun budgets as content and interactions land.

Each completed stage needs recursive typecheck/lint/unit/build, applicable E2E and reviewed visual baselines, no source maps, and route-specific performance evidence. Full login/submission/signup/review E2E, real data and deployment rollback are later gates, not completed foundation checks.
