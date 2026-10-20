import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { handlePublicFixture, publicActivitiesFixture, publicMembersFixture, publicHistoryFixture, publicConfigFixture } from './public-data.mjs'
import { createAdminUpstreamFixture } from './admin-upstream.mjs'
import { exitWithParent } from './parent-watch.mjs'
import { createGuestUpstreamFixture } from './guest-upstream.mjs'
import { createAdminEventsUpstreamFixture } from './admin-events-upstream.mjs'

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
  const guest = createGuestUpstreamFixture()
  const events = createAdminEventsUpstreamFixture()
  const admin = createAdminUpstreamFixture()
  admin.state.activities = structuredClone(publicActivitiesFixture)
  admin.state.members = structuredClone(publicMembersFixture)
  admin.state.history = structuredClone(publicHistoryFixture)
  admin.state.config = publicConfigFixture()
  // The public fixture intentionally contains a nonnumeric private-looking
  // sentinel. Auth needs a real version counter, independent of that sentinel.
  admin.state.config.token_version = '1'
  let adminEnabled = false
  const state = {
    requests: [],
    loginAttempts: 0,
    lockLogin: false,
    loginDelayMs: 0,
    tokenTtlSeconds: 3600,
    tokenVersion: Number(admin.state.config.token_version),
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

    // Opt-in mutable integration dataset. Existing archive/public acceptance
    // runs retain the same immutable fixture until a private workflow enables it.
    if (url.pathname === '/__fixture/admin') {
      if (request.method === 'POST') {
        const body = await readJsonBody(request); adminEnabled = true
        // Public Markdown browser acceptance, isolated in memory. No real backend writes.
        if (typeof body.publicMarkdown === 'string' && body.publicMarkdown.length <= 200_000) {
          const article = admin.state.activities.find(item => item.id === 1)
          if (article) article.content = body.publicMarkdown
        }
        if (body.stalledBackup && !admin.state.backups.some(item => item.name === 'full_stall.tar.gz'))
          admin.state.backups.push({ type: 'full', name: 'full_stall.tar.gz', size: 100 * 1024 * 1024, mtime: 1_792_310_400_000 })
        if (body.failNext && Number.isInteger(body.failNext.status)) admin.state.failNext = body.failNext
      }
      return send(response, 200, { enabled: adminEnabled, requests: admin.state.requests, activities: admin.state.activities, members: admin.state.members,
        history: admin.state.history, config: admin.state.config, uploads: admin.state.uploads, bans: admin.state.bans, backups: admin.state.backups, activeBackupStreams: admin.state.activeBackupStreams, backupStreams: admin.state.backupStreams })
    }

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
        if (typeof body.username === 'string' && typeof body.disabled === 'boolean') {
          const user = state.users.get(body.username)
          if (user) user.disabled = body.disabled
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
      if (user.twofaEnabled) {
        if (!body.twofa) return send(response, 401, { message: '需要二步密码' })
        if (body.twofa !== user.twofa) return send(response, 401, { message: `二步密码错误 ${body.twofa}` })
      }
      const token = makeToken({
        id: user.id,
        username: user.username,
        role: user.role,
        token_version: state.tokenVersion,
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
      if (user.disabled) return send(response, 401, { message: '账号不可用' })
      if (payload.token_version !== state.tokenVersion) return send(response, 401, { message: '登录状态已过期' })
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
    if (adminEnabled) {
      const mutableResource = /^\/api\/(?:activities|members|history)(?:\/|$)/.test(url.pathname)
        || url.pathname === '/api/config' || url.pathname.startsWith('/api/admin/')
        || url.pathname === '/api/auth/profile' || url.pathname === '/api/auth/register' || url.pathname === '/api/upload'
      if (mutableResource) {
        admin.state.users = [...state.users.values()].map(user => ({ ...user, twofa_enabled: user.twofaEnabled }))
        await admin.handle(request, response, { publicRead: request.method === 'GET' && !headers.authorization })
        if (response.statusCode === 200 && (url.pathname === '/api/auth/register' || url.pathname.startsWith('/api/admin/users'))) {
          const ids = new Set(admin.state.users.map(user => user.id))
          for (const [username, user] of state.users) if (!ids.has(user.id)) state.users.delete(username)
          for (const user of admin.state.users) {
            state.users.set(user.username, { ...user, twofaEnabled: user.twofa_enabled })
          }
        }
        if (url.pathname === '/api/auth/profile' && response.statusCode === 200) {
          const body = admin.state.profileBodies.at(-1)
          const authorization = headers.authorization ?? ''
          const payload = JSON.parse(Buffer.from(authorization.slice(7).split('.')[1], 'base64url').toString('utf8'))
          const user = [...state.users.values()].find(candidate => candidate.id === payload.id)
          if (user && body) {
            if ('avatar' in body) user.avatar = body.avatar
            if ('password' in body) user.password = body.password
            if (body.twofa_enabled === false) { user.twofaEnabled = 0; user.twofa = null }
            else if (body.twofa_password) { user.twofaEnabled = 1; user.twofa = body.twofa_password }
          }
        }
        if (url.pathname === '/api/admin/token-version/refresh' && response.statusCode === 200)
          state.tokenVersion = Number(admin.state.config.token_version)
        return
      }
    }
    if (await events.handle(request, response)) return
    if (await guest.handle(request, response)) return
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
