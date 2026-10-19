# Live smoke against the built server (evidence for §5.1 of README.md)

Built server: `node web/.output/server/index.mjs` with
`PORT=3800 NUXT_API_BASE=http://127.0.0.1:3882
NUXT_SESSION_PASSWORD=auth-smoke-session-password-0123456789abcdef
NUXT_BFF_AUTH_ALLOWED_ORIGINS=["http://127.0.0.1:3800"]`.
Upstream: `PORT=3882 node web/tests/fixtures/auth-upstream.mjs`.
Both processes were stopped afterwards (by PID); the build lock was held across
the whole sequence and released at the end.

Raw transcript of the requests that matter, with the exact responses:

```
GET /api/bff/auth/csrf
  200  Cache-Control: no-store, private   Pragma: no-cache
  Set-Cookie: bff_csrf=v1.<exp>.<nonce>.<mac>; Max-Age=7200; Path=/; HttpOnly; Secure; SameSite=Lax
  {"csrfToken":"v1.…","expiresIn":7200}

GET /api/_auth/session        -> 404      (bff-auth-guard h3 layer)
DELETE /api/_auth/session     -> 404

POST /api/bff/auth/login      origin: http://127.0.0.1:3800
                              content-type: application/json
                              x-csrf-token: <from /csrf>, cookie bff_csrf=<same>
  -> 400 {"error":{"code":"invalid_request","message":"请求内容无效"}}
     ^ the BFF's own empty-body error: nuxt-security's xssValidator consumed the
       body with readBody(event) before the handler. Route rule not yet applied.

POST /api/bff/auth/login      origin: https://evil.example
  -> 403 {"error":{"code":"origin_rejected","message":"请求来源不被允许"}}
POST /api/bff/auth/login      (no origin header)
  -> 403 {"error":{"code":"origin_rejected","message":"请求来源不被允许"}}
POST /api/bff/auth/login      content-type: text/plain
  -> 415 {"error":{"code":"unsupported_media_type","message":"请求格式不受支持"}}
POST /api/bff/auth/login      (no x-csrf-token / no cookie)
  -> 403 {"error":{"code":"csrf_invalid","message":"请求校验失败，请刷新页面后重试"}}

12 anonymous POSTs, same client address
  -> 403 ×10 (csrf_invalid) then 429 ×2
  -> 429 Retry-After: 60
     {"error":{"code":"rate_limited","message":"登录尝试过于频繁，请稍后再试"}}

GET /api/bff/auth/session     (anonymous)
  -> 200 {"authenticated":false,"user":null}
GET /api/bff/auth/session     Cookie: guatswr-next=forged-cookie-value
  -> 401 {"error":{"code":"session_expired","message":"登录状态已失效，请重新登录"}}
     Cache-Control: no-store, private   Pragma: no-cache
     Set-Cookie: guatswr-next=; Path=/; HttpOnly; Secure; SameSite=Lax
     Set-Cookie: bff_csrf=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax

POST /api/bff/guest/events/draft      (no origin) -> 403 origin_rejected
PUT  /api/bff/guest/events/27         (no origin) -> 403 origin_rejected
GET  /api/bff/guest/events/1/signup   -> 404 {"error":{"code":"not_found",…}}
GET  /api/bff/admin/users             -> 404   (out of scope, correctly absent)
GET  /api/bff/account/me              -> 404   (out of scope, correctly absent)

GET /login
  -> 200, 131 974 bytes; contains 博丽神社办事处, 登录系统, name="username",
     name="password", 二步密码 (可选); zero JWT-shaped strings in the HTML
GET /admin
  -> 200 (ssr:false SPA shell; no admin page or admin middleware yet)
```

Not covered by this smoke (blocked by the missing route rule): a successful
login, the session round trip, logout, and the no-JWT-in-any-browser-surface
assertions. Re-run those once `/api/bff/**` has `security.xssValidator: false`.
