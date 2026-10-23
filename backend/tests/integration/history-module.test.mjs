import http from 'node:http'
import { once } from 'node:events'
import { expect, it, onTestFinished } from 'vitest'
import { fixture, token, get } from '../helpers/fixture.mjs'

it('EX-06 create returns each committed ID and sends that ID to the real local Bot receiver', async () => {
  const notifications = []
  const receiver = http.createServer((request, response) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', chunk => { body += chunk })
    request.on('end', () => { notifications.push(JSON.parse(body)); response.writeHead(200, { 'content-type': 'application/json' }); response.end('{}') })
  })
  receiver.listen(0, '127.0.0.1')
  await once(receiver, 'listening')
  onTestFinished(() => new Promise((resolve, reject) => receiver.close(error => error ? reject(error) : resolve())))
  const f = await fixture({ env: { ASTRBOT_WEBHOOK_URL: `http://127.0.0.1:${receiver.address().port}`, ASTRBOT_TIMEOUT_MS: '1000' } })
  f.context.externalServices = true
  const titles = ['first concurrent history', 'second concurrent history', 'third concurrent history']
  const responses = await Promise.all(titles.map(title => f.http.post('/api/history').set('Authorization', `Bearer ${token(2, 'admin')}`).send({ date: '2026-10-23', title })))
  for (const [index, response] of responses.entries()) {
    expect(response.status).toBe(200)
    expect(response.body.id).toEqual(expect.any(Number))
    expect(await get(f.db, 'SELECT id FROM history WHERE title=?', [titles[index]])).toEqual({ id: response.body.id })
  }
  expect(new Set(responses.map(response => response.body.id)).size).toBe(3)
  await expect.poll(() => notifications.length).toBe(3)
  for (const notification of notifications) {
    const index = titles.indexOf(notification.data.title)
    expect(index).toBeGreaterThanOrEqual(0)
    expect(notification).toMatchObject({ event: 'history.updated', source: 'guatswr_web', actor: { id: 2, username: 'admin', role: 'admin' }, data: { id: responses[index].body.id, date: '2026-10-23', title: titles[index], description: '', image: '', sort_order: 0, action: 'create' } })
    expect(Number.isFinite(Date.parse(notification.timestamp))).toBe(true)
  }
})
