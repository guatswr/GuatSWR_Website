# next.guatswr.top deployment proposal — deferred

This document is a proposal only. No DNS, server, Cloudflare, or production configuration has been changed.

User direction on 2026-10-18: do not deploy now; develop and test locally. Target
launch is 2026-11-11. Retain this proposal for review closer to launch. Missing
infrastructure inputs do not block subsequent local implementation stages.

An independent local image is now build-verified: `guatswr-revamp:foundation-local`.
Reproduce from the repository root with `docker build -f web/Dockerfile -t guatswr-revamp:<reviewed-sha> .`.
The Dockerfile runs all four recursive gates and artifact checks, uses Node 24.15.0,
and runs the final Nitro service as the unprivileged `node` user. Local loopback
smoke checks passed; this is not a server deployment or a traffic cutover.

## Proposed topology

- Keep the current frontend container, backend container, database, uploads, reverse proxy upstream and `guatswr.top` routes untouched.
- Add an independent Node 24.15.0 Nitro service on a loopback-only port (proposed `127.0.0.1:3100`). Run with a separate unprivileged user/container and restart/health policy.
- Add only a `next.guatswr.top` HTTPS virtual host forwarding to that service. Its `/api/*` endpoints are Nitro BFF endpoints, not a blanket reverse proxy to the backend. Upload serving will be designed and reviewed with the image port.
- Set private `NUXT_API_BASE` to the existing backend's internal HTTP(S) origin. Production preview receives environment variables from the service/secret store, not a checked-in file.
- Generate `NUXT_SESSION_PASSWORD` (at least 32 random characters) in the server secret store. Do not send it in chat, commit it, print it, or include it in a browser runtime config. Use a host-only cookie (`guatswr-next`), HttpOnly/Secure/SameSite=Lax.
- Keep `next` noindex. Start Cloudflare with HTML/API caching bypassed; Nitro SWR is independently tested before adding any edge cache. API, session, admin and interactive routes must stay `no-store`.
- Prefer existing Cloudflare Access for a private preview if available. Confirm whether preview should be publicly readable or access restricted before creating rules.

## Required inputs before any infrastructure operation

Server/SSH target and deployment convention; available port and reverse proxy; internal backend origin; DNS/Cloudflare account and existing certificate approach; preview access policy; permission to create only the `next` service/host/DNS record.

## Deployment sequence after approval

1. Build a reproducible release from the reviewed `revamp/*` commit with the pinned Node/pnpm versions and frozen lockfile. Run all gates; no source maps. Validate Linux build if that is the target OS.
2. Create a separate release directory/image and secret environment; start the service bound to loopback. Check `/api/health` and `/api/config` without changing existing routes.
3. Validate SSR HTML, CSP nonce, noindex, assets, API failures and existing-backend compatibility against the internal service.
4. Add the `next` virtual host/certificate and DNS record using the approved values. Do not modify the apex or `www` records. Record exact changes and release SHA.
5. Run external smoke/Lighthouse/visual checks. This foundation fixture is not public-page migration acceptance; later stages must pass with real content/data.

## Rollback

Remove or disable only the new `next` host/service/DNS change, or repoint the `next` service to its previous reviewed release. Existing production remains on its current deployment throughout. `v1-archive` identifies the source checkpoint and is local until a separate tag-publication instruction (the current policy permits pushing only `revamp/*`).

Traffic cutover for `guatswr.top` needs a later, separate plan, approval, backup and a timed ≤5-minute rollback rehearsal. A source tag alone is not a deployment rollback rehearsal.
