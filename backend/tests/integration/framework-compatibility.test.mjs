import { it, expect } from 'vitest'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
import { fixture, run, token } from '../helpers/fixture.mjs'

it('preserves extended query arrays/objects and native structured SQL bindings over HTTP', async () => {
  const f = await fixture()
  await run(f.db, "INSERT INTO members(name,school,tags) VALUES ('structured-school','[object Object]','[]')")
  for (const query of ['school[x]=value', 'school[]=a&school[]=b']) {
    const response = await f.http.get('/api/members?' + query)
    expect(response.status).toBe(200)
    expect(response.body.map(row => row.name)).toEqual(['structured-school'])
  }
})

it('preserves no-body and urlencoded wire semantics at actual API adapters', async () => {
  const f = await fixture()
  const noBody = await f.http.post('/api/auth/login')
  const empty = await f.http.post('/api/auth/login').send({})
  expect(noBody.status).toBe(400)
  expect(noBody.body).toEqual(empty.body)
  const draft = await f.http.post('/api/event/draft').set('Authorization', `Bearer ${token()}`)
  expect(draft.status).toBe(200)
  expect(draft.body.id).toBeGreaterThan(0)
  const form = await f.http.post('/api/auth/login').type('form').send({ username: 'owner', password: 'fixture-password' })
  expect(form.status).toBe(200)
  expect(typeof form.body.token).toBe('string')
})

it('preserves static resource bytes, HEAD, dotfile rejection, SVG sandbox and docs', async () => {
  const f = await fixture()
  await f.fs.writeFile(path.join(f.context.PUBLIC_DIR, 'framework.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>')
  await f.fs.writeFile(path.join(f.context.PUBLIC_DIR, '.framework-secret'), 'private')
  const resource = await f.http.get('/uploads/framework.svg')
  expect(resource.status).toBe(200)
  expect(resource.headers['content-type']).toMatch(/^image\/svg\+xml/)
  expect(resource.headers['content-security-policy']).toContain('sandbox')
  const head = await f.http.head('/uploads/framework.svg')
  expect(head.status).toBe(200)
  expect(head.headers['content-length']).toBe(resource.headers['content-length'])
  expect(head.text).toBeUndefined()
  expect((await f.http.get('/uploads/.framework-secret')).status).toBe(404)
  expect((await f.http.get('/api/docs/openapi.yaml')).status).toBe(200)
  expect((await f.http.get('/api/docs/')).status).toBe(200)
  expect((await f.http.head('/api/version')).status).toBe(200)
  const missing = await f.http.get('/missing-framework-route')
  expect(missing.status).toBe(404)
  expect(missing.body).toEqual({ message: 'Not Found' })
})

it('keeps decoded route parameters and frozen parser error masks', async () => {
  const f = await fixture()
  await run(f.db, "INSERT INTO banned_ips(ip,expires_at) VALUES ('203.0.113.78', '2999-01-01T00:00:00Z')")
  const deleted = await f.http.delete('/api/admin/bans/203%2E0%2E113%2E78').set('Authorization', `Bearer ${token()}`)
  expect(deleted.status).toBe(200)
  const malformed = await f.http.post('/api/auth/login').set('Content-Type', 'application/json').send('{')
  expect(malformed.status).toBe(500)
  expect(malformed.body).toEqual({ message: '服务器错误' })
  const malformedParam = await f.http.get('/api/event/%zz')
  expect(malformedParam.status).toBe(500)
  expect(malformedParam.body).toEqual({ message: '服务器错误' })
})

it('forwards rejected async middleware once without unhandled rejections', async () => {
  const express = require('express'), request = require('supertest')
  const app = express(), rejected = [], handled = []
  const observe = reason => rejected.push(reason)
  process.on('unhandledRejection', observe)
  try {
    app.get('/native', async () => { throw new Error('synthetic rejected middleware') })
    app.get('/wrapped', (_req, _res, next) => Promise.reject(new Error('synthetic wrapped rejection')).catch(next))
    app.use((error, _req, res, _next) => { handled.push(error.message); res.status(500).json({ message: '服务器错误' }) })
    for (const route of ['/native', '/wrapped']) {
      const response = await request(app).get(route)
      expect(response.status).toBe(500)
      expect(response.body).toEqual({ message: '服务器错误' })
    }
    await new Promise(resolve => setImmediate(resolve))
    expect(handled).toHaveLength(2)
    expect(rejected).toEqual([])
  } finally { process.off('unhandledRejection', observe) }
})

it('retains production CORS allowlist, preflight and fixed denial response', async () => {
  const f = await fixture({ env: { NODE_ENV: 'production', CORS_ORIGINS: 'https://allowed.example' } })
  const allowed = await f.http.get('/api/version').set('Origin', 'https://allowed.example')
  expect(allowed.status).toBe(200)
  expect(allowed.headers['access-control-allow-origin']).toBe('https://allowed.example')
  expect(allowed.headers['access-control-allow-credentials']).toBe('true')
  const preflight = await f.http.options('/api/config').set('Origin', 'https://allowed.example').set('Access-Control-Request-Method', 'POST')
  expect(preflight.status).toBe(204)
  const denied = await f.http.get('/api/version').set('Origin', 'https://denied.example')
  expect(denied.status).toBe(403)
  expect(denied.body).toEqual({ message: '跨域访问被拒绝' })
})
