import { publicEventsFixture, publicEventParticipantsFixture } from './public-data.mjs'

// Opt-in, in-memory frozen v1 event API behind the real Nuxt BFF. No database,
// uploads on disk, bot hooks, browser interception or external writes.
export function createAdminEventsUpstreamFixture() {
  const state = { enabled: false, records: structuredClone(publicEventsFixture), requests: [], failNextWrite: false }
  state.records.push(
    { ...structuredClone(publicEventsFixture.find(row => row.id === 101)), id: 2001, title: '等待审核的赛事', status: 'pending', visitor_ip: 'private-fixture-address' },
    { ...structuredClone(publicEventsFixture.find(row => row.id === 102)), id: 2002, title: '需要修订的对赌', status: 'pending', content: { ...structuredClone(publicEventsFixture.find(row => row.id === 102).content), retained: { marker: 'keep-on-edit' }, result: '原有结算' } },
  )
  let nextId = 3000
  const publicStatuses = ['published', 'ongoing', 'ended', 'settled']
  const allStatuses = ['draft', 'pending', ...publicStatuses, 'rejected', 'deleted']
  const send = (response, status, body) => {
    response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    response.end(JSON.stringify(body)); return true
  }
  async function readBytes(request, limit = 4 * 1024 * 1024) {
    const chunks = []; let bytes = 0
    for await (const chunk of request) {
      bytes += chunk.length
      if (bytes > limit) throw new Error('fixture request too large')
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  }
  async function body(request) { const data = await readBytes(request); return data.length ? JSON.parse(data.toString('utf8')) : {} }
  return {
    async handle(request, response) {
      const url = new URL(request.url, 'http://127.0.0.1')
      if (url.pathname === '/__fixture/events') {
        if (request.method === 'POST') { const input = await body(request); state.enabled = true; if (input.failNextWrite) state.failNextWrite = true }
        return send(response, 200, state)
      }
      const avatarUpload = url.pathname === '/api/upload/visitor/avatar' && request.method === 'POST'
      if (!state.enabled || (!/^\/api\/event(?:\/|$)/.test(url.pathname) && !avatarUpload)) return false
      const call = { method: request.method, path: url.pathname, query: url.searchParams.toString(), headers: { ...request.headers } }
      state.requests.push(call)
      const headers = request.headers
      if (headers.cookie || headers.origin || headers['x-real-ip'] || headers['cf-connecting-ip'] || headers.forwarded)
        return send(response, 500, { message: 'browser identity leaked to fixture' })
      const token = String(headers.authorization ?? '').replace(/^Bearer /, '')
      let identity
      try { identity = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) } catch { identity = undefined }
      const authenticated = ['admin', 'super_admin'].includes(identity?.role)
      const isAdminList = url.pathname === '/api/event/admin/list'
      if ((isAdminList || request.method !== 'GET' || /\/participants$/.test(url.pathname)) && !authenticated)
        return send(response, 403, { message: 'admin required' })
      if (avatarUpload) {
        const form = await new Response(await readBytes(request, 51 * 1024 * 1024), { headers: { 'content-type': headers['content-type'] } }).formData()
        const eid = Number(form.get('eid')), file = form.get('file')
        const row = state.records.find(row => row.id === eid)
        if (!row) return send(response, 404, { message: 'not found' })
        if (!publicStatuses.includes(row.status)) return send(response, 403, { message: 'event is not public' })
        if (!file?.size) return send(response, 400, { message: 'file required' })
        call.upload = { eid, name: file.name, type: file.type, size: file.size, fields: [...form.keys()] }
        return send(response, 200, { url: `/uploads/img/events/${eid}/avatars/fixture-${state.requests.length}.png` })
      }
      if (request.method === 'GET' && (url.pathname === '/api/event' || isAdminList)) {
        const page = Math.max(1, Number(url.searchParams.get('page')) || 1), limit = Math.min(100, Number(url.searchParams.get('limit')) || 20)
        const statuses = url.searchParams.get('status')?.split(',').filter(Boolean)
        const rows = state.records.filter(row => (isAdminList || publicStatuses.includes(row.status))
          && (!statuses?.length || statuses.includes(row.status)) && (!url.searchParams.get('type') || row.type === url.searchParams.get('type')))
        return send(response, 200, { items: rows.slice((page - 1) * limit, page * limit), total: rows.length, page, limit })
      }
      const match = /^\/api\/event\/(\d+)(?:\/(approve|reject|status|delete|settle|set_result|participants|participants\/public))?$/.exec(url.pathname)
      const row = match ? state.records.find(row => row.id === Number(match[1])) : undefined
      if (request.method === 'GET' && row) {
        if (match[2]?.startsWith('participants')) {
          const items = publicEventParticipantsFixture.filter(person => person.event_id === row.id)
          return send(response, 200, { items })
        }
        return !authenticated && !publicStatuses.includes(row.status) ? send(response, 404, { message: 'not found' }) : send(response, 200, row)
      }
      if (request.method === 'GET') return send(response, 404, { message: 'not found' })
      const input = await body(request); call.body = input
      if (state.failNextWrite) { state.failNextWrite = false; return send(response, 500, { message: 'deliberate fixture write failure', stack: 'private-stack' }) }
      if (request.method === 'POST' && url.pathname === '/api/event/admin') {
        const created = { id: nextId++, type: input.type, title: input.title, content: input.content ?? {}, status: allStatuses.includes(input.status) ? input.status : 'published', created_by: identity.id, created_by_name: identity.username, created_at: '2026-10-20T00:00:00+08:00', updated_at: '' }
        state.records.push(created); return send(response, 200, { id: created.id, message: '创建成功' })
      }
      if (!row) return send(response, 404, { message: 'not found' })
      if (request.method === 'PUT' && !match[2]) {
        Object.assign(row, { type: input.type, title: input.title, content: input.content, status: input.submit === true ? 'pending' : row.status })
        return send(response, 200, { id: row.id, message: '保存成功' })
      }
      if (request.method !== 'POST') return send(response, 405, { message: 'method not allowed' })
      const action = match[2]
      if (action === 'approve') row.status = 'published'
      else if (action === 'reject') row.status = 'rejected'
      else if (action === 'delete') row.status = 'deleted'
      else if (action === 'status' && allStatuses.includes(input.status)) row.status = input.status
      else if (action === 'settle') { row.content = { ...row.content, ...input.payload }; row.status = input.status || 'settled' }
      else if (action === 'set_result' && ['STG', '则则'].includes(row.type)) { row.content = { ...row.content, results: input.results, results_updated_at: '2026-10-20T00:00:00+08:00' }; row.status = 'ended' }
      else return send(response, 400, { message: 'invalid event action' })
      return send(response, 200, { id: row.id, message: '更新成功' })
    },
  }
}
