import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { handlePublicFixture } from './public-data.mjs'
import { exitWithParent } from './parent-watch.mjs'

// Deterministic in-memory auth fixture for the BFF integration test. It never
// starts or writes to the real backend, and it is a separate file from the
// public-data `upstream.mjs` so that worker's fixture stays untouched.
//
// Wiring for Codex:
//   1. `node web/tests/fixtures/auth-upstream.mjs` starts it on PORT (default
//      3182) with upstream.mjs-compatible conventions; add it next to the
//      existing fixture in the Playwright webServer array when an auth E2E
//      batch lands.
//   2. `createAuthUpstreamFixture()` is imported directly by
//      `web/tests/auth-api-integration.test.ts`, which binds an ephemeral
//      loopback port instead of relying on a fixed one.

function base64Url(value) {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function makeToken(payload) {
  return `${base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${base64Url(JSON.stringify(payload))}.fixture-signature`
}

function readJsonBody(request, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    request.on('data', (chunk) => {
      total += chunk.length
      if (total > limit) {
        reject(new Error('body too large'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('error', reject)
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      }
      catch {
        reject(new Error('invalid json'))
      }
    })
  })
}

function send(response, status, body, headers = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body)
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    ...headers,
  })
  response.end(payload)
}

export function createAuthUpstreamFixture() {
  const state = {
    requests: [],
    loginAttempts: 0,
    lockLogin: false,
    loginDelayMs: 0,
    tokenTtlSeconds: 3600,
    meStatus: null,
    hugeMe: false,
    users: new Map([
      ['admin', {
        id: 1,
        username: 'admin',
        password: 'adminpass',
        role: 'super_admin',
        twofa: null,
        avatar: null,
        twofaEnabled: 0,
      }],
      ['second', {
        id: 2,
        username: 'second',
        password: 'secondpass',
        role: 'admin',
        twofa: '123456',
        avatar: '/uploads/second.webp',
        twofaEnabled: 1,
      }],
    ]),
  }

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const headers = request.headers
    state.requests.push({
      method: request.method,
      path: url.pathname,
      headers: { ...headers },
    })

    // Any browser credential or origin reaching this fixture is a BFF bug.
    const leaked = Boolean(headers.cookie || headers.origin || headers['x-real-ip'] || headers['cf-connecting-ip'] || headers.forwarded)

    if (request.method === 'POST' && url.pathname === '/__fixture/control') {
      try {
        const body = await readJsonBody(request)
        if (typeof body.tokenTtlSeconds === 'number') state.tokenTtlSeconds = body.tokenTtlSeconds
        if (typeof body.lockLogin === 'boolean') state.lockLogin = body.lockLogin
        if (typeof body.loginDelayMs === 'number') state.loginDelayMs = Math.max(0, Math.min(body.loginDelayMs, 5000))
        if (typeof body.hugeMe === 'boolean') state.hugeMe = body.hugeMe
        if ('meStatus' in body) state.meStatus = body.meStatus
        if (typeof body.role === 'string') {
          for (const user of state.users.values()) user.role = body.role
        }
        if (typeof body.username === 'string' && typeof body.role === 'string') {
          const user = state.users.get(body.username)
          if (user) user.role = body.role
        }
        return send(response, 200, { ok: true })
      }
      catch {
        return send(response, 400, { message: 'invalid control body' })
      }
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/login') {
      if (state.lockLogin) {
        return send(response, 429, { message: '登录过于频繁，请稍后再试' }, { 'Retry-After': '60' })
      }
      let body
      try {
        body = await readJsonBody(request)
      }
      catch {
        return send(response, 400, { message: '请求参数无效' })
      }
      if (leaked) return send(response, 500, { message: 'credential-leak' })
      state.loginAttempts += 1
      if (state.loginDelayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, state.loginDelayMs))
      }
      const user = typeof body.username === 'string' ? state.users.get(body.username) : undefined
      if (!user || user.password !== body.password) {
        const remaining = Math.max(0, 5 - state.loginAttempts)
        return send(response, 401, { message: `用户名或密码错误 (剩余 ${remaining} 次)` })
      }
      if (user.twofa) {
        if (!body.twofa) return send(response, 401, { message: '需要二步密码' })
        if (body.twofa !== user.twofa) return send(response, 401, { message: `二步密码错误 ${body.twofa}` })
      }
      const token = makeToken({
        id: user.id,
        username: user.username,
        role: user.role,
        token_version: 1,
        exp: Math.floor(Date.now() / 1000) + state.tokenTtlSeconds,
      })
      return send(response, 200, {
        token,
        username: user.username,
        role: user.role,
        avatar: user.avatar,
        id: user.id,
      })
    }

    if (request.method === 'GET' && url.pathname === '/api/auth/me') {
      const authorization = headers.authorization
      if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
        return send(response, 401, { message: '未登录' })
      }
      if (state.meStatus) return send(response, state.meStatus, { message: 'Token 无效' })
      if (state.hugeMe) {
        return send(response, 200, { id: 1, username: 'x'.repeat(200_000), role: 'admin', avatar: null, twofa_enabled: 0 })
      }
      let payload
      try {
        payload = JSON.parse(Buffer.from(authorization.slice('Bearer '.length).split('.')[1], 'base64url').toString('utf8'))
      }
      catch {
        return send(response, 403, { message: 'Token 无效' })
      }
      const user = [...state.users.values()].find(candidate => candidate.id === payload.id)
      if (!user) return send(response, 404, { message: '用户不存在' })
      return send(response, 200, {
        id: user.id,
        username: user.username,
        role: user.role,
        avatar: user.avatar,
        twofa_enabled: user.twofaEnabled,
      })
    }

    // Anything that is not an auth path belongs to the public-data fixture, so a
    // single upstream can serve a whole Playwright run and the app's
    // `NUXT_API_BASE` does not have to switch between two fixtures. The
    // credential-leak check above stays scoped to `/api/auth/login`, so public
    // reads cannot pollute it.
    if (handlePublicFixture(request, response)) return

    return send(response, 404, { message: 'Not Found' })
  })

  return {
    server,
    state,
    listen(port = 0) {
      return new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, '127.0.0.1', () => {
          const address = server.address()
          resolve(typeof address === 'object' && address ? address.port : port)
        })
      })
    },
    close() {
      return new Promise((resolve) => {
        server.close(() => resolve())
      })
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3182)
  const fixture = createAuthUpstreamFixture()
  fixture.listen(port).then((bound) => {
    console.log(`auth fixture listening on http://127.0.0.1:${bound}`)
  })
  // A leftover listener on this port makes the next E2E batch's webServer fail
  // to start, so this process must not outlive the parent that spawned it.
  exitWithParent()
}
