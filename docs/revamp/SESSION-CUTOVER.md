# Session transition plan — no deployment performed

2026-10-20. Current scope: local migration and a future, separately approved
`next.guatswr.top` preview. Main-site cutover is not authorized.

## Independent preview

- New login always uses the opaque BFF session. Never import, exchange, decode
  or trust the old browser JWT or its `user`/`role`/`avatar` values. A fresh login
  is required even if the old site is signed in.
- Frozen `frontend/src/stores/user.js` writes the four localStorage keys
  `token`, `user`, `role`, `avatar` and same-named host-only `Path=/` cookies.
  localStorage is origin-specific; those host-only main-site cookies do not
  belong to the preview subdomain. Leave them intact so the old site remains
  deployable and usable during the transition.
- The already-integrated `clearLegacyAuthStorage` runs when this origin's
  login mounts and when its authenticated admin runtime is first installed.
  It idempotently removes only those four keys/host cookies on the **current
  origin**, preserving theme and `guatswr-next`. It cannot clear the main site's
  storage from preview. Its two unit cases also cover storage removal failures.
- The new `guatswr-next` session cookie is host-only, `Path=/`, HttpOnly,
  Secure and SameSite=Lax. Do not add `Domain=.guatswr.top`. Server-side session
  storage retains the upstream JWT; browser API responses expose only the safe
  identity projection and a memory-only CSRF token. Closed upstream clients
  construct headers from scratch and never forward browser Cookie/Authorization.
- Deployment review must check actual cookie scopes and response headers. Any
  parent-domain legacy cookie discovered then needs a specific retirement plan;
  deleting it from preview could log out the still-active old site.

## Optional future main-origin cutover

Only after a separate main-site cutover decision, rehearse the existing limited
cleanup on that origin and verify the full transition before deployment:

1. Remove only the four known legacy localStorage keys and expire the four
   matching non-HttpOnly host cookies at `Path=/`. Do not clear all storage,
   theme preferences, unrelated cookies or another origin's session.
2. Reject legacy credentials regardless of cleanup success. Storage may be
   blocked; the new BFF must still require its own opaque session and fresh
   backend identity/role verification.
3. Preserve a copy of the old deployment and record that administrators will
   need to log in again after either cutover or rollback. Do not restore a
   copied JWT into localStorage as a rollback shortcut.
4. Validate old-key/cookie seeds, a forged `role=super_admin`, unavailable
   storage, repeated loads, logout and return-to-old-site behavior in an
   isolated browser profile. Confirm no seeded JWT reaches any response,
   new request header, URL, console or shared cache.

The host-only cleanup is already implemented; the **main-origin cutover and its
environment/browser rehearsal are future conditions**. This document executes
neither. Preview must not perform main-origin cleanup.

## Invalidation and operational limits

New logout removes its opaque record and private client state. Confirmed own
password/second-password changes revoke every BFF session for that user;
confirmed global token refresh revokes all BFF records and the frozen backend
invalidates old JWT versions. A deployment restart of today's single-process
memory store requires everyone to sign in again. Do not claim multi-instance
session continuity; choose shared storage before approving multiple replicas.

The existing backend global refresh affects **old-site sessions too**. It is
available only as an explicit super-admin action with a confirmation; it is
never an automatic preview deployment or migration step. Local tests use
in-memory fixtures only. Final environment/rollback review remains in STAGING
and the release checklist.
