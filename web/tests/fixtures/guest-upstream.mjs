import { publicEventsFixture } from './public-data.mjs'

// In-memory model of the frozen v1 guest routes. Used behind the REAL Nuxt BFF;
// no browser interception, real database, filesystem write or outbound hook.
export function createGuestUpstreamFixture() {
  let nextId = 700
  let failSaveTimes = 0
  const drafts = new Map()
  const signups = new Map()
  const requests = []
  const send = (response, status, body) => {
    response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    response.end(JSON.stringify(body))
    return true
  }
  const readBody = async request => {
    const chunks = []
    let bytes = 0
    for await (const chunk of request) {
      bytes += chunk.length
      if (bytes > 51 * 1024 * 1024) throw new Error('fixture body too large')
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  }
  const snapshot = () => ({ requests, drafts: [...drafts.values()], signups: [...signups.values()] })
  return {
    async handle(request, response) {
      const path = new URL(request.url, 'http://127.0.0.1').pathname
      if (path === '/__fixture/guest') {
        if (request.method === 'POST') {
          const control = JSON.parse((await readBody(request)).toString())
          if (control.reset) { drafts.clear(); signups.clear(); requests.length = 0; nextId = 700; failSaveTimes = 0 }
          if (Number.isInteger(control.failSaveTimes)) failSaveTimes = control.failSaveTimes
        }
        return send(response, 200, snapshot())
      }
      const event = /^\/api\/event\/(\d+)(\/signup)?$/.exec(path)
      const upload = ['/api/upload_visitor', '/api/upload_visitor/avatar'].includes(path)
      const draft = path === '/api/event/draft' && request.method === 'POST'
      if (!draft && !upload && !event) return false
      const id = event ? Number(event[1]) : undefined
      // Leave ordinary public event reads to the existing public fixture.
      if (event && !event[2] && request.method === 'GET' && !drafts.has(id)) return false
      const entry = { method: request.method, path, headers: { ...request.headers } }
      requests.push(entry)
      if (request.headers.cookie || request.headers.origin)
        return send(response, 500, { message: 'guest browser credential leaked' })
      if (!request.headers['x-forwarded-for']) return send(response, 500, { message: 'missing validated visitor address' })
      if (draft) {
        const row = { id: nextId++, status: 'draft', visitor_ip: request.headers['x-forwarded-for'] }
        drafts.set(row.id, row)
        return send(response, 200, { id: row.id, message: '草稿创建成功' })
      }
      if (upload) {
        const data = await new Response(await readBody(request), { headers: { 'content-type': request.headers['content-type'] } }).formData()
        const eid = Number(data.get('eid'))
        const file = data.get('file')
        entry.upload = { eid, name: file?.name, type: file?.type, size: file?.size, fields: [...data.keys()] }
        const row = drafts.get(eid) ?? publicEventsFixture.find(row => row.id === eid)
        if (!row || (path.endsWith('/avatar') ? !['published', 'ongoing', 'ended', 'settled'].includes(row.status) : !['draft', 'pending'].includes(row.status)))
          return send(response, 403, { message: '禁止上传' })
        if (!file?.size) return send(response, 400, { message: '文件上传失败' })
        return send(response, 200, { url: `/uploads/img/events/${eid}/fixture.png` })
      }
      if (event[2]) {
        const key = `${id}:${request.headers['x-forwarded-for']}`
        if (request.method === 'GET') return send(response, 200, { data: signups.get(key) ?? null })
        if (request.method === 'DELETE') {
          if (!signups.delete(key)) return send(response, 404, { message: '报名记录不存在' })
          return send(response, 200, { message: '已删除报名' })
        }
        const row = publicEventsFixture.find(row => row.id === id)
        if (!row || !['STG', '则则'].includes(row.type) || !['published', 'ongoing'].includes(row.status)) return send(response, 403, { message: '当前状态不允许报名' })
        entry.body = JSON.parse((await readBody(request)).toString())
        const body = entry.body
        if (!body.common_id || !body.qq || !body.avatar) return send(response, 400, { message: '请填写报名信息与头像' })
        signups.set(key, { ...body, id: 1, visitor_ip: request.headers['x-forwarded-for'], user_id: null })
        return send(response, 200, { message: '报名成功', eventId: id })
      }
      const row = drafts.get(id)
      if (!row) return send(response, 404, { message: 'Event not found' })
      if (request.method === 'GET') return send(response, 200, row)
      entry.body = JSON.parse((await readBody(request)).toString())
      if (failSaveTimes-- > 0) return send(response, 500, { message: 'deliberate transient fixture error' })
      Object.assign(row, entry.body, { status: entry.body.submit === true ? 'pending' : row.status })
      return send(response, 200, { message: '保存成功', id })
    },
  }
}
