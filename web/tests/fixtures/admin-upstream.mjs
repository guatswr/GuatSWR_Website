import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

// Deterministic in-memory admin fixture for the protected BFF tests. Separate
// from upstream.mjs / auth-upstream.mjs; it never touches the real backend and
// deliberately leaks private-looking fields so projection tests can prove the
// BFF strips them.

function readJsonBody(request, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    request.on('data', (chunk) => {
      total += chunk.length
      if (total > limit) {
        request.destroy()
        reject(new Error('body too large'))
        return
      }
      chunks.push(chunk)
    })
    request.on('error', reject)
    request.on('end', () => {
      if (chunks.length === 0) return resolve({})
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
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    ...headers,
  })
  response.end(body === undefined ? '' : JSON.stringify(body))
}

export function createAdminUpstreamFixture() {
  const state = {
    requests: [],
    meStatus: null,
    roleOverride: null,
    failNext: null,
    activities: [
      { id: 1, title: '夏日祭', tag: '活动', date: '2026-08-01', description: 'd', content: '# c', cover_image: '/uploads/a.webp', images: ['/uploads/b.webp'], status: 'published', deleted_at: null, created_at: '2026-08-01T00:00:00+08:00', created_by: 1, updated_by: null, deleted_by: null, password: 'private-hash', token_version: 7 },
      { id: 2, title: '(草稿)', tag: '', date: '2026-08-02', description: '', content: '', cover_image: '', images: [], status: 'draft', deleted_at: null, created_at: '2026-08-02T00:00:00+08:00', created_by: 1, updated_by: null, deleted_by: null },
      { id: 3, title: '已删除', tag: 'x', date: '2026-07-01', description: '', content: '', cover_image: '', images: [], status: 'published', deleted_at: '2026-07-02T00:00:00+08:00', created_at: '2026-07-01T00:00:00+08:00', created_by: 1, updated_by: null, deleted_by: 1 },
    ],
    members: [
      { id: 1, name: '琪露诺', role: '看板娘', bio: null, avatar: '/uploads/m.webp', school: '桂航', tags: ['东方'], sort_order: 1, deleted_at: null, deleted_by: null, password: 'private' },
    ],
    history: [
      { id: 1, date: '2020-01-01', title: '起点', description: null, image: '/uploads/h.webp', sort_order: 0, deleted_at: null, deleted_by: null },
    ],
    logs: [
      { id: 1, username: 'admin', action: 'LOGIN', details: 'IP 1.2.3.4', created_at: '2026-08-01T00:00:00+08:00', token_version: 7 },
    ],
    config: {
      home_bg: '/uploads/home.webp',
      banner_text: '欢迎',
      qq_group_number: '123456',
      home_links: '[]',
      token_version: '7',
      backup_enabled: '1',
      backup_last_error: '/secret/path.sqlite',
    },
    users: [
      { id: 1, username: 'admin', role: 'super_admin', avatar: null, twofa_enabled: 0, password: 'private-hash', twofa_secret: 'private-2fa' },
      { id: 2, username: 'editor', role: 'admin', avatar: '/uploads/e.webp', twofa_enabled: 1, password: 'private-hash' },
    ],
    profileBodies: [],
    uploads: [],
    bans: [],
    backupSettings: { enabled: false, time: '02:30', lastRun: '', lastError: '' },
    backups: [{ type: 'full', name: 'full_fixture.tar.gz', size: gzipSync(Buffer.alloc(1024)).length, mtime: 1_792_310_400_000 }],
    activeBackupStreams: 0,
    backupStreams: [],
  }

  let nextId = 100

  const handle = async (request, response, { publicRead = false } = {}) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const headers = request.headers
    state.requests.push({ method: request.method, path: url.pathname, query: url.searchParams.toString(), headers: { ...headers } })

    // Browser credentials or identity headers must never reach the backend.
    if (headers.cookie || headers.origin || headers['x-real-ip'] || headers['cf-connecting-ip'] || headers.forwarded) {
      return send(response, 500, { message: 'credential-leak', error: 'SQLITE_ERROR: leak' })
    }
    if (state.failNext) {
      const failure = state.failNext
      state.failNext = null
      return send(response, failure.status, failure.body)
    }

    const authorization = headers.authorization
    const token = typeof authorization === 'string' && authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
    const payload = (() => {
      try {
        return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'))
      }
      catch {
        return null
      }
    })()

    if (url.pathname === '/api/auth/me') {
      if (!payload) return send(response, 401, { message: '未登录' })
      if (state.meStatus) return send(response, state.meStatus, { message: 'Token 无效' })
      const user = state.users.find(candidate => candidate.id === payload.id)
      if (!user) return send(response, 404, { message: '用户不存在' })
      return send(response, 200, {
        id: user.id,
        username: user.username,
        role: state.roleOverride ?? user.role,
        avatar: user.avatar,
        twofa_enabled: user.twofa_enabled,
      })
    }

    // Resource tests must not accidentally pass with an unauthenticated client.
    // This fixture decodes fixture-only JWTs; it is not a signature verifier.
    if (url.pathname.startsWith('/api/') && !publicRead && !state.users.some(user => user.id === payload?.id))
      return send(response, 401, { message: '未登录' })

    if (url.pathname === '/api/upload' && request.method === 'POST') {
      const chunks = []
      let bytes = 0
      for await (const chunk of request) {
        bytes += chunk.length
        if (bytes > 51 * 1024 * 1024) return send(response, 413, { message: 'too large' })
        chunks.push(chunk)
      }
      const form = await new Response(Buffer.concat(chunks), { headers: { 'content-type': request.headers['content-type'] } }).formData()
      const file = form.get('file')
      if (!(file instanceof File)) return send(response, 400, { message: 'missing file' })
      state.uploads.push({ name: file.name, type: file.type, size: file.size, fields: [...form.keys()] })
      return send(response, 200, { url: `/uploads/admin-${state.uploads.length}.png` })
    }

    if (request.method === 'PUT' && url.pathname === '/api/auth/profile') {
      try {
        const body = await readJsonBody(request)
        state.profileBodies.push(body)
        const user = state.users.find(user => user.id === payload.id)
        if ('avatar' in body) user.avatar = body.avatar
        if ('twofa_enabled' in body) user.twofa_enabled = body.twofa_enabled ? 1 : 0
        return send(response, 200, { message: '个人资料更新成功' })
      }
      catch {
        return send(response, 400, { message: '参数错误' })
      }
    }

    if (url.pathname === '/__fixture/control') {
      try {
        const body = await readJsonBody(request)
        if ('meStatus' in body) state.meStatus = body.meStatus
        if ('roleOverride' in body) state.roleOverride = body.roleOverride
        if (body.failNext) state.failNext = body.failNext
        return send(response, 200, { ok: true, counts: { requests: state.requests.length } })
      }
      catch {
        return send(response, 400, { message: 'invalid control body' })
      }
    }

    // ------------------------------------------------------------- activities
    if (url.pathname === '/api/activities' && request.method === 'GET') {
      const includeDeleted = url.searchParams.get('includeDeleted') === '1'
      const page = Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1
      const limit = Math.min(100, Number.parseInt(url.searchParams.get('limit') ?? '20', 10) || 20)
      const items = state.activities.filter(activity => (includeDeleted || activity.deleted_at === null)
        && (!publicRead || activity.status === 'published'))
      return send(response, 200, { total: items.length, page, limit, items: items.slice((page - 1) * limit, page * limit) })
    }
    if (url.pathname === '/api/activities/draft' && request.method === 'POST') {
      const id = ++nextId
      state.activities.push({ id, title: '(草稿)', tag: '', date: '2026-08-03', description: '', content: '', cover_image: '', images: [], status: 'draft', deleted_at: null, created_at: '2026-08-03T00:00:00+08:00' })
      return send(response, 200, { id })
    }
    if (url.pathname === '/api/activities' && request.method === 'POST') {
      try {
        const body = await readJsonBody(request)
        if (!body.title) return send(response, 400, { error: 'SQLITE_ERROR: no such column title' })
        state.activities.push({ id: ++nextId, ...body, images: body.images ?? [], status: 'published', deleted_at: null, created_at: '2026-08-03T00:00:00+08:00' })
        return send(response, 200, { id: nextId, message: '发布成功' })
      }
      catch {
        return send(response, 400, { error: 'bad body' })
      }
    }
    const activityId = url.pathname.match(/^\/api\/activities\/(\d+)$/)
    if (activityId) {
      const id = Number(activityId[1])
      const index = state.activities.findIndex(activity => activity.id === id)
      if (index === -1) return send(response, 404, { message: 'Not Found' })
      if (publicRead && (state.activities[index].deleted_at || state.activities[index].status !== 'published'))
        return send(response, 404, { message: 'Not Found' })
      if (request.method === 'GET') return send(response, 200, state.activities[index])
      if (request.method === 'PUT') {
        const body = await readJsonBody(request)
        state.activities[index] = { ...state.activities[index], ...body, status: 'published' }
        return send(response, 200, { message: '更新成功' })
      }
      if (request.method === 'DELETE') {
        state.activities[index].deleted_at = '2026-08-04T00:00:00+08:00'
        return send(response, 200, { message: '已软删除' })
      }
    }
    if (/^\/api\/activities\/\d+\/restore$/.test(url.pathname) && request.method === 'POST') {
      const id = Number(url.pathname.split('/')[3])
      const activity = state.activities.find(candidate => candidate.id === id)
      if (!activity) return send(response, 404, { message: 'Not Found' })
      activity.deleted_at = null
      return send(response, 200, { message: '已恢复' })
    }

    // ---------------------------------------------------------------- members
    if (url.pathname === '/api/members' && request.method === 'GET') {
      const includeDeleted = url.searchParams.get('includeDeleted') === '1'
      const original = url.searchParams.get('original') === '1'
      const items = state.members
        .filter(member => includeDeleted || member.deleted_at === null)
        .map(member => ({ ...member, tags: Array.isArray(member.tags) ? member.tags : (() => { try { return JSON.parse(member.tags || '[]') } catch { return [] } })(), avatar_thumb: member.avatar, avatar_original: member.avatar, avatar: original ? member.avatar : member.avatar }))
      return send(response, 200, items)
    }
    if (url.pathname === '/api/members' && request.method === 'POST') {
      const body = await readJsonBody(request)
      if (!body.name) return send(response, 400, { error: 'SQLITE_ERROR' })
      const id = ++nextId
      state.members.push({ id, ...body, tags: body.tags ?? [], sort_order: body.sort_order ?? 0, deleted_at: null })
      return send(response, 200, { id })
    }
    const memberId = url.pathname.match(/^\/api\/members\/(\d+)$/)
    if (memberId) {
      const id = Number(memberId[1])
      const index = state.members.findIndex(member => member.id === id)
      if (index === -1) return send(response, 404, { message: 'Not Found' })
      if (request.method === 'PUT') {
        state.members[index] = { ...state.members[index], ...(await readJsonBody(request)) }
        return send(response, 200, { message: '成员更新成功' })
      }
      if (request.method === 'DELETE') {
        state.members[index].deleted_at = '2026-08-04T00:00:00+08:00'
        return send(response, 200, { message: '已软删除' })
      }
    }
    if (/^\/api\/members\/\d+\/restore$/.test(url.pathname) && request.method === 'POST') {
      const id = Number(url.pathname.split('/')[3])
      const member = state.members.find(candidate => candidate.id === id)
      if (!member) return send(response, 404, { message: 'Not Found' })
      member.deleted_at = null
      return send(response, 200, { message: '已恢复' })
    }

    // ---------------------------------------------------------------- history
    if (url.pathname === '/api/history' && request.method === 'GET') {
      const includeDeleted = url.searchParams.get('includeDeleted') === '1'
      return send(response, 200, state.history.filter(entry => includeDeleted || entry.deleted_at === null))
    }
    if (url.pathname === '/api/history' && request.method === 'POST') {
      const body = await readJsonBody(request)
      const id = ++nextId
      state.history.push({ id, ...body, sort_order: body.sort_order ?? 0, deleted_at: null })
      return send(response, 200, { id })
    }
    const historyId = url.pathname.match(/^\/api\/history\/(\d+)$/)
    if (historyId) {
      const id = Number(historyId[1])
      const index = state.history.findIndex(entry => entry.id === id)
      if (index === -1) return send(response, 404, { message: 'Not Found' })
      if (request.method === 'PUT') {
        state.history[index] = { ...state.history[index], ...(await readJsonBody(request)) }
        return send(response, 200, { message: '更新成功' })
      }
      if (request.method === 'DELETE') {
        state.history[index].deleted_at = '2026-08-04T00:00:00+08:00'
        return send(response, 200, { message: '已软删除' })
      }
    }
    if (/^\/api\/history\/\d+\/restore$/.test(url.pathname) && request.method === 'POST') {
      const id = Number(url.pathname.split('/')[3])
      const entry = state.history.find(candidate => candidate.id === id)
      if (!entry) return send(response, 404, { message: 'Not Found' })
      entry.deleted_at = null
      return send(response, 200, { message: '已恢复' })
    }

    // ----------------------------------------------------------------- config
    if (url.pathname === '/api/config' && request.method === 'GET') {
      return send(response, 200, state.config)
    }
    if (url.pathname === '/api/config' && request.method === 'POST') {
      const body = await readJsonBody(request)
      state.config[String(body.key)] = String(body.value ?? '')
      return send(response, 200, { message: '已保存' })
    }

    // ------------------------------------------------------------------- logs
    if (url.pathname === '/api/admin/logs' && request.method === 'GET') {
      return send(response, 200, { total: state.logs.length, logs: state.logs })
    }
    if (/^\/api\/admin\/logs\/\d+$/.test(url.pathname) && request.method === 'DELETE') {
      const id = Number(url.pathname.split('/')[4])
      state.logs = state.logs.filter(log => log.id !== id)
      return send(response, 200, { message: '删除成功' })
    }

    // ------------------------------------------------------------------ users
    if (url.pathname === '/api/auth/register' && request.method === 'POST') {
      const body = await readJsonBody(request)
      if (state.users.some(user => user.username === body.username)) return send(response, 400, { message: '用户名已存在' })
      state.users.push({ id: ++nextId, username: body.username, password: body.password, role: 'admin', avatar: null, twofa_enabled: 0, twofa: null })
      return send(response, 200, { message: '添加成功' })
    }
    if (url.pathname === '/api/admin/users' && request.method === 'GET') {
      return send(response, 200, state.users)
    }
    const userId = url.pathname.match(/^\/api\/admin\/users\/(\d+)$/)
    if (userId && request.method === 'DELETE') {
      const id = Number(userId[1])
      if (payload && payload.id === id) return send(response, 400, { message: '无法删除自己' })
      state.users = state.users.filter(user => user.id !== id)
      return send(response, 200, { message: '删除成功', target: 'editor' })
    }
    const passwordId = url.pathname.match(/^\/api\/admin\/users\/(\d+)\/password$/)
    if (passwordId && request.method === 'PUT') {
      const body = await readJsonBody(request)
      if (!body.password || String(body.password).length < 6) return send(response, 400, { message: '密码至少 6 位' })
      const user = state.users.find(user => user.id === Number(passwordId[1]))
      if (!user) return send(response, 404, { message: 'Not Found' })
      user.password = body.password
      return send(response, 200, { message: '重置成功' })
    }
    const twofaId = url.pathname.match(/^\/api\/admin\/users\/(\d+)\/twofa\/reset$/)
    if (twofaId && request.method === 'PUT') {
      const user = state.users.find(user => user.id === Number(twofaId[1]))
      if (!user) return send(response, 404, { message: 'Not Found' })
      user.twofa_enabled = 0; user.twofa = null
      return send(response, 200, { message: '二步密码已重置' })
    }
    if (url.pathname === '/api/admin/token-version/refresh' && request.method === 'POST') {
      return send(response, 200, { message: '已强制刷新登录状态', version: 8 })
    }

    if (url.pathname === '/api/admin/bans') {
      if (request.method === 'GET') return send(response, 200, { bans: state.bans })
      if (request.method === 'POST') {
        const body = await readJsonBody(request)
        const ban = { ...body, created_by: state.users.find(user => user.id === payload.id)?.username ?? 'admin', created_at: Date.now(), expires_at: body.minutes ? Date.now() + body.minutes * 60_000 : null }
        state.bans = [...state.bans.filter(item => item.ip !== body.ip), ban]
        return send(response, 200, { message: '已封禁' })
      }
    }
    if (url.pathname.startsWith('/api/admin/bans/') && request.method === 'DELETE') {
      const ip = decodeURIComponent(url.pathname.slice('/api/admin/bans/'.length))
      state.bans = state.bans.filter(ban => ban.ip !== ip)
      return send(response, 200, { message: '已解封' })
    }
    if (url.pathname === '/api/admin/backups/settings') {
      if (request.method === 'GET') return send(response, 200, state.backupSettings)
      if (request.method === 'POST') {
        Object.assign(state.backupSettings, await readJsonBody(request))
        return send(response, 200, { message: '已保存' })
      }
    }
    if (url.pathname === '/api/admin/backups/run' && request.method === 'POST') {
      state.backupSettings.lastRun = new Date().toISOString()
      state.backups.push({ type: 'full', name: `full_manual_${++nextId}.tar.gz`, size: gzipSync(Buffer.alloc(1024)).length, mtime: Date.now() })
      return send(response, 200, { message: '备份完成' })
    }
    if (url.pathname === '/api/admin/backups') {
      if (request.method === 'GET') return send(response, 200, { full: state.backups })
      if (request.method === 'DELETE') {
        const name = url.searchParams.get('file')
        if (!state.backups.some(item => item.name === name)) return send(response, 404, { message: 'Not Found' })
        state.backups = state.backups.filter(item => item.name !== name)
        return send(response, 200, { message: '已删除' })
      }
    }
    if (url.pathname === '/api/admin/backups/download' && ['GET', 'HEAD'].includes(request.method)) {
      const name = url.searchParams.get('file')
      if (!state.backups.some(item => item.name === name)) return send(response, 404, { message: 'Not Found' })
      if (name === 'full_stall.tar.gz') {
        const size = 100 * 1024 * 1024
        response.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${name}"`, 'content-length': size })
        if (request.method === 'HEAD') return response.end()
        state.activeBackupStreams++
        const sample = { sent: 0, active: true }
        state.backupStreams.push(sample)
        let timer, sent = 0
        const chunk = Buffer.alloc(64 * 1024)
        response.once('close', () => { clearTimeout(timer); state.activeBackupStreams--; sample.active = false })
        const emit = () => {
          if (response.destroyed || response.writableEnded) return
          if (sent >= size) return response.end()
          sent += chunk.length
          sample.sent = sent
          const schedule = () => { timer = setTimeout(emit, 0) }
          if (response.write(chunk)) schedule()
          else response.once('drain', schedule)
        }
        emit()
        return
      }
      const bytes = gzipSync(Buffer.alloc(1024))
      response.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${name}"`, 'content-length': bytes.length })
      return response.end(request.method === 'HEAD' ? undefined : bytes)
    }

    return send(response, 404, { message: 'Not Found' })
  }
  const server = createServer((request, response) => {
    handle(request, response).catch(() => send(response, 500, { message: 'fixture failure' }))
  })

  return {
    server,
    handle,
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
  const port = Number(process.env.PORT ?? 3183)
  const fixture = createAdminUpstreamFixture()
  fixture.listen(port).then((bound) => {
    console.log(`admin fixture listening on http://127.0.0.1:${bound}`)
  })
}
